import React, { Component } from 'react';
import { ResponsiveContainer, LineChart, CartesianGrid, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Line } from 'recharts';
// NOAA Oceanic Nino Index (ONI) DJF anomaly per season start-year. Small and
// only changes once a year, so it is imported at build time. Source:
// https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt (the DJF value
// labelled year Y covers the winter that starts in Y-1).
import oni from './Data/oni.json';
import HomeButton from '../components/HomeButton';
import MobileDrawer from '../components/MobileDrawer';
import { withViewport } from '../hooks/useViewport';
import './Snow.css';
import {
    AVERAGE_SEASON,
    LA_NINA_AVG,
    EL_NINO_AVG,
    buildChartRows,
    convertData,
    pickExtremeSeasons,
    resolveSeason,
    seasonHasData,
} from './snowStats';

/*
TODO:
Add links
    Ski resort
    WSDOT webcams
Add forecast?

Done:
- Average season line (per-calendar-day mean across all seasons)
- La Nina / El Nino average lines (ONI-classified, per-calendar-day mean)
- Daily in-season update: see src/Snow/lambda (Lambda + EventBridge -> S3 +
  CloudFront invalidation). The page fetches its data at runtime from
  public/snow/pass_snowfall_data.json.
 */

// Runtime data location (deployed under public/, overwritten daily by the
// Lambda in src/Snow/lambda). Mirrors the Royalty page's fetch pattern.
const SNOW_DATA_URL = process.env.PUBLIC_URL + '/snow/pass_snowfall_data.json';

// ENSO classification from an ONI DJF anomaly (standard +/-0.5 thresholds).
const ensoPhase = (anom) => {
    if (anom === undefined || anom === null) return null;
    if (anom >= 0.5) return 'El Nino';
    if (anom <= -0.5) return 'La Nina';
    return 'Neutral';
}

const ensoStrength = (anom) => {
    const a = Math.abs(anom);
    if (a < 0.5) return '';
    if (a < 1.0) return 'weak';
    if (a < 1.5) return 'moderate';
    if (a < 2.0) return 'strong';
    return 'very strong';
}

// Signed ONI anomaly value, e.g. "+1.50" or "-0.37".
const formatOni = (anom) => (anom === undefined || anom === null)
    ? '?'
    : `${anom > 0 ? '+' : ''}${anom.toFixed(2)}`;

// Human-readable label for a season including the ONI number, e.g.
// "La Nina, moderate (ONI -1.31)" or "Neutral (ONI -0.37)".
const describeEnso = (season) => {
    const anom = oni[season];
    const phase = ensoPhase(anom);
    if (!phase) return 'Unknown';
    if (phase === 'Neutral') return `Neutral (ONI ${formatOni(anom)})`;
    return `${phase}, ${ensoStrength(anom)} (ONI ${formatOni(anom)})`;
}


const passNames = {
    'Blewett_Pass_US-97': 'Blewett Pass US-97',
    'Sherman_Pass_SR-20': 'Sherman Pass SR-20',
    'Stevens_Pass_US-2': 'Stevens Pass US-2',
    'Snoqualmie_Pass_I-90': 'Snoqualmie Pass I-90',
    'White_Pass_US-12': 'White Pass US-12'
}

const phaseOf = (season) => ensoPhase(oni[season]);

class Snow extends Component {
    constructor(props) {
        super(props);

        this.state = {
            snowFallData: null,
            loadError: null,
            passName: "Stevens_Pass_US-2",
            currentSeason: "",
            highestSeason: "",
            lowestSeason: "",
            data: [],
            hiddenSeries: {},
            controlsDrawerOpen: false,
        };
    }

    // Toggle a series (by its legend name) on/off across all charts.
    toggleSeries = (name) => {
        if (name === undefined || name === null) return;
        this.setState(prev => {
            const next = { ...prev.hiddenSeries };
            if (next[name]) {
                delete next[name];
            } else {
                next[name] = true;
            }
            return { hiddenSeries: next };
        });
    }

    handleLegendClick = (entry) => {
        this.toggleSeries(entry && (entry.value ?? entry.dataKey));
    }

    legendFormatter = (value) => (
        <span style={{
            color: this.state.hiddenSeries[value] ? 'var(--color-text-faint)' : 'var(--color-text)',
            textDecoration: this.state.hiddenSeries[value] ? 'line-through' : 'none',
            cursor: 'pointer'
        }}>
            {value}
        </span>
    )

    tooltipFormatter = (value) => (typeof value === 'number' ? value.toFixed(1) : value)

