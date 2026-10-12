"""Khoét alpha đúng theo ranh, thay cho cách nới 60 m rồi xoá mọi pixel trắng.

Mép hiển thị là polygon ranh, không phải khung chữ nhật của tile.
Pixel giấy gần-trắng (kênh màu xấp xỉ nhau) mới thành trong suốt;
màu đất nhạt nhưng có sắc không bị thủng.
Erode vài pixel để cắt vệt màu bilinear loang ra ngoài ranh.
"""
from __future__ import annotations

import argparse

import numpy as np
from osgeo import gdal

gdal.UseExceptions()


def erode(mask: np.ndarray, radius: int) -> np.ndarray:
    """mask bool. Mỗi vòng co 1 pixel theo 4 hướng."""
    src = mask
    for _ in range(radius):
        padded = np.pad(src, 1, constant_values=False)
        src = (
            padded[1:-1, 1:-1]
            & padded[:-2, 1:-1]
            & padded[2:, 1:-1]
            & padded[1:-1, :-2]
            & padded[1:-1, 2:]
        )
    return src


def paper_mask(rgb: np.ndarray) -> np.ndarray:
    hi = rgb.max(axis=2)
    lo = rgb.min(axis=2)
    return (hi >= 248) & ((hi - lo) <= 6)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("src")
    parser.add_argument("boundary")
    parser.add_argument("dst")
    parser.add_argument("--erode", type=int, default=2)
    args = parser.parse_args()

    src = gdal.Open(args.src)
    band_count = src.RasterCount
    if band_count < 3:
        raise SystemExit("Ảnh nguồn cần ít nhất 3 kênh màu")

    xsize, ysize = src.RasterXSize, src.RasterYSize
    mask_ds = gdal.GetDriverByName("MEM").Create("", xsize, ysize, 1, gdal.GDT_Byte)
    mask_ds.SetGeoTransform(src.GetGeoTransform())
    mask_ds.SetProjection(src.GetProjection())

    reproj = gdal.VectorTranslate(
        "/vsimem/boundary_3857.geojson",
        args.boundary,
        format="GeoJSON",
        dstSRS=src.GetProjection() or "EPSG:3857",
        reproject=True,
    )
    # allTouched=False: không tô pixel chỉ chạm mép, kẻo màu loang ra ngoài ranh.
    gdal.Rasterize(mask_ds, reproj, burnValues=[255], allTouched=False)
    reproj = None
    inside = mask_ds.GetRasterBand(1).ReadAsArray() > 0
    inside = erode(inside, max(0, args.erode))

    rgb = np.dstack([src.GetRasterBand(i + 1).ReadAsArray() for i in range(3)])
    alpha = np.where(inside & ~paper_mask(rgb), 255, 0).astype(np.uint8)

    out = gdal.GetDriverByName("GTiff").Create(
        args.dst,
        xsize,
        ysize,
        4,
        gdal.GDT_Byte,
        options=["COMPRESS=DEFLATE", "TILED=YES", "ALPHA=YES"],
    )
    out.SetGeoTransform(src.GetGeoTransform())
    out.SetProjection(src.GetProjection())
    for i in range(3):
        out.GetRasterBand(i + 1).WriteArray(rgb[:, :, i])
    out.GetRasterBand(4).WriteArray(alpha)
    out.FlushCache()
    kept = int(alpha.sum() // 255)
    print(f"mask pixels kept={kept} of {xsize * ysize}; erode={args.erode}")


if __name__ == "__main__":
    main()
