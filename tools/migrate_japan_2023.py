#!/usr/bin/env python3
"""Rebuild trips/2023-10-japan-tohoku/data.json from the original Excel workbook.

Kept for provenance: it records exactly how the 2023 trip's figures were derived,
and is the starting point for migrating another old workbook. It is specific to
that file's sheet layout ("High Level Itinerary v2" is the route actually
travelled; the other itinerary sheets were discarded proposals).

    python tools/migrate_japan_2023.py "path/to/Japan Budget & Itinerary 2023.xlsx"

Needs `openpyxl`. Close the workbook in Excel first — an open file is locked.
Flight details come from the airline confirmation, not the workbook, and are
hardcoded below.
"""
import openpyxl, json, datetime, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

DEFAULT_SRC = os.path.join(
    os.path.expanduser("~"), "OneDrive", "Travel", "2023 01. Japan",
    "Japan Budget & Itinerary 2023.xlsx",
)
SRC = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
OUT = os.path.join(REPO, "trips", "2023-10-japan-tohoku", "data.json")

wb = openpyxl.load_workbook(SRC, data_only=True)


def s(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def num(v):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return round(float(v), 2)
    return None


def d(v):
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, datetime.date):
        return v.strftime("%Y-%m-%d")
    return None


def t(v):
    if isinstance(v, datetime.time):
        return v.strftime("%H:%M")
    if isinstance(v, datetime.datetime):
        return v.strftime("%H:%M")
    return None


def rows(name):
    return list(wb[name].iter_rows())


RANGE_RE = re.compile(r"^(-?\d+)\s*-\s*(-?\d+)$")


def parse_temperature(raw):
    """"Tokyo - 18-25\nZao Onsen - -1-12" -> [{location, min, max, note}].

    Values in the workbook are already Celsius. Lines that aren't a plain
    numeric range (e.g. "Azuma - ?? Expected lower than 9-16") are kept as a
    note rather than guessed at.
    """
    if not raw:
        return []
    out = []
    for line in str(raw).split("\n"):
        line = line.strip()
        if not line:
            continue
        location, _, rest = line.partition(" - ")
        m = RANGE_RE.match(rest.strip())
        if m:
            out.append({
                "location": location.strip(),
                "min": int(m.group(1)),
                "max": int(m.group(2)),
                "note": None,
            })
        else:
            out.append({
                "location": location.strip() if rest else None,
                "min": None,
                "max": None,
                "note": (rest or line).strip(),
            })
    return out


# ---------- Overview (High Level Itinerary v2) ----------
overview = []
for r in rows("High Level Itinerary v2")[1:]:
    v = [c.value for c in r]
    if not (isinstance(v[0], str) and v[0].startswith("Day ")):
        continue
    city = s(v[3]).replace("\n", " ") if s(v[3]) else None
    if city == "N/A":  # final day — flying home, no overnight stay
        city = "Tokyo → Kuala Lumpur"
    overview.append({
        "day": int(v[0].split()[1]),
        "weekday": s(v[1]),
        "date": d(v[2]),
        "city": city,
        "morning": s(v[4]),
        "afternoon": s(v[5]),
        "evening": s(v[6]),
        "remarks": s(v[7]),
        # Per-slot remarks: the workbook only ever had one note per day, so these
        # start empty and get filled in going forward.
        "slotRemarks": {"morning": None, "afternoon": None, "evening": None},
        "temperature": parse_temperature(v[8]),
    })

# ---------- Detailed days ----------
COST_KEYS = ["transport", "fuel", "food", "sightseeing", "misc"]
days = {}
for sheet in ["Nikko_Aizu", "Fukushima_Yamagata", "Sendai_Nikko"]:
    current = None
    for r in rows(sheet)[1:]:
        v = [c.value for c in r]
        if isinstance(v[0], str):  # Total rows
            continue
        if isinstance(v[0], (int, float)):
            current = int(v[0])
            days[current] = {"day": current, "date": d(v[1]), "items": []}
        if current is None:
            continue
        activity = s(v[3])
        if not activity:
            continue
        costs = {k: num(v[4 + i]) for i, k in enumerate(COST_KEYS)}
        costs = {k: val for k, val in costs.items() if val}
        days[current]["items"].append({
            "time": t(v[2]),
            "activity": activity,
            "costs": costs,
            "remarks": s(v[9]),
        })

# merge overview city/weekday into days
by_day = {o["day"]: o for o in overview}
day_list = []
for n in sorted(days):
    day = days[n]
    ov = by_day.get(n, {})
    day["city"] = ov.get("city")
    day["weekday"] = ov.get("weekday")
    day["temperature"] = ov.get("temperature")
    day["summary"] = ov.get("remarks")
    day_list.append(day)

# ---------- Accommodation ----------
accommodation = []
for r in rows("Hotel")[2:]:
    v = [c.value for c in r]
    if not isinstance(v[0], str) or v[0].startswith("Grand Total") or v[0].startswith("Note"):
        continue
    if not d(v[1]):
        continue
    accommodation.append({
        "city": s(v[0]),
        "checkIn": d(v[1]),
        "checkOut": d(v[2]),
        "nights": num(v[3]),
        "persons": num(v[4]),
        "name": s(v[5]),
        "freeCancellation": s(v[6]),
        "checkInTime": s(v[7]),
        "checkOutTime": s(v[8]),
        "breakfast": s(v[9]),
        "parking": s(v[10]),
        "pricePerNight": num(v[11]),
        "total": num(v[12]),
        "remarks": s(v[13]),
        "perPerson": {k: num(v[14 + i]) for i, k in enumerate(["CMC", "WY", "Gary", "Kalai"])},
        "payment": s(v[18]),
    })

