"""Dựng một vùng quy hoạch demo quanh phường Tân Hưng, TP.HCM.

Ranh lấy từ OSM relation 2766950 (phường Tân Hưng sau sắp xếp 2025).
Màu bên trong là hiện trạng OSM (ở, thương mại, công viên, mặt nước...),
cắt đúng ranh — không nới buffer — để đối chiếu mép kênh / đường trên ảnh vệ tinh.
"""
from __future__ import annotations

import json
import math
import random
import urllib.parse
import urllib.request
from pathlib import Path

from shapely.geometry import GeometryCollection, mapping, shape
from shapely.ops import transform, unary_union
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parents[1]
WEB_DATA = ROOT.parent / "web" / "public" / "data"
RELATION_ID = 2766950
UA = "guland-demo/0.1 (local planning demo)"

# Vẽ từ dưới lên. Phần còn lại của ranh phủ kín phía dưới cùng.
DRAW_ORDER = ["rest", "residential", "commercial", "industrial", "public", "park", "water"]
# Khi trừ dần: mặt nước và công viên thắng phần đất ở đè lên.
CLIP_ORDER = ["water", "park", "public", "industrial", "commercial", "residential"]

KIND = {
    "water": {"code": "MN", "name": "Mặt nước", "color": "#5BA3D9", "group": "water"},
    "park": {"code": "CX", "name": "Cây xanh, công viên", "color": "#6FBF73", "group": "green"},
    "public": {"code": "CC", "name": "Công trình công cộng", "color": "#F2C14E", "group": "public"},
    "industrial": {"code": "SX", "name": "Sản xuất, kho", "color": "#C084FC", "group": "commercial"},
    "commercial": {"code": "TMD", "name": "Thương mại, dịch vụ", "color": "#E07A9A", "group": "commercial"},
    "residential": {"code": "O", "name": "Đất ở", "color": "#F6E27A", "group": "residential"},
    "rest": {"code": "HH", "name": "Trong ranh, chưa tách loại", "color": "#E7D3B0", "group": "residential"},
}

MIN_M2 = {"water": 80, "park": 200, "public": 200, "industrial": 200, "commercial": 200, "residential": 400}


def fetch_json(url: str, data: bytes | None = None) -> dict:
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as res:
        return json.loads(res.read().decode())


OVERPASS_ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
]


def overpass(query: str) -> dict:
    body = urllib.parse.urlencode({"data": query}).encode()
    last_error: Exception | None = None
    for url in OVERPASS_ENDPOINTS:
        try:
            print(f"overpass {url.split('/')[2]} ...")
            return fetch_json(url, body)
        except Exception as exc:
            last_error = exc
            print(f"  fail {type(exc).__name__}")
    raise SystemExit(f"Overpass lỗi: {last_error}")


def area_m2(geom) -> float:
    lat = geom.centroid.y * math.pi / 180
    mx = 111_320 * math.cos(lat)
    my = 110_540
    projected = transform(lambda x, y, z=None: (x * mx, y * my), geom)
    return float(projected.area)


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
    if geom.is_empty:
        return None
    return geom


def round_geom(geom, digits: int = 6):
    return transform(lambda x, y, z=None: (round(x, digits), round(y, digits)), geom)


def load_ward():
    url = "https://nominatim.openstreetmap.org/lookup?" + urllib.parse.urlencode(
        {
            "osm_ids": f"R{RELATION_ID}",
            "format": "geojson",
            "polygon_geojson": "1",
            "polygon_threshold": "0",
        }
    )
    fc = fetch_json(url)
    features = fc["features"] if fc.get("type") == "FeatureCollection" else [fc]
    geom = clean(shape(features[0]["geometry"]))
    if geom is None:
        raise SystemExit("Không đọc được ranh phường Tân Hưng")
    return geom


def classify(tags: dict) -> str | None:
    natural = tags.get("natural")
    waterway = tags.get("waterway")
    landuse = tags.get("landuse")
    leisure = tags.get("leisure")
    amenity = tags.get("amenity")
    if natural == "water" or waterway in {"riverbank", "dock"} or landuse in {"basin", "reservoir"}:
        return "water"
    if leisure in {"park", "garden", "pitch", "recreation_ground", "playground"} or landuse in {
        "grass",
        "recreation_ground",
        "village_green",
        "forest",
        "meadow",
    }:
        return "park"
    if amenity in {"school", "university", "college", "hospital", "clinic", "kindergarten"} or landuse in {
        "education",
        "institutional",
    }:
        return "public"
    if landuse in {"industrial", "warehouse"}:
        return "industrial"
    if landuse in {"commercial", "retail"}:
        return "commercial"
    if landuse == "residential":
        return "residential"
    return None


