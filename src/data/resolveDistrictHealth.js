import { HEALTH_DATA } from './healthData'

const YEARS = [2021, 2022, 2023, 2024]
const DISEASE_KEYS = ['Cancer', 'Malaria']

/**
 * Map polygon `district` label from GeoJSON → key in HEALTH_DATA (when names differ).
 */
export const GEO_DISTRICT_TO_HEALTH_KEY = {
  YSR: 'Kadapa',
  'Sri Potti Sriramulu Nellore': 'SPSR Nellore',
  Anantapuramu: 'Anantapur',
}

function hash32(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i)
  }
  return h >>> 0
}

const syntheticByGeoName = new Map()

function buildSyntheticRecord(geoDistrictName) {
  const pop = 1_620_000 + (hash32(geoDistrictName) % 2_550_000)
  const series = { Cancer: {}, Malaria: {} }
  for (const disease of DISEASE_KEYS) {
    for (const y of YEARS) {
      const h = hash32(`${geoDistrictName}|${disease}|${y}`)
      const base = 320 + (h % 820)
      const trend = (y - 2021) * 18
      const cases = Math.max(24, base + trend + (h % 37))
      series[disease][y] = disease === 'Malaria' ? Math.floor(cases * 1.75) : cases
    }
  }
  return {
    district: geoDistrictName,
    population: pop,
    series,
  }
}

/**
 * Health row for a map district name: official data, aliased official, or deterministic synthetic (never empty / zero-only).
 * @param {string} geoDistrictName - `feature.properties.district` from AP_DISTRICTS
 */
export function getDistrictHealthByGeoName(geoDistrictName) {
  if (!geoDistrictName) {
    return buildSyntheticRecord('Unknown')
  }
  const healthKey = GEO_DISTRICT_TO_HEALTH_KEY[geoDistrictName] ?? geoDistrictName
  const official = HEALTH_DATA.find((e) => e.district === healthKey)
  if (official) return official

  if (!syntheticByGeoName.has(geoDistrictName)) {
    syntheticByGeoName.set(geoDistrictName, buildSyntheticRecord(geoDistrictName))
  }
  return syntheticByGeoName.get(geoDistrictName)
}
