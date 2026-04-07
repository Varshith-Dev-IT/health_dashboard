/**
 * Rule-based answers for the AP health map dashboard, using live UI + data context.
 * @param {string} question
 * @param {Record<string, unknown>} ctx
 */
export function getDashboardChatReply(question, ctx) {
  const q = question.trim().toLowerCase()
  if (!q) {
    return 'Type a question about the map, districts, mandals, or the numbers on screen.'
  }

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
    formatNumber,
    getDistrictData,
    getCases,
    getIncidence,
  } = ctx

  const valueFor = (name) => districtValues.find((e) => e.name === name)?.value ?? 0
  const sortedHigh = () => [...districtValues].sort((a, b) => b.value - a.value)
  const sortedLow = () => [...districtValues].sort((a, b) => a.value - b.value)
  const vals = () => districtValues.map((e) => e.value)

  if (/^(hi|hello|hey|good\s+(morning|afternoon|evening))\b/.test(q)) {
    return 'Hello. I can explain **rankings**, **totals**, **mandals**, **colours**, **zoom**, **metrics**, or give **Cancer / Malaria** numbers for any district name on the map.'
  }

  if (/thanks|thank you|thx\b/.test(q)) {
    return 'You are welcome. Ask anything else about the dashboard.'
  }

  if (
    /\b(who are you|what are you|your name|chat ?bot|assistant)\b/.test(q) ||
    q === 'bot'
  ) {
    return 'I am the **map assistant** for this Andhra Pradesh health dashboard. I only answer using the **data and filters on your screen**—districts, Cancer/Malaria, years, cases vs rate, mandals, and how the controls work.'
  }

  if (
    /\b(what can (you|i)|what do you know|capabilities|topics|questions)\b/.test(q) ||
    /\b(examples?|ideas?|suggest)\b.*\b(ask|question)/.test(q)
  ) {
    return capabilitiesAnswer({ disease, summaryLabel, districtNames })
  }

  if (
    /\bhow\s+many\s+questions?\b/.test(q) ||
    /\bhow\s+much\s+can\s+you\s+(answer|handle|do)\b/.test(q) ||
    /\bwhat\s+kind(s)?\s+of\s+questions?\b/.test(q) ||
    /\blist\s+(all\s+)?(the\s+)?(things?|topics?|intents?)\b/.test(q)
  ) {
    return questionScopeAnswer({
      disease,
      summaryLabel,
      year,
      selectedDistrict,
      ALL_DISTRICTS,
      districtNames,
      totals,
      formatNumber,
    })
  }

  if (
    /\b(did\s*not|could\s*not|couldn'?t|didn'?t)\s+match\b/.test(q) ||
    /\bno\s+match\b/.test(q) ||
    /\bnot\s+match(ed)?\b.*\b(answer|question)\b/.test(q)
  ) {
    return noMatchHintAnswer({
      disease,
      summaryLabel,
      year,
      selectedDistrict,
      ALL_DISTRICTS,
    })
  }

  const dMatch = matchDistrict(q, districtNames)

  if (dMatch && /\brank\b|\branking\b|\bposition\b|\bstand\b/.test(q)) {
    const rankList = sortedHigh()
    const idx = rankList.findIndex((e) => e.name === dMatch)
    if (idx >= 0) {
      return `**${dMatch}** is **#${idx + 1} of ${rankList.length}** districts for **${summaryLabel.toLowerCase()}** (**${disease}**, **${year}**) at **${formatNumber(rankList[idx].value)}**.`
    }
  }

  if (dMatch) {
    const row = getDistrictData(dMatch)
    const cases = getCases(row, disease, year)
    const incidence = getIncidence(row, disease, year)
    if (/\bpopulation\b|\bpeople\b|\bhow\s+big\b/.test(q)) {
      return `**${dMatch}** estimated population in this dataset: **${formatNumber(row?.population ?? 0)}**. Health figures are at **district** level.`
    }
    if (/\b(case|cases)\b/.test(q) && !/\brate\b|\bincidence\b|\b100k\b/.test(q)) {
      return `**${dMatch}**, **${disease}**, **${year}**: **${formatNumber(cases)}** cases.`
    }
    if (/\b(rate|incidence|100k|per\s*100|per\s*capita)\b/.test(q)) {
      return `**${dMatch}**, **${disease}**, **${year}**: incidence **${incidence.toFixed(1)}** per 100,000 people.`
    }
    if (/\b(both|all|everything|full|numbers?|stats?|figures?|breakdown)\b/.test(q)) {
      return `**${dMatch}** (${year}, ${disease}): **${formatNumber(cases)}** cases; **${incidence.toFixed(1)}** per 100k; population **${formatNumber(row?.population ?? 0)}**.`
    }
    if (/\b(tell me|about|info|information|details?)\b/.test(q)) {
      return `**${dMatch}** (${year}, ${disease}): **${formatNumber(cases)}** cases, **${incidence.toFixed(1)}** per 100k. Ask for **population** or switch **disease / year / metric** in the toolbar.`
    }
    return `**${dMatch}** (${year}, ${disease}): **${formatNumber(cases)}** cases and **${incidence.toFixed(1)}** per 100k. Try **population**, **rate**, or **ranking** for more.`
  }

  const mentioned = findDistrictsMentioned(q, districtNames)
  const compareIntent =
    mentioned.length >= 2 &&
    (/\b(compare|versus|vs\.?|between|difference|against)\b/.test(q) ||
      /\s+and\s+/.test(q) ||
      /\bvs\.?\b/.test(q))

  if (compareIntent) {
    const d1 = mentioned[0]
    const d2 = mentioned[1]
    const v1 = valueFor(d1)
    const v2 = valueFor(d2)
    const higher = v1 >= v2 ? d1 : d2
    return `**${d1}** vs **${d2}** (${summaryLabel.toLowerCase()}, ${disease}, ${year}): **${formatNumber(v1)}** vs **${formatNumber(v2)}**. **${higher}** is higher on this metric.`
  }

  const topN = parseTopBottomN(q, 'top')
  if (topN !== null) {
    const slice = sortedHigh().slice(0, topN)
    const lines = slice.map((e, i) => `${i + 1}. **${e.name}** — ${formatNumber(e.value)}`)
    return `Top **${topN}** districts (${summaryLabel.toLowerCase()}, ${disease}, ${year}):\n${lines.join('\n')}`
  }

  const bottomN = parseTopBottomN(q, 'bottom')
  if (bottomN !== null) {
    const slice = sortedLow().slice(0, bottomN)
    const lines = slice.map((e, i) => `${i + 1}. **${e.name}** — ${formatNumber(e.value)}`)
    return `Lowest **${bottomN}** districts (${summaryLabel.toLowerCase()}, ${disease}, ${year}):\n${lines.join('\n')}`
  }

  if (
    /\b(highest|top|most|maximum|max|best|leader|leading)\b/.test(q) &&
    /\b(district|which|who|where|one)\b/.test(q)
  ) {
    const t = totals.topDistrict
    return `Highest district for **${summaryLabel.toLowerCase()}** (**${disease}**, **${year}**): **${t?.name ?? '—'}** at **${formatNumber(t?.value ?? 0)}**.`
  }

  if (
    /\b(lowest|least|minimum|min|worst|smallest|bottom)\b/.test(q) &&
    /\b(district|which|who|where|one)\b/.test(q)
  ) {
    const bottom = sortedLow()[0]
    return `Lowest district for **${summaryLabel.toLowerCase()}** (**${disease}**, **${year}**): **${bottom?.name ?? '—'}** at **${formatNumber(bottom?.value ?? 0)}**.`
  }

  if (/\b(highest|top|most|maximum|max|best|leader)\b/.test(q)) {
    const t = totals.topDistrict
    return `Highest right now: **${t?.name ?? '—'}** — **${formatNumber(t?.value ?? 0)}** (${summaryLabel.toLowerCase()}, ${disease}, ${year}).`
  }

  if (/\b(lowest|least|minimum|min|smallest)\b/.test(q)) {
    const bottom = sortedLow()[0]
    return `Lowest right now: **${bottom?.name ?? '—'}** — **${formatNumber(bottom?.value ?? 0)}**.`
  }

  if (
    /\b(total|sum|combined|overall|statewide|whole\s+state|all\s+districts|add\s+up)\b/.test(
      q,
    ) &&
    !matchDistrict(q, districtNames) &&
    !/\bpopulation\b/.test(q)
  ) {
    return `Statewide total **${summaryLabel.toLowerCase()}** (**${disease}**, **${year}**): **${formatNumber(totals.totalCases)}** (sum of all ${districtNames.length} districts on the map).`
  }

  if (q === 'total' || /\b^what.*\btotal\b|\btotal\s*\?/.test(q)) {
    return `Total **${summaryLabel.toLowerCase()}** across districts: **${formatNumber(totals.totalCases)}** (${disease}, ${year}).`
  }

  if (/\bmedian\b|\bmiddle\b|\bbadge\b|\bcorner\b/.test(q)) {
    return `Median **${summaryLabel.toLowerCase()}** (**${disease}**, **${year}**): **${stats.median.toFixed(1)}** (same value as the small badge on the map).`
  }

  if (/\b(average|mean)\b/.test(q)) {
    return `Average **${summaryLabel.toLowerCase()}** across ${districtNames.length} districts: **${totals.avg.toFixed(1)}** (${disease}, ${year}).`
  }

  if (
    /\b(min|max|minimum|maximum|range|spread|gap)\b/.test(q) &&
    /\b(value|values|metric|number|district|all|across)\b/.test(q)
  ) {
    const v = vals()
    return `Across all districts (${disease}, ${year}, ${summaryLabel.toLowerCase()}): **min** ${formatNumber(Math.min(...v))}, **max** ${formatNumber(Math.max(...v))}, **median** ${stats.median.toFixed(1)}.`
  }

  if (
    /\b(legend|color|colour|heatmap|shade|yellow|red|orange|gradient|scale|bucket|quantile|palette|chloropleth|choropleth)\b/.test(
      q,
    )
  ) {
    return 'Fill colour uses **six quantile buckets** (light yellow → dark red) for the **current metric and year**. **Darker = higher** on that metric. District outlines are thicker when a district is selected. **Mandal lines** are neutral—they are not coloured by disease.'
  }

  if (
    /\b(mandal|mandals|sub-?district|subdistrict|tehsil|taluk|revenue)\b/.test(q)
  ) {
    const m =
      mandalCount != null ? `**${mandalCount}** mandal boundaries` : 'Mandal boundaries'
    return `${m} sit under districts. **Health data is still by district**, not mandal. Choose one district to zoom and show only its mandals.`
  }

  if (
    /\b(zoom|select|choose|focus|filter|dropdown|pan|navigate|drill)\b/.test(q) &&
    /\b(district|map|area)\b/.test(q)
  ) {
    return 'Use the **District** dropdown: **All Andhra Pradesh** shows the full state and every mandal line; picking a **single district** zooms the map and filters mandals to that district. **Scroll** or pinch to zoom the map; **Metric** and **Disease** are in the toolbar.'
  }

  if (/\b(scroll|pinch|wheel|mouse)\b/.test(q) && /\bzoom\b/.test(q)) {
    return 'The map supports **scroll-wheel zoom** and touch **pinch zoom** (where the device allows). **Zoom controls** are on the bottom-right of the map.'
  }

  if (/\b(popup|pop-up|tooltip|hover)\b/.test(q)) {
    return '**Hover** a district or mandal to open a short popup with **district-level** cases and rate for your selected **disease and year**.'
  }

  if (
    /\bwhat\b.*\b(i|we)\s+(see|seeing|view|looking|on)\b/.test(q) ||
    /\bwhat\b.*\b(map|dashboard|screen)\s+(show|display|have)\b/.test(q) ||
    /\bdescribe\b.*\b(map|dashboard)\b/.test(q)
  ) {
    return currentViewSummary({
      selectedDistrict,
      ALL_DISTRICTS,
      disease,
      year,
      summaryLabel,
      totals,
      formatNumber,
    })
  }

  if (
    /\b(current|selected|active|now|right now|at\s+the\s+moment)\b/.test(q) &&
    /\b(year|disease|metric|district|filter|view|setting)\b/.test(q)
  ) {
    return currentViewSummary({
      selectedDistrict,
      ALL_DISTRICTS,
      disease,
      year,
      summaryLabel,
      totals,
      formatNumber,
    })
  }

  if (
    /\b(metric|cases|incidence|rate)\b/.test(q) &&
    /\b(what|which|current|selected|showing|am i|using)\b/.test(q)
  ) {
    const detail =
      metric === 'cases'
        ? 'raw **case counts** per district'
        : '**incidence per 100,000** (cases divided by population times 100,000)'
    return `Current **metric**: **${summaryLabel}** - ${detail}. Change it in the toolbar under the header.`
  }

  if (/\b(malaria|cancer)\b/.test(q) && /\b(what|tell|about|switch|change)\b/.test(q)) {
    return `The dashboard tracks **${diseases.join('** and **')}**. You are on **${disease}** now. Use the **Disease** dropdown to switch; numbers update everywhere.`
  }

  if (/\b(year|years)\b/.test(q)) {
    return `Years: **${years.join(', ')}**. Pick a year with the **tabs** in the dark header bar.`
  }

  if (/\b(disease|diseases|condition|illness)\b/.test(q)) {
    return `Diseases: **${diseases.join('** and **')}** (dropdown). Metrics: **Cases** or **Incidence per 100k**.`
  }

  if (
    /\b(incidence|per\s*100|100k|100\s*000)\b/.test(q) &&
    /\b(mean|what|how|explain|define|why|formula)\b/.test(q)
  ) {
    return '**Incidence per 100k** = (cases ÷ district population) × 100,000. It lets you compare districts of different sizes.'
  }

  if (/\b(case|cases)\b/.test(q) && /\b(mean|what|how|explain|define)\b/.test(q)) {
    return '**Cases** are the raw count for that district and year (demo / sample data unless you plug in real feeds).'
  }

  if (/\bhow\s+many\s+district/.test(q) || /\bdistrict\s+count\b/.test(q)) {
    return `**${districtNames.length}** districts are on this map.`
  }

  if (/\bhow\s+many\s+mandal/.test(q)) {
    if (mandalCount != null) {
      return `**${mandalCount}** mandal polygons in the boundary file (simplified).`
    }
    return 'Mandal file not loaded—check `public/ap-mandals.geojson` and your connection.'
  }

  if (
    /\blist\b.*\b(district|all|every)\b/.test(q) ||
    /\bdistricts\b.*\b(list|names|all|complete)\b/.test(q) ||
    /\bname\s+all\b.*\bdistrict/.test(q)
  ) {
    return `All **${districtNames.length}** districts: ${districtNames.join(', ')}.`
  }

  if (
    /\b(sample|demo|placeholder|synthetic|fake|made up|real|official|accurate|source)\b/.test(
      q,
    ) &&
    /\b(data|number|figure)\b/.test(q)
  ) {
    return 'Numbers mix **sample rows** in `healthData.js` with **generated placeholders** for newer district names. Replace with **official programme data** for production.'
  }

  if (/\b(overview|sidebar|panel|card|summary)\b/.test(q)) {
    return 'The **right-hand panel** shows totals, highest district, and the focused district summary. It always reflects your **year, disease, and metric**.'
  }

  if (/\bhelp\b/.test(q) || /\bhow\b.*\b(work|use|start)\b/.test(q) || q === '?') {
    return capabilitiesAnswer({ disease, summaryLabel, districtNames })
  }

  if (/\b(toolbar|control|dropdown|filter|header|tab)\b/.test(q)) {
    return '**Header**: year tabs. **Toolbar**: District, Disease, Metric. **Map**: colours = values; hover = popups. **Assistant** (this chat): questions in plain English.'
  }

  const fb = keywordFallback(q, {
    disease,
    summaryLabel,
    year,
    selectedDistrict,
    ALL_DISTRICTS,
    formatNumber,
    totals,
  })
  if (fb) return fb

  return `I could not parse that exact phrase, but I can answer a lot about this screen. **Try:** “top 5 districts”, “total”, “median”, “explain colours”, “mandals”, “zoom map”, “${disease} in Guntur”, “compare Krishna and Guntur”, “rank Visakhapatnam”. **Your view:** **${disease}**, **${summaryLabel}**, **${year}**${selectedDistrict === ALL_DISTRICTS ? ', all districts' : `, **${selectedDistrict}**`}.`
}

