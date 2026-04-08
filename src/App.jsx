import { useEffect, useMemo, useState } from 'react'
import { GeoJSON, MapContainer, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import { DashboardChatbot } from './components/DashboardChatbot'
import { AP_DISTRICTS } from './data/apDistricts'
import {
  getDistrictHealthByGeoName,
  getMandalLevelStats,
} from './data/resolveDistrictHealth'
import { filterMandalsInsideDistrict } from './utils/mandalSpatialFilter'
import './App.css'

const DISEASES = ['Cancer', 'Malaria']
const METRICS = [
  { label: 'Cases', value: 'cases' },
  { label: 'Incidence per 100k', value: 'incidence' },
]
const YEARS = [2021, 2022, 2023, 2024]
const COLOR_RAMP = [
  '#fff1c1',
  '#ffd38a',
  '#f5b26b',
  '#e17d4c',
  '#c34936',
  '#7b1e1e',
]

/** Distinct ramp for mandal-level heatmap (district view keeps warm ramp above). */
const MANDAL_COLOR_RAMP = [
  '#e8f4fc',
  '#b8d9f0',
  '#7eb8d9',
  '#4a90b8',
  '#2a6a94',
  '#0f3d5c',
]

const ALL_DISTRICTS = 'All districts'
const MAP_LEVEL_DISTRICT = 'district'
const MAP_LEVEL_MANDAL = 'mandal'

/** Mandal GeoJSON uses census district labels; map to dashboard district names. */
const DISTRICT_TO_MANDAL_GEO_DTNAME = {
  Kadapa: 'Y.S.R.',
  'SPSR Nellore': 'Sri Potti Sriramulu Nellore',
}

const mandalGeoDtname = (dashboardDistrict) =>
  DISTRICT_TO_MANDAL_GEO_DTNAME[dashboardDistrict] ?? dashboardDistrict

const dashboardDistrictFromMandalGeo = (dtname) => {
  if (dtname === 'Y.S.R.') return 'Kadapa'
  if (dtname === 'Sri Potti Sriramulu Nellore') return 'SPSR Nellore'
  return dtname
}

/** Initial / “reset” view for Andhra Pradesh */
const MAP_BOUNDS = [
  [12.6, 76.2],
  [19.6, 84.7],
]

/** Wider limit so you can pan past the state edge and keep coast / borders fully in view */
const MAP_MAX_BOUNDS = [
  [11.85, 75.35],
  [20.45, 85.65],
]

const WORLD_BOUNDS = [
  [85, -180],
  [-85, 180],
]

const getFeatureBounds = (feature) => {
  if (!feature) return null
  const layer = L.geoJSON(feature)
  return layer.getBounds()
}

const getDistrictOuterRings = (feature) => {
  if (!feature?.geometry) return []
  const { type, coordinates } = feature.geometry
  if (type === 'Polygon') {
    return coordinates.length ? [coordinates[0]] : []
  }
  if (type === 'MultiPolygon') {
    return coordinates.map((polygon) => polygon[0]).filter(Boolean)
  }
  return []
}

const buildMaskFeature = (features) => {
  const outerRing = [
    [WORLD_BOUNDS[0][1], WORLD_BOUNDS[0][0]],
    [WORLD_BOUNDS[1][1], WORLD_BOUNDS[0][0]],
    [WORLD_BOUNDS[1][1], WORLD_BOUNDS[1][0]],
    [WORLD_BOUNDS[0][1], WORLD_BOUNDS[1][0]],
    [WORLD_BOUNDS[0][1], WORLD_BOUNDS[0][0]],
  ]
  const holes = features.flatMap(getDistrictOuterRings)
  return {
    type: 'Feature',
    properties: { name: 'ap-mask' },
    geometry: {
      type: 'Polygon',
      coordinates: [outerRing, ...holes],
    },
  }
}

const MapViewport = ({ district, feature }) => {
  const map = useMap()

  useEffect(() => {
    if (!map) return
    if (district === ALL_DISTRICTS || !feature) {
      map.flyToBounds(MAP_BOUNDS, { padding: [48, 48], duration: 0.9 })
      return
    }
    const bounds = getFeatureBounds(feature)
    if (bounds?.isValid()) {
      map.flyToBounds(bounds, { padding: [32, 32], maxZoom: 10, duration: 0.9 })
    }
  }, [map, district, feature])

  return null
}

const formatNumber = (value) =>
  new Intl.NumberFormat('en-IN').format(Math.round(value))

const getCases = (districtData, disease, year) =>
  districtData?.series?.[disease]?.[year] ?? 0

const getIncidence = (districtData, disease, year) => {
  const cases = getCases(districtData, disease, year)
  const population = districtData?.population ?? 0
  if (!population) return 0
  return (cases / population) * 100000
}

const getQuantileBreaks = (values, steps) => {
  const sorted = [...values].sort((a, b) => a - b)
  return Array.from({ length: steps }, (_, index) => {
    const position = Math.floor(((index + 1) / steps) * (sorted.length - 1))
    return sorted[position]
  })
}

const getMedian = (values) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

const getFillColor = (value, stats, ramp = COLOR_RAMP) => {
  if (!Number.isFinite(value)) return ramp[0]
  const index = stats.quantiles.findIndex((breakpoint) => value <= breakpoint)
  return ramp[Math.max(0, index)] ?? ramp.at(-1)
}

const getMandalFeatureMetric = (feature, districtScope, disease, yearKey, metricKey) => {
  const mandalName = feature?.properties?.sdtname ?? ''
  const geoDt = feature?.properties?.dtname ?? ''
  const mapDistrictLabel =
    districtScope !== ALL_DISTRICTS ? districtScope : dashboardDistrictFromMandalGeo(geoDt)
  const m = getMandalLevelStats(mapDistrictLabel, mandalName, geoDt, disease, yearKey)
  return metricKey === 'cases' ? m.cases : m.incidence
}

function App() {
  const [disease, setDisease] = useState('Cancer')
  const [metric, setMetric] = useState('incidence')
  const [year, setYear] = useState(2024)
  const [district, setDistrict] = useState(ALL_DISTRICTS)
  const [mandalsGeo, setMandalsGeo] = useState(null)
  const [selectedMandal, setSelectedMandal] = useState(null)
  const [mapLevel, setMapLevel] = useState(MAP_LEVEL_DISTRICT)

  useEffect(() => {
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}ap-mandals.geojson`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setMandalsGeo(data)
      })
      .catch(() => {
        if (!cancelled) setMandalsGeo(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const districtValues = useMemo(() => {
    return AP_DISTRICTS.features.map((feature) => {
      const name = feature.properties.district
      const districtData = getDistrictHealthByGeoName(name)
      const value =
        metric === 'cases'
          ? getCases(districtData, disease, year)
          : getIncidence(districtData, disease, year)
      return { name, value, population: districtData.population }
    })
  }, [disease, metric, year])

  const selectedFeature = useMemo(() => {
    if (district === ALL_DISTRICTS) return null
    return AP_DISTRICTS.features.find(
      (feature) => feature?.properties?.district === district,
    )
  }, [district])

  const maskFeature = useMemo(() => {
    return buildMaskFeature(AP_DISTRICTS.features)
  }, [])

  const mandalLayerData = useMemo(() => {
    if (!mandalsGeo?.features?.length) return null
    if (district === ALL_DISTRICTS) return mandalsGeo

    const targetDt = mandalGeoDtname(district)
    const byLegacyName = mandalsGeo.features.filter(
      (f) => f.properties?.dtname === targetDt,
    )

    if (byLegacyName.length > 0) {
      return { type: 'FeatureCollection', features: byLegacyName }
    }

    const distFeature = AP_DISTRICTS.features.find(
      (feat) => feat.properties?.district === district,
    )
    if (!distFeature?.geometry) {
      return { type: 'FeatureCollection', features: [] }
    }

    const features = filterMandalsInsideDistrict(mandalsGeo.features, distFeature)
    return { type: 'FeatureCollection', features }
  }, [mandalsGeo, district])

  const mandalHeatStats = useMemo(() => {
    if (mapLevel !== MAP_LEVEL_MANDAL || !mandalLayerData?.features?.length) {
      return {
        quantiles: Array.from({ length: MANDAL_COLOR_RAMP.length }, () => 0),
        median: 0,
        min: 0,
        max: 0,
      }
    }
    const values = mandalLayerData.features.map((feature) =>
      getMandalFeatureMetric(feature, district, disease, year, metric),
    )
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      median: getMedian(values),
      quantiles: getQuantileBreaks(values, MANDAL_COLOR_RAMP.length),
    }
  }, [mapLevel, mandalLayerData, district, disease, year, metric])

  const stats = useMemo(() => {
    const values = districtValues.map((entry) => entry.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    return {
      min,
      max,
      median: getMedian(values),
      quantiles: getQuantileBreaks(values, COLOR_RAMP.length),
    }
  }, [districtValues])

  const totals = useMemo(() => {
    const totalCases = districtValues.reduce((sum, entry) => sum + entry.value, 0)
    const topDistrict = [...districtValues].sort((a, b) => b.value - a.value)[0]
    const avg = totalCases / districtValues.length
    return {
      totalCases,
      topDistrict,
      avg,
    }
  }, [districtValues])

  const activeDistrictData =
    district === ALL_DISTRICTS ? null : getDistrictHealthByGeoName(district)

  const summaryValue = metric === 'cases'
    ? getCases(activeDistrictData, disease, year)
    : getIncidence(activeDistrictData, disease, year)

  const summaryLabel = metric === 'cases' ? 'Cases' : 'Rate per 100k'

  const selectedMandalStats = useMemo(() => {
    if (!selectedMandal) return null
    return getMandalLevelStats(
      selectedMandal.districtLabel,
      selectedMandal.sdtname,
      selectedMandal.dtname,
      disease,
      year,
    )
  }, [selectedMandal, disease, year])

  const activeHeatStats = mapLevel === MAP_LEVEL_MANDAL ? mandalHeatStats : stats
  const activeColorRamp = mapLevel === MAP_LEVEL_MANDAL ? MANDAL_COLOR_RAMP : COLOR_RAMP
  const medianBadgeLabel =
    mapLevel === MAP_LEVEL_MANDAL ? 'Mandal median' : 'AP median'
  const medianDisplayValue =
    metric === 'cases'
      ? formatNumber(activeHeatStats.median)
      : activeHeatStats.median.toFixed(1)

  const chatContext = useMemo(
    () => ({
      ALL_DISTRICTS,
      selectedDistrict: district,
      disease,
      metric,
      year,
      years: YEARS,
      diseases: DISEASES,
      districtNames: districtValues.map((e) => e.name),
      districtValues,
      mandalCount: mandalsGeo?.features?.length ?? null,
      stats,
      totals,
      summaryLabel,
      formatNumber,
      getDistrictData: getDistrictHealthByGeoName,
      getCases,
      getIncidence,
      mapLevel,
    }),
    [
      district,
      disease,
      metric,
      year,
      districtValues,
      mandalsGeo,
      stats,
      totals,
      summaryLabel,
      mapLevel,
    ],
  )

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="title-block">
          <p className="kicker">Andhra Pradesh</p>
          <h1>{disease} {metric === 'incidence' ? 'Incidence Rate' : 'Cases'}</h1>
          <p className="subtitle">
            {mapLevel === MAP_LEVEL_MANDAL
              ? 'Mandal-level heatmap (sample subdistrict values) · cool palette · '
              : 'District-level heatmap · warm palette · '}
            Sample programme · {YEARS[0]}-{YEARS.at(-1)}
          </p>
        </div>
        <div className="topbar-brand">
          <div className="topbar-logo-wrap">
            <img
              className="topbar-logo"
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="GeoIntel lab"
              decoding="async"
            />
          </div>
          <p className="topbar-credit">Powered by Geo-Intel Lab, IITTNIF, Tirupati</p>
        </div>
      </header>

      <main className="main-grid">
        <aside className="filters-panel">
          <section className="toolbar" aria-label="Map filters">
            <div className="toolbar-left">
              <label className="inline-field">
                <span>District</span>
                <select
                  value={district}
                  onChange={(event) => {
                    setDistrict(event.target.value)
                    setSelectedMandal(null)
                  }}
                >
                  <option value={ALL_DISTRICTS}>All Andhra Pradesh</option>
                  {districtValues.map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-field">
                <span>Year</span>
                <select
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                  aria-label="Year"
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-field">
                <span>Disease</span>
                <select value={disease} onChange={(event) => setDisease(event.target.value)}>
                  {DISEASES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-field">
                <span>Metric</span>
                <select value={metric} onChange={(event) => setMetric(event.target.value)}>
                  {METRICS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="map-level-toggle"
                role="group"
                aria-label="Heat map aggregation level"
              >
                <span className="map-level-toggle-label">Heat map</span>
                <div className="map-level-toggle-buttons">
                  <button
                    type="button"
                    className={
                      mapLevel === MAP_LEVEL_DISTRICT
                        ? 'map-level-btn is-active'
                        : 'map-level-btn'
                    }
                    onClick={() => setMapLevel(MAP_LEVEL_DISTRICT)}
                  >
                    District
                  </button>
                  <button
                    type="button"
                    className={
                      mapLevel === MAP_LEVEL_MANDAL ? 'map-level-btn is-active' : 'map-level-btn'
                    }
                    onClick={() => setMapLevel(MAP_LEVEL_MANDAL)}
                  >
                    Mandal
                  </button>
                </div>
              </div>
            </div>
            <div className="toolbar-right">
              <span className="meta-pill">{AP_DISTRICTS.features.length} districts</span>
              <span className="meta-pill">{mandalsGeo?.features?.length ?? '—'} mandals</span>
              <span className="meta-pill">{YEARS[0]}-{YEARS.at(-1)}</span>
            </div>
          </section>

          <div className="overview-focus">
            <div>
              <h3>{district === ALL_DISTRICTS ? 'Selected district' : district}</h3>
              <p>{district === ALL_DISTRICTS ? 'Choose a district to zoom in.' : 'Focused summary'}</p>
            </div>
            <div>
              <strong>{district === ALL_DISTRICTS ? '--' : formatNumber(summaryValue)}</strong>
              <span>{summaryLabel}</span>
            </div>
          </div>
        </aside>

        <section className="map-panel">
          <div className="map-shell">
            <MapContainer
              bounds={MAP_BOUNDS}
              maxBounds={MAP_MAX_BOUNDS}
              maxBoundsViscosity={0.85}
              minZoom={6}
              maxZoom={9}
              zoomControl={false}
              scrollWheelZoom
              className="map"
            >
              <MapViewport district={district} feature={selectedFeature} />
              <GeoJSON
                data={maskFeature}
                style={{
                  color: 'transparent',
                  weight: 0,
                  fillColor: '#e6e1da',
                  fillOpacity: 1,
                }}
                interactive={false}
              />
              <GeoJSON
                key={`${disease}-${year}-${metric}-${district}-${mapLevel}`}
                data={AP_DISTRICTS}
                style={(feature) => {
                  const name = feature?.properties?.district
                  const focused = district === ALL_DISTRICTS || district === name
                  if (mapLevel === MAP_LEVEL_MANDAL) {
                    return {
                      color: focused ? '#4a433c' : '#8a8078',
                      weight: focused ? 1.6 : 0.9,
                      fillColor: '#c4bfb6',
                      fillOpacity: focused ? 0.22 : 0.1,
                    }
                  }
                  const value = districtValues.find((entry) => entry.name === name)?.value
                  return {
                    color: focused ? '#2c2722' : '#61554a',
                    weight: focused ? 2 : 1,
                    fillColor: getFillColor(value, stats, COLOR_RAMP),
                    fillOpacity: focused ? 0.85 : 0.22,
                  }
                }}
                onEachFeature={(feature, layer) => {
                  const name = feature?.properties?.district
                  const districtData = getDistrictHealthByGeoName(name)
                  const cases = getCases(districtData, disease, year)
                  const incidence = getIncidence(districtData, disease, year)
                  const canShowPopup =
                    district === ALL_DISTRICTS || district === name
                  layer.bindPopup(
                    `<strong>${name}</strong><br/>Cases: ${formatNumber(
                      cases,
                    )}<br/>Rate: ${incidence.toFixed(1)} per 100k`,
                    { autoPan: false, className: 'district-popup' },
                  )
                  layer.on('click', () => {
                    setSelectedMandal(null)
                  })
                  layer.on('mouseover', () => {
                    if (canShowPopup) layer.openPopup()
                  })
                  layer.on('mouseout', () => {
                    layer.closePopup()
                  })
                }}
              />
              {mandalLayerData ? (
                <GeoJSON
                  key={`mandals-${district}-${disease}-${year}-${mapLevel}-${mandalsGeo?.features?.length ?? 0}`}
                  data={mandalLayerData}
                  style={(feature) => {
                    const sdt = feature?.properties?.sdtname ?? ''
                    const dt = feature?.properties?.dtname ?? ''
                    const selected =
                      selectedMandal != null &&
                      selectedMandal.sdtname === sdt &&
                      selectedMandal.dtname === dt
                    if (mapLevel === MAP_LEVEL_MANDAL) {
                      const mValue = getMandalFeatureMetric(
                        feature,
                        district,
                        disease,
                        year,
                        metric,
                      )
                      return {
                        className: 'mandal-boundary',
                        color: selected ? '#0a1620' : 'rgba(15, 61, 92, 0.55)',
                        weight: selected ? 2.2 : 0.35,
                        fillColor: getFillColor(mValue, mandalHeatStats, MANDAL_COLOR_RAMP),
                        fillOpacity: selected ? 0.92 : 0.82,
                        opacity: 1,
                      }
                    }
                    return {
                      className: 'mandal-boundary',
                      color: selected
                        ? '#c64b3b'
                        : district === ALL_DISTRICTS
                          ? 'rgba(44, 39, 34, 0.42)'
                          : 'rgba(44, 39, 34, 0.58)',
                      weight: selected ? 2.2 : district === ALL_DISTRICTS ? 0.35 : 0.55,
                      fillOpacity: selected ? 0.14 : 0,
                      opacity: 0.95,
                    }
                  }}
                  onEachFeature={(feature, layer) => {
                    const mandalName = feature?.properties?.sdtname ?? 'Mandal'
                    const geoDt = feature?.properties?.dtname ?? ''
                    const legacyDistLabel = dashboardDistrictFromMandalGeo(geoDt)
                    const mapDistrictLabel =
                      district !== ALL_DISTRICTS ? district : legacyDistLabel

                    const buildPopupHtml = () => {
                      const m = getMandalLevelStats(
                        mapDistrictLabel,
                        mandalName,
                        geoDt,
                        disease,
                        year,
                      )
                      const districtData = getDistrictHealthByGeoName(mapDistrictLabel)
                      const dCases = getCases(districtData, disease, year)
                      const dInc = getIncidence(districtData, disease, year)
                      const censusNote =
                        district !== ALL_DISTRICTS &&
                        geoDt &&
                        legacyDistLabel !== mapDistrictLabel
                          ? `<span style="opacity:0.72;font-size:11px">Mandal file (census): ${geoDt}</span><br/>`
                          : ''
                      return `<strong>${mandalName}</strong><br/><span style="opacity:0.85">${mapDistrictLabel}</span><br/>${censusNote}<strong>Mandal cases (sample):</strong> ${formatNumber(m.cases)}<br/><strong>Mandal rate:</strong> ${m.incidence.toFixed(1)} per 100k<br/><span style="opacity:0.72;font-size:11px">Est. pop. ${formatNumber(m.population)}</span><hr style="border:none;border-top:1px solid rgba(255,255,255,0.18);margin:8px 0"/><span style="opacity:0.85">District cases:</span> ${formatNumber(dCases)}<br/><span style="opacity:0.85">District rate:</span> ${dInc.toFixed(1)} per 100k<br/><span style="opacity:0.65;font-size:11px">Use × to close · Click another mandal to switch</span>`
                    }

                    layer.bindPopup(buildPopupHtml(), {
                      autoPan: false,
                      className: 'district-popup',
                      closeButton: true,
                    })
                    layer.on('click', (e) => {
                      L.DomEvent.stopPropagation(e)
                      setSelectedMandal({
                        sdtname: mandalName,
                        dtname: geoDt,
                        districtLabel: mapDistrictLabel,
                      })
                      layer.setPopupContent(buildPopupHtml())
                      layer.openPopup()
                    })
                  }}
                />
              ) : null}
              <ZoomControl position="bottomright" />
            </MapContainer>

            <div className="median-badge">
              <span>
                {medianBadgeLabel} {summaryLabel.toLowerCase()}
              </span>
              <strong>{medianDisplayValue}</strong>
            </div>

            <div className="legend">
              <span>Low</span>
              <div className="legend-bar">
                {activeColorRamp.map((color) => (
                  <span key={color} style={{ background: color }} aria-hidden="true"></span>
                ))}
              </div>
              <span>High</span>
            </div>
          </div>
        </section>

        <aside className="overview-panel">
          <div className="panel-header">
            <h2>Andhra Pradesh Overview</h2>
            <p>Summary for the selected year and metric.</p>
          </div>
          <div className="overview-grid">
            <div className="overview-card">
              <span>Districts mapped</span>
              <strong>{AP_DISTRICTS.features.length}</strong>
            </div>
            <div className="overview-card">
              <span>Year range</span>
              <strong>{YEARS[0]}-{YEARS.at(-1)}</strong>
            </div>
            <div className="overview-card">
              <span>Highest district</span>
              <strong>{totals.topDistrict?.name ?? '--'}</strong>
              <p>{formatNumber(totals.topDistrict?.value ?? 0)}</p>
            </div>
            <div className="overview-card">
              <span>Total {summaryLabel.toLowerCase()}</span>
              <strong>{formatNumber(totals.totalCases)}</strong>
            </div>
          </div>

          {selectedMandal && selectedMandalStats ? (
            <div className="overview-mandal">
              <div className="overview-mandal-head">
                <div>
                  <h3>{selectedMandal.sdtname}</h3>
                  <p>
                    {selectedMandal.districtLabel} · {disease} · {year}
                  </p>
                </div>
                <button
                  type="button"
                  className="mandal-clear"
                  onClick={() => setSelectedMandal(null)}
                >
                  Clear
                </button>
              </div>
              <p className="overview-mandal-note">
                Sample subdistrict (mandal) figures — deterministic demo values, not official counts.
              </p>
              <dl className="overview-mandal-dl">
                <div>
                  <dt>Mandal cases</dt>
                  <dd>{formatNumber(selectedMandalStats.cases)}</dd>
                </div>
                <div>
                  <dt>Rate per 100k</dt>
                  <dd>{selectedMandalStats.incidence.toFixed(1)}</dd>
                </div>
                <div>
                  <dt>Est. population</dt>
                  <dd>{formatNumber(selectedMandalStats.population)}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </aside>
      </main>

      <DashboardChatbot context={chatContext} />
    </div>
  )
}

export default App
