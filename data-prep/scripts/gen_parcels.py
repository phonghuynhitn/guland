"""Sinh ô đất giả theo khối phố, không phải lưới bàn cờ.

Lấy đường từ OpenStreetMap, chừa lòng đường và mặt nước, rồi chia mỗi
khối phố thành các thửa hẹp quay mặt ra đường. Số tờ / số thửa là giả.
"""
from __future__ import annotations

import json
import math
import random
import re
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

import numpy as np
from shapely import make_valid, transform
from shapely.geometry import LineString, Polygon, mapping, shape
from shapely.ops import unary_union
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT.parent / "web" / "public" / "data"
BOUNDARY = WEB / "tan-hung-boundary.geojson"
ZONES = WEB / "tan-hung-zone.geojson"
LISTINGS = WEB / "listings.json"
OUT = WEB / "tan-hung-parcels.geojson"
UA = "guland-demo/0.1 (local planning demo)"

# Bán kính buffer = nửa bề rộng lòng đường cần chừa trống.
HALF_WIDTH = {
    "motorway": 18.0,
    "trunk": 16.0,
    "primary": 14.0,
    "secondary": 9.0,
    "tertiary": 6.0,
    "residential": 4.2,
    "living_street": 3.2,
    "unclassified": 5.0,
    "service": 2.4,
    "pedestrian": 3.0,
    "road": 5.0,
}
SKIP_SERVICE = {"driveway", "parking_aisle", "parking", "emergency_access", "spur"}
OPEN_CODES = {"CX", "MN"}
SHEET_M = 170.0
MIN_LOT = 32.0

CODE_BY_KIND = {
    "residential": "O",
    "commercial": "TMD",
    "industrial": "SX",
    "public": "CC",
    "park": "CX",
    "water": "MN",
    "rest": "HH",
}

OVERPASS_ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
]


def fetch_json(url: str, data: bytes | None = None) -> dict:
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as res:
        return json.loads(res.read().decode())


def overpass(query: str) -> dict:
    body = urllib.parse.urlencode({"data": query}).encode()
    last_error: Exception | None = None
    for url in OVERPASS_ENDPOINTS:
        try:
            print(f"overpass {url.split('/')[2]} ...", flush=True)
            return fetch_json(url, body)
        except Exception as exc:
            last_error = exc
            print(f"  fail {type(exc).__name__}", flush=True)
    raise SystemExit(f"Overpass lỗi: {last_error}")


