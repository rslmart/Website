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

// Pseudo-season keys for the computed baselines.
const AVERAGE_SEASON = 'Average';
const LA_NINA_AVG = 'La Nina avg';
const EL_NINO_AVG = 'El Nino avg';

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

const ensoColors = {
    'La Nina': { bg: '#e3f0fb', fg: '#1f6fb2' },
    'El Nino': { bg: '#fbe6e6', fg: '#b5322e' },
    'Neutral': { bg: '#ececec', fg: '#555555' },
    'Unknown': { bg: '#ececec', fg: '#555555' },
}

const passNames = {
    'Blewett_Pass_US-97': 'Blewett Pass US-97',
    'Sherman_Pass_SR-20': 'Sherman Pass SR-20',
    'Stevens_Pass_US-2': 'Stevens Pass US-2',
    'Snoqualmie_Pass_I-90': 'Snoqualmie Pass I-90',
    'White_Pass_US-12': 'White Pass US-12'
}

const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May']
const days_in_a_month = [31, 30, 31, 31, 28, 31, 30, 31]

const monthPriority = {};
months.forEach((month, index) => {
    monthPriority[month] = index;
});

// Custom sort function for objects with a 'name' property
function customDateSort(a, b) {
    const [aDay, aMonth] = a.name.split('-');
    const [bDay, bMonth] = b.name.split('-');

    // Get priorities (default to Infinity for unknown months)
    const aPriority = monthPriority[aMonth] ?? Infinity;
    const bPriority = monthPriority[bMonth] ?? Infinity;

    // Compare by month priority first
    if (aPriority !== bPriority) {
        return aPriority - bPriority;
    }

    // If same month, compare by day
    const aDayNum = parseInt(aDay, 10);
    const bDayNum = parseInt(bDay, 10);
    return aDayNum - bDayNum;
}

const convertData = (passName, data) => {
    const chartData = {}
    let passData = data[passName];
    const highestPerYear_accumulatedSnowFall = {}
    const highestPerYear_totalSnowFall = {}

    // Per-calendar-day (`${day}-${month}`) accumulators for the baseline
    // averages: one bucket across every season, plus ONI-classified La Nina
    // and El Nino buckets. Each is summed here and divided into a mean below.
    const buckets = {
        [AVERAGE_SEASON]: { sum: {}, count: {} },
        [LA_NINA_AVG]: { sum: {}, count: {} },
        [EL_NINO_AVG]: { sum: {}, count: {} },
    }
    const addToBucket = (key, name, daily) => {
        const b = buckets[key]
        if (!b.sum[name]) {
            b.sum[name] = { newDailySnowFall: 0, totalSnowFall: 0, accumulatedSnowFall: 0 }
            b.count[name] = 0
        }
        b.sum[name].newDailySnowFall += daily['newDailySnowFall']
        b.sum[name].totalSnowFall += daily['totalSnowFall']
        b.sum[name].accumulatedSnowFall += daily['accumulatedSnowFall']
        b.count[name] += 1
    }

    Object.entries(passData).forEach(([season, seasonData]) => {
        chartData[season] = []
        const phase = ensoPhase(oni[season])
        const highest_accumulatedSnowFall = {
            "season": '',
            "month": '',
            "day": 0,
            "amount": 0
        }
        const highest_totalSnowFall = {
            "season": '',
            "month": '',
            "day": 0,
            "amount": 0
        }
        months.forEach(month => {
            const monthData = seasonData.find(obj => obj.month === month)
            if (monthData && "dailySnowFall" in monthData) {
                monthData.dailySnowFall.forEach(dailySnow => {
                    const name = `${dailySnow['day']}-${month}`
                    chartData[season].push({
                        'name': name,
                        'newDailySnowFall': dailySnow['newDailySnowFall'],
                        'totalSnowFall': dailySnow['totalSnowFall'],
                        'accumulatedSnowFall': dailySnow['accumulatedSnowFall'],
                    })
                    if (dailySnow["accumulatedSnowFall"] > highest_accumulatedSnowFall["amount"]) {
                        highest_accumulatedSnowFall["amount"] = dailySnow["accumulatedSnowFall"]
                        highest_accumulatedSnowFall["day"] = dailySnow["day"]
                        highest_accumulatedSnowFall["month"] = month
                        highest_accumulatedSnowFall["season"] = season
                    }
                    if (dailySnow["totalSnowFall"] > highest_totalSnowFall["amount"]) {
                        highest_totalSnowFall["amount"] = dailySnow["totalSnowFall"]
                        highest_totalSnowFall["day"] = dailySnow["day"]
                        highest_totalSnowFall["month"] = month
                        highest_totalSnowFall["season"] = season
                    }
                    addToBucket(AVERAGE_SEASON, name, dailySnow)
                    if (phase === 'La Nina') addToBucket(LA_NINA_AVG, name, dailySnow)
                    if (phase === 'El Nino') addToBucket(EL_NINO_AVG, name, dailySnow)
                })
            }
        })
        highestPerYear_accumulatedSnowFall[season] = highest_accumulatedSnowFall
        highestPerYear_totalSnowFall[season] = highest_totalSnowFall
    })

    // Build each baseline pseudo-season from its per-day accumulators.
    const bucketToSeries = (bucket) => Object.keys(bucket.sum).map(name => ({
        name,
        newDailySnowFall: bucket.sum[name].newDailySnowFall / bucket.count[name],
        totalSnowFall: bucket.sum[name].totalSnowFall / bucket.count[name],
        accumulatedSnowFall: bucket.sum[name].accumulatedSnowFall / bucket.count[name],
    }))
    chartData[AVERAGE_SEASON] = bucketToSeries(buckets[AVERAGE_SEASON])
    chartData[LA_NINA_AVG] = bucketToSeries(buckets[LA_NINA_AVG])
    chartData[EL_NINO_AVG] = bucketToSeries(buckets[EL_NINO_AVG])

    return [chartData, highestPerYear_accumulatedSnowFall, highestPerYear_totalSnowFall]
}

