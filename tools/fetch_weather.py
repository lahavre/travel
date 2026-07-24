#!/usr/bin/env python3
"""Add observed weather to a trip's day-by-day from the Open-Meteo archive.

    python tools/fetch_weather.py trips/2023-10-japan-tohoku/data.json

Open-Meteo needs no key and its historical archive reports what the weather
actually did, so a past trip can carry real observations rather than the forecast
someone wrote down while planning. Both are kept: `min`/`max` stay as recorded at
planning time, and the measurements land in `observed` beside them.

Only places in PLACES are fetched. Their coordinates come from Open-Meteo's own
geocoding API, checked against the prefecture they should be in — an onsen or a
mountain often geocodes to somewhere else entirely, and weather from the wrong
altitude is worse than none. A place left out keeps whatever the trip recorded.

For a trip still in the future, point BASE at the forecast API instead; the daily
fields are the same.
"""
import json
import sys
import time
import urllib.parse
import urllib.request

ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"

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

DAILY = ",".join([
    "weathercode",
    "temperature_2m_max", "temperature_2m_min",
    "apparent_temperature_max", "apparent_temperature_min",
    "precipitation_sum", "precipitation_hours",
    "windspeed_10m_max",
    "sunrise", "sunset",
])


def fetch(lat, lon, start, end, timezone):
    url = ARCHIVE + "?" + urllib.parse.urlencode({
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

    series = {}
    for name, (lat, lon, source) in PLACES.items():
        data = fetch(lat, lon, start, end, timezone)
        daily = data["daily"]
        series[name] = {
            date: {
                "code": daily["weathercode"][i],
                "max": round_or_none(daily["temperature_2m_max"][i]),
                "min": round_or_none(daily["temperature_2m_min"][i]),
                "feelsMax": round_or_none(daily["apparent_temperature_max"][i]),
                "feelsMin": round_or_none(daily["apparent_temperature_min"][i]),
                "rain": round_or_none(daily["precipitation_sum"][i]),
                "rainHours": round_or_none(daily["precipitation_hours"][i], 0),
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
                entry.pop("observed", None)
                skipped += 1
                continue
            entry["observed"] = {
                "condition": CONDITIONS.get(obs["code"], f"code {obs['code']}"),
                "min": obs["min"], "max": obs["max"],
                "feelsMin": obs["feelsMin"], "feelsMax": obs["feelsMax"],
                "rain": obs["rain"], "rainHours": obs["rainHours"],
                "wind": obs["wind"],
                "sunrise": obs["sunrise"], "sunset": obs["sunset"],
            }
            filled += 1

    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(trip, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\nobserved weather added to {filled} entries, {skipped} left as recorded")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "trips/2023-10-japan-tohoku/data.json")
