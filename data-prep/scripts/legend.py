"""Lấy màu ô chú giải trên bản đồ QHSDĐ Cầu Giấy và xuất legend.json cho web."""
import json
import sys

from osgeo import gdal

gdal.UseExceptions()

# Vị trí ô chú giải (pixel ảnh 300 DPI): gốc vùng chú giải và khoảng cách giữa các dòng
ORIGIN_X, ORIGIN_Y = 380, 10950
SCALE = 1400 / 869
ROW0, ROW_STEP = 140, 51.6
COL_SAMPLE_X = (70, 467)

COLUMNS = [
    [
        ("CLN", "Đất trồng cây lâu năm"),
        ("BHK", "Đất bằng trồng cây hàng năm khác"),
        ("NTS", "Đất nuôi trồng thủy sản"),
        ("MNC", "Đất có mặt nước chuyên dùng"),
        ("ODT", "Đất ở tại đô thị"),
        ("DSH", "Đất sinh hoạt cộng đồng"),
        ("TMD", "Đất thương mại, dịch vụ"),
        ("TON", "Đất tôn giáo"),
        ("DGT", "Đất giao thông"),
        ("TIN", "Đất tín ngưỡng"),
        ("NTD", "Đất nghĩa trang, nghĩa địa"),
        ("DCH", "Đất chợ"),
        ("TSC", "Đất trụ sở cơ quan, công trình sự nghiệp nhà nước"),
        ("SKC", "Đất cơ sở sản xuất, kinh doanh"),
        ("DTL", "Đất thủy lợi"),
        ("CAN", "Đất an ninh"),
        ("BCS", "Đất bằng chưa sử dụng"),
    ],
    [
        ("DYT", "Đất cơ sở y tế"),
        ("DGD", "Đất cơ sở giáo dục - đào tạo"),
        ("DVH", "Đất cơ sở văn hóa"),
        ("SON", "Đất sông ngòi, kênh, rạch, suối"),
        ("DKH", "Đất cơ sở nghiên cứu khoa học"),
        ("CQP", "Đất quốc phòng"),
        ("DKV", "Đất khu vui chơi, giải trí công cộng"),
        ("DTS", "Đất xây dựng trụ sở của tổ chức sự nghiệp"),
        ("DNL", "Đất công trình năng lượng"),
        ("DBV", "Đất công trình bưu chính viễn thông"),
        ("DTT", "Đất cơ sở thể dục - thể thao"),
        ("DXH", "Đất cơ sở dịch vụ về xã hội"),
        ("DCK", "Đất công trình công cộng khác"),
        ("DRA", "Đất bãi thải, xử lý chất thải"),
        ("PNK", "Đất phi nông nghiệp khác"),
    ],
]

GROUPS = {
    "residential": {"ODT"},
    "commercial": {"TMD", "SKC"},
    "agriculture": {"CLN", "BHK", "NTS"},
    "transport": {"DGT"},
    "water": {"MNC", "SON", "DTL"},
    "defense": {"CQP", "CAN"},
    "unused": {"BCS"},
}


def group_of(code):
    for name, codes in GROUPS.items():
        if code in codes:
            return name
    return "public"


def main(src, dst):
    ds = gdal.Open(src)
    items = []
    for col, entries in enumerate(COLUMNS):
        for row, (code, name) in enumerate(entries):
            x = int(ORIGIN_X + COL_SAMPLE_X[col] * SCALE)
            y = int(ORIGIN_Y + (ROW0 + row * ROW_STEP) * SCALE)
            rgb = [int(ds.GetRasterBand(b + 1).ReadAsArray(x, y, 1, 1)[0, 0]) for b in range(3)]
            items.append({"code": code, "name": name, "color": "#%02x%02x%02x" % tuple(rgb),
                          "group": group_of(code)})
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    for it in items:
        print(it["code"], it["color"])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