def clean(geom):
    if geom is None or geom.is_empty:
        return None
    geom = make_valid(geom)
    if geom.geom_type == "GeometryCollection":
        parts = [g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        if not parts:
            return None
        geom = unary_union(parts)
    if geom.geom_type not in ("Polygon", "MultiPolygon"):
        return None
    return None if geom.is_empty else geom


def polygons_of(geom):
    geom = clean(geom)
    if geom is None:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    return [g for g in geom.geoms if g.geom_type == "Polygon" and not g.is_empty]


def streets_from_listings() -> list[str]:
    if not LISTINGS.exists():
        return ["Đường số 79", "Đường số 81", "Lê Văn Lương"]
    data = json.loads(LISTINGS.read_text(encoding="utf-8"))
    found: list[str] = []
    seen: set[str] = set()
    for item in data.get("listings") or []:
        match = re.match(r"^\d+\s+(.+),\s*phường", item.get("address") or "")
        name = match.group(1).strip() if match else ""
        if name and name not in seen:
            seen.add(name)
            found.append(name)
    return found or ["Đường số 79", "Đường số 81"]


def axis_frame(poly: Polygon):
    rect = poly.minimum_rotated_rectangle
    coords = list(rect.exterior.coords)[:4]
    edges = []
    for i in range(4):
        a = coords[i]
        b = coords[(i + 1) % 4]
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        edges.append((length, a, b))
    edges.sort(key=lambda item: -item[0])
    long_len, a, b = edges[0]
    if long_len < 1:
        return None
    u = ((b[0] - a[0]) / long_len, (b[1] - a[1]) / long_len)
    v = (-u[1], u[0])

    def proj(pt, axis):
        return (pt[0] - a[0]) * axis[0] + (pt[1] - a[1]) * axis[1]

    pts = list(poly.exterior.coords)
    us = [proj(p, u) for p in pts]
    vs = [proj(p, v) for p in pts]
    return a, u, v, min(us), max(us), min(vs), max(vs)


def quad(origin, u, v, u0, u1, v0, v1) -> Polygon:
    def point(tu, tv):
        return (origin[0] + u[0] * tu + v[0] * tv, origin[1] + u[1] * tu + v[1] * tv)

    return Polygon([point(u0, v0), point(u1, v0), point(u1, v1), point(u0, v1)])


def clip_band(poly, origin, u, v, u0, u1, v0, v1):
    piece = clean(poly.intersection(quad(origin, u, v, u0, u1, v0, v1)))
    return polygons_of(piece)


def split_widths(start: float, end: float, rng: random.Random, lo: float, hi: float):
    cuts = []
    cursor = start
    while cursor < end - 0.8:
        width = rng.uniform(lo, hi)
        if end - (cursor + width) < lo * 0.55:
            width = end - cursor
        nxt = min(cursor + width, end)
        if nxt - cursor >= 3.2:
            cuts.append((cursor, nxt))
        cursor = nxt
    return cuts


def strip_lots(poly: Polygon, rng: random.Random, front_lo: float, front_hi: float):
    frame = axis_frame(poly)
    if frame is None:
        return [poly] if poly.area >= MIN_LOT else []
    origin, u, v, u0, u1, v0, v1 = frame
    depth = v1 - v0
    if depth < 4 or (u1 - u0) < 4:
        return [poly] if poly.area >= MIN_LOT else []
    if depth >= 36:
        mid = (v0 + v1) / 2.0
        bands = [(v0, mid), (mid, v1)]
    else:
        bands = [(v0, v1)]
    lots = []
    for va, vb in bands:
        if vb - va < 5:
            continue
        band_lots = []
        for ta, tb in split_widths(u0, u1, rng, front_lo, front_hi):
            for part in clip_band(poly, origin, u, v, ta, tb, va - 1.5, vb + 1.5):
                if part.area < MIN_LOT:
                    if band_lots:
                        merged = clean(band_lots[-1].union(part))
                        if merged is not None and merged.geom_type == "Polygon":
                            band_lots[-1] = merged
                    continue
                band_lots.append(part)
        lots.extend(band_lots)
    return lots or ([poly] if poly.area >= MIN_LOT else [])


def subdivide(poly: Polygon, code: str, rng: random.Random, depth: int = 0):
    if poly.area < MIN_LOT:
        return []
    if code in OPEN_CODES:
        return [poly]
    if code == "CC" and poly.area < 4500:
        return [poly]
    if code == "SX" and poly.area < 7000:
        return [poly]
    if poly.area < 240 or depth > 5:
        return [poly]
    frame = axis_frame(poly)
    if frame is None:
        return [poly]
    rect = poly.minimum_rotated_rectangle
    fill = poly.area / rect.area if rect.area else 1
    if fill < 0.7 and poly.area > 700:
        origin, u, v, u0, u1, v0, v1 = frame
        mid = (u0 + u1) / 2.0
        parts = []
        parts += clip_band(poly, origin, u, v, u0 - 1, mid, v0 - 1, v1 + 1)
        parts += clip_band(poly, origin, u, v, mid, u1 + 1, v0 - 1, v1 + 1)
        parts = [p for p in parts if p.area >= MIN_LOT]
        if len(parts) >= 2:
            lots = []
            for part in parts:
                lots.extend(subdivide(part, code, rng, depth + 1))
            return lots
    front = (16.0, 28.0) if code == "TMD" else (7.0, 12.5)
    return strip_lots(poly, rng, front[0], front[1])


def fetch_roads(south, west, north, east):
    query = f"""
[out:json][timeout:90];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified|service|pedestrian|road)$"]({south},{west},{north},{east});
out geom;
"""
    lines = []
    for el in overpass(query).get("elements") or []:
        tags = el.get("tags") or {}
        highway = tags.get("highway")
        if highway == "service" and tags.get("service") in SKIP_SERVICE:
            continue
        pts = el.get("geometry") or []
        if len(pts) < 2:
            continue
        half = HALF_WIDTH.get(highway)
        if not half:
            continue
        lines.append((half, [(p["lon"], p["lat"]) for p in pts]))
    return lines


def main() -> None:
    ward_ll = make_valid(shape(json.loads(BOUNDARY.read_text(encoding="utf-8"))["features"][0]["geometry"]))
    minx, miny, maxx, maxy = ward_ll.bounds
    lat0 = ((miny + maxy) / 2) * math.pi / 180
    m_lng = 111_320 * math.cos(lat0)
    m_lat = 110_540

    def fwd(coords):
        out = np.asarray(coords, dtype=float).copy()
        out[..., 0] = (out[..., 0] - minx) * m_lng
        out[..., 1] = (out[..., 1] - miny) * m_lat
        return out

    def inv(coords):
        out = np.asarray(coords, dtype=float).copy()
        out[..., 0] = minx + out[..., 0] / m_lng
        out[..., 1] = miny + out[..., 1] / m_lat
        return out

    ward = transform(ward_ll, fwd)
    zones = []
    water_parts = []
    for feature in json.loads(ZONES.read_text(encoding="utf-8"))["features"]:
        geom = transform(make_valid(shape(feature["geometry"])), fwd)
        kind = feature["properties"].get("kind") or "rest"
        code = CODE_BY_KIND.get(kind, "HH")
        zones.append((prep(geom), code))
        if code == "MN":
            water_parts.append(geom)
    if water_parts:
        ward = clean(ward.difference(unary_union(water_parts))) or ward

    pad = 0.002
    print("loading roads...", flush=True)
    raw_roads = fetch_roads(miny - pad, minx - pad, maxy + pad, maxx + pad)
    print(f"roads {len(raw_roads)}", flush=True)
    grouped: dict[float, list] = defaultdict(list)
    for half, coords in raw_roads:
        line = transform(LineString(coords), fwd)
        if line.length < 4:
            continue
        grouped[half].append(line)
    buffers = []
    for half, lines in grouped.items():
        buffers.append(unary_union(lines).buffer(half, cap_style="round", join_style="round"))
    roads = unary_union(buffers) if buffers else None
    land = clean(ward.difference(roads)) if roads is not None else ward
    blocks = [g for g in polygons_of(land) if g.area >= MIN_LOT]
    print(f"blocks {len(blocks)}", flush=True)

    pieces = []
    for index, block in enumerate(blocks):
        point = block.representative_point()
        code = "HH"
        for zone_prep, zone_code in zones:
            if zone_prep.covers(point):
                code = zone_code
                break
        seed = int(abs(block.centroid.x) * 3 + abs(block.centroid.y)) % (2**31 - 1)
        pieces.extend((part, code) for part in subdivide(block, code, random.Random(seed)))
        if index % 200 == 0:
            print(f"block {index}/{len(blocks)} lots {len(pieces)}", flush=True)

    pieces = [(simplify_lot(poly), code) for poly, code in pieces]
    pieces = [(poly, code) for poly, code in pieces if poly is not None and poly.area >= MIN_LOT]
    pieces.sort(key=lambda item: (sheet_of(item[0]), item[0].centroid.y, item[0].centroid.x))

    streets = streets_from_listings()
    sheet_index: dict[tuple[int, int], int] = {}
    thua_of: dict[tuple[int, int], int] = {}
    features = []
    angles = []
    for poly, code in pieces:
        key = sheet_of(poly)
        if key not in sheet_index:
            sheet_index[key] = len(sheet_index) + 1
            thua_of[key] = 0
        thua_of[key] += 1
        so_to = sheet_index[key]
        so_thua = thua_of[key]
        frame = axis_frame(poly)
        if frame is not None:
            angles.append(math.degrees(math.atan2(frame[1][1], frame[1][0])) % 180)
        lonlat = transform(poly, inv)
        lonlat = transform(lonlat, lambda coords: np.round(np.asarray(coords, dtype=float), 6))
        street = streets[(so_to + so_thua) % len(streets)]
        number = (so_thua * 3 + so_to) % 180 + 1
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "soTo": so_to,
                    "soThua": so_thua,
                    "areaM2": round(poly.area, 2),
                    "code": code,
                    "address": f"{number} {street}, phường Tân Hưng",
                },
                "geometry": mapping(lonlat),
            }
        )

    OUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    if angles:
        spread = max(angles) - min(angles)
    else:
        spread = 0
    print(
        f"parcels {len(features)} sheets {len(sheet_index)} bytes {OUT.stat().st_size} angle_span {spread:.0f}",
        flush=True,
    )


def simplify_lot(poly: Polygon):
    geom = clean(poly.simplify(0.35, preserve_topology=True))
    parts = polygons_of(geom)
    if not parts:
        return None
    return max(parts, key=lambda item: item.area)


def sheet_of(poly: Polygon):
    c = poly.centroid
    return (int(c.x // SHEET_M), int(c.y // SHEET_M))


if __name__ == "__main__":
    main()
