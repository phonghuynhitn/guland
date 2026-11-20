# Yêu cầu khi đưa sa bàn lên dự án thật

Hệ thống bán hàng (`tdl-system-api`) đã có sản phẩm: mã, phân khu, khu/dãy, ngang, dài, diện tích, vị trí, hướng, đơn giá, trạng thái (`AVAILABLE`, `RESERVED`, `DEPOSITED`, `CONTRACT_SIGNED`, `LIQUIDATED`).

Hệ thống chưa có mặt bằng và ranh lô. Sa bàn chỉ cần design vẽ hình và ranh. Số liệu trên thẻ lô lấy theo mã sản phẩm, không nhập lại giá hay trạng thái.

Mã trên bản vẽ phải trùng `Product.code` trong phân khu: chữ, số, dấu `.` `_` `-`, tối đa 50 ký tự. Một mã một lô trong cùng phân khu.

## Sa bàn (`/sa-ban/`)

Mặt bằng ảnh, tô màu theo loại sản phẩm hoặc theo trạng thái bán. Bấm lô, tìm mã, zoom từng phân khu.

**Design giao**

- Một ảnh mặt bằng đã chốt cho phân khu đó.
- Mỗi lô một polyline kín. Mã lô nằm trong lô, trùng mã sản phẩm.
- Bảng màu: mỗi loại (biệt thự đơn lập, song lập, nhà phố, shophouse) và biến thể góc / điển hình một màu.
- Nếu có nút zoom phân khu (như Park / River): vạch chia phân khu trên bản vẽ.

**Dữ liệu**

- Không cần file giá riêng. Giá, diện tích, ngang, dài, hướng, trạng thái lấy từ sản phẩm đã có trên API.
- Loại sản phẩm dùng để tô màu chưa nằm trên sản phẩm. Cần một bảng mã sản phẩm → loại, hoặc bổ sung loại vào sản phẩm trước khi làm màu.

## Sa bàn 2 (`/sa-ban-2/`)

Cả tờ bản vẽ CAD: khuôn viên, khung tên, ký hiệu, ghi chú. Bấm lô theo ranh khép.

**Design giao**

- Một file `.dwg` của phương án đã chốt. Gửi kèm font và file xref nếu bản vẽ đang trỏ ra ngoài.
- Ranh lô là polyline kín, một layer riêng. Không giao nét rời hay hatch thay ranh. Bản PA2 đang là nét rời nên mới có lô không bấm được.
- Mã lô là text trong lòng lô, một layer riêng, mỗi lô một mã, trùng mã sản phẩm. Không dùng số lặp 1, 2, 3 cho nhiều lô.
- Chữ khung tên và ghi chú để Unicode. Nếu vẫn là font VNI thì gửi kèm font.
- Màu cần thấy trên web là màu trong model, không phải màu chỉ hiện khi in.

**Dữ liệu**

- Cùng sản phẩm trên API như sa bàn trên. Thẻ lô hiện mã, diện tích, giá, trạng thái từ hệ thống.
- Lô không có ranh kín thì không đưa lên, chờ design sửa file.