function questionScopeAnswer({
  disease,
  summaryLabel,
  year,
  selectedDistrict,
  ALL_DISTRICTS,
  districtNames,
  totals,
  formatNumber,
}) {
  const n = districtNames.length
  const view =
    selectedDistrict === ALL_DISTRICTS
      ? 'all districts'
      : `**${selectedDistrict}** (focused)`
  const approx = 120 + n * 6
  return (
    `I am **rule-based** (not a free-form LLM), but I cover a lot of **map-dashboard** wording.\n\n` +
    `**Rough scope:** **~${approx}+** phrasings — **${n}** district names each for **cases**, **rate**, **population**, **rank**; **top/bottom N** (N 1–15); **totals**, **median**, **average**, **min/max**; **compare** two districts; **colours**, **mandals**, **zoom**, **hover**, **toolbar**, **year/disease/metric**, **data disclaimer**, and **“what am I viewing?”**.\n\n` +
    `**Your view:** **${disease}**, **${summaryLabel}**, **${year}**, ${view}. State total for this metric: **${formatNumber(totals.totalCases)}**.`
  )
}

function noMatchHintAnswer({ disease, summaryLabel, year, selectedDistrict, ALL_DISTRICTS }) {
  const view =
    selectedDistrict === ALL_DISTRICTS
      ? 'all districts'
      : `**${selectedDistrict}**`
  return (
    `That exact wording is not in my pattern list. **Try:** “top 5 districts”, “total”, “median”, “highest district”, “rank Visakhapatnam”, “cancer cases in Guntur”, “rate in Krishna”, “explain colours”, “mandals”, “how do I zoom”, “what metric am I using”, “what am I seeing”. **Your view:** **${disease}**, **${summaryLabel}**, **${year}**, ${view}.`
  )
}

