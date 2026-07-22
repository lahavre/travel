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

# Booking details transcribed from the confirmation vouchers in
# OneDrive/Travel/2023 01. Japan/Hotel Booking/.
#
# Deliberately NOT copied across, because this repo is public: door and lock-box
# codes, host directions, and the guest's own phone/email/date of birth. Laundry
# was never recorded on any voucher, so it stays null rather than guessed.
RESERVATIONS = {
    "Sotetsu Fresa Inn Hamamatsucho Daimon": {
        "reservation": {"site": "Agoda", "bookingNo": "935918893",
                        "refs": [{"label": "Booking.com Ref", "value": "2318680570"}]},
        "address": "1-2-7 Shibadaimon, Minato-ku, Shinbashi, Tokyo, Japan, 105-0012",
        "phone": "+81 3 5472 2031",
        "rooms": 1,
        "roomType": "Double Room - Smoking (requested non-smoking, twin beds)",
        "meal": None,
        "parking": "N/A",
        "laundry": None,
        "prepaid": True,
        "extraRemarks": "Taxes and fees of MYR 29.72 included.",
    },
    "K's House Nikko - Kinugawa Onsen": {
        "reservation": {"site": "Agoda", "bookingNo": "941298857"},
        "address": "Kinugawaonsen Ōhara Nikko City, 680-1, Kinugawa, Nikko, Japan, 321-2522",
        "phone": "+81 288 77 1300",
        "rooms": 1,
        "roomType": "Economy Room with Bunk Bed and Shared Bathroom",
        "meal": None,
        "parking": "Free",
        "laundry": None,
        "prepaid": True,
        "extraRemarks": "Taxes and fees of MYR 89.80 included; bathing tax of "
                        "MYR 19.84 payable at the property.",
    },
    "Airbnb - 2F-B Aizu Wakamatsu City": {
        "reservation": {"site": "Airbnb", "bookingNo": "HMMDH2JRPK"},
        "address": "4-12 Sakaemachi エクシード Ⅱ 2F-B, Aizuwakamatsu, Fukushima 965-0871, Japan",
        "phone": None,
        "rooms": 1,
        "roomType": "Entire home · 3DK, sleeps 9 (host: Taku)",
        "meal": None,
        "parking": "Paid",
        "parkingNote": "JPY 1,000 / night",
        "dropRemarks": True,
        "laundry": None,
        "prepaid": True,
        "extraRemarks": None,
    },
    "donaludo Pension": {
        "reservation": {"site": "Agoda", "bookingNo": "964540701",
                        "refs": [{"label": "Booking.com Ref", "value": "2752987512"}]},
        "address": "Kengamine 1093, Kitashiobara, Kitashiobara, Japan, 969-2701",
        "phone": None,
        "rooms": 2,
        "roomType": "Twin Room with Extra Bed",
        "meal": None,
        "parking": "Free",
        "laundry": None,
        "prepaid": False,
        "payAtProperty": "JPY 22,000 on check-in",
        "dropRemarks": True,
        "extraRemarks": "JPY 22,000 total, JPY 5,500 each — bring cash. "
                        "Taxes and fees of MYR 65.84 included.",
    },
    "HOTEL SANKYO FUKUSHIMA": {
        "reservation": {"site": "Agoda", "bookingNo": "964590833",
                        "refs": [{"label": "Booking Ref", "value": "3408024"}]},
        "address": "7-11, Omachi, Fukushima, Fukushima, Japan, 960-8041",
        "phone": "+81 24 525 2211",
        "rooms": 1,
        "roomType": "[Adjoining/Nearby Room] 2 Bedrooms, 4 Single Beds, Non Smoking",
        "meal": None,
        "parking": "Paid",
        "parkingNote": "JPY 900 / night",
        "dropRemarks": True,
        "laundry": None,
        "prepaid": True,
        "extraRemarks": "Taxes and fees of MYR 88.20 included.",
    },
    "Takasagoya Ryokan": {
        "reservation": {"site": "Agoda", "bookingNo": "969115477",
                        "refs": [{"label": "Booking.com Ref", "value": "3903868873"}]},
        "address": "23 Zaouonsen, Zao, Yamagata, Japan, 990-2301",
        "phone": "+81 23 694 9026",
        "rooms": 2,
        "roomType": "Japanese-Style Room with Shared Bathroom",
        "meal": None,
        "parking": "Free",
        "laundry": None,
        "prepaid": True,
        "extraRemarks": "Taxes and fees of MYR 91.60 included.",
    },
    "Yamagata Nanokamachi Washington Hotel": {
        "reservation": {"site": "Agoda", "bookingNo": "981801613",
                        "refs": [{"label": "JTB Ref", "value": "6035581297"}]},
        "address": "1-4-31 Nanokamachi, Yamagata city, Yamagata, Japan, 990-0042",
        "phone": None,
        "rooms": 2,
        "roomType": "Standard Room - Twin",
        "meal": None,
        "parking": "Paid",
        "parkingNote": "JPY 600 / night, required in the city",
        "dropRemarks": True,
        "laundry": None,
        "prepaid": True,
        "extraRemarks": "Taxes and fees of MYR 151.74 included.",
    },
    "Takimikan Ryokan": {
        "reservation": {"site": "Takimikan (direct)", "bookingNo": "6890"},
        "address": None,
        "phone": None,
        "rooms": 1,
        "roomType": "Japanese-style room",
        "meal": "Breakfast & dinner",
        "parking": "Free",
        "laundry": None,
        "prepaid": True,
        "cancellation": "Free cancellation before 15:00, 22 Oct 2023",
        "dropRemarks": True,
        "extraRemarks": "JPY 75,900 for 3 guests (JPY 25,300 each), TAKIMI-kaiseki "
                        "plan. Bathing tax payable at the property.",
    },
    "Airbnb - Room in a home hosted by Ryu": {
        "reservation": {"site": "Airbnb", "bookingNo": "HMDZMSZNX8"},
        "address": "2-27 Hagigaoka, Taihaku-ku, Sendai, Miyagi Prefecture 982-0848, Japan",
        "phone": None,
        "rooms": 1,
        "roomType": "Private room (host: Ryu)",
        "meal": None,
        "parking": "Free",
        "laundry": None,
        "prepaid": True,
        "cancellation": "Partial refund if cancelled before 13:00, 17 Oct 2023",
        "extraRemarks": None,
    },
    "Airbnb - Entire rental unit hosted by Maru": {
        "reservation": {"site": "Airbnb", "bookingNo": "HMZ5348JDK"},
        "address": "鬼怒川温泉大原 72-72 飛鳥ハイツ 302, 日光市, 栃木県 321-2522, Japan",
        "phone": None,
        "rooms": 1,
        "roomType": "Entire home · 3 beds (host: Maru)",
        "meal": None,
        "parking": "Free",
        "parkingNote": "160 m from the apartment",
        "laundry": None,
        "prepaid": True,
        "cancellation": "Partial refund if cancelled before 16:00, 19 Oct 2023",
        "extraRemarks": None,
    },
    "Airbnb - Entire rental unit hosted by Shohei": {
        "reservation": {"site": "Airbnb", "bookingNo": "HMTNYKEPBK"},
        "address": "方南 1-2-3, メゾン･ド・ダダ弐番館 105, 杉並区, 東京都 168-0062, Japan",
        "phone": None,
        "rooms": 1,
        "roomType": "Entire home · 2 beds (host: Shohei)",
        "meal": None,
        "parking": "N/A",
        "laundry": None,
        "prepaid": True,
        "cancellation": "Partial refund if cancelled before 15:00, 21 Oct 2023",
        "extraRemarks": None,
    },
}


