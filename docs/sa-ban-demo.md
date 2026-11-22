# Sa bàn demo Dragon Eden

Tài liệu này ghi lại các bước và kỹ thuật của route `/sa-ban-demo/`. Trang này làm mới hoàn toàn, không dùng code hay dữ liệu của `/sa-ban/` và `/sa-ban-2/`.

Demo không có giá trị pháp lý. Trạng thái bán, diện tích, hướng và giá là dữ liệu giả lập hoặc để trống. Chỉ vị trí trên bản đồ và hình lô lấy từ mặt bằng thiết kế.

Chạy local:

```bash
cd web
nvm use          # Node 22, xem .nvmrc
pnpm install
pnpm dev         # http://localhost:5173/sa-ban-demo/
```

Vite 8 cần Node 22. Node 21 làm trang không lên.

---

## 1. Các bước đã làm

1. Thêm một trang Vite riêng: `web/sa-ban-demo/index.html` nạp `web/src/saban-demo/main.tsx`. `web/vite.config.ts` khai báo input `sabanDemo`.
2. Lấy mặt bằng từ frame Figma **Toàn bộ** (`2394:9977`, file Tân Độ MS). Frame 1789×1040 px. Ảnh mặt bằng là `overlay-labels.webp` (4034×3334), còn số lô in sẵn trên ảnh.
3. Xuất từng lô thành polygon trong hệ pixel của frame, không gán lat/lng riêng cho từng lô. File `web/public/data/saban-demo/lots.json` có 5.396 lô.
4. Ghim cả frame lên một điểm EPSG:3857 bằng tâm, mét/pixel, góc xoay và hai hệ số kéo. Công thức nằm ở `frameToLatLng` trong `web/src/saban-demo/model.ts`.
5. Khóa camera trong khung dự án: zoom vào được, kéo và thu nhỏ không ra khỏi mặt bằng.
6. Vẽ lô bằng canvas Leaflet. Mọi lô luôn có polygon. Nhóm trạng thái chưa tích thì tô be nhạt và viền trắng. Nhóm đã tích thì tô đặc, viền trắng, và vẽ lại mã lô lên lớp màu.
7. Thêm panel tìm mã lô, lọc phân khu và năm trạng thái. Một mã khớp thì bay tới lô. Nhiều lô cùng mã thì liệt kê.
8. Thêm chế độ căn chỉnh tay (kéo, tỷ lệ, ngang, dọc, xoay) và nút lưu cấu hình vào `meta.json` khi đang chạy `pnpm dev`.
9. Nền mặc định là vệ tinh Google. Nút góc bản đồ đổi sang bản đồ đường Esri.

---

## 2. Dữ liệu

| File | Vai trò |
| --- | --- |
| `web/public/data/saban-demo/meta.json` | Tên, kích thước frame, vị trí ảnh, tâm WGS84, mét/pixel, xoay, scale ngang/dọc, danh sách phân khu |
| `web/public/data/saban-demo/lots.json` | 5.396 lô: `id`, `code`, `x`, `y`, `zone`, `block`, `ring` |
| `web/public/data/saban-demo/overlay-labels.webp` | Ảnh mặt bằng có số lô, khoảng 1,8 MB |

`ring` là các đỉnh polygon trong pixel frame, gốc trên-trái, trục y hướng xuống. 5.140 lô là tứ giác. `x`, `y` là điểm nhãn trong Figma, dùng cho popup. Số vẽ trên lớp màu không lấy điểm này.

Năm phân khu và số lô:

| Phân khu | Số lô |
| --- | ---: |
| PHÂN KHU 1 · DRAGON PARK | 554 |
| PHÂN KHU 2 · DRAGON RIVER | 1.103 |
| PHÂN KHU 3 · DRAGON CENTRAL | 1.224 |
| PHÂN KHU 4 · DRAGON AVENUE | 804 |
| PHÂN KHU 5 · DRAGON MEGA | 1.711 |

Mã lô dạng `A1-01`, `B14-19`. Có 5.300 mã khác nhau và 96 mã lặp. Mã lặp không nhảy tới một điểm: danh sách kết quả hiện hết.

Ảnh phủ đúng vùng render, không phủ cả frame. Trong `meta.json`, `overlay` là gốc `(360.74, 104.93)` và kích thước `1008.32 × 833.49` pixel frame.

---