function capabilitiesAnswer({ disease, summaryLabel, districtNames }) {
  const ex = districtNames.slice(0, 3).join('", "')
  return (
    `You can ask about:\n` +
    `• **Rankings** — “highest district”, “lowest”, “top 3”, “bottom 5”, “where does ${ex} rank”\n` +
    `• **Numbers** — “total”, “median”, “average”, “cases in [district]”, “rate in [district]”, “population in [district]”\n` +
    `• **Compare** — “X vs Y”, “compare A and B”\n` +
    `• **Map** — “colours”, “legend”, “mandals”, “zoom”, “hover”, “popup”\n` +
    `• **Controls** — “what metric”, “what year”, “diseases”, “toolbar”\n` +
    `Right now the map uses your **${disease}** / **${summaryLabel}** selection.`
  )
}

function parseTopBottomN(q, kind) {
  if (kind === 'top') {
    if (/\btop\s*three\b|\bthree\s+highest\b|\b3\s+highest\b/.test(q)) return 3
    let m = q.match(/\b(top|first)\s+(\d{1,2})\b/)
    if (m) return clampN(parseInt(m[2], 10))
    m = q.match(/\b(\d{1,2})\s+(highest|best)\b/)
    if (m) return clampN(parseInt(m[1], 10))
    return null
  }
  if (/\bbottom\s*three\b|\bthree\s+lowest\b|\b3\s+lowest\b/.test(q)) return 3
  let m = q.match(/\b(bottom|last|lowest)\s+(\d{1,2})\b/)
  if (m) return clampN(parseInt(m[2], 10))
  m = q.match(/\b(\d{1,2})\s+(lowest|worst)\b/)
  if (m) return clampN(parseInt(m[1], 10))
  return null
}