def way_polygon(element: dict):
    pts = element.get("geometry") or []
    if len(pts) < 4:
        return None
    coords = [(p["lon"], p["lat"]) for p in pts]
    if coords[0] != coords[-1]:
        return None
    return clean(shape({"type": "Polygon", "coordinates": [coords]}))


def relation_polygon(element: dict):
    outers: list[list[tuple[float, float]]] = []
    inners: list[list[tuple[float, float]]] = []
    for member in element.get("members") or []:
        if member.get("type") != "way":
            continue
        pts = member.get("geometry") or []
        if len(pts) < 2:
            continue
        line = [(p["lon"], p["lat"]) for p in pts]
        role = member.get("role") or "outer"
        (inners if role == "inner" else outers).append(line)
    outer_rings = _chain(outers)
    inner_rings = _chain(inners)
    if not outer_rings:
        return None
    polygons = []
    for outer in outer_rings:
        holes = [ring for ring in inner_rings if shape({"type": "Polygon", "coordinates": [ring]}).within(
            shape({"type": "Polygon", "coordinates": [outer]})
        )]
        polygons.append(clean(shape({"type": "Polygon", "coordinates": [outer, *holes]})))
    polygons = [p for p in polygons if p is not None]
    if not polygons:
        return None
    return clean(unary_union(polygons))


