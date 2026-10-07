#!/usr/bin/env python3
"""Waehrungsuebersicht – serverseitige Erfassung (ohne Schluessel, nur Standardbibliothek).

Liest 1h-Kerzen von biquote.io (Mittelkurs) und EZB-Referenzkurse (api.frankfurter.dev),
ergaenzt data/rates.json und berechnet die Prognose Tagesende sowie die Prognose 7 Tage
(Modelle 1:1 aus main.swift).
Welche vollen Stunden gespeichert werden, steht in data/capture-times.json (Standard 06/08/10/12/14/16/18/20).
08:00 und 16:00 werden immer erfasst (Prognosen und FX-Alarme). Die Datei wird hier nie geschrieben.
Idempotent: Bereits gespeicherte Werte werden nie ueberschrieben (gleiche Merge-Regel wie die macOS-App).
Da biquote ca. 7 Tage Verlauf liefert, werden verpasste/verspaetete Laeufe automatisch nachgetragen.
Neue Slot-Schluessel ("06", "20", weitere "00"…"23") sind zusaetzlich zu "08"…"18"; das macOS-Format bleibt gleich.
"""
import json, os, sys, urllib.request
from datetime import datetime, timedelta, timezone, date
from zoneinfo import ZoneInfo

ZURICH = ZoneInfo("Europe/Zurich")
FORECAST_HOUR = 8    # Prognosen werden zum 08:00-Zeitpunkt berechnet
CLOSE_HOUR = 16      # "Tagesende" = 16:00 (Ziel beider Prognosen)
REQUIRED_HOURS = (FORECAST_HOUR, CLOSE_HOUR)
DEFAULT_HOURS = [6, 8, 10, 12, 14, 16, 18, 20]
TIMES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "capture-times.json")
ECB_LOOKBACK_DAYS = 45  # Kalendertage EZB-Verlauf als Ergaenzung fuer das 7-Tage-Modell
START_DAY = date(2026, 10, 1)
CURRENCIES = [  # code, biquote-Symbol, invertiert, Einheit
    ("USD", "USDCHF", False, 1),
    ("EUR", "EURCHF", False, 1),
    ("GBP", "GBPCHF", False, 1),
]
UA = "Waehrungsuebersicht/1.0 (+github-actions)"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "rates.json")


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def slot_dt(d, hour):
    return datetime(d.year, d.month, d.day, hour, tzinfo=ZURICH)


def is_weekday(d):
    return d.weekday() < 5


def weekdays(frm, to):
    out, d = [], frm
    while d <= to:
        if is_weekday(d):
            out.append(d)
        d += timedelta(days=1)
    return out


def forecast_end_of_day(candles, day):
    """Port von forecastEndOfDay (main.swift). candles: Liste (time_utc, open, high, low) in CHF/Einheit."""
    t8 = slot_dt(day, FORECAST_HOUR)
    cs = [c for c in candles if c[0] <= t8]
    by_time = {}
    for c in cs:
        by_time.setdefault(c[0], c)
    if t8 not in by_time:
        return None
    open8 = by_time[t8][1]
    close_hour = CLOSE_HOUR
    prev_days, d = [], day
    for _ in range(14):
        if len(prev_days) >= 6:
            break
        d -= timedelta(days=1)
        if is_weekday(d) and slot_dt(d, close_hour) in by_time:
            prev_days.append(d)
    if len(prev_days) < 2:
        return None
    closes = [by_time[slot_dt(p, close_hour)][1] for p in prev_days]  # neuester zuerst
    prev_close = closes[0]
    trend = (closes[0] - closes[-1]) / (len(closes) - 1)
    overnight = open8 - prev_close
    ranges = []
    for p in prev_days[:5]:
        frm, to = slot_dt(p, FORECAST_HOUR), slot_dt(p, close_hour)
        dc = [c for c in cs if frm <= c[0] < to]
        if dc:
            ranges.append(max(c[2] for c in dc) - min(c[3] for c in dc))
    avg_range = sum(ranges) / len(ranges) if ranges else abs(open8) * 0.005
    change = 0.5 * trend - 0.3 * overnight
    limit = 0.5 * avg_range
    change = min(max(change, -limit), limit)
    return open8 + change


def forecast_target_day(day):
    """Zieltag der 7-Tage-Prognose: gleicher Wochentag eine Woche spaeter."""
    return day + timedelta(days=7)


