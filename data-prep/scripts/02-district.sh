#!/usr/bin/env bash
# Tải ranh giới Quận Cầu Giấy cũ từ OSM. Sau 07/2025 quận đã bị giải thể nên phải lấy dữ liệu lịch sử.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/raw"
REL_ID="${1:-9421132}"
DATE="${2:-2025-05-01T00:00:00Z}"
mkdir -p "$RAW"

curl -s --max-time 170 -A "guland-demo/0.1" https://overpass-api.de/api/interpreter \
  --data-urlencode "data=[timeout:160][date:\"$DATE\"];(rel($REL_ID);>;);out meta;" \
  -o "$RAW/district.osm"

rm -f "$RAW/district.geojson"
OSM_USE_CUSTOM_INDEXING=NO ogr2ogr -f GeoJSON "$RAW/district.geojson" "$RAW/district.osm" multipolygons \
  -select name,admin_level -lco COORDINATE_PRECISION=7

ogrinfo -so -al "$RAW/district.geojson" | grep -E "Feature Count|Extent"
