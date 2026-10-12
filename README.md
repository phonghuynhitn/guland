# Demo soi quy hoạch Tân Hưng

Demo tính năng giống [guland.vn/soi-quy-hoach](https://guland.vn/soi-quy-hoach/ha-noi), nhưng vùng xem là **phường Tân Hưng, TP. Hồ Chí Minh** (ranh OSM sau sắp xếp 2025) để nhìn kênh và đường quen mà biết lớp có đặt đúng chỗ. Một vùng tô màu hiện trạng được cắt đúng ranh phường, đè lên ảnh vệ tinh; vẽ ranh thửa; bản đồ giá từ tin ảo.

Toàn bộ công cụ và dữ liệu đều miễn phí. Vùng trên web là ranh và hiện trạng OpenStreetMap của phường Tân Hưng, chỉ để đối chiếu vị trí, không có giá trị pháp lý. Pipeline PDF Cầu Giấy vẫn nằm trong `data-prep/` cho thí nghiệm nắn ảnh.

Tài liệu đầy đủ (các bước làm, luồng vận hành, cập nhật dữ liệu, lên sản phẩm, chi phí miễn phí): **[docs/huong-dan.md](docs/huong-dan.md)**. Nắn ảnh VN-2000: [data-prep/README.md](data-prep/README.md).

## Cấu trúc

```
data-prep/        Xử lý dữ liệu: PDF -> ảnh có tọa độ -> PMTiles
  scripts/
    01-download.sh   Tải PDF quy hoạch từ Google Drive
    02-district.sh   Tải ranh giới quận từ OSM (dữ liệu lịch sử trước 07/2025)
    03-tiles.sh      Nắn ảnh, cắt theo ranh quận, tạo file .pmtiles cho web
    find_grid.py     Dò đường lưới tọa độ trên ảnh
    georef.py        Gán tọa độ VN-2000 từ lưới
    legend.py        Lấy màu chú giải -> legend.json
    gen-listings.py  Sinh tin rao ảo trong ranh phường Tân Hưng
    build_tan_hung.py  Tải ranh + hiện trạng OSM, cắt đúng biên phường
    mask_edge.py     Khoét alpha raster đúng ranh (khi có PDF)
  raw/ work/      Dữ liệu gốc và file trung gian (không commit)
web/              Vite + React + Leaflet + Geoman
  public/data/    tan-hung-zone.geojson, tan-hung-boundary.geojson, listings.json
```

## Yêu cầu

- macOS với Homebrew: `brew install gdal pmtiles pipx`, `pipx install gdown`
- Node.js `^20.19` hoặc `>=22.12` (Vite 8 không chạy trên Node 21), pnpm
- QGIS (tùy chọn, chỉ cần khi nắn ảnh bằng tay): `brew install --cask qgis-ltr`

## Làm lại vùng Tân Hưng

```bash
python data-prep/scripts/build_tan_hung.py
```

Cần Python 3 và `shapely`. Script tải ranh OSM, cắt hiện trạng đúng biên phường, ghi `web/public/data/tan-hung-*.json` và tin ảo.

Pipeline PDF (nắn lưới, rồi `mask_edge.py` khoét alpha đúng ranh) vẫn là `01-download.sh`, `02-district.sh`, `03-tiles.sh` — chưa gắn vào trang web.

## Chạy web

```bash
cd web
nvm use          # Node 22 theo .nvmrc
pnpm install
pnpm dev         # http://localhost:5173
```

## Deploy (miễn phí)

Bản public: **https://phonghuynhitn.github.io/guland/**

Mỗi lần `git push` lên `main`, GitHub Actions build Vite với `VITE_BASE=/guland/` rồi đưa `web/dist` lên GitHub Pages.

Cloudflare Pages (gốc `/`, tốt hơn cho file PMTiles lớn về sau):

```bash
cd web
pnpm exec wrangler login     # đăng nhập tài khoản Cloudflare một lần
pnpm deploy                  # build và upload dist/ lên project guland-demo
```

File `cau-giay.pmtiles` (7,4 MB) dưới giới hạn 25 MiB/file của Cloudflare Pages. Khi vượt, đưa file lên R2 (public, CORS `GET` + header `Range`) rồi:

```bash
VITE_PLANNING_URL=https://<r2-public-domain>/cau-giay.pmtiles pnpm deploy
```

## Nguồn bản đồ nền

- Ảnh vệ tinh và bản đồ đường phố: Esri World Imagery / World Street Map, miễn phí cho demo khi ghi nguồn; dùng thương mại cần tài khoản ArcGIS Location Platform.
- `tile.openstreetmap.org` không truy cập được từ một số mạng ở Việt Nam, CARTO basemaps đã bắt buộc API key, nên demo dùng Esri cho cả hai nền.
