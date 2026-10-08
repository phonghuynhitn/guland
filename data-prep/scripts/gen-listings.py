"""Sinh tin rao giả trong ranh Cầu Giấy. Dữ liệu chỉ để demo màu bản đồ giá."""
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DISTRICT = ROOT / "raw" / "district.geojson"
if not DISTRICT.exists():
    DISTRICT = ROOT.parent / "web" / "public" / "data" / "district.geojson"
OUT = ROOT.parent / "web" / "public" / "data" / "listings.json"

STREETS = [
    "Xuân Thủy",
    "Cầu Giấy",
    "Trần Đăng Ninh",
    "Nguyễn Phong Sắc",
    "Hoàng Quốc Việt",
    "Trần Thái Tông",
    "Dương Quảng Hàm",
    "Nguyễn Khánh Toàn",
    "Hồ Tùng Mậu",
    "Nguyễn Văn Huyên",
    "Thành Thái",
    "Duy Tân",
    "Trung Kính",
    "Trung Hòa",
    "Tô Hiệu",
    "Nguyễn Ngọc Vũ",
    "Phạm Tuấn Tài",
    "Nguyễn Thị Thập",
    "Trần Bình",
    "Dịch Vọng Hậu",
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


def point_in_district(lng, lat, geom):
    for poly in geom["coordinates"]:
        if not point_in_ring(lng, lat, poly[0]):
            continue
        if any(point_in_ring(lng, lat, hole) for hole in poly[1:]):
            continue
        return True
    return False


def main():
    fc = json.loads(DISTRICT.read_text())
    geom = fc["features"][0]["geometry"]
    rng = random.Random(42)
    listings = []
    n = 0
    while len(listings) < 70 and n < 8000:
        n += 1
        lng = rng.uniform(105.767, 105.814)
        lat = rng.uniform(21.001, 21.059)
        if not point_in_district(lng, lat, geom):
            continue
        east = (lng - 105.767) / (105.814 - 105.767)
        is_house = rng.random() < 0.55
        area = rng.randint(48, 92) if is_house else rng.randint(60, 220)
        base = 95 + east * 85 + (8 if is_house else 0)
        price = int((base + rng.gauss(0, 12)) * 1_000_000)
        price = max(72_000_000, min(220_000_000, price))
        street = rng.choice(STREETS)
        i = len(listings) + 1
        kind = "nhà" if is_house else "đất"
        listings.append(
            {
                "id": f"cg-{i:03d}",
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "areaM2": area,
                "pricePerM2": price,
                "type": "nha" if is_house else "dat",
                "title": f"{kind.capitalize()} {area} m² {street}",
                "address": f"{rng.randint(12, 248)} {street}, Cầu Giấy",
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"source": "mock", "listings": listings}, ensure_ascii=False, indent=2) + "\n")
    prices = [x["pricePerM2"] for x in listings]
    print(f"wrote {len(listings)} listings -> {OUT}")
    print(f"price/m2 min={min(prices):,} median={sorted(prices)[len(prices)//2]:,} max={max(prices):,}")


if __name__ == "__main__":
    main()
