"""Gán tọa độ VN-2000 cho ảnh quy hoạch dựa trên lưới km in trên bản đồ.

Mốc neo đọc từ nhãn lưới trên bản đồ Cầu Giấy:
  đường dọc tại x≈1604 px  -> Easting 579 500
  đường ngang tại y≈2662 px -> Northing 2 329 500
Lưới cách nhau 500 m.
"""
import argparse

import numpy as np
from osgeo import gdal

from find_grid import cyan_mask, peaks

gdal.UseExceptions()

# VN-2000 TM-3, kinh tuyến trục 105°00' (Hà Nội). Tham số EPSG:6960 công bố theo quy ước
# coordinate frame; +towgs84 dùng quy ước position vector nên 3 tham số xoay phải đổi dấu.
VN2000_HANOI = (
    "+proj=tmerc +lat_0=0 +lon_0=105 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 "
    "+towgs84=-191.90441429,-39.30318279,-111.45032835,0.00928836,-0.01975479,0.00427372,0.252906278 "
    "+units=m +no_defs"
)


def fit_axis(lines_px, anchor_px, anchor_coord, spacing, sign):
    """Gán giá trị tọa độ cho từng đường lưới rồi hồi quy tuyến tính px -> tọa độ."""
    step = np.median(np.diff(lines_px))
    k = np.round((np.array(lines_px) - anchor_px) / step)
    coords = anchor_coord + sign * k * spacing
    slope, intercept = np.polyfit(lines_px, coords, 1)
    residual = coords - (slope * np.array(lines_px) + intercept)
    return slope, intercept, np.abs(residual).max()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("src")
    p.add_argument("dst")
    p.add_argument("--anchor-x", type=float, default=1604)
    p.add_argument("--anchor-e", type=float, default=579500)
    p.add_argument("--anchor-y", type=float, default=2662)
    p.add_argument("--anchor-n", type=float, default=2329500)
    p.add_argument("--spacing", type=float, default=500)
    a = p.parse_args()

    ds = gdal.Open(a.src)
    step = 2
    mask = cyan_mask(ds, step)
    xs = [c * step for c in peaks(mask.sum(axis=0), 0.35, 3)]
    ys = [r * step for r in peaks(mask.sum(axis=1), 0.35, 3)]

    sx, ix, rx = fit_axis(xs, a.anchor_x, a.anchor_e, a.spacing, +1)
    sy, iy, ry = fit_axis(ys, a.anchor_y, a.anchor_n, a.spacing, -1)
    print(f"pixel size x={sx:.5f} m, y={sy:.5f} m; max residual x={rx:.2f} m, y={ry:.2f} m")

    out = gdal.Translate(a.dst, ds, format="GTiff",
                         creationOptions=["COMPRESS=DEFLATE", "TILED=YES"],
                         outputSRS=VN2000_HANOI)
    out.SetGeoTransform((ix, sx, 0.0, iy, 0.0, sy))
    out.FlushCache()
    print("written", a.dst)


if __name__ == "__main__":
    main()
