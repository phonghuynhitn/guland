# Chuẩn bị dữ liệu quy hoạch

Tài liệu tổng: [docs/huong-dan.md](../docs/huong-dan.md) (các bước pipeline, vận hành, chi phí). File này chỉ nói về nắn ảnh.

## Nắn ảnh tự động theo lưới tọa độ

Bản đồ QHSDĐ Cầu Giấy có lưới VN-2000 màu xanh lơ, mỗi ô 500 m, thẳng hàng với trục ảnh. `georef.py` dò vị trí pixel của các đường lưới (`find_grid.py`), gán giá trị tọa độ từ hai mốc đọc trên nhãn viền khung, rồi hồi quy tuyến tính ra geotransform. Sai số khớp lưới dưới 0,35 m.

| Mốc | Pixel (ảnh 300 DPI) | Tọa độ VN-2000 |
| --- | --- | --- |
| Đường lưới dọc | x = 1604 | Y (Easting) = 579 500 |
| Đường lưới ngang | y = 2662 | X (Northing) = 2 329 500 |

Hệ tọa độ: VN-2000 TM-3, kinh tuyến trục 105°00', k = 0,9999 (Hà Nội). Tham số chuyển sang WGS84 lấy từ EPSG:6960; vì `+towgs84` dùng quy ước position vector nên 3 tham số xoay đã đổi dấu so với bảng EPSG (quy ước coordinate frame).

Với quận khác: đọc nhãn lưới trên ảnh, chạy `georef.py` với `--anchor-x/--anchor-e/--anchor-y/--anchor-n` tương ứng.

## Nắn bằng tay trong QGIS (khi bản đồ không có lưới hoặc bị xoay)

1. `gdal_translate -of GTiff --config GDAL_PDF_DPI 300 raw/<file>.pdf work/qh.tif`
2. QGIS > Raster > Georeferencer, mở `work/qh.tif`.
3. Chấm 6-10 điểm giao lưới (hoặc ngã tư đường đối chiếu ảnh vệ tinh), nhập tọa độ VN-2000.
4. Transformation: Polynomial 1 (hoặc Thin Plate Spline nếu ảnh scan bị méo), Target SRS dùng proj string trong `scripts/georef.py`.
5. Xuất ra `work/qh_vn2000.tif`, rồi chạy phần còn lại của `03-tiles.sh` (bỏ bước gọi `georef.py`).

## Ranh giới

Web đang xem **phường Tân Hưng** (OSM relation `2766950`). `build_tan_hung.py` cắt hiện trạng đúng theo polygon này, không nới buffer. Mép đỏ trên bản đồ và mép vùng tô là cùng một đường.

Khi nắn PDF (pipeline `03-tiles.sh`): chỉ buffer 12 m để còn mép resample, rồi `mask_edge.py` khoét alpha đúng ranh và co thêm 2 pixel cho khỏi vệt màu bilinear. Pixel giấy gần-trắng (ba kênh xấp xỉ nhau) mới trong suốt; màu đất nhạt có sắc không bị đục lỗ. Không còn nới 60 m rồi xoá mọi pixel `255,255,255`.
