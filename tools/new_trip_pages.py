#!/usr/bin/env python3
"""Write the seven per-trip HTML pages into a trip folder.

They are pure boilerplate — all rendering lives in assets/trip.js — so every trip
gets an identical set. Copying trips/_template/ does the same thing; this exists to
regenerate them all at once if the boilerplate ever changes.

    python tools/new_trip_pages.py 2026-09-korea-seoul [...more slugs]

Creates trips/<slug>/ if needed. Never touches data.json.
"""
import os
import sys

PAGES = {
    "index": "Trip",
    "overview": "Overview",
    "day": "Day-by-day",
    "weather": "Weather",
    "budget": "Budget",
    "accommodation": "Accommodation",
    "transport": "Transport",
    "todo": "To-do",
    "files": "Files",
}

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <link rel="stylesheet" href="../../assets/style.css" />
</head>
<body>
  <header class="site-header"><div id="site-header"></div></header>
  <main class="page" id="main"></main>

  <script src="../../assets/common.js"></script>
  <script src="../../assets/trip.js"></script>
  <script>Trip.page("{section}");</script>
</body>
</html>
"""

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(os.path.dirname(HERE), "trips")

# Default to refreshing the folders that already exist.
folders = sys.argv[1:] or [
    name for name in sorted(os.listdir(BASE)) if os.path.isdir(os.path.join(BASE, name))
]

for folder in folders:
    target = os.path.join(BASE, folder)
    os.makedirs(target, exist_ok=True)
    for section, label in PAGES.items():
        title = "Trip itinerary" if section == "index" else label
        with open(os.path.join(target, f"{section}.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(TEMPLATE.format(title=title, section=section))
    print("wrote", len(PAGES), "pages ->", folder)
