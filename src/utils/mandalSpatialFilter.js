import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import centroid from '@turf/centroid'

/**
 * Mandal GeoJSON uses legacy census district names (e.g. Y.S.R., Chittoor).
 * New AP districts (e.g. Annamayya) have no matching dtname — filter by geometry instead.
 *
 * @param {GeoJSON.Feature[]} mandalFeatures
 * @param {GeoJSON.Feature} districtFeature
 * @returns {GeoJSON.Feature[]}
 */
export function filterMandalsInsideDistrict(mandalFeatures, districtFeature) {
  if (!districtFeature?.geometry || !Array.isArray(mandalFeatures)) return []

  return mandalFeatures.filter((mandal) => {
    if (!mandal?.geometry) return false
    try {
      const c = centroid(mandal.geometry)
      return booleanPointInPolygon(c, districtFeature.geometry)
    } catch {
      return false
    }
  })
}
