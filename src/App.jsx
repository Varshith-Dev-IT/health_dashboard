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

const ALL_DISTRICTS = 'All districts'

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

const MAP_BOUNDS = [
  [12.6, 76.2],
  [19.6, 84.7],
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
      map.flyToBounds(MAP_BOUNDS, { padding: [32, 32], duration: 0.9 })
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

const getFillColor = (value, stats) => {
  if (!Number.isFinite(value)) return COLOR_RAMP[0]
  const index = stats.quantiles.findIndex((breakpoint) => value <= breakpoint)
  return COLOR_RAMP[Math.max(0, index)] ?? COLOR_RAMP.at(-1)
}

function App() {
  const [disease, setDisease] = useState('Cancer')
  const [metric, setMetric] = useState('incidence')
  const [year, setYear] = useState(2024)
  const [district, setDistrict] = useState(ALL_DISTRICTS)
  const [mandalsGeo, setMandalsGeo] = useState(null)
  const [selectedMandal, setSelectedMandal] = useState(null)

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
    ],
  )

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="title-block">
          <p className="kicker">Andhra Pradesh</p>
          <h1>{disease} {metric === 'incidence' ? 'Incidence Rate' : 'Cases'}</h1>
          <p className="subtitle">
            District-level rate per 100,000 population · Mandal boundaries shown · Sample programme ·{' '}
            {YEARS[0]}-{YEARS.at(-1)}
          </p>
        </div>
        <div className="year-tabs" role="tablist" aria-label="Year selection">
          {YEARS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === year ? 'year-tab is-active' : 'year-tab'}
              onClick={() => setYear(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </header>

      <section className="toolbar">
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
        </div>
        <div className="toolbar-right">
          <span className="meta-pill">{AP_DISTRICTS.features.length} districts</span>
          <span className="meta-pill">{mandalsGeo?.features?.length ?? '—'} mandals</span>
          <span className="meta-pill">{YEARS[0]}-{YEARS.at(-1)}</span>
          <span className="meta-pill">Year {year}</span>
        </div>
      </section>

      <main className="main-grid">
        <section className="map-panel">
          <div className="map-shell">
            <MapContainer
              bounds={MAP_BOUNDS}
              maxBounds={MAP_BOUNDS}
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
                key={`${disease}-${year}-${metric}-${district}`}
                data={AP_DISTRICTS}
                style={(feature) => {
                  const name = feature?.properties?.district
                  const value = districtValues.find((entry) => entry.name === name)?.value
                  const focused = district === ALL_DISTRICTS || district === name
                  return {
                    color: focused ? '#2c2722' : '#61554a',
                    weight: focused ? 2 : 1,
                    fillColor: getFillColor(value, stats),
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
                  key={`mandals-${district}-${disease}-${year}-${mandalsGeo?.features?.length ?? 0}`}
                  data={mandalLayerData}
                  style={(feature) => {
                    const sdt = feature?.properties?.sdtname ?? ''
                    const dt = feature?.properties?.dtname ?? ''
                    const selected =
                      selectedMandal != null &&
                      selectedMandal.sdtname === sdt &&
                      selectedMandal.dtname === dt
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
              <span>AP median {summaryLabel.toLowerCase()}</span>
              <strong>{stats.median.toFixed(1)}</strong>
            </div>

            <div className="legend">
              <span>Low</span>
              <div className="legend-bar">
                {COLOR_RAMP.map((color) => (
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

            <div className="overview-note">
            <p>
              Select a district to zoom the map and show its mandals. Click a mandal to see sample
              subdistrict cases in this panel; click a mandal to open its popup (it stays until you close it).
              Sub-district boundaries:
              simplified census geometry (MIT,{' '}
              <a
                href="https://github.com/datta07/INDIAN-SHAPEFILES"
                target="_blank"
                rel="noreferrer"
              >
                INDIAN-SHAPEFILES
              </a>
              ).
            </p>
          </div>
        </aside>
      </main>

      <DashboardChatbot context={chatContext} />
    </div>
  )
}

export default App