def forecast_7_days(candles, ecb_series, day):
    """Prognose des Kurses 7 Tage spaeter (gleicher Wochentag, 16:00 Schweizer Zeit).

    Port von forecastSevenDays (main.swift). Deterministisch: nur Kerzen bis und mit 08:00 von `day`
    und EZB-Referenzkurse von Tagen VOR `day` (der EZB-Kurs von `day` erscheint erst ca. 16:00).
    candles: Liste (time_utc, open, high, low); ecb_series: dict "yyyy-mm-dd" -> CHF pro Einheit.
    Modell:
      Tagesschlusskurse der letzten bis zu 20 Handelstage: 16:00-Kurs (biquote), sonst EZB-Referenzkurs
      m      = mittlere Tagesrendite (log) der letzten bis zu 10 Tage
      trend  = spot * 0.3 * 5 * m                    (gedaempftes Momentum, 5 Handelstage)
      revert = 0.15 * (Durchschnitt der Schlusskurse - spot)  (Rueckkehr zum Mittel, nur ab 5 Kursen)
      Begrenzung: Veraenderung hoechstens +/- 1 Wochen-Standardabweichung
                  (sd der Tagesrenditen * sqrt(5) * spot; ohne Verlauf 0.5 % pro Tag)
    Rueckgabe None, wenn kein 08:00-Kurs oder weniger als 2 Schlusskurse vorhanden sind.
    """
    import math
    t8 = slot_dt(day, FORECAST_HOUR)
    by_time = {}
    for c in candles:
        if c[0] <= t8:
            by_time.setdefault(c[0], c)
    if t8 not in by_time:
        return None
    spot = by_time[t8][1]
    closes, d = [], day  # neuester zuerst
    for _ in range(40):
        if len(closes) >= 20:
            break
        d -= timedelta(days=1)
        if not is_weekday(d):
            continue
        c16 = by_time.get(slot_dt(d, CLOSE_HOUR))
        if c16 is not None:
            closes.append(c16[1])
        elif d.isoformat() in ecb_series:
            closes.append(ecb_series[d.isoformat()])
    if len(closes) < 2:
        return None
    rets = [math.log(closes[i] / closes[i + 1]) for i in range(len(closes) - 1)]
    m = sum(rets[:10]) / len(rets[:10])
    horizon = 5.0
    trend = spot * 0.3 * horizon * m
    revert = 0.15 * (sum(closes) / len(closes) - spot) if len(closes) >= 5 else 0.0
    if len(rets) >= 3:
        mean = sum(rets) / len(rets)
        sd = math.sqrt(sum((r - mean) ** 2 for r in rets) / (len(rets) - 1))
    else:
        sd = 0.005
    limit = sd * math.sqrt(horizon) * spot
    change = min(max(trend + revert, -limit), limit)
    return spot + change


def load_capture_hours():
    """Ganze Stunden 0-23 aus data/capture-times.json. 08 und 16 sind immer enthalten.

    Ungueltige oder leere Datei: Standardliste. Schreibt die Datei nie.
    """
    chosen = None
    try:
        with open(TIMES, encoding="utf-8") as f:
            data = json.load(f)
        raw = data.get("hours") if isinstance(data, dict) else None
        parsed = []
        if isinstance(raw, list):
            for item in raw:
                if isinstance(item, bool):
                    continue
                n = item if isinstance(item, int) else None
                if n is None and isinstance(item, str) and item.strip().isdigit():
                    n = int(item.strip())
                if isinstance(n, int) and 0 <= n <= 23:
                    parsed.append(n)
        if parsed:
            chosen = parsed
        else:
            print("capture-times.json ohne gueltige Stunden, Standardzeiten", file=sys.stderr)
    except FileNotFoundError:
        print("capture-times.json fehlt, Standardzeiten", file=sys.stderr)
    except Exception as e:  # noqa
        print(f"capture-times.json ungueltig ({e}), Standardzeiten", file=sys.stderr)
    hours = sorted(set(chosen or DEFAULT_HOURS) | set(REQUIRED_HOURS))
    print("Erfassungszeiten (Zurich): " + ", ".join(f"{h:02d}" for h in hours))
    return hours


def load():
    try:
        with open(OUT, encoding="utf-8") as f:
            h = json.load(f)
    except FileNotFoundError:
        h = {}
    h.setdefault("version", 1)
    h.setdefault("days", {})
    return h


