"""Sinh tin rao giả trong ranh phường Tân Hưng. Dữ liệu chỉ để demo màu bản đồ giá.

Muốn lấy tên đường từ OSM thì chạy build_tan_hung.py (ghi đè file này).
"""
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOUNDARY = ROOT.parent / "web" / "public" / "data" / "tan-hung-boundary.geojson"
OUT = ROOT.parent / "web" / "public" / "data" / "listings.json"

STREETS = [
    "Nguyễn Văn Linh",
    "Nguyễn Lương Bằng",
    "Nguyễn Thị Thập",
    "Lê Văn Lương",
    "Trần Xuân Soạn",
    "Lâm Văn Bền",
    "Nguyễn Hữu Thọ",
    "Huỳnh Tấn Phát",
    "Đường số 9",
    "Đường Số 10",
]


def point_in_ring(lng, lat, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-18) + xi):
            inside = not inside
        j = i
    return inside


def polygons_of(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def point_in_geom(lng, lat, geom):
    for poly in polygons_of(geom):
        if not point_in_ring(lng, lat, poly[0]):
            continue
        if any(point_in_ring(lng, lat, hole) for hole in poly[1:]):
            continue
        return True
    return False


def bounds_of(geom):
    lngs = []
    lats = []

    def walk(node):
        if node and isinstance(node[0], (int, float)):
            lngs.append(node[0])
            lats.append(node[1])
            return
        for child in node:
            walk(child)

    walk(geom["coordinates"])
    return min(lngs), min(lats), max(lngs), max(lats)


def main():
    fc = json.loads(BOUNDARY.read_text(encoding="utf-8"))
    geom = fc["features"][0]["geometry"]
    min_lng, min_lat, max_lng, max_lat = bounds_of(geom)
    rng = random.Random(42)
    listings = []
    n = 0
    while len(listings) < 60 and n < 12000:
        n += 1
        lng = rng.uniform(min_lng, max_lng)
        lat = rng.uniform(min_lat, max_lat)
        if not point_in_geom(lng, lat, geom):
            continue
        east = (lng - min_lng) / (max_lng - min_lng or 1)
        is_house = rng.random() < 0.62
        area = rng.randint(55, 140) if is_house else rng.randint(80, 280)
        base = 160 + east * 140 + (12 if is_house else 0)
        price = int((base + rng.gauss(0, 18)) * 1_000_000)
        price = max(120_000_000, min(380_000_000, price))
        street = rng.choice(STREETS)
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

    OUT.write_text(
        json.dumps({"source": "mock-tan-hung", "listings": listings}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {len(listings)} listings -> {OUT}")


if __name__ == "__main__":
    main()