    onChange = async (evt) => {
        if (evt.target.name === "passNameSelect") {
            this.changePass(evt.target.value, this.state.currentSeason);
        }
        if (evt.target.name === "seasonSelect") {
            this.changePass(this.state.passName, evt.target.value);
        }
    }

    componentDidMount() {
        this.mounted = true;
        this.loadData();
    }

    componentWillUnmount() {
        this.mounted = false;
    }

    loadData = () => {
        this.setState({ loadError: null });
        fetch(SNOW_DATA_URL)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(snowFallData => {
                if (!this.mounted) return;
                if (!snowFallData || !snowFallData[this.state.passName]) {
                    throw new Error('unexpected data format');
                }
                this.setState({ snowFallData }, () => {
                    this.changePass(this.state.passName, null);
                });
            })
            .catch(err => {
                console.error('Failed to load snowfall data', err);
                if (this.mounted) this.setState({ loadError: err.message || String(err) });
            });
    }

    changePass(passName, requestedSeason) {
        const { snowFallData } = this.state;
        const passData = snowFallData[passName] || {};
        const [chartData, highestPerYear_accumulatedSnowFall]
            = convertData(passName, snowFallData, phaseOf)

        // Keep the chosen season if this pass has it; otherwise (e.g.
        // Snoqualmie 2000 -> Stevens, whose data starts in 2004) fall back to
        // the pass's newest season with data.
        const currentSeason = resolveSeason(passData, requestedSeason);
        const { highestSeason, lowestSeason }
            = pickExtremeSeasons(passData, highestPerYear_accumulatedSnowFall);

        const seasons = [
            currentSeason,
            highestSeason,
            lowestSeason,
            AVERAGE_SEASON,
            LA_NINA_AVG,
            EL_NINO_AVG,
        ].filter(Boolean)

        this.setState({
            passName: passName,
            currentSeason: currentSeason || '',
            highestSeason: highestSeason || '',
            lowestSeason: lowestSeason || '',
            data: buildChartRows(chartData, seasons),
        });
    }