function clampN(n) {
  if (!Number.isFinite(n) || n < 1) return null
  return Math.min(n, 15)
}

function keywordFallback(q, ctx) {
  const { disease, summaryLabel, year, selectedDistrict, ALL_DISTRICTS, formatNumber, totals } =
    ctx
  if (/\btotal\b/.test(q)) {
    return `Total **${summaryLabel.toLowerCase()}**: **${formatNumber(totals.totalCases)}** (${disease}, ${year}).`
  }
  if (/\bmedian\b/.test(q)) {
    return `Use the **median** value on the map badge, or ask “what is the median”.`
  }
  if (/\b(rank|ranking|order|sorted|leader ?board)\b/.test(q)) {
    return `Ask **which district is highest**, **top 5 districts**, or **where does [district] rank**.`
  }
  if (/\b(map|dashboard|view)\b/.test(q) && /\b(what|how)\b/.test(q)) {
    return `The **map** colours districts by **${summaryLabel.toLowerCase()}** for **${disease}** in **${year}**${selectedDistrict === ALL_DISTRICTS ? '' : ` (focused: **${selectedDistrict}**)`}.`
  }
  if (/\b(rank|ranking|leader\s*board|sorted)\b/.test(q) && /\b(district|districts)\b/.test(q)) {
    return `Ask **“top 5 districts”**, **“highest district”**, **“lowest district”**, or **“where does [district name] rank”** using a name from the map.`
  }
  if (/\b(cancer|malaria)\b/.test(q) && /\b(number|data|figure|stat)\b/.test(q)) {
    return `Pick a **district name** (e.g. “cancer cases in Guntur”, “malaria rate in Visakhapatnam”). I use your **${disease}** / **${year}** / **${summaryLabel}** selection.`
  }
  return null
}

