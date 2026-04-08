/**
 * Plain JSON snapshot of dashboard state for the chat API (no functions).
 * Keeps payloads bounded for the model and logs.
 */
export function buildChatContextSnapshot(context) {
  if (!context || typeof context !== 'object') return {}

  const {
    ALL_DISTRICTS,
    selectedDistrict,
    disease,
    metric,
    year,
    years,
    diseases,
    districtNames,
    districtValues,
    mandalCount,
    stats,
    totals,
    summaryLabel,
    mapLevel,
  } = context

  return {
    ALL_DISTRICTS,
    selectedDistrict,
    disease,
    metric,
    year,
    years,
    diseases,
    districtNames,
    districtValues,
    mandalCount,
    stats,
    totals,
    summaryLabel,
    mapLevel,
  }
}