    renderLineChart(title, dataKey) {
        const isMobile = this.props.viewport && this.props.viewport.isMobile;
        return (
            <div style={isMobile ? { height: 300, minHeight: 260 } : { height: '33vh' }}>
                <h4 style={{ textAlign: 'center', margin: '10px 0' }}>{title}</h4>
                <ResponsiveContainer width="100%" height="80%">
                    <LineChart
                        data={this.state.data}
                        margin={{ top: 5, right: 30, left: 20, bottom: 50 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                            dataKey="name"
                            tick={{ dy: 5, dx: -10, fontSize: 12 }}
                            interval={0}
                            tickFormatter={(value) => {
                                const [day, month] = value.split('-');
                                return (day === '1' || day === '15') ? `${month} ${day}` : '';
                            }}
                        />
                        <YAxis label={{ value: 'Inches', angle: -90, dx: -15}} />
                        <Tooltip formatter={this.tooltipFormatter} />
                        <Legend onClick={this.handleLegendClick} formatter={this.legendFormatter} />
                        <Line
                            dot={false}
                            connectNulls={true}
                            dataKey={`${this.state.currentSeason}${dataKey}`}
                            name={this.state.currentSeason}
                            stroke={"#8884d8"}
                            hide={!!this.state.hiddenSeries[this.state.currentSeason]}
                        />
                        {this.state.highestSeason && (
                            <Line
                                dot={false}
                                connectNulls={true}
                                dataKey={`${this.state.highestSeason}${dataKey}`}
                                name={this.state.highestSeason}
                                stroke={"#82ca9d"}
                                hide={!!this.state.hiddenSeries[this.state.highestSeason]}
                            />
                        )}
                        {this.state.lowestSeason && (
                            <Line
                                dot={false}
                                connectNulls={true}
                                dataKey={`${this.state.lowestSeason}${dataKey}`}
                                name={this.state.lowestSeason}
                                stroke={"#ff8042"}
                                hide={!!this.state.hiddenSeries[this.state.lowestSeason]}
                            />
                        )}
                        <Line
                            dot={false}
                            connectNulls={true}
                            dataKey={`${AVERAGE_SEASON}${dataKey}`}
                            name={AVERAGE_SEASON}
                            stroke={"#555555"}
                            strokeDasharray="5 5"
                            hide={!!this.state.hiddenSeries[AVERAGE_SEASON]}
                        />
                        <Line
                            dot={false}
                            connectNulls={true}
                            dataKey={`${LA_NINA_AVG}${dataKey}`}
                            name={LA_NINA_AVG}
                            stroke={"#1f6fb2"}
                            strokeDasharray="6 3"
                            hide={!!this.state.hiddenSeries[LA_NINA_AVG]}
                        />
                        <Line
                            dot={false}
                            connectNulls={true}
                            dataKey={`${EL_NINO_AVG}${dataKey}`}
                            name={EL_NINO_AVG}
                            stroke={"#b5322e"}
                            strokeDasharray="6 3"
                            hide={!!this.state.hiddenSeries[EL_NINO_AVG]}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        );
    }

    render() {
        const titleBarStyle = {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            backgroundColor: 'var(--color-surface)',
            // Room on the left for the fixed Home button and theme menu.
            padding: '10px 20px 10px 120px',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            justifyContent: 'space-between', // Changed to space-between
            alignItems: 'center',
            gap: '16px'
        };

        const titleStyle = {
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: 'var(--color-text)'
        };

        const brandStyle = {
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 'normal',
            color: 'var(--color-text-muted)'
        };

        const ensoBadgeContainerStyle = {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px'
        };

        const selectContainerStyle = {
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            width: '200px'
        };

        // Colours, border and focus ring come from the global select styles.
        const selectStyle = {
            padding: '6px',
        };

        const isMobile = this.props.viewport && this.props.viewport.isMobile;

        // Static (non-fixed) compact header on mobile so the page scrolls
        // naturally; leaves room on the left for the fixed Home button.
        const mobileHeaderStyle = {
            backgroundColor: 'var(--color-surface)',
            boxShadow: 'var(--shadow-sm)',
            padding: '10px 12px 10px 116px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
        };

        const mobileTitleStyle = {
            fontSize: '1.05rem',
            fontWeight: 'bold',
            color: 'var(--color-text)',
            lineHeight: 1.25,
        };

        if (!this.state.snowFallData) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '12px',
                    height: '100vh',
                    color: 'var(--color-text-muted)'
                }}>
                    <HomeButton />
                    {this.state.loadError ? (
                        <>
                            <div role="alert">
                                Couldn't load WA Snowfall data ({this.state.loadError}).
                            </div>
                            <button type="button" className="btn-primary" onClick={this.loadData}>
                                Retry
                            </button>
                        </>
                    ) : (
                        'Loading WA Snowfall data...'
                    )}
                </div>
            );
        }

        // Current ENSO status = the most recent season's ONI classification.
        const latestSeason = Object.keys(this.state.snowFallData[this.state.passName]).sort().pop();
        const currentEnsoPhase = ensoPhase(oni[latestSeason]) || 'Unknown';

        const seasonOptions = Object.keys(this.state.snowFallData[this.state.passName])
            .filter(season => seasonHasData(this.state.snowFallData[this.state.passName][season]));
        const passSelect = (
            <select style={{ ...selectStyle, width: '100%' }} name="passNameSelect" value={this.state.passName} onChange={evt => this.onChange(evt)}>
                {Object.keys(passNames).map(name =>
                    <option key={name} value={name}>{passNames[name]}</option>)}
            </select>
        );
        const seasonSelect = (
            <select style={{ ...selectStyle, width: '100%' }} name="seasonSelect" value={this.state.currentSeason} onChange={evt => this.onChange(evt)}>
                {seasonOptions.map(season =>
                    <option key={season} value={season}>
                        {season} - {ensoPhase(oni[season]) || '?'} ({formatOni(oni[season])})
                    </option>)}
            </select>
        );
        const ensoBadge = (
            <span className="enso-badge" data-phase={currentEnsoPhase}>
                {describeEnso(latestSeason)}
            </span>
        );

        return (
            <div>
                <HomeButton />
                {!isMobile && (
                <div style={titleBarStyle}>
                    <div style={titleStyle}>
                        <span style={brandStyle}>WA Snowfall</span>
                        {passNames[this.state.passName]}
                        <span style={brandStyle}>
                            {this.state.currentSeason} season: {describeEnso(this.state.currentSeason)}
                        </span>
                    </div>
                    <div style={ensoBadgeContainerStyle}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Current ENSO status</span>
                        {ensoBadge}
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-faint)' }}>
                            {latestSeason}-{Number(latestSeason) + 1} winter
                        </span>
                    </div>
                    <div style={selectContainerStyle}>
                        <select style={selectStyle} name="passNameSelect" value={this.state.passName} onChange={evt => this.onChange(evt)}>
                            {Object.keys(passNames).map(name =>
                                <option key={name} value={name}>{passNames[name]}</option>)}
                        </select>
                        <select style={selectStyle} name="seasonSelect" value={this.state.currentSeason} onChange={evt => this.onChange(evt)}>
                            {seasonOptions.map(season =>
                                <option key={season} value={season}>
                                    {season} - {ensoPhase(oni[season]) || '?'} ({formatOni(oni[season])})
                                </option>)}
                        </select>
                    </div>
                </div>
                )}
                {isMobile && (
                <div style={mobileHeaderStyle}>
                    <div style={mobileTitleStyle}>
                        <span style={brandStyle}>WA Snowfall</span>
                        {passNames[this.state.passName]}
                        <span style={brandStyle}>
                            {this.state.currentSeason}: {describeEnso(this.state.currentSeason)}
                        </span>
                    </div>
                    <button
                        type="button"
                        className="btn-primary"
                        onClick={() => this.setState({ controlsDrawerOpen: true })}
                    >
                        Controls
                    </button>
                </div>
                )}
                <div style={isMobile
                    ? { width: '100%', padding: '12px 10px 32px', boxSizing: 'border-box' }
                    : { width: '100%', height: '100vh', padding: '20px', paddingTop: '80px', boxSizing: 'border-box' }
                }>
                    {this.renderLineChart(
                        `Snow Depth`,
                        `totalSnowFall`
                    )}

                    {this.renderLineChart(
                        `Accumulated Snowfall`,
                        `accumulatedSnowFall`
                    )}

                        <div style={isMobile ? { height: 300, minHeight: 260 } : { height: '33vh' }}>
                            <h4 style={{ textAlign: 'center', margin: '10px 0' }}>New Daily Snowfall</h4>
                            <ResponsiveContainer width="100%" height="80%">
                                <BarChart
                                    data={this.state.data}
                                    margin={{ top: 5, right: 30, left: 20, bottom: 50 }}
                                    barSize={40}
                                    barGap={-40}
                                >
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ dy: 5, dx: -10, fontSize: 12 }}
                                        interval={0}
                                        tickFormatter={(value) => {
                                            const [day, month] = value.split('-');
                                            return (day === '1' || day === '15') ? `${month} ${day}` : '';
                                        }}
                                    />
                                    <YAxis label={{ value: 'Inches', angle: -90, dx: -15}} />
                                    <Tooltip formatter={this.tooltipFormatter} />
                                    <Legend onClick={this.handleLegendClick} formatter={this.legendFormatter} />
                                    <Bar
                                        dataKey={`${this.state.currentSeason}newDailySnowFall`}
                                        name={this.state.currentSeason}
                                        fill="#8884d8"
                                        stroke="#8884d8"
                                        hide={!!this.state.hiddenSeries[this.state.currentSeason]}
                                    />
                                    {this.state.highestSeason && (
                                        <Bar
                                            dataKey={`${this.state.highestSeason}newDailySnowFall`}
                                            name={this.state.highestSeason}
                                            fill="#82ca9d"
                                            stroke="#82ca9d"
                                            hide={!!this.state.hiddenSeries[this.state.highestSeason]}
                                        />
                                    )}
                                    {this.state.lowestSeason && (
                                        <Bar
                                            dataKey={`${this.state.lowestSeason}newDailySnowFall`}
                                            name={this.state.lowestSeason}
                                            fill="#ff8042"
                                            stroke="#ff8042"
                                            hide={!!this.state.hiddenSeries[this.state.lowestSeason]}
                                        />
                                    )}
                                    <Bar
                                        dataKey={`${AVERAGE_SEASON}newDailySnowFall`}
                                        name={AVERAGE_SEASON}
                                        fill="#555555"
                                        stroke="#555555"
                                        hide={!!this.state.hiddenSeries[AVERAGE_SEASON]}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{
                            textAlign: 'center',
                            fontSize: '0.9rem',
                            color: 'var(--color-text-muted)'
                        }}>
                            Data Source: {' '}
                            <a
                                href="https://wsdot.com/travel/real-time/mountainpasses/snowfallreport"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--color-primary)' }}
                            >
                                WSDOT Snowfall Data
                            </a>
                        </div>
                    </div>
                {isMobile && (
                    <MobileDrawer
                        open={this.state.controlsDrawerOpen}
                        onClose={() => this.setState({ controlsDrawerOpen: false })}
                        title="Snowfall controls"
                    >
                        <div className="mobile-drawer-section">Current ENSO status</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
                            {ensoBadge}
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-faint)' }}>
                                {latestSeason}-{Number(latestSeason) + 1} winter
                            </span>
                        </div>
                        <div className="mobile-drawer-section">Mountain pass</div>
                        {passSelect}
                        <div className="mobile-drawer-section">Season</div>
                        {seasonSelect}
                    </MobileDrawer>
                )}
            </div>
        );
    }
}

export default withViewport(Snow);
