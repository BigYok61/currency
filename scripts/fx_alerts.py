#!/usr/bin/env python3
"""Waehrungsuebersicht – FX-Push-Alarme via ntfy (GitHub Actions, alle 15 Min. Mo–Fr).

Meldet, wenn sich USD/CHF bzw. EUR/CHF im Tagesverlauf gegenueber dem Kurs von 08:00 Schweizer Zeit
(vor 08:00: Tageseroeffnung = erste Stundenkerze ab 00:00 Zuerich) staerker bewegt als die Schwelle:
  Rueckgang um mehr als `down` % bzw. Anstieg um mehr als `up` %.
Schwellen und Ein/Aus je Waehrung: data/fx-alerts.json (Web-App, Mac-App oder direkt auf GitHub bearbeitbar).
Je Waehrung und Richtung hoechstens eine Meldung pro Tag; Status in data/fx-alert-state.json (neuer Tag = neu scharf).
Kurse: biquote.io (Mittelkurs, gleiche Quelle wie die Zeitpunkte in rates.json).
Das ntfy-Topic kommt aus NTFY_TOPIC (Secret) und wird nie ausgegeben.
  python3 scripts/fx_alerts.py          # regulaerer Lauf (nur werktags 07:00–22:00 Zuerich)
  python3 scripts/fx_alerts.py --test   # Test-Push (als Test gekennzeichnet)
  FX_DRY=1 python3 scripts/fx_alerts.py --force   # lokal: Zeitfenster ignorieren, nichts senden
"""
import json, os, sys, time, urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

ZURICH = ZoneInfo("Europe/Zurich")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
F_CFG = os.path.join(ROOT, "data", "fx-alerts.json")
F_STATE = os.path.join(ROOT, "data", "fx-alert-state.json")
SYMBOLS = {"USD": "USDCHF", "EUR": "EURCHF", "GBP": "GBPCHF"}
DEFAULTS = {"USD": {"enabled": True, "down": 0.5, "up": 0.25}, "EUR": {"enabled": True, "down": 0.5, "up": 0.25}}
WINDOW = (7, 22)          # Stunden Zuerich: 07:00 bis 22:00 (inkl. 22:00-Lauf bis 22:14)
BASE_HOUR = 8
MAX_QUOTE_AGE = 20 * 60   # aeltere Kurse (Markt geschlossen/Stoerung) loesen keinen Alarm aus
UA = "Waehrungsuebersicht/1.4 (+github-actions)"
APP_URL = "https://bigyok61.github.io/waehrungsuebersicht/"


def log(*a):
    print(*a, flush=True)


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, path)