def to24(hour, minute, meridiem):
    hour = int(hour)
    minute = int(minute or 0)
    if meridiem == "pm" and hour != 12:
        hour += 12
    elif meridiem == "am" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


def parse_window(raw):
    """"3-7pm" -> ("15:00", "19:00");  "From 3pm" -> ("15:00", None);
    "Until 11am" -> (None, "11:00").  Returns (start, end) in 24-hour time."""
    if not raw:
        return None, None
    s = str(raw).strip().lower()

    # "3-7pm", "8-11am" — one meridiem at the end applies to both ends.
    m = re.match(r"^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$", s)
    if m:
        mer = m.group(5)
        start = to24(m.group(1), m.group(2), mer)
        end = to24(m.group(3), m.group(4), mer)
        # "3-10pm" means 15:00-22:00, but a start later than the end means the
        # range crossed noon, e.g. "11-2pm".
        if start > end:
            start = to24(m.group(1), m.group(2), "am")
        return start, end

    m = re.match(r"^from\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)$", s)
    if m:
        return to24(m.group(1), m.group(2), m.group(3)), None

    m = re.match(r"^until\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)$", s)
    if m:
        return None, to24(m.group(1), m.group(2), m.group(3))

    return None, None


def cancellation_text(workbook_value, override, check_in):
    """Display-ready cancellation wording, always carrying the year.

    The voucher wins where we have one — the workbook recorded Ginzan and the
    three Airbnb stays as "No" although their confirmations give deadlines.
    """
    if override:
        return override
    v = (workbook_value or "").strip()
    if not v:
        return None
    if v.lower() == "no":
        return "Non-refundable"
    # "Before 11 Oct" -> "Free cancellation before 11 Oct 2023". A cancellation
    # deadline always precedes check-in, so it shares that year.
    year = (check_in or "")[:4]
    if year and year not in v:
        v = f"{v} {year}"
    # Lower only the leading word so the month keeps its capital.
    return "Free cancellation " + v[0].lower() + v[1:]


