"""Dò vị trí pixel các đường lưới tọa độ màu xanh lơ trên ảnh bản đồ quy hoạch."""
import sys

import numpy as np
from osgeo import gdal


def cyan_mask(ds, step):
    r, g, b = (ds.GetRasterBand(i + 1).ReadAsArray(buf_xsize=ds.RasterXSize // step,
                                                    buf_ysize=ds.RasterYSize // step).astype(np.int16)
               for i in range(3))
    return (r < 140) & (g > 180) & (b > 200) & (b - r > 80)


def peaks(profile, min_ratio, min_gap):
    threshold = profile.max() * min_ratio
    idx = np.where(profile >= threshold)[0]
    groups, current = [], [idx[0]]
    for i in idx[1:]:
        if i - current[-1] <= min_gap:
            current.append(i)
        else:
            groups.append(current)
            current = [i]
    groups.append(current)
    return [float(np.average(g, weights=profile[g])) for g in groups]


def main(path, step=2):
    ds = gdal.Open(path)
    mask = cyan_mask(ds, step)
    cols = peaks(mask.sum(axis=0), 0.35, 3)
    rows = peaks(mask.sum(axis=1), 0.35, 3)
    print("size", ds.RasterXSize, ds.RasterYSize)
    print("vertical lines (x px):", [round(c * step, 1) for c in cols])
    print("horizontal lines (y px):", [round(r * step, 1) for r in rows])


if __name__ == "__main__":
    main(sys.argv[1])