def _chain(segments: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
    unused = [list(seg) for seg in segments if len(seg) >= 2]
    rings = []
    while unused:
        ring = unused.pop(0)
        progressed = True
        while progressed and ring[0] != ring[-1]:
            progressed = False
            for i, seg in enumerate(unused):
                if seg[0] == ring[-1]:
                    ring.extend(seg[1:])
                    unused.pop(i)
                    progressed = True
                    break
                if seg[-1] == ring[-1]:
                    ring.extend(list(reversed(seg[:-1])))
                    unused.pop(i)
                    progressed = True
                    break
        if ring[0] == ring[-1] and len(ring) >= 4:
            rings.append(ring)
    return rings


def element_polygon(element: dict):
    if element.get("type") == "way":
        return way_polygon(element)
    if element.get("type") == "relation":
        return relation_polygon(element)
    return None


def fetch_landuse(bounds: tuple[float, float, float, float]):
    south, west, north, east = bounds
    box = f"({south},{west},{north},{east})"
    selectors = [
        f'way["landuse"]{box}',
        f'way["leisure"~"park|garden|pitch|recreation_ground|playground"]{box}',
        f'way["natural"="water"]{box}',
        f'way["amenity"~"school|university|college|hospital|clinic|kindergarten"]{box}',
        f'way["waterway"="riverbank"]{box}',
        f'relation["landuse"]{box}',
        f'relation["natural"="water"]{box}',
        f'relation["leisure"~"park|garden"]{box}',
    ]
    elements = []
    for selector in selectors:
        query = f"[out:json][timeout:90];\n{selector};\nout geom;"
        elements.extend(overpass(query).get("elements") or [])
    return elements


def fetch_streets(bounds: tuple[float, float, float, float], ward) -> list[str]:
    south, west, north, east = bounds
    query = f"""
[out:json][timeout:90];
way["highway"]["name"]({south},{west},{north},{east});
out tags center;
"""
    names: set[str] = set()
    for el in overpass(query).get("elements") or []:
        center = el.get("center")
        name = (el.get("tags") or {}).get("name")
        if not center or not name:
            continue
        pt = shape({"type": "Point", "coordinates": [center["lon"], center["lat"]]})
        if ward.contains(pt):
            names.add(name.strip())
    return sorted(names)


def bounds_of(geom) -> tuple[float, float, float, float]:
    minx, miny, maxx, maxy = geom.bounds
    return (miny, minx, maxy, maxx)


def dump_feature(geom, props: dict) -> dict:
    return {"type": "Feature", "properties": props, "geometry": mapping(geom)}


def write_json(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def build_listings(ward, streets: list[str]) -> list[dict]:
    minx, miny, maxx, maxy = ward.bounds
    rng = random.Random(42)
    fallback = streets or ["Nguyễn Văn Linh", "Nguyễn Lương Bằng", "Nguyễn Thị Thập", "Lê Văn Lương"]
    listings = []
    guard = 0
    while len(listings) < 60 and guard < 12000:
        guard += 1
        lng = rng.uniform(minx, maxx)
        lat = rng.uniform(miny, maxy)
        if not ward.contains(shape({"type": "Point", "coordinates": [lng, lat]})):
            continue
        east = 0 if maxx == minx else (lng - minx) / (maxx - minx)
        is_house = rng.random() < 0.62
        area = rng.randint(55, 140) if is_house else rng.randint(80, 280)
        base = 160 + east * 140 + (12 if is_house else 0)
        price = int((base + rng.gauss(0, 18)) * 1_000_000)
        price = max(120_000_000, min(380_000_000, price))
        street = rng.choice(fallback)
        i = len(listings) + 1
        kind = "nhà" if is_house else "đất"
        listings.append(
            {
                "id": f"th-{i:03d}",
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "areaM2": area,
                "pricePerM2": price,
                "type": "nha" if is_house else "dat",
                "title": f"{kind.capitalize()} {area} m² {street}",
                "address": f"{rng.randint(1, 240)} {street}, phường Tân Hưng",
            }
        )
    return listings


def main() -> None:
    print("loading ward boundary...")
    ward = round_geom(load_ward())
    ward = clean(ward)
    km2 = area_m2(ward) / 1_000_000
    print(f"ward area {km2:.2f} km2")
    if not 6.5 <= km2 <= 11:
        raise SystemExit(f"Diện tích ranh bất thường ({km2:.2f} km2), dừng để khỏi ghi nhầm vùng")

    south, west, north, east = bounds_of(ward)
    pad = 0.003
    print("loading landuse...")
    elements = fetch_landuse((south - pad, west - pad, north + pad, east + pad))
    print(f"osm elements {len(elements)}")

    buckets: dict[str, list] = {kind: [] for kind in CLIP_ORDER}
    for el in elements:
        kind = classify(el.get("tags") or {})
        if not kind:
            continue
        poly = element_polygon(el)
        if poly is None or not poly.intersects(ward):
            continue
        piece = clean(poly.intersection(ward))
        if piece is None or area_m2(piece) < MIN_M2[kind]:
            continue
        buckets[kind].append(piece)

    remaining = ward
    pieces: list[tuple[str, object]] = []
    for kind in CLIP_ORDER:
        if not buckets[kind]:
            continue
        merged = clean(unary_union(buckets[kind]).intersection(remaining))
        if merged is None or area_m2(merged) < MIN_M2[kind]:
            continue
        pieces.append((kind, merged))
        nxt = clean(remaining.difference(merged))
        remaining = nxt if nxt is not None else remaining
    if remaining is not None and area_m2(remaining) >= 80:
        pieces.append(("rest", remaining.intersection(ward)))

    features = []
    for kind, geom in pieces:
        geom = clean(round_geom(geom))
        if geom is None:
            continue
        geom = clean(geom.intersection(ward))
        if geom is None:
            continue
        props = dict(KIND[kind])
        props["kind"] = kind
        props["areaM2"] = round(area_m2(geom))
        features.append(dump_feature(geom, props))

    order = {kind: i for i, kind in enumerate(DRAW_ORDER)}
    features.sort(key=lambda f: order[f["properties"]["kind"]])

    center = ward.centroid
    area_meta = {
        "id": "hcm-tan-hung",
        "title": "Soi quy hoạch Tân Hưng",
        "subtitle": "Phường Tân Hưng, TP. Hồ Chí Minh",
        "center": [round(center.y, 6), round(center.x, 6)],
        "bounds": [round(south, 6), round(west, 6), round(north, 6), round(east, 6)],
        "meridianLabel": "105°45′",
        "relationId": RELATION_ID,
        "areaM2": round(area_m2(ward)),
        "checks": [
            {"side": "Bắc", "edge": "Kênh Tẻ"},
            {"side": "Tây", "edge": "Rạch Ông Lớn"},
            {"side": "Đông", "edge": "đường Lâm Văn Bền"},
        ],
    }

    print("loading street names...")
    streets = fetch_streets((south, west, north, east), ward)
    print(f"streets {len(streets)}")
    listings = build_listings(ward, streets)

    WEB_DATA.mkdir(parents=True, exist_ok=True)
    write_json(
        WEB_DATA / "tan-hung-zone.geojson",
        {"type": "FeatureCollection", "features": features},
    )
    write_json(
        WEB_DATA / "tan-hung-boundary.geojson",
        {"type": "FeatureCollection", "features": [dump_feature(ward, {"name": "Phường Tân Hưng"})]},
    )
    write_json(WEB_DATA / "tan-hung-area.json", area_meta)
    write_json(WEB_DATA / "listings.json", {"source": "mock-tan-hung", "listings": listings})

    summary = {
        "km2": round(km2, 2),
        "features": {f["properties"]["kind"]: f["properties"]["areaM2"] for f in features},
        "streets": len(streets),
        "listings": len(listings),
        "bounds": area_meta["bounds"],
    }
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
