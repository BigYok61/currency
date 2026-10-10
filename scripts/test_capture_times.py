#!/usr/bin/env python3
"""Raster der Erfassungszeiten: start, start+n*Intervall, … ≤ end. 16:00 wird immer erfasst."""
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
REAL = ROOT / "data" / "capture-times.json"

spec = importlib.util.spec_from_file_location("capture", ROOT / "scripts" / "capture.py")
cap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cap)


def hours_for(data):
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "capture-times.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)
        cap.TIMES = path
        return cap.load_times()


class ExpandSchedule(unittest.TestCase):
    def test_every_hour_includes_the_end(self):
        self.assertEqual(cap.expand_schedule(6, 20, 1), list(range(6, 21)))

    def test_two_hours(self):
        self.assertEqual(cap.expand_schedule(6, 20, 2), [6, 8, 10, 12, 14, 16, 18, 20])

    def test_three_hours_through_21(self):
        self.assertEqual(cap.expand_schedule(6, 21, 3), [6, 9, 12, 15, 18, 21])

    def test_four_hours_stops_at_the_last_slot_not_past_the_end(self):
        self.assertEqual(cap.expand_schedule(6, 20, 4), [6, 10, 14, 18])

    def test_eight_twelve_and_twenty_four(self):
        self.assertEqual(cap.expand_schedule(6, 20, 8), [6, 14])
        self.assertEqual(cap.expand_schedule(6, 20, 12), [6, 18])
        self.assertEqual(cap.expand_schedule(6, 20, 24), [6])

    def test_string_step_and_invalid(self):
        self.assertEqual(cap.parse_step("24"), 24)
        self.assertEqual(cap.parse_step(5), 5)
        self.assertEqual(cap.expand_schedule(7, 17, 5), [7, 12, 17])
        self.assertIsNone(cap.parse_step(True))
        self.assertIsNone(cap.parse_step(6))
        self.assertIsNone(cap.expand_schedule(20, 6, 2))

    def test_close_is_captured_grid_hours_stay_on_the_pattern(self):
        start, grid, capture = hours_for({"version": 2, "start": "06", "end": "21", "intervalHours": 3})
        self.assertEqual(start, 6)
        self.assertEqual(grid, [6, 9, 12, 15, 18, 21])
        self.assertEqual(capture, [6, 9, 12, 15, 16, 18, 21])
        self.assertEqual(hours_for({"version": 2, "start": "06", "end": "20", "intervalHours": 4})[2], [6, 10, 14, 16, 18])
        self.assertEqual(hours_for({"version": 2, "start": "06", "end": "20", "intervalHours": 8})[2], [6, 14, 16])
        self.assertEqual(hours_for({"version": 2, "start": "06", "end": "20", "intervalHours": 12})[2], [6, 16, 18])
        self.assertEqual(hours_for({"version": 2, "start": "06", "end": "20", "intervalHours": 24})[2], [6, 16])
        self.assertEqual(hours_for({"version": 2, "start": "08", "end": "20", "intervalHours": 24})[2], [8, 16])
        self.assertEqual(hours_for({"version": 2, "start": "06", "end": "20", "intervalHours": 5, "hours": [9]})[2], [6, 11, 16])
        self.assertEqual(hours_for({"version": 2, "start": "07", "end": "17", "intervalHours": 5})[1], [7, 12, 17])

    def test_basis_hour_prefers_start_then_grid_then_legacy(self):
        from datetime import date
        day = date(2026, 10, 7)

        def candle(hour):
            t = cap.slot_dt(day, hour)
            return (t, float(hour), float(hour), float(hour))

        grid = [6, 9, 12, 15, 18, 21]
        self.assertEqual(cap.resolve_basis_hour([candle(6), candle(8), candle(9)], day, 6, grid), 6)
        self.assertEqual(cap.resolve_basis_hour([candle(9), candle(16)], day, 6, grid), 9)
        self.assertEqual(cap.resolve_basis_hour([candle(8), candle(16)], day, 6, grid), 8)
        self.assertIsNone(cap.resolve_basis_hour([candle(16)], day, 6, grid))

    def test_repo_file_is_not_rewritten(self):
        before = REAL.read_bytes()
        hours_for({"version": 2, "start": "06", "end": "20", "intervalHours": 2})
        self.assertEqual(REAL.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