def push(topic, title, message, tags, priority=4):
    if os.environ.get("FX_DRY"):
        log("DRY:", title, "|", message)
        return True
    obj = {"topic": topic, "title": title, "message": message, "tags": tags, "priority": priority, "click": APP_URL}
    for i in range(3):
        try:
            req = urllib.request.Request("https://ntfy.sh/", data=json.dumps(obj).encode(),
                                         headers={"User-Agent": UA, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                r.read()
            return True
        except Exception as e:  # noqa
            log(f"ntfy Fehler {type(e).__name__}")
            time.sleep(2 * (i + 1))
    return False


def num(v):
    return f"{v:.4f}"


def pct(v):
    # typografisches Minus wie in der Vorgabe: «USD/CHF −0.52 % seit 08:00»
    return ("+" if v > 0 else "−" if v < 0 else "±") + f"{abs(v):.2f} %"


def base_rate(symbol, now_z):
    """Kurs 08:00 (Eroeffnung der 08-Uhr-Stundenkerze) bzw. vor 08:00 die Tageseroeffnung. Rueckgabe (Kurs, Label)."""
    bars = get_json(f"https://biquote.io/api/{symbol}/ohlc?interval=1h&limit=30")["bars"]
    today, first = now_z.date(), None
    for b in sorted(bars, key=lambda b: b["openTime"]):
        t = datetime.fromisoformat(b["openTime"].replace("Z", "+00:00")).astimezone(ZURICH)
        if t.date() != today:
            continue
        if first is None:
            first = (b["open"], t)
        if t.hour == BASE_HOUR and t.minute == 0:
            return b["open"], "08:00"
    if first and now_z.hour < BASE_HOUR:
        return first[0], "Tageseröffnung"
    return None, None


def current_rate(symbol, now_utc):
    t = get_json(f"https://biquote.io/api/{symbol}")
    mid = t.get("mid") or ((t.get("bid") or 0) + (t.get("ask") or 0)) / 2
    qt = t.get("lastQuoteAt") or t.get("timestamp")
    age = (now_utc - datetime.fromisoformat(qt.replace("Z", "+00:00"))).total_seconds() if qt else t.get("quoteAgeSeconds", 0)
    return (mid if mid and mid > 0 else None), age, t.get("marketState", "open")


def main():
    topic = (os.environ.get("NTFY_TOPIC") or "").strip()
    if not topic and not os.environ.get("FX_DRY"):
        log("FEHLER: NTFY_TOPIC fehlt"); sys.exit(2)
    now_utc = datetime.now(timezone.utc)
    now_z = now_utc.astimezone(ZURICH)

    if "--test" in sys.argv:
        lines = []
        for code in ("USD", "EUR"):
            try:
                cur, _, _ = current_rate(SYMBOLS[code], now_utc)
                base, lab = base_rate(SYMBOLS[code], now_z)
                if cur and base:
                    lines.append(f"{code}/CHF {pct((cur / base - 1) * 100)} seit {lab} ({num(base)} → {num(cur)})")
                elif cur:
                    lines.append(f"{code}/CHF aktuell {num(cur)}")
            except Exception as e:  # noqa
                lines.append(f"{code}/CHF: Kurs nicht abrufbar ({type(e).__name__})")
        msg = "TEST – die FX-Alarme sind eingerichtet (keine echte Kursbewegung).\n" + "\n".join(lines)
        ok = push(topic, "TEST: Währungsübersicht FX-Alarm", msg, ["test_tube"], priority=3)
        log("Test-Push gesendet" if ok else "Test-Push fehlgeschlagen")
        sys.exit(0 if ok else 1)

    if "--force" not in sys.argv:
        if now_z.weekday() >= 5:
            log("Wochenende – keine Prüfung."); return
        if not (WINDOW[0] <= now_z.hour <= WINDOW[1]) or (now_z.hour == WINDOW[1] and now_z.minute > 14):
            log(f"Ausserhalb {WINDOW[0]:02d}:00–{WINDOW[1]:02d}:00 Zürich – keine Prüfung."); return

    cfg = read_json(F_CFG, {"currencies": DEFAULTS}).get("currencies") or DEFAULTS
    key = now_z.date().isoformat()
    state = read_json(F_STATE, {})
    if state.get("date") != key:          # neuer Tag: alle Alarme wieder scharf
        state = {"date": key, "sent": {}}
    sent = state.setdefault("sent", {})
    changed = False

    for code, c in cfg.items():
        if code not in SYMBOLS or not c.get("enabled", True):
            continue
        try:
            down, up = float(c.get("down", 0.5)), float(c.get("up", 0.25))
        except (TypeError, ValueError):
            log(f"{code}: ungültige Schwelle – übersprungen"); continue
        try:
            cur, age, mstate = current_rate(SYMBOLS[code], now_utc)
            base, lab = base_rate(SYMBOLS[code], now_z)
        except Exception as e:  # noqa
            log(f"{code}: Abruf fehlgeschlagen ({type(e).__name__})"); continue
        if not cur or not base:
            log(f"{code}: kein Kurs bzw. kein Basiskurs"); continue
        if age > MAX_QUOTE_AGE:
            log(f"{code}: Kurs veraltet ({int(age)} s, Markt {mstate}) – kein Alarm"); continue
        change = (cur / base - 1) * 100
        log(f"{code}/CHF {pct(change)} seit {lab} ({num(base)} → {num(cur)}); Schwellen −{down} / +{up} %")
        for direction, hit in (("down", change < -down), ("up", change > up)):
            k = f"{code}:{direction}"
            if not hit or k in sent:
                continue
            msg = f"{code}/CHF {pct(change)} seit {lab} ({num(base)} → {num(cur)})"
            title = f"Währungsübersicht: {code}/CHF {'fällt' if direction == 'down' else 'steigt'}"
            tags = ["chart_with_downwards_trend"] if direction == "down" else ["chart_with_upwards_trend"]
            if push(topic, title, msg + f"\nSchwelle {'−' if direction == 'down' else '+'}{down if direction == 'down' else up} %", tags):
                sent[k] = {"time": now_z.strftime("%H:%M"), "pct": round(change, 3), "base": round(base, 6), "rate": round(cur, 6)}
                changed = True
                log(f"Push gesendet: {k}")

    if changed or not os.path.exists(F_STATE) or read_json(F_STATE, {}).get("date") != key:
        write_json(F_STATE, state)


if __name__ == "__main__":
    main()
