#!/usr/bin/env bash
# Tải PDF quy hoạch sử dụng đất Quận Cầu Giấy 2030 (nguồn: Sở TN-MT Hà Nội, đăng lại bởi datsach.net)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/raw"
WORK="$ROOT/work"
OUT_NAME="${2:-cau-giay-qhsdd-2030.pdf}"
# Chính: Cầu Giấy. Dự phòng: Thanh Xuân, Đống Đa, Tây Hồ.
URLS=("${1:-https://bit.ly/3zMc7bX}" "https://bit.ly/3Sg4H8f" "https://bit.ly/3BwWBC3" "https://bit.ly/3BxVsub")

export PATH="$HOME/.local/bin:$PATH"
mkdir -p "$RAW" "$WORK"

download_one() {
  local short_url="$1"
  rm -rf "$RAW/tmp"
  mkdir -p "$RAW/tmp"
  local drive_url
  drive_url="$(curl -sIL -o /dev/null -w '%{url_effective}' "$short_url")"
  echo "Drive URL: $drive_url"
  if [[ "$drive_url" == *"/folders/"* ]]; then
    gdown --folder "$drive_url" -O "$RAW/tmp/"
  else
    gdown --fuzzy "$drive_url" -O "$RAW/tmp/"
  fi
  find "$RAW/tmp" -iname '*.pdf' | head -n 1
}

PDF=""
for url in "${URLS[@]}"; do
  echo "Đang tải $url ..."
  if PDF="$(download_one "$url")" && [[ -n "$PDF" && -f "$PDF" ]]; then
    break
  fi
  echo "Không tải được từ $url, thử link tiếp theo..." >&2
  PDF=""
done

if [[ -z "$PDF" || ! -f "$PDF" ]]; then
  echo "Không tìm thấy file PDF. Tải tay qua trình duyệt rồi đặt vào $RAW/$OUT_NAME" >&2
  exit 1
fi

mv "$PDF" "$RAW/$OUT_NAME"
rm -rf "$RAW/tmp"

ls -lh "$RAW/$OUT_NAME"
gdalinfo "$RAW/$OUT_NAME" | head -n 12
# Ảnh xem trước nhỏ để kiểm tra lưới tọa độ VN-2000 in trên bản đồ
gdal_translate -q -of PNG -outsize 20% 20% --config GDAL_PDF_DPI 72 "$RAW/$OUT_NAME" "$WORK/preview.png"
echo "Preview: $WORK/preview.png"