class Snow extends Component {
    constructor(props) {
        super(props);

        this.state = {
            snowFallData: null,
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
            color: this.state.hiddenSeries[value] ? '#bbb' : '#333',
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
        fetch(SNOW_DATA_URL)
            .then(res => res.json())
            .then(snowFallData => {
                const passName = this.state.passName;
                const latestSeason = Object.keys(snowFallData[passName]).sort().pop();
                this.setState({ snowFallData }, () => {
                    this.changePass(passName, latestSeason);
                });
            })
            .catch(err => console.error('Failed to load snowfall data', err));
    }

    changePass(passName, currentSeason) {
        const { snowFallData } = this.state;
        const [chartData, highestPerYear_accumulatedSnowFall]
            = convertData(passName, snowFallData)

        // Seed highest/lowest from whatever seasons exist (no hardcoded year).
        const realSeasons = Object.keys(highestPerYear_accumulatedSnowFall);
        let highest_accumulatedSnowFall = highestPerYear_accumulatedSnowFall[realSeasons[0]]
        let lowest_accumulatedSnowFall = highestPerYear_accumulatedSnowFall[realSeasons[0]]
        Object.values(highestPerYear_accumulatedSnowFall).forEach((seasonData) => {
            if (seasonData["amount"] > highest_accumulatedSnowFall["amount"]) {
                highest_accumulatedSnowFall = seasonData;
            }
            if (seasonData["amount"] < lowest_accumulatedSnowFall["amount"]) {
                lowest_accumulatedSnowFall = seasonData;
            }
        })

        // Seed one row per real calendar day (day 1..N), then merge each series.
        const finalData = [];
        months.forEach((month, month_number) => {
            for (let i = 1; i <= days_in_a_month[month_number]; i++) {
                finalData.push({
                    'name': `${i}-${month}`,
                })
            }
        })
        const seasons = [
            currentSeason,
            highest_accumulatedSnowFall["season"],
            lowest_accumulatedSnowFall["season"],
            AVERAGE_SEASON,
            LA_NINA_AVG,
            EL_NINO_AVG,
        ]
        seasons.forEach(season => {
            chartData[season].forEach((dailySnow) => {
                const matching = finalData.find(obj => obj.name === dailySnow.name);
                if (matching) {
                    matching[season + 'newDailySnowFall'] = dailySnow['newDailySnowFall']
                    matching[season + 'totalSnowFall'] = dailySnow['totalSnowFall']
                    matching[season + 'accumulatedSnowFall'] = dailySnow['accumulatedSnowFall']
                } else {
                    finalData.push({
                        name: dailySnow.name,
                        [`${season}newDailySnowFall`]: dailySnow['newDailySnowFall'],
                        [`${season}totalSnowFall`]: dailySnow['totalSnowFall'],
                        [`${season}accumulatedSnowFall`]: dailySnow['accumulatedSnowFall'],
                    })
                }
            })
        })

        finalData.sort(customDateSort)
        // name: month-day, latest_accumulated: X, latest_total: X, highest_accumulated: X, ...

        this.setState({
            passName: passName,
            currentSeason: seasons[0],
            highestSeason: seasons[1],
            lowestSeason: seasons[2],
            data: finalData,
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
                        <Line
                            dot={false}
                            connectNulls={true}
                            dataKey={`${this.state.highestSeason}${dataKey}`}
                            name={this.state.highestSeason}
                            stroke={"#82ca9d"}
                            hide={!!this.state.hiddenSeries[this.state.highestSeason]}
                        />
                        <Line
                            dot={false}
                            connectNulls={true}
                            dataKey={`${this.state.lowestSeason}${dataKey}`}
                            name={this.state.lowestSeason}
                            stroke={"#ff8042"}
                            hide={!!this.state.hiddenSeries[this.state.lowestSeason]}
                        />
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
            padding: '10px 20px 10px 72px',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            justifyContent: 'space-between', // Changed to space-between
            alignItems: 'center',
            gap: '16px'
        };

        const titleStyle = {
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#333'
        };

        const brandStyle = {
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 'normal',
            color: '#666'
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

        const selectStyle = {
            padding: '6px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: 'white'
        };

        const isMobile = this.props.viewport && this.props.viewport.isMobile;

        // Static (non-fixed) compact header on mobile so the page scrolls
        // naturally; leaves room on the left for the fixed Home button.
        const mobileHeaderStyle = {
            backgroundColor: 'var(--color-surface)',
            boxShadow: 'var(--shadow-sm)',
            padding: '10px 12px 10px 64px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
        };

        const mobileTitleStyle = {
            fontSize: '1.05rem',
            fontWeight: 'bold',
            color: '#333',
            lineHeight: 1.25,
        };

        if (!this.state.snowFallData) {
            return (
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh',
                    color: '#666'
                }}>
                    Loading WA Snowfall data...
                </div>
            );
        }

        // Current ENSO status = the most recent season's ONI classification.
        const latestSeason = Object.keys(this.state.snowFallData[this.state.passName]).sort().pop();
        const currentEnsoPhase = ensoPhase(oni[latestSeason]) || 'Unknown';
        const currentEnsoColor = ensoColors[currentEnsoPhase] || ensoColors['Unknown'];

        const passSelect = (
            <select style={{ ...selectStyle, width: '100%' }} name="passNameSelect" value={this.state.passName} onChange={evt => this.onChange(evt)}>
                {Object.keys(passNames).map(name =>
                    <option key={name} value={name}>{passNames[name]}</option>)}
            </select>
        );
        const seasonSelect = (
            <select style={{ ...selectStyle, width: '100%' }} name="seasonSelect" value={this.state.currentSeason} onChange={evt => this.onChange(evt)}>
                {Object.keys(this.state.snowFallData[this.state.passName]).map(season =>
                    <option key={season} value={season}>
                        {season} - {ensoPhase(oni[season]) || '?'} ({formatOni(oni[season])})
                    </option>)}
            </select>
        );
        const ensoBadge = (
            <span style={{
                padding: '4px 12px',
                borderRadius: '12px',
                fontWeight: 'bold',
                backgroundColor: currentEnsoColor.bg,
                color: currentEnsoColor.fg
            }}>
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
                        <span style={{ fontSize: '0.75rem', color: '#666' }}>Current ENSO status</span>
                        {ensoBadge}
                        <span style={{ fontSize: '0.7rem', color: '#999' }}>
                            {latestSeason}-{Number(latestSeason) + 1} winter
                        </span>
                    </div>
                    <div style={selectContainerStyle}>
                        <select style={selectStyle} name="passNameSelect" value={this.state.passName} onChange={evt => this.onChange(evt)}>
                            {Object.keys(passNames).map(name =>
                                <option key={name} value={name}>{passNames[name]}</option>)}
                        </select>
                        <select style={selectStyle} name="seasonSelect" value={this.state.currentSeason} onChange={evt => this.onChange(evt)}>
                            {Object.keys(this.state.snowFallData[this.state.passName]).map(season =>
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
                                    <Bar
                                        dataKey={`${this.state.highestSeason}newDailySnowFall`}
                                        name={this.state.highestSeason}
                                        fill="#82ca9d"
                                        stroke="#82ca9d"
                                        hide={!!this.state.hiddenSeries[this.state.highestSeason]}
                                    />
                                    <Bar
                                        dataKey={`${this.state.lowestSeason}newDailySnowFall`}
                                        name={this.state.lowestSeason}
                                        fill="#ff8042"
                                        stroke="#ff8042"
                                        hide={!!this.state.hiddenSeries[this.state.lowestSeason]}
                                    />
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
                            color: '#666'
                        }}>
                            Data Source: {' '}
                            <a
                                href="https://wsdot.com/travel/real-time/mountainpasses/snowfallreport"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#8884d8', textDecoration: 'none' }}
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
                            <span style={{ fontSize: '0.75rem', color: '#999' }}>
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
