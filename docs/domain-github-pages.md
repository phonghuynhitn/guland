# Trỏ domain trên Cloudflare tới GitHub Pages

Site build với base `/`. Sau khi gắn domain, mở `https://dprop.dsolution.net/` — không còn đường dẫn `/guland/`.

`dprop.dsolution.net` là subdomain. Zone trên Cloudflare là `dsolution.net`. Bản ghi là một **CNAME**, không phải bốn IP `A` của apex (những IP đó chỉ dùng khi trỏ chính `dsolution.net`).

## 1. DNS

Cloudflare → `dsolution.net` → **DNS** → **Records**. Proxy để **DNS only** (mây xám). Mây cam che đích GitHub, chứng chỉ HTTPS của Pages dễ không được cấp.

| Type | Name | Content | Proxy | TTL |
| --- | --- | --- | --- | --- |
| CNAME | `dprop` | `phonghuynhitn.github.io` | DNS only | Auto |

`Name` điền `dprop`, không điền cả `dprop.dsolution.net` — Cloudflare tự ghép thành `dprop.dsolution.net`. Xóa bản ghi `A` / `AAAA` / `CNAME` cũ cùng tên `dprop` nếu đang trỏ chỗ khác.

## 2. GitHub

Repo → **Settings** → **Pages** → **Custom domain** → nhập `dprop.dsolution.net` → **Save**.

Đợi GitHub kiểm tra DNS và xin chứng chỉ. Khi ô domain có dấu kiểm, bật **Enforce HTTPS**.

## 3. SSL trên Cloudflare

**SSL/TLS** → **Overview** → chế độ **Full**.

Đừng dùng **Flexible**: GitHub bắt HTTPS, Flexible gây vòng lặp redirect. Giữ mây xám đến khi Enforce HTTPS trên GitHub đã bật.