def day_rec(h, key):
    rec = h["days"].setdefault(key, {})
    rec.setdefault("slots", {})
    rec.setdefault("ecb", {})
    return rec


def put(dct, key, val):
    """Nur ergaenzen, nie ueberschreiben. Gibt True zurueck, wenn neu."""
    if key in dct:
        return False
    dct[key] = round(val, 6)
    return True


def main():
    capture_hours = load_capture_hours()
    now = datetime.now(timezone.utc)
    today = now.astimezone(ZURICH).date()
    h = load()
    changed, errors = 0, []
    first_key = START_DAY.isoformat()
    days = weekdays(START_DAY, today)

    # EZB-Referenzkurse (Basis EUR -> Kreuzkurse gegen CHF), inkl. Vorlauf fuer das 7-Tage-Modell
    ecb_all = {code: {} for code, *_ in CURRENCIES}
    try:
        start = (min(START_DAY, today - timedelta(days=14)) - timedelta(days=ECB_LOOKBACK_DAYS)).isoformat()
        syms = ",".join(sorted({c[0] for c in CURRENCIES} - {"EUR"} | {"CHF"}))
        resp = get_json(f"https://api.frankfurter.dev/v1/{start}..?base=EUR&symbols={syms}")
        for key, r in resp.get("rates", {}).items():
            chf = r.get("CHF")
            if not chf:
                continue
            for code, _, _, unit in CURRENCIES:
                x = 1.0 if code == "EUR" else r.get(code)
                if x:
                    ecb_all[code][key] = chf / x * unit
                    if key >= first_key:
                        changed += put(day_rec(h, key)["ecb"], code, chf / x * unit)
    except Exception as e:  # noqa
        errors.append(f"EZB: {e}")

    hours_back = int((now - slot_dt(START_DAY, 0)).total_seconds() // 3600) + 3
    limit = max(24, min(hours_back + 14 * 24, 1000))
    for code, sym, inv, unit in CURRENCIES:
        conv = (lambda q: (1 / q if inv else q) * unit)
        try:
            bars = get_json(f"https://biquote.io/api/{sym}/ohlc?interval=1h&limit={limit}")["bars"]
        except Exception as e:  # noqa
            errors.append(f"{sym}: {e}")
            continue
        candles = []
        for b in bars:
            t = datetime.fromisoformat(b["openTime"].replace("Z", "+00:00"))
            o, hi, lo = conv(b["open"]), conv(b["high"]), conv(b["low"])
            candles.append((t, o, max(hi, lo), min(hi, lo)))
            tz = t.astimezone(ZURICH)
            if not is_weekday(tz.date()) or tz.minute != 0 or tz.hour not in capture_hours:
                continue
            key = tz.date().isoformat()
            if key < first_key:
                continue
            # Eroeffnungskurs der Kerze = Kurs zur vollen Stunde (steht ab Kerzenbeginn fest)
            slot = day_rec(h, key)["slots"].setdefault(f"{tz.hour:02d}", {})
            changed += put(slot, code, o)
        candles.sort(key=lambda c: c[0])
        for d in days:
            rec = h["days"].get(d.isoformat())
            if rec and code in (rec.get("forecast") or {}):
                continue
            f = forecast_end_of_day(candles, d)
            if f is not None:
                rec = day_rec(h, d.isoformat())
                rec.setdefault("forecast", {})
                changed += put(rec["forecast"], code, f)
        # Prognose 7 Tage: einmal pro Tag (08:00), gespeichert beim Erstellungstag mit Zieldatum
        for d in days:
            rec = h["days"].get(d.isoformat())
            if not ecb_all[code]:  # ohne EZB-Verlauf nicht berechnen (identische Werte auf allen Geraeten)
                break
            if rec and code in (rec.get("forecast7") or {}):
                continue
            f = forecast_7_days(candles, ecb_all[code], d)
            if f is not None:
                rec = day_rec(h, d.isoformat())
                rec.setdefault("forecast7", {})
                rec.setdefault("forecast7Target", forecast_target_day(d).isoformat())
                changed += put(rec["forecast7"], code, f)

    if changed:
        h["updated"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    h["days"] = dict(sorted(h["days"].items()))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(h, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, OUT)
    print(f"{changed} neue Werte; Fehler: {errors or 'keine'}")
    # Nur scheitern, wenn gar nichts geladen werden konnte
    if errors and len(errors) == len(CURRENCIES) + 1:
        sys.exit(1)


if __name__ == "__main__":
    main()
