const data = (file: string) => `${import.meta.env.BASE_URL}data/${file}`

export const AREA_URL = data('tan-hung-area.json')
export const ZONE_URL = data('tan-hung-zone.geojson')
export const BOUNDARY_URL = data('tan-hung-boundary.geojson')
export const LISTINGS_URL = data('listings.json')
export const LOTS_URL = data('tan-hung-parcels.geojson?v=2')
