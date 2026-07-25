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

# tenki.jp prefecture forecast pages, grouped by the prefecture each place sits in.
# Verified from tenki.jp's own forecast index. Prefecture level is as fine as a place
# name reaches — tenki.jp has no coordinate or romaji lookup. Places without verified
# coordinates (Zao Onsen, Chuzenji, Aizu, Ginzan Onsen) still get a link this way,
# since a prefecture link needs no coordinates.
_TOKYO = "https://tenki.jp/forecast/3/16/"
_TOCHIGI = "https://tenki.jp/forecast/3/12/"
_FUKUSHIMA = "https://tenki.jp/forecast/2/10/"
_YAMAGATA = "https://tenki.jp/forecast/2/9/"
_MIYAGI = "https://tenki.jp/forecast/2/7/"
TENKI = {
    "Tokyo": _TOKYO,
    "Kinugawa": _TOCHIGI, "Yumoto": _TOCHIGI, "Nikko": _TOCHIGI, "Chuzenji": _TOCHIGI,
    "Urabandai": _FUKUSHIMA, "Azuma": _FUKUSHIMA, "Fukushima": _FUKUSHIMA, "Aizu": _FUKUSHIMA,
    "Yonezawa": _YAMAGATA, "Mt Zao": _YAMAGATA, "Zao Onsen": _YAMAGATA,
    "Yamagata": _YAMAGATA, "Ginzan Onsen": _YAMAGATA,
    "Naruko": _MIYAGI, "Sendai": _MIYAGI, "Matsushima": _MIYAGI,
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

    today = datetime.date.today()
    horizon = today + datetime.timedelta(days=15)  # Open-Meteo forecasts ~16 days
    wanted = sorted({d["date"] for d in days})

    def fetch_series(base, s, e):
        out = {}
        for name, (lat, lon, source) in PLACES.items():
            daily = fetch(base, lat, lon, s, e, timezone)["daily"]
            out[name] = {
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
            time.sleep(0.4)
        return out

    def shift_year(iso, delta):
        y, m, d = (int(x) for x in iso.split("-"))
        try:
            return datetime.date(y + delta, m, d).isoformat()
        except ValueError:  # 29 Feb in a non-leap year
            return datetime.date(y + delta, m, 28).isoformat()

    # Split the trip's dates by where each one's weather can come from: the archive
    # for dates already past, the forecast for the next ~16 days, and — for anything
    # further out, where no forecast exists yet — the same dates a year ago.
    past = [d for d in wanted if d < today.isoformat()]
    near = [d for d in wanted if today.isoformat() <= d <= horizon.isoformat()]
    far = [d for d in wanted if d > horizon.isoformat()]

    series = {name: {} for name in PLACES}
    historical = {name: {} for name in PLACES}

    def merge(target, s):
        for name, by_date in s.items():
            target[name].update(by_date)

    if past:
        print(f"  archive   {past[0]} to {past[-1]}")
        merge(series, fetch_series(ARCHIVE, past[0], past[-1]))
    if near:
        print(f"  forecast  {near[0]} to {near[-1]}")
        merge(series, fetch_series(FORECAST, near[0], near[-1]))
    if far:
        ly_s, ly_e = shift_year(far[0], -1), shift_year(far[-1], -1)
        print(f"  last year {ly_s} to {ly_e} (stand-in for {far[0]} to {far[-1]})")
        for name, by_date in fetch_series(ARCHIVE, ly_s, ly_e).items():
            for ly_date, obs in by_date.items():
                historical[name][shift_year(ly_date, 1)] = {**obs, "basisDate": ly_date}

    def good(o):
        return o and o["max"] is not None

    filled = historic = skipped = 0
    for day in days:
        for entry in day.get("temperature") or []:
            name = entry.get("location")
            obs = series.get(name, {}).get(day["date"])
            hist = historical.get(name, {}).get(day["date"])
            chosen = obs if good(obs) else (hist if good(hist) else None)
            if not chosen:
                skipped += 1
                entry.pop("basis", None)
                entry.pop("basisDate", None)
                continue
            # Real figures replace whatever was typed in, including a vague note.
            entry["min"] = chosen["min"]
            entry["max"] = chosen["max"]
            entry["note"] = None
            entry["feelsMin"] = chosen["feelsMin"]
            entry["feelsMax"] = chosen["feelsMax"]
            entry["condition"] = CONDITIONS.get(chosen["code"], f"code {chosen['code']}")
            entry["wind"] = chosen["wind"]
            entry["sunrise"] = chosen["sunrise"]
            entry["sunset"] = chosen["sunset"]
            entry.pop("observed", None)
            if chosen is hist:
                entry["basis"] = "historical"
                entry["basisDate"] = chosen["basisDate"]
                historic += 1
            else:
                entry.pop("basis", None)
                entry.pop("basisDate", None)
                filled += 1

    # A coordinate table so the page can re-fetch the forecast in the browser
    # (the "Refresh" button) without re-running this script. Only places that
    # appear in the trip and have verified coordinates go in.
    used = {
        entry["location"]
        for day in days
        for entry in day.get("temperature") or []
        if entry.get("location") in PLACES
    }
    trip["weatherPlaces"] = {
        name: {"lat": PLACES[name][0], "lon": PLACES[name][1]}
        for name in PLACES
        if name in used
    }
    trip["weatherTimezone"] = timezone

    # Which forecast page each place name opens. tenki.jp (Japan Weather Association)
    # is the local source, but it addresses by prefecture area code, not coordinates,
    # so the links are set here explicitly — at prefecture level, the finest a place
    # name alone can reach. A place with no entry falls back to a point-exact link the
    # page builds from its coordinates; that's how a non-Japan trip would work.
    all_used = {e["location"] for day in days for e in (day.get("temperature") or []) if e.get("location")}
    trip["weatherLinks"] = {name: TENKI[name] for name in sorted(all_used) if name in TENKI}

    # When this forecast was pulled, so the page can show "(updated …)" on first
    # load. A browser Refresh writes a newer date into localStorage.
    trip["weatherUpdated"] = datetime.date.today().isoformat()

    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(trip, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(
        f"\nweather filled for {filled} entries"
        f"{f', {historic} from last year' if historic else ''}, {skipped} left as recorded"
    )


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "trips/2023-10-japan-tohoku/data.json")
