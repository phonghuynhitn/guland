#!/usr/bin/env python3
"""Tách ranh lô Dragon Park / Dragon River từ màu trên mặt bằng.

Mỗi lô là một ô màu có vòng tròn số ở giữa. Script lấy đúng ô đó ở độ phân giải
ảnh, ghép hai mảnh bị số nhà cắt, rồi nới tới mép viền trắng. Chạy từ repo:

    python3 data-prep/scripts/extract_dragon_lots.py
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "MAT BANG PHAN LO - DRAGON PARK - RIVER.jpg"
OUT_DIR = ROOT / "web" / "public" / "data"
CROP_X = 5668

# rgb là màu tô đo trên ảnh. color là màu chú giải dùng cho UI.
SWATCHES = {
    "villa-semi-corner": {
        "product": "villa-semi",
        "variant": "corner",
        "rgb": (151, 78, 35),
        "tol": 24,
        "color": "#AB4E25",
        "frontageM": 10.75,
        "depthM": 20,
        "sizeLabel": "9,5–12 × 20 m",
    },
    "villa-detach-corner": {
        "product": "villa-detach",
        "variant": "corner",
        "rgb": (143, 98, 39),
        "tol": 26,
        "color": "#9F6327",
        "frontageM": 10.5,
        "depthM": 18,
        "sizeLabel": "10,5 × 18 m",
    },
    "villa-semi-typical": {
        "product": "villa-semi",
        "variant": "typical",
        "rgb": (205, 147, 107),
        "tol": 20,
        "color": "#DF946C",
        "frontageM": 8,
        "depthM": 20,
        "sizeLabel": "8 × 20 m",
    },
    "villa-detach-typical": {
        "product": "villa-detach",
        "variant": "typical",
        "rgb": (185, 150, 109),
        "tol": 22,
        "color": "#BD9C6F",
        "frontageM": 10,
        "depthM": 18,
        "sizeLabel": "10 × 18 m",
    },
    "townhouse-corner": {
        "product": "townhouse",
        "variant": "corner",
        "rgb": (87, 128, 114),
        "tol": 24,
        "color": "#567D70",
        "frontageM": 8,
        "depthM": 18,
        "sizeLabel": "7–9 × 18 m",
    },
    "shophouse-corner": {
        "product": "shophouse",
        "variant": "corner",
        "rgb": (149, 120, 90),
        "tol": 22,
        "color": "#A07958",
        "frontageM": 7.5,
        "depthM": 22,
        "sizeLabel": "6–9 × 22 m",
    },
    "townhouse-typical": {
        "product": "townhouse",
        "variant": "typical",
        "rgb": (177, 183, 181),
        "tol": 24,
        "color": "#B1B7B5",
        "frontageM": 5,
        "depthM": 18,
        "sizeLabel": "5 × 18 m",
    },
    "shophouse-typical": {
        "product": "shophouse",
        "variant": "typical",
        "rgb": (227, 217, 207),
        "tol": 18,
        "color": "#EAD9CF",
        "frontageM": 5,
        "depthM": 22,
        "sizeLabel": "5 × 22 m",
    },
}


def components(img: np.ndarray, rgb: tuple[int, int, int], tol: int) -> list[list[int]]:
    mask = np.abs(img.astype(np.int16) - np.array(rgb, dtype=np.int16)).sum(axis=2) < tol
    label, _ = ndimage.label(mask)
    sizes = np.bincount(label.ravel())
    found: list[list[int]] = []
    for label_id, sl in enumerate(ndimage.find_objects(label), start=1):
        if sl is None or sizes[label_id] < 70:
            continue
        ys, xs = sl
        width = xs.stop - xs.start
        height = ys.stop - ys.start
        if min(width, height) < 8 or max(width, height) > 260:
            continue
        if sizes[label_id] / float(width * height) < 0.4:
            continue
        found.append([int(xs.start), int(ys.start), int(xs.stop), int(ys.stop)])
    return found


def _gap_patch(img: np.ndarray, a: list[int], b: list[int], vertical: bool) -> np.ndarray | None:
    if vertical:
        top, bot = (a, b) if a[1] <= b[1] else (b, a)
        x0, x1 = max(top[0], bot[0]), min(top[2], bot[2])
        y0, y1 = top[3], bot[1]
    else:
        left, right = (a, b) if a[0] <= b[0] else (b, a)
        y0, y1 = max(left[1], right[1]), min(left[3], right[3])
        x0, x1 = left[2], right[0]
    if x1 - x0 < 6 or y1 - y0 < 3:
        return None
    return img[y0:y1, x0:x1]


def is_badge_gap(img: np.ndarray, a: list[int], b: list[int], vertical: bool) -> bool:
    """Khe giữa hai mảnh là vòng tròn số (trắng + chữ đỏ), không phải lối đi."""
    patch = _gap_patch(img, a, b, vertical)
    if patch is None or patch.size == 0:
        return False
    red = patch[:, :, 0].astype(np.int16)
    green = patch[:, :, 1].astype(np.int16)
    blue = patch[:, :, 2].astype(np.int16)
    white = patch.mean(axis=2) > 185
    ink = (red > 130) & (red > green + 30) & (red > blue + 30)
    # Vòng số gần như toàn trắng/đỏ. Khe có cả lô khác ở giữa thì không đạt.
    return float((white | ink).mean()) > 0.62


def merge_fragments(img: np.ndarray, boxes: list[list[int]], vertical: bool) -> list[list[int]]:
    boxes = [box[:] for box in boxes]
    used = [False] * len(boxes)
    order = sorted(range(len(boxes)), key=lambda i: boxes[i][1 if vertical else 0])
    merged: list[list[int]] = []
    for index in order:
        if used[index]:
            continue
        used[index] = True
        box = boxes[index]
        changed = True
        guard = 0
        while changed and guard < 5:
            changed = False
            guard += 1
            for other_index in order:
                if used[other_index]:
                    continue
                other = boxes[other_index]
                if vertical:
                    top, bot = (box, other) if box[1] <= other[1] else (other, box)
                    gap = bot[1] - top[3]
                    span = min(top[2] - top[0], bot[2] - bot[0])
                    overlap = min(top[2], bot[2]) - max(top[0], bot[0])
                    part_a, part_b = top[3] - top[1], bot[3] - bot[1]
                    combined = bot[3] - top[1]
                else:
                    left, right = (box, other) if box[0] <= other[0] else (other, box)
                    gap = right[0] - left[2]
                    span = min(left[3] - left[1], right[3] - right[1])
                    overlap = min(left[3], right[3]) - max(left[1], right[1])
                    part_a, part_b = left[2] - left[0], right[2] - right[0]
                    combined = right[2] - left[0]
                if gap < 3 or gap > 24 or overlap < 0.6 * span:
                    continue
                if part_a > 50 or part_b > 50 or combined > 110:
                    continue
                if not is_badge_gap(img, box, other, vertical):
                    continue
                box[0] = min(box[0], other[0])
                box[1] = min(box[1], other[1])
                box[2] = max(box[2], other[2])
                box[3] = max(box[3], other[3])
                used[other_index] = True
                changed = True
        merged.append(box)
    return merged


def has_badge(img: np.ndarray, box: list[int]) -> bool:
    x0, y0, x1, y1 = box
    width, height = x1 - x0, y1 - y0
    if width < 12 or height < 12:
        return False
    patch = img[y0 + height // 6 : y1 - height // 6, x0 + width // 6 : x1 - width // 6]
    if patch.size == 0:
        return False
    white = patch.mean(axis=2) > 205
    red = patch[:, :, 0].astype(np.int16)
    green = patch[:, :, 1].astype(np.int16)
    blue = patch[:, :, 2].astype(np.int16)
    ink = (red > 130) & (red > green + 30) & (red > blue + 30)
    return float(white.mean()) > 0.1 and float(ink.mean()) > 0.004


def grow_white(img: np.ndarray, box: list[int], limit: int = 5) -> list[int]:
    """Nới mỗi cạnh tới mép ngoài của viền trắng, không nuốt cỏ hay đường."""
    height, width = img.shape[:2]
    x0, y0, x1, y1 = box

    def light(column: np.ndarray) -> bool:
        if column.size == 0:
            return False
        return float((column.mean(axis=1) > 200).mean()) > 0.72

    for _ in range(limit):
        if x0 <= 0 or not light(img[y0:y1, x0 - 1]):
            break
        x0 -= 1
    for _ in range(limit):
        if x1 >= width or not light(img[y0:y1, x1]):
            break
        x1 += 1
    for _ in range(limit):
        if y0 <= 0 or not light(img[y0 - 1, x0:x1]):
            break
        y0 -= 1
    for _ in range(limit):
        if y1 >= height or not light(img[y1, x0:x1]):
            break
        y1 += 1
    return [x0, y0, x1, y1]


def plausible(box: list[int]) -> bool:
    width, height = box[2] - box[0], box[3] - box[1]
    short, long = min(width, height), max(width, height)
    return 18 <= short <= 80 and 44 <= long <= 120 and long / short <= 4.2


def resolve_overlaps(boxes: list[dict]) -> list[dict]:
    """Hai ô cùng chiếm một viền trắng thì chia đôi khoảng chồng."""
    for _ in range(3):
        for i in range(len(boxes)):
            a = boxes[i]["box"]
            for j in range(i + 1, len(boxes)):
                b = boxes[j]["box"]
                ix0, iy0 = max(a[0], b[0]), max(a[1], b[1])
                ix1, iy1 = min(a[2], b[2]), min(a[3], b[3])
                overlap_w, overlap_h = ix1 - ix0, iy1 - iy0
                if overlap_w < 1 or overlap_h < 1:
                    continue
                if overlap_w <= overlap_h and overlap_w <= 14:
                    mid = (ix0 + ix1) / 2
                    if a[0] <= b[0]:
                        a[2], b[0] = mid, mid
                    else:
                        b[2], a[0] = mid, mid
                elif overlap_h < overlap_w and overlap_h <= 14:
                    mid = (iy0 + iy1) / 2
                    if a[1] <= b[1]:
                        a[3], b[1] = mid, mid
                    else:
                        b[3], a[1] = mid, mid
    kept = []
    for i, lot in enumerate(boxes):
        box = lot["box"]
        area = max(box[2] - box[0], 0) * max(box[3] - box[1], 0)
        if area < 400:
            continue
        drop = False
        for other in boxes:
            if other is lot:
                continue
            ob = other["box"]
            ix = min(box[2], ob[2]) - max(box[0], ob[0])
            iy = min(box[3], ob[3]) - max(box[1], ob[1])
            if ix <= 0 or iy <= 0:
                continue
            if ix * iy / area > 0.45 and SWATCHES[other["swatch"]] != SWATCHES[lot["swatch"]]:
                # Ưu tiên màu đứng trước trong SWATCHES khi hai mask trùng một lô.
                if list(SWATCHES).index(other["swatch"]) < list(SWATCHES).index(lot["swatch"]):
                    drop = True
                    break
        if not drop:
            kept.append(lot)
    return kept


def choose_split(centers: list[float], width: float) -> float:
    if not centers:
        return width * 0.45
    hist, edges = np.histogram(centers, bins=90, range=(0, width))
    smooth = ndimage.uniform_filter1d(hist.astype(float), size=3)
    lo = int(0.32 * len(smooth))
    hi = int(0.62 * len(smooth))
    window = smooth[lo:hi]
    if window.size == 0 or window.min() > smooth.max() * 0.35:
        return width * 0.45
    idx = lo + int(window.argmin())
    return float((edges[idx] + edges[idx + 1]) / 2)


def cluster_blocks(lots: list[dict]) -> list[list[dict]]:
    """Một dãy ngang hoặc một cột dọc là một block để đánh số."""
    parent = list(range(len(lots)))

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(left: int, right: int) -> None:
        parent[find(left)] = find(right)

    for i, lot in enumerate(lots):
        a = lot["box"]
        for j in range(i + 1, len(lots)):
            b = lots[j]["box"]
            ix = min(a[2], b[2]) - max(a[0], b[0])
            iy = min(a[3], b[3]) - max(a[1], b[1])
            x_gap = max(a[0], b[0]) - min(a[2], b[2])
            y_gap = max(a[1], b[1]) - min(a[3], b[3])
            same_row = iy > 0.45 * min(a[3] - a[1], b[3] - b[1]) and -4 <= x_gap <= 36
            same_col = ix > 0.45 * min(a[2] - a[0], b[2] - b[0]) and -4 <= y_gap <= 36
            if same_row or same_col:
                union(i, j)
    groups: dict[int, list[dict]] = defaultdict(list)
    for index, lot in enumerate(lots):
        groups[find(index)].append(lot)
    blocks = list(groups.values())

    def anchor(block: list[dict]) -> tuple[float, float]:
        return (min(lot["box"][1] for lot in block), min(lot["box"][0] for lot in block))

    blocks.sort(key=anchor)
    ordered = []
    for block in blocks:
        x0 = min(lot["box"][0] for lot in block)
        x1 = max(lot["box"][2] for lot in block)
        y0 = min(lot["box"][1] for lot in block)
        y1 = max(lot["box"][3] for lot in block)
        if (x1 - x0) >= (y1 - y0):
            block.sort(key=lambda lot: lot["box"][0])
        else:
            block.sort(key=lambda lot: lot["box"][1])
        ordered.append(block)
    return ordered


def main() -> None:
    Image.MAX_IMAGE_PIXELS = None
    image = Image.open(SRC).convert("RGB")
    full = np.asarray(image)
    height = full.shape[0]
    img = full[:, :CROP_X]

    lots: list[dict] = []
    for swatch, spec in SWATCHES.items():
        found = components(img, spec["rgb"], spec["tol"])
        found = merge_fragments(img, found, vertical=True)
        for box in found:
            grown = grow_white(img, box)
            if not plausible(grown) or not has_badge(img, grown):
                continue
            lots.append({"swatch": swatch, "box": grown})
    lots = resolve_overlaps(lots)

    centers = [(lot["box"][0] + lot["box"][2]) / 2 for lot in lots]
    split_x = choose_split(centers, CROP_X)
    zoned: dict[str, list[dict]] = {"park": [], "river": []}
    for lot in lots:
        center_x = (lot["box"][0] + lot["box"][2]) / 2
        zoned["park" if center_x < split_x else "river"].append(lot)

    features = []
    counts: dict[str, int] = defaultdict(int)
    for zone, zone_lots in zoned.items():
        prefix = "PARK" if zone == "park" else "RIVER"
        for row_index, block in enumerate(cluster_blocks(zone_lots), start=1):
            for lot_index, lot in enumerate(block, start=1):
                spec = SWATCHES[lot["swatch"]]
                x0, y0, x1, y1 = lot["box"]
                code = f"{prefix}-{row_index:02d}-{lot_index:02d}"
                features.append(
                    {
                        "type": "Feature",
                        "properties": {
                            "id": code,
                            "zone": zone,
                            "row": row_index,
                            "index": lot_index,
                            "product": spec["product"],
                            "variant": spec["variant"],
                            "swatch": lot["swatch"],
                            "frontageM": spec["frontageM"],
                            "depthM": spec["depthM"],
                            "sizeLabel": spec["sizeLabel"],
                            "areaM2": round(spec["frontageM"] * spec["depthM"], 1),
                            "color": spec["color"],
                        },
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [round(x0, 1), round(height - y1, 1)],
                                    [round(x1, 1), round(height - y1, 1)],
                                    [round(x1, 1), round(height - y0, 1)],
                                    [round(x0, 1), round(height - y0, 1)],
                                    [round(x0, 1), round(height - y1, 1)],
                                ]
                            ],
                        },
                    }
                )
                counts[lot["swatch"]] += 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "dragon-lots.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False),
        encoding="utf-8",
    )
    meta = {
        "width": CROP_X,
        "height": height,
        "image": "dragon-plan.webp",
        "title": "Dragon Park / Dragon River",
        "splitX": round(split_x, 1),
        "lots": len(features),
    }
    (OUT_DIR / "dragon-meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    webp_path = OUT_DIR / "dragon-plan.webp"
    if not webp_path.exists() or webp_path.stat().st_size < 100_000:
        image.crop((0, 0, CROP_X, height)).save(webp_path, "WEBP", quality=72, method=4)

    print(f"lots {len(features)} splitX {split_x:.0f}")
    for key in SWATCHES:
        print(f"  {key}: {counts[key]}")


if __name__ == "__main__":
    main()
