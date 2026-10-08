const data = (file: string) => `${import.meta.env.BASE_URL}data/${file}`

export const PLANNING_URL: string = import.meta.env.VITE_PLANNING_URL ?? data('cau-giay.pmtiles')
export const DISTRICT_URL = data('district.geojson')
export const LISTINGS_URL = data('listings.json')
export const LEGEND_URL = data('legend.json')
