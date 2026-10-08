# Demo soi quy hoạch Cầu Giấy

Demo tính năng giống [guland.vn/soi-quy-hoach](https://guland.vn/soi-quy-hoach/ha-noi): bản đồ quy hoạch sử dụng đất đến 2030 của quận Cầu Giấy (cũ) đè lên ảnh vệ tinh; chú giải mã đất; vẽ ranh thửa; bản đồ giá từ tin ảo.

Toàn bộ công cụ và dữ liệu đều miễn phí. Bản đồ quy hoạch là file PDF công khai của Sở TN-MT Hà Nội (bản đăng lại trên datsach.net), chỉ dùng cho demo nội bộ, không có giá trị pháp lý.

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
    gen-listings.py  Sinh tin rao ảo trong ranh quận
  raw/ work/      Dữ liệu gốc và file trung gian (không commit)
web/              Vite + React + Leaflet + Geoman
  public/data/    cau-giay.pmtiles, district.geojson, legend.json, listings.json
```

## Yêu cầu

- macOS với Homebrew: `brew install gdal pmtiles pipx`, `pipx install gdown`
- Node.js `^20.19` hoặc `>=22.12` (Vite 8 không chạy trên Node 21), pnpm
- QGIS (tùy chọn, chỉ cần khi nắn ảnh bằng tay): `brew install --cask qgis-ltr`

## Chạy lại toàn bộ pipeline dữ liệu

```bash
./data-prep/scripts/01-download.sh
./data-prep/scripts/02-district.sh
./data-prep/scripts/03-tiles.sh
/opt/homebrew/bin/python3 data-prep/scripts/legend.py data-prep/work/qh.tif web/public/data/legend.json
/opt/homebrew/bin/python3 data-prep/scripts/gen-listings.py
```

File kết quả đã có sẵn trong `web/public/data/`, chỉ cần chạy lại khi đổi dữ liệu.

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
