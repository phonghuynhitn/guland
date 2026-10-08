#!/usr/bin/env bash
# PDF -> GeoTIFF (VN-2000) -> EPSG:3857 cắt theo ranh quận -> MBTiles -> PMTiles
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/raw"
WORK="$ROOT/work"
WEB_DATA="$ROOT/../web/public/data"
NAME="${NAME:-cau-giay}"
PDF="${PDF:-$RAW/cau-giay-qhsdd-2030.pdf}"
PY=/opt/homebrew/bin/python3
# Ranh OSM lấy từ GADM nên thô hơn bản đồ, nới rộng để không cắt mất phần rìa quận
BUFFER_M="${BUFFER_M:-60}"

mkdir -p "$WORK" "$WEB_DATA"
cd "$WORK"

if [[ ! -f qh.tif ]]; then
  gdal_translate -q -of GTiff -co COMPRESS=DEFLATE -co TILED=YES --config GDAL_PDF_DPI 300 "$PDF" qh.tif
fi

(cd "$ROOT/scripts" && $PY georef.py "$WORK/qh.tif" "$WORK/qh_vn2000.tif")

rm -f cutline.geojson
ogr2ogr -f GeoJSON cutline.geojson "$RAW/district.geojson" -a_srs EPSG:3857 \
  -dialect sqlite -sql "SELECT ST_Buffer(ST_Transform(SetSRID(geometry, 4326), 3857), $BUFFER_M) AS geometry FROM multipolygons"

rm -f warped.tif
# Nền giấy trắng của PDF thành trong suốt để nhìn xuyên xuống ảnh vệ tinh
gdalwarp -q -overwrite -t_srs EPSG:3857 -r bilinear -srcnodata "255 255 255" -dstalpha \
  -cutline cutline.geojson -crop_to_cutline \
  -co COMPRESS=DEFLATE -co TILED=YES qh_vn2000.tif warped.tif

# WEBP nhỏ hơn PNG khoảng 4 lần, giữ file dưới giới hạn 25 MiB/file của Cloudflare Pages
TILE_FORMAT="${TILE_FORMAT:-WEBP}"
rm -f "$NAME.mbtiles"
gdal_translate -q -of MBTILES -co TILE_FORMAT="$TILE_FORMAT" -co QUALITY=90 -co ZOOM_LEVEL_STRATEGY=UPPER \
  -co RESAMPLING=BILINEAR -co NAME="QHSDD $NAME 2030" warped.tif "$NAME.mbtiles"
gdaladdo -q -r average "$NAME.mbtiles" 2 4 8 16 32 64

rm -f "$WEB_DATA/$NAME.pmtiles"
pmtiles convert "$NAME.mbtiles" "$WEB_DATA/$NAME.pmtiles"
pmtiles show "$WEB_DATA/$NAME.pmtiles" | grep -Ei "zoom|bounds|tile type|center"

rm -f "$WEB_DATA/district.geojson"
ogr2ogr -f GeoJSON "$WEB_DATA/district.geojson" "$RAW/district.geojson" -lco COORDINATE_PRECISION=6
ls -lh "$WEB_DATA"