# ---------- Budget (Summary) ----------
SPELLING = {
    "Airplace Ticket": "Airplane Ticket",
    "Accomodation": "Accommodation",
    "Miscellanous": "Miscellaneous",
    "Japan Sim/Roaming": "SIM / Roaming",
}
SKIP = {"Budget Costing", "Total Cost", "Average per day", "Actual (JPY)",
        "Actual (MYR)", "Total Spendings", "Note"}
budget_categories = []
for r in rows("Summary")[5:]:
    v = [c.value for c in r]
    label = s(v[0])
    if not label or label in SKIP or label.startswith("1."):
        continue
    budget_categories.append({
        "category": SPELLING.get(label, label),
        "perDay": num(v[1]),
        "budget": num(v[2]),
        "actual": num(v[4]),
    })

# ---------- Exchange rate ----------
fx_history = []
for r in rows("Exchange Rate")[1:]:
    v = [c.value for c in r]
    if not d(v[0]):
        continue
    fx_history.append({"date": d(v[0]), "home": num(v[1]), "local": num(v[2]),
                       "rate": round(float(v[3]), 4)})

# ---------- Transport (distance log) ----------
transport_legs = []
for r in rows("Transportation")[2:]:
    v = [c.value for c in r]
    if not isinstance(v[0], (int, float)) or not d(v[1]):
        continue
    transport_legs.append({
        "day": int(v[0]) + 1,  # sheet counts driving days from Day 2 of the trip
        "date": d(v[1]),
        "route": s(v[2]),
        "km": num(v[3]),
        "refuel": s(v[4]) == "Yes",
    })

# ---------- Settle tab ----------
TRAVELERS = ["CMC", "WY", "Gary", "Kalai"]
settle = []
for r in rows("Settle_Tab")[1:]:
    v = [c.value for c in r]
    label = s(v[0])
    if not label or label.startswith("Payment History") or label.startswith("1.") or label.startswith("2."):
        continue
    settle.append({
        "label": label.replace("\n", " "),
        "amounts": {tr: num(v[1 + i]) for i, tr in enumerate(TRAVELERS)},
        "remarks": s(v[5]),
    })

# ---------- To-Do ----------
todo = []
for r in rows("To-Do"):
    v = [c.value for c in r]
    if s(v[1]) is None or s(v[1]) == "To Do List":  # blank + header rows
        continue
    todo.append({
        "ref": str(s(v[0])) if s(v[0]) is not None else None,
        "task": s(v[1]),
        "status": s(v[2]),
        "remarks": s(v[3]),
        "url": s(v[4]),
    })

# Flights, from the airline booking confirmation. All times are local to each airport.
flights = [
    {
        "type": "Outbound",
        "date": "2023-10-13",
        "from": "Kuala Lumpur (KUL)",
        "fromTerminal": "KLIA2",
        "to": "Tokyo Haneda (HND)",
        "toTerminal": None,
        "airline": "AirAsia X",
        "flightNo": "D7 522",
        "departTime": "14:20",
        "arriveTime": "22:30",
        "duration": "7h 10m",
        "arrivesNextDay": False,
        "remarks": None,
    },
    {
        "type": "Return",
        "date": "2023-10-29",
        "from": "Tokyo Haneda (HND)",
        "fromTerminal": None,
        "to": "Kuala Lumpur (KUL)",
        "toTerminal": "KLIA2",
        "airline": "AirAsia X",
        "flightNo": "D7 523",
        "departTime": "23:50",
        "arriveTime": "06:45",
        "duration": "7h 55m",
        "arrivesNextDay": True,
        "remarks": "Lands Mon, 30 Oct 2023.",
    },
]

data = {
    "slug": "2023-10-japan-tohoku",
    "title": "Japan — Tohoku, Fukushima & Nikko",
    "destination": "Japan",
    "emoji": "🇯🇵",
    "startDate": "2023-10-13",
    "endDate": "2023-10-29",
    "travelers": TRAVELERS,
    "homeCurrency": "MYR",
    "tripCurrency": "JPY",
    # rate = home-currency units per `per` units of the trip currency
    "exchangeRate": {"per": 100, "rate": 3.305, "history": fx_history},
    "summary": {
        "totalDays": 17,
        "budgetTotal": 12885.85,
        "actualTotal": 8407.10,
        "note": "Budget and actual figures are one person's share (the trip organiser). "
                "Group-wide totals live on the Accommodation and Settle-up tables.",
    },
    "flights": flights,
    "budget": {"categories": budget_categories},
    "settle": settle,
    "overview": overview,
    "days": day_list,
    "accommodation": accommodation,
    "transport": {
        "mode": "Self-drive — Toyota Corolla Touring, collected in Hamamatsucho, returned in Nakano/Shinjuku",
        "totalKm": 1956.5,
        "rentalTotal": 6433.23,
        "legs": transport_legs,
    },
    "todo": todo,
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("days:", len(day_list), "items:", sum(len(x["items"]) for x in day_list))
print("overview:", len(overview), "hotels:", len(accommodation))
print("budget cats:", [c["category"] for c in budget_categories])
print("settle rows:", [x["label"] for x in settle])
print("todo:", len(todo), "legs:", len(transport_legs), "fx:", len(fx_history))
