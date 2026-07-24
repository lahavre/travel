#!/usr/bin/env python3
"""Fill a trip's day-by-day weather from Open-Meteo.

    python tools/fetch_weather.py trips/2026-03-somewhere/data.json

Open-Meteo needs no key, so the numbers are written into data.json and the site
stays static. A trip still ahead gets the forecast; one already past gets the
archive, which is the same set of daily fields. Either way each place ends up
with one set of figures — this is a planner, so there is nothing to compare a
forecast against.

Re-run it as departure approaches: a forecast more than a couple of weeks out is
barely better than a seasonal average, and the API only forecasts about 16 days.

Only places in PLACES are fetched. Their coordinates come from Open-Meteo's own
geocoding API, checked against the prefecture they should be in — an onsen or a
mountain often geocodes to somewhere else entirely, and weather from the wrong
altitude is worse than none. A place left out keeps whatever the trip recorded.
"""
import datetime
import json
import sys
import time
import urllib.parse
import urllib.request

ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
FORECAST = "https://api.open-meteo.com/v1/forecast"

# name in data.json -> (latitude, longitude, what the geocoder called it)
PLACES = {
    "Tokyo": (35.6895, 139.6917, "Tokyo, Tokyo"),
    "Kinugawa": (36.8167, 139.7167, "Shimodaki, Tochigi"),
    "Yumoto": (36.8068, 139.4235, "Yumoto, Tochigi"),
    "Urabandai": (37.6895, 140.0508, "Kitashiobara, Fukushima"),
    "Azuma": (37.7219, 140.2669, "Mount Azuma-kofuji, Fukushima (1705 m)"),
    "Fukushima": (37.7500, 140.4667, "Fukushima, Fukushima"),
    "Yonezawa": (37.9100, 140.1167, "Yonezawa, Yamagata"),
    "Mt Zao": (38.1415, 140.4439, "Mount Zao, Yamagata"),
    "Yamagata": (38.2333, 140.3667, "Yamagata, Yamagata"),
    "Naruko": (38.7631, 140.7160, "Naruko Onsen, Miyagi"),
    "Sendai": (38.2667, 140.8667, "Sendai, Miyagi"),
    "Matsushima": (38.3736, 141.0611, "Matsushima, Miyagi"),
    "Nikko": (36.7500, 139.6167, "Nikko, Tochigi"),
}

# Deliberately absent: Zao Onsen, Chuzenji, Aizu and Ginzan Onsen. The geocoder
# returned nothing for the first two, a same-named town in another prefecture for
# Chuzenji, and for Ginzan Onsen only Obanazawa in the valley some 450 m below it.
# A few hundred metres of altitude is a few degrees, so these keep the range the
# trip recorded rather than borrowing a neighbour's.

# WMO weather codes, in the wording a traveller would use.
CONDITIONS = {
    0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Freezing fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Light showers", 81: "Showers", 82: "Heavy showers",
    85: "Snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail",
}

# Rainfall totals are left out on purpose: for planning it is enough to know the
# day reads "Light rain" or "Rain", not how many millimetres fell.
DAILY = ",".join([
    "weathercode",
    "temperature_2m_max", "temperature_2m_min",
    "apparent_temperature_max", "apparent_temperature_min",
    "windspeed_10m_max",
    "sunrise", "sunset",
])


def fetch(base, lat, lon, start, end, timezone):
    url = base + "?" + urllib.parse.urlencode({
        "latitude": lat, "longitude": lon,
        "start_date": start, "end_date": end,
        "daily": DAILY, "timezone": timezone,
    })
    with urllib.request.urlopen(url, timeout=40) as r:
        return json.load(r)


def round_or_none(v, digits=1):
    return None if v is None else round(float(v), digits)


def main(path, timezone="Asia/Tokyo"):
    with open(path, encoding="utf-8") as f:
        trip = json.load(f)

    days = trip.get("days") or []
    if not days:
        print("no days in", path)
        return
    start, end = days[0]["date"], days[-1]["date"]

    today = datetime.date.today().isoformat()
    base = ARCHIVE if end < today else FORECAST
    print(f"{start} to {end} -> {'archive' if base is ARCHIVE else 'forecast'}")

    series = {}
    for name, (lat, lon, source) in PLACES.items():
        data = fetch(base, lat, lon, start, end, timezone)
        daily = data["daily"]
        series[name] = {
            date: {
                "code": daily["weathercode"][i],
                "max": round_or_none(daily["temperature_2m_max"][i]),
                "min": round_or_none(daily["temperature_2m_min"][i]),
                "feelsMax": round_or_none(daily["apparent_temperature_max"][i]),
                "feelsMin": round_or_none(daily["apparent_temperature_min"][i]),
                "wind": round_or_none(daily["windspeed_10m_max"][i]),
                "sunrise": daily["sunrise"][i][11:16],
                "sunset": daily["sunset"][i][11:16],
            }
            for i, date in enumerate(daily["time"])
        }
        print(f"  fetched {name:<14} ({source}), elevation {data.get('elevation')} m")
        time.sleep(0.4)

    filled = skipped = 0
    for day in days:
        for entry in day.get("temperature") or []:
            name = entry.get("location")
            obs = series.get(name, {}).get(day["date"])
            if not obs:
                skipped += 1
                continue
            # Real figures replace whatever was typed in, including a vague note.
            entry["min"] = obs["min"]
            entry["max"] = obs["max"]
            entry["note"] = None
            entry["feelsMin"] = obs["feelsMin"]
            entry["feelsMax"] = obs["feelsMax"]
            entry["condition"] = CONDITIONS.get(obs["code"], f"code {obs['code']}")
            entry["wind"] = obs["wind"]
            entry["sunrise"] = obs["sunrise"]
            entry["sunset"] = obs["sunset"]
            entry.pop("observed", None)
            filled += 1

    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(trip, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\nweather filled for {filled} entries, {skipped} left as recorded")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "trips/2023-10-japan-tohoku/data.json")