/**
 * @param {string} q
 * @param {string[]} names
 */
function findDistrictsMentioned(q, names) {
  const lower = q.toLowerCase()
  const sorted = [...names].sort((a, b) => b.length - a.length)
  const found = []
  for (const n of sorted) {
    if (lower.includes(n.toLowerCase())) found.push(n)
  }
  if (found.length >= 2) return [...new Set(found)].slice(0, 2)
  const first = matchDistrict(q, names)
  if (!first) return []
  const rest = names.filter((n) => n !== first)
  const second = matchDistrict(
    lower.replace(first.toLowerCase(), ''),
    rest,
  )
  return second ? [first, second] : first ? [first] : []
}

/**
 * @param {string} q
 * @param {string[]} names
 */
function matchDistrict(q, names) {
  const lower = q.toLowerCase()
  const sorted = [...names].sort((a, b) => b.length - a.length)

  if (/\bkadapa\b|\bysr\b|y\.s\.r/.test(lower)) {
    const ysr = sorted.find((n) => n === 'YSR' || /\bYSR\b/.test(n))
    if (ysr) return ysr
  }

  if (/\banantapur\b/.test(lower) && !lower.includes('anantapuramu')) {
    const a = sorted.find((n) => n.includes('Anantapur'))
    if (a) return a
  }

  if (/\bspsr\b|\bsri\s+potti\b|\bnellore\b/.test(lower)) {
    const n = sorted.find((x) => x.includes('Nellore'))
    if (n) return n
  }

  for (const n of sorted) {
    if (lower.includes(n.toLowerCase())) return n
  }

  for (const n of sorted) {
    const parts = n.toLowerCase().split(/\s+/)
    for (const part of parts) {
      if (part.length > 4 && lower.includes(part)) return n
    }
  }

  if (/\bgodavari\b/.test(lower)) {
    if (/\beast\b/.test(lower)) {
      const e = sorted.find((n) => n.includes('East Godavari'))
      if (e) return e
    }
    if (/\bwest\b/.test(lower)) {
      const w = sorted.find((n) => n.includes('West Godavari'))
      if (w) return w
    }
    const eg = sorted.find((n) => n.includes('East Godavari'))
    if (eg) return eg
  }

  return null
}

function currentViewSummary({
  selectedDistrict,
  ALL_DISTRICTS,
  disease,
  year,
  summaryLabel,
  totals,
  formatNumber,
}) {
  const scope =
    selectedDistrict === ALL_DISTRICTS
      ? 'all districts'
      : `district **${selectedDistrict}** (map zoomed)`
  return `You are viewing **${disease}** as **${summaryLabel}** for **${year}**, with ${scope}. Total across districts for this metric: **${formatNumber(totals.totalCases)}**. Highest district: **${totals.topDistrict?.name ?? '—'}** (**${formatNumber(totals.topDistrict?.value ?? 0)}**).`
}
