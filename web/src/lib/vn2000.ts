import proj4 from 'proj4'

// VN-2000 TM-3, kinh tuyến trục 105°45', k=0.9999 (TP. Hồ Chí Minh).
// Tham số datum lấy từ EPSG:9210 / bộ 7 tham số quốc gia. +towgs84 của proj4 dùng
// quy ước position vector nên 3 tham số xoay đã đổi dấu so với bảng coordinate frame.
export const VN2000_MERIDIAN_LABEL = '105°45′'

export const VN2000_HCMC =
  '+proj=tmerc +lat_0=0 +lon_0=105.75 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 ' +
  '+towgs84=-191.90441429,-39.30318279,-111.45032835,0.00928836,-0.01975479,0.00427372,0.252906278 ' +
  '+units=m +no_defs'

const converter = proj4('EPSG:4326', VN2000_HCMC)

/** Theo quy ước trắc địa Việt Nam: X là hướng Bắc (northing), Y là hướng Đông (easting). */
export function wgs84ToVn2000(lat: number, lng: number): { x: number; y: number } {
  const [easting, northing] = converter.forward([lng, lat])
  return { x: northing, y: easting }
}

export function vn2000ToWgs84(x: number, y: number): { lat: number; lng: number } {
  const [lng, lat] = converter.inverse([y, x])
  return { lat, lng }
}