## 3. Ghim pixel frame lên bản đồ

Không có lat/lng từng lô. Mọi điểm đi qua một phép chiếu:

1. Đưa pixel về tâm frame.
2. Chiếu lên hai trục của dãy lô. Trục dọc dãy là `{x: 0.791, y: -0.612}`, trục ngang là `{x: -0.612, y: -0.791}`.
3. Nhân `scaleAlong` và `scaleAcross`. Hai hệ số này tách riêng vì bản vẽ lệch tỷ lệ so với mặt đất: phóng đều thì một mép khớp, mép kia vẫn hụt.
4. Đổi ra mét bằng `metersPerPixel`, rồi xoay quanh tâm nếu `rotation` khác 0.
5. Đổi mét ra độ: vĩ độ dùng 111.320 m/độ, kinh độ chia thêm `cos(lat)`.

Kết quả là `[lat, lng]`. Polygon, ảnh nền, popup và vùng khóa camera đều gọi cùng hàm này, nên kéo tâm hay đổi tỷ lệ thì mọi lớp đi cùng nhau.

Giá trị đang lưu trong `meta.json` (đã căn tay):

- tâm `10.737018, 106.467321`
- `metersPerPixel` ≈ 2,299
- `rotation` = 0
- `scaleAcross` ≈ 1,010
- `scaleAlong` ≈ 1,030

---

## 4. Khóa vùng xem

`LockView` lấy bốn góc frame, đổi sang lat/lng, rồi:

- `maxBounds` = hình chữ nhật bao bốn góc, `maxBoundsViscosity` = 1
- `minZoom` = mức zoom vừa khít bounds, chừa 28 px
- `setView` chỉ chạy một lần (`fitted`). Đổi căn chỉnh không kéo camera về giữa mỗi lần render

Khi mở **Căn chỉnh**, `maxBounds` được gỡ và `minZoom` hạ thêm 2 nấc để kéo lớp lô ra ngoài khung. Đóng căn chỉnh thì khóa trở lại. Phím bản đồ cũng tắt trong lúc căn, để mũi tên dành cho bước dịch.

---

## 5. Thứ tự lớp

Pane Leaflet, từ dưới lên:

| Pane | z-index | Nội dung |
| --- | ---: | --- |
| tile (mặc định) | 200 | Vệ tinh hoặc giao thông |
| `planPane` | 450 | Ảnh mặt bằng, không nhận chuột |
| `lotPane` | 500 | Canvas tô lô, viền trắng, mã lô |
| `selectPane` | 560 | Viền đen của lô đang chọn |
| popup | 700 | Thẻ thông tin lô |

Canvas nằm trên ảnh nên màu lô che mặt bằng và vệ tinh. Lô không thuộc nhóm đang lọc vẫn được vẽ: tô be nhạt `#C5B893`, viền trắng 2 px. Ảnh mặt bằng chỉ còn lộ ở khoảng trống giữa các lô.

---

## 6. Ảnh mặt bằng bám zoom

Ảnh không dùng `ImageOverlay` của Leaflet. `PlanImage` tạo một thẻ `img` trong `planPane`, class `leaflet-zoom-animated`, rồi đặt bằng ma trận CSS từ ba góc:

- tây-bắc, đông-bắc, tây-nam của khung `overlay`
- mỗi góc qua `frameToLatLng` rồi ra điểm pixel lớp

Khi Leaflet đang animate zoom (`zoomanim`), góc được tính bằng `_latLngToNewLayerPoint` theo zoom và tâm mới. Trong lúc đó, handler `move` / `zoom` bỏ qua (`_animatingZoom`), kẻo ảnh nhảy một nhịp rồi mới khớp. Hết animation thì đặt lại theo view đã đứng yên.

Đổi căn chỉnh chỉ gọi lại hàm đặt ảnh. Ảnh gốc không bị cắt thành nhiều file. Khi một phân khu đã có ranh và đang lệch, cùng file đó được gắn thêm một lần nữa, cắt đúng theo ranh, và đặt theo căn của phân khu. Đưa phân khu về gốc thì chỉ còn một ảnh.

---

## 7. Tô trạng thái và số lô

Trạng thái không gọi API bán hàng. `demoStatus` băm mã lô (FNV-1a, offset `2166136261`, prime `16777619`) rồi chia dư 5:

| Thứ tự | Nhãn | Màu |
| --- | --- | --- |
| available | Còn trống | `#E0E0E0` |
| holding | Đang giữ chỗ | `#8A8A8A` |
| deposited | Đã đặt cọc | `#1A75D1` |
| contract | Đã ký HĐCN | `#178B70` |
| liquidated | Đã thanh lý | `#E58C00` |

Với bộ dữ liệu hiện tại, số lô theo trạng thái là 1.095 / 1.070 / 1.049 / 1.074 / 1.108. Đổi mã hoặc thêm lô thì số đếm đổi theo, vì panel đếm lại từ `demoStatus`.

Lô vẽ bằng một `L.canvas` chung, `padding` 0.5, gắn `lotPane`. Nhóm đang bật và đúng phân khu: tô đặc (`fillOpacity` 1), viền trắng 2 px, `lineJoin` round. Nhóm tắt, hoặc lô ngoài phân khu đang chọn: vẫn tô đặc be nhạt `#C5B893`, viền trắng 2 px. Mã lô vẽ trên cả hai nền. Chữ trên nền be là `#3d2914`, có viền trắng 1 px.

Mã lô trên lớp màu không phải marker DOM. Sau mỗi `_redraw` của canvas, `paintLotCodes` vẽ chữ vào cùng context:

- neo tại **trọng tâm diện tích** của ring (công thức shoelace), không phải điểm nhãn Figma — điểm nhãn lệch khỏi tim lô
- xoay theo cạnh dài nhất, lật sao cho chữ đọc từ trái sang phải
- cỡ chữ khoảng 72% cạnh ngắn, tối đa 15 px, và không rộng quá 90% cạnh dài
- bỏ qua lô khi cạnh dài dưới 16 px, cạnh ngắn dưới 8 px, hoặc chữ nhỏ hơn khoảng 6,5 px
- chữ trắng trên nền giữ chỗ, đặt cọc, ký HĐCN; chữ `#1c1c1c` kèm viền trắng 1 px trên nền còn trống và thanh lý

Vẽ lại một vùng thì chỉ vẽ những mã có neo nằm trong vùng đó, nới thêm 48 px. Vẽ lại toàn canvas thì vẽ hết mã đang thấy được.

Renderer được tạo một lần (`useMemo` rỗng) và đọc trạng thái lọc qua ref. Đổi hàm vẽ chữ thì cần tải lại trang; hot reload không thay closure cũ.

Popup hiện mã, khu, phân khu và trạng thái. Diện tích, hướng, đơn giá, thành tiền là `—`.

---

## 8. Tìm lô

`searchLots` so khớp đúng mã, không phân biệt hoa thường, trong phân khu đang chọn. Không có chuỗi thì xóa ghi chú.

- 0 kết quả: “Không có lô này.”
- 1 kết quả: chọn lô và `fitBounds` ring, padding 80 px, zoom tối đa 19
- nhiều kết quả: hiện danh sách, câu “N lô cùng mã. Chọn một dòng.”

Chọn một dòng tăng `focusNonce` để bay tới lô đó. Bấm lại lô đang chọn thì bỏ chọn. URL giữ `?lot=<id Figma>`. Mở lại link thì khôi phục lô nếu id còn trong dữ liệu.

---

## 9. Căn chỉnh và lưu

Bật bằng nút **Căn chỉnh**. `ALIGN_ENABLED` trong `SabanDemoApp.tsx` đang là `true`.

Mục **Đang căn** chọn **Cả dự án** hoặc một phân khu. Cả dự án dùng một phép chiếu chung. Từng phân khu thêm một chỉnh quanh tâm khu đó: dịch, tỷ lệ, ngang, dài, xoay. Lô khu khác không đi theo.

**Vẽ ranh** để tự khoanh phân khu. Bấm các điểm bao hết lô và tiện ích, rồi **Xong**. Lô có tâm nằm trong ranh thuộc phân khu đó. Ranh nhỏ hơn được ưu tiên khi chồng nhau. Ảnh nền vẫn là một file nguyên. Chỉ khi phân khu đã có ranh và đang lệch so với cả dự án, phần ảnh trong ranh mới được cắt theo đúng ranh và đi theo phân khu. Đưa phân khu về gốc thì ảnh liền lại. **Xóa ranh** trả lô về phân khu trong dữ liệu.

