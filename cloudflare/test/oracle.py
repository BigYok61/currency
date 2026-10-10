#!/usr/bin/env python3
"""Python-Referenz für die Worker-Portierung. Liest JSON von stdin, schreibt JSON nach stdout."""
import contextlib
import io
import json
import os
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import capture  # noqa: E402
import fx_alerts  # noqa: E402


def emit(obj):
    json.dump(obj, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


def freeze(mod, now):
    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return now if tz is None else now.astimezone(tz)

    mod.datetime = FrozenDateTime
    return FrozenDateTime


def parse_now(text):
    now = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now


def cmd_dumps(payload):
    return {"text": json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n"}


def cmd_round(payload):
    out = []
    for v in payload["values"]:
        out.append({
            "r6": round(v, 6),
            "r4": round(v, 4),
            "r3": round(v, 3),
            "r2": round(v, 2),
            "j6": json.dumps(round(v, 6)),
            "f4": f"{v:.4f}",
            "f2abs": f"{abs(v):.2f}",
            "pct": fx_alerts.pct(v),
            "num": fx_alerts.num(v),
        })
    return out


def cmd_slot(payload):
    out = []
    for item in payload["items"]:
        slot = capture.slot_dt(date.fromisoformat(item["day"]), item["hour"])
        out.append(slot.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    return out


def cmd_forecast(payload):
    candles = []
    for c in payload["candles"]:
        t = datetime.fromisoformat(c["t"].replace("Z", "+00:00"))
        candles.append((t, c["o"], c["h"], c["l"]))
    day = date.fromisoformat(payload["day"])
    end = capture.forecast_end_of_day(candles, day, payload["basis"])
    seven = capture.forecast_7_days(candles, payload["ecb"], day, payload["basis"])
    return {"end": end, "seven": seven, "end_j": None if end is None else json.dumps(end), "seven_j": None if seven is None else json.dumps(seven)}


def cmd_times(payload):
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "capture-times.json")
        if payload.get("data") is None:
            capture.TIMES = os.path.join(tmp, "missing.json")
        else:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(payload["data"], f)
            capture.TIMES = path
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            start, grid, capture_hours = capture.load_times()
        return {"start": start, "grid": grid, "capture": capture_hours}


def cmd_basis(payload):
    day = date.fromisoformat(payload["day"])
    candles = [(capture.slot_dt(day, h), float(h), float(h), float(h)) for h in payload["hours"]]
    return capture.resolve_basis_hour(candles, day, payload["start"], payload["grid"])


def cmd_capture(payload):
    now = parse_now(payload["now"])
    freeze(capture, now)
    seen = []

    def get_json(url):
        seen.append(url)
        if "frankfurter" in url:
            return payload["ecb"]
        symbol = url.split("/api/", 1)[1].split("/", 1)[0]
        if "/ohlc" not in url:
            raise KeyError(url)
        return {"bars": payload["bars"][symbol]}

    capture.get_json = get_json
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "rates.json")
        times = os.path.join(tmp, "capture-times.json")
        with open(times, "w", encoding="utf-8") as f:
            json.dump(payload["times"], f)
        with open(out, "w", encoding="utf-8") as f:
            json.dump(payload["history"], f)
        capture.OUT = out
        capture.TIMES = times
        code = 0
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            try:
                capture.main()
            except SystemExit as e:
                code = int(e.code or 0)
        body = Path(out).read_text(encoding="utf-8")
    return {"exit": code, "body": body, "urls": seen}


def cmd_alerts(payload):
    now = parse_now(payload["now"])
    freeze(fx_alerts, now)
    pushes = []

    def push(topic, title, message, tags, priority=4):
        pushes.append({"title": title, "message": message, "tags": list(tags), "priority": priority})
        return bool(payload.get("pushOk", True))

    def get_json(url):
        symbol = url.split("/api/", 1)[1].split("/", 1)[0]
        if symbol in payload.get("fail", []):
            raise RuntimeError("fail")
        if "/ohlc" in url:
            return {"bars": payload["bars"][symbol]}
        return payload["quotes"][symbol]

    fx_alerts.push = push
    fx_alerts.get_json = get_json
    os.environ["NTFY_TOPIC"] = payload.get("topic", "topic-test")
    os.environ.pop("FX_DRY", None)
    argv = ["fx_alerts.py"]
    if payload.get("test"):
        argv.append("--test")
    if payload.get("force"):
        argv.append("--force")
    old_argv = sys.argv
    sys.argv = argv
    code = 0
    try:
        with tempfile.TemporaryDirectory() as tmp:
            cfg = os.path.join(tmp, "fx-alerts.json")
            state = os.path.join(tmp, "fx-alert-state.json")
            times = os.path.join(tmp, "capture-times.json")
            with open(cfg, "w", encoding="utf-8") as f:
                json.dump(payload["cfg"], f)
            with open(times, "w", encoding="utf-8") as f:
                json.dump(payload["times"], f)
            if payload.get("state") is not None:
                with open(state, "w", encoding="utf-8") as f:
                    json.dump(payload["state"], f)
            fx_alerts.F_CFG = cfg
            fx_alerts.F_STATE = state
            fx_alerts.TIMES = times
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                try:
                    fx_alerts.main()
                except SystemExit as e:
                    code = int(e.code or 0)
            body = Path(state).read_text(encoding="utf-8") if os.path.exists(state) else None
    finally:
        sys.argv = old_argv
    return {"exit": code, "state": body, "pushes": pushes}


COMMANDS = {
    "dumps": cmd_dumps,
    "round": cmd_round,
    "slot": cmd_slot,
    "times": cmd_times,
    "forecast": cmd_forecast,
    "basis": cmd_basis,
    "capture": cmd_capture,
    "alerts": cmd_alerts,
}


if __name__ == "__main__":
    name = sys.argv[1]
    payload = json.load(sys.stdin)
    emit(COMMANDS[name](payload))