def meal_from(breakfast):
    return "Breakfast" if (breakfast or "").strip().lower() == "yes" else None


def parking_from(parking):
    p = (parking or "").strip().lower()
    if p == "free":
        return "Free"
    if p == "charges":
        return "Paid"
    return "N/A"


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
    name = s(v[5])
    booking = RESERVATIONS.get(name, {})
    check_in_from, check_in_to = parse_window(v[7])
    _, check_out_until = parse_window(v[8])
    remarks = None if booking.get("dropRemarks") else s(v[13])
    if booking.get("extraRemarks"):
        remarks = f"{remarks}\n{booking['extraRemarks']}" if remarks else booking["extraRemarks"]

    accommodation.append({
        "city": s(v[0]),
        "name": name,
        "reservation": booking.get("reservation"),
        "address": booking.get("address"),
        "phone": booking.get("phone"),
        "checkIn": d(v[1]),
        "checkOut": d(v[2]),
        "nights": num(v[3]),
        "persons": num(v[4]),
        "rooms": booking.get("rooms"),
        "roomType": booking.get("roomType"),
        "cancellation": cancellation_text(v[6], booking.get("cancellation"), d(v[1])),
        # 24-hour windows parsed from the workbook's "3-7pm" / "Until 11am" text.
        "checkInFrom": check_in_from,
        "checkInTo": check_in_to,
        "checkOutUntil": check_out_until,
        "laundry": booking.get("laundry"),
        "meal": booking.get("meal") or meal_from(v[9]),
        "parking": booking.get("parking") or parking_from(v[10]),
        "parkingNote": booking.get("parkingNote"),
        "prepaid": booking.get("prepaid"),
        "payAtProperty": booking.get("payAtProperty"),
        "pricePerNight": num(v[11]),
        "total": num(v[12]),
        "remarks": remarks,
        "perPerson": {k: num(v[14 + i]) for i, k in enumerate(["CMC", "WY", "Gary", "Kalai"])},
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