Trong lúc kéo cả dự án, lớp lô ẩn để nhìn ảnh và vệ tinh. Kéo một phân khu thì lô trong ranh và ảnh trong ranh đi theo tay, các khu khác mờ. Có hai chế độ: kéo lớp lô, hoặc kéo bản đồ. Mũi tên dịch theo bước 1, 5 hoặc 20 mét. Đang vẽ ranh thì Enter để xong, Backspace xóa điểm, Escape để hủy.

Các núm còn lại áp vào mục đang chọn:

- **Tỷ lệ** đổi `metersPerPixel` của cả dự án, hoặc hệ số phóng quanh tâm phân khu
- **Ngang** đổi `scaleAcross`
- **Dọc** đổi `scaleAlong`
- **Xoay** cộng độ vào `rotation`

**Đưa về gốc** chỉ xóa căn của mục đang chọn, không xóa ranh.

Bản nháp kéo cả dự án nằm ở `live`: ảnh đi theo tay, lô cập nhật khi thả. Kéo một phân khu thì lô và mảnh ảnh của khu đó dùng `liveZone` ngay trong lúc kéo.

Hai nơi lưu:

- `localStorage` khóa `saban-demo-align`, gồm căn cả dự án, `zones` và `outlines`
- **Lưu cấu hình** gửi `POST /api/saban-demo-align`

Plugin `sabanAlignSave` ghi `center`, `metersPerPixel`, `rotation`, `scaleAcross`, `scaleAlong`, `zoneTweaks` và `zoneOutlines`. Ranh là 3 đến 400 điểm pixel khung, mỗi tọa độ trong ±20000.

Giới hạn lúc lưu: mét/pixel trong (0,3; 20), xoay cả dự án trong ±20°, hai scale trong (0,5; 2). Mỗi phân khu: dịch trong ±2000 m, tỷ lệ và hai scale trong [0,5; 2], xoay trong ±30°.

---

## 10. Hai lớp nền

| Nút đang hiện | Lớp thật | URL |
| --- | --- | --- |
| Vệ tinh | Google `lyrs=s` | `https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}`, subdomain `mt0`–`mt3`, zoom gốc tối đa 20 |
| Giao thông | Esri World Street Map | `.../tile/{z}/{y}/{x}`, không có `{s}`, zoom gốc tối đa 19 |

`TileLayer` có `key={base}` để đổi lớp là tạo layer mới.

Lớp giao thông không khai báo `subdomains`. Leaflet vẫn gọi `_getSubdomain` và đọc `options.subdomains.length` dù URL không có `{s}`. Truyền `subdomains={undefined}` sẽ xóa mặc định `'abc'` và trang vỡ (`Cannot read properties of undefined (reading 'length')`). Chỉ spread `subdomains` khi cấu hình lớp có mảng đó.

---

## 11. File mã

| File | Việc |
| --- | --- |
| `web/sa-ban-demo/index.html` | Vỏ trang |
| `web/src/saban-demo/main.tsx` | Gắn React |
| `web/src/saban-demo/SabanDemoApp.tsx` | Tải dữ liệu, lọc, tìm, căn chỉnh |
| `web/src/saban-demo/SabanDemoMap.tsx` | Bản đồ, lớp, tô, số lô, khóa camera |
| `web/src/saban-demo/Panel.tsx` | Tìm kiếm và bộ lọc |
| `web/src/saban-demo/AlignPanel.tsx` | Núm căn chỉnh |
| `web/src/saban-demo/model.ts` | Kiểu, màu, băm trạng thái, `frameToLatLng` |
| `web/src/saban-demo/saban-demo.css` | Chrome trang |
| `web/vite.config.ts` | Input trang và API lưu căn chỉnh |

---

## 12. Giới hạn

- Trạng thái là hàm băm của mã, không phải tình trạng bán thật.
- Diện tích, hướng, đơn giá và thành tiền chưa có nguồn, nên popup để `—`.
- Số trên ảnh là số in trong `overlay-labels.webp`, bị lớp lô che. Số trên lớp màu hiện khi lô đủ lớn trên màn hình, kể cả lúc chưa lọc.
- API lưu căn chỉnh chỉ có khi chạy Vite dev. Bản build tĩnh không ghi được `meta.json`.
- Khóa camera theo khung frame đã chiếu. Xoay hoặc kéo mạnh lúc căn chỉnh có thể để một phần dự án sát mép vùng khóa.
