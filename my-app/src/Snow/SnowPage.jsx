import React, { Component } from 'react';
import { ResponsiveContainer, LineChart, CartesianGrid, BarChart, Bar, XAxis, YAxis, Tooltip, Line, ReferenceArea } from 'recharts';
// NOAA Oceanic Nino Index (ONI) DJF anomaly per season start-year. Small and
// only changes once a year, so it is imported at build time. Source:
// https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt (the DJF value
// labelled year Y covers the winter that starts in Y-1).
import oni from './Data/oni.json';
import HomeButton from '../components/HomeButton';
import MobileDrawer from '../components/MobileDrawer';
import { withViewport } from '../hooks/useViewport';
import useThemeTokens from '../hooks/useThemeTokens';
import './Snow.css';
import {
    AVERAGE_SEASON,
    LA_NINA_AVG,
    EL_NINO_AVG,
    MAX_LOW_SAMPLE_STEP_INCHES,
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

// Series strokes, measured 2026-11-17 against the page background and the
// low-confidence band in both themes. Each pair is at least 3:1. Average
// keeps --chart-reference, which already clears that bar per theme.
const SERIES_COLOR = {
    current: '#8855CC',
    highest: '#1E8A45',
    lowest: '#C25A16',
    laNina: '#2A7CC0',
    elNino: '#C4473A',
};

const AXIS_MONTHS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

// "2025" -> "2025–26". Baseline names (Average, La Nina avg) pass through.
const seasonRange = (season) => {
    if (!/^\d{4}$/.test(String(season))) return String(season);
    const end = String(Number(season) + 1).slice(-2);
    return `${season}\u2013${end}`;
};

const seriesLabel = (season, role) => (
    role ? `${seasonRange(season)} (${role})` : seasonRange(season)
);

// Phone widths skip the 15th, and the narrowest phones also skip every other
// month, so the remaining month names have room.
const axisTicks = (width) => {
    const months = width <= 480
        ? AXIS_MONTHS.filter((_, index) => index % 2 === 0)
        : AXIS_MONTHS;
    if (width > 1100) {
        return AXIS_MONTHS.flatMap((month) => [`1-${month}`, `15-${month}`]);
    }
    return months.map((month) => `1-${month}`);
};

const formatAxisTick = (value, width) => {
    const [day, month] = String(value).split('-');
    if (!month) return String(value);
    return width > 1100 ? `${month} ${day}` : month;
};

const formatCalendarDay = (value) => {
    const [day, month] = String(value).split('-');
    return month ? `${month} ${day}` : String(value);
};

const prefersReducedMotion = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const listen = (target, event, handler) => {
    if (!target) return () => {};
    if (typeof target.addEventListener === 'function') {
        target.addEventListener(event, handler);
        return () => target.removeEventListener(event, handler);
    }
    if (typeof target.addListener === 'function') {
        target.addListener(handler);
        return () => target.removeListener(handler);
    }
    return () => {};
};


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
            reduceMotion: prefersReducedMotion(),
            viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1280,
        };
    }

    // Toggle one series on every chart. The key is the series role, so
    // "this season" and "highest" stay independent when they share a year.
    toggleSeries = (id) => {
        if (id === undefined || id === null) return;
        this.setState(prev => {
            const next = { ...prev.hiddenSeries };
            if (next[id]) {
                delete next[id];
            } else {
                next[id] = true;
            }
            return { hiddenSeries: next };
        });
    }

    tooltipFormatter = (value, name) => [
        typeof value === 'number' ? `${value.toFixed(1)} inches` : value,
        name,
    ]

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
        this.motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.onMotionChange = () => {
            if (this.mounted) this.setState({ reduceMotion: this.motionMedia.matches });
        };
        this.removeMotionListener = listen(this.motionMedia, 'change', this.onMotionChange);
        this.onResize = () => {
            if (this.mounted) this.setState({ viewportWidth: window.innerWidth });
        };
        this.removeResizeListener = listen(window, 'resize', this.onResize);
    }

    componentWillUnmount() {
        this.mounted = false;
        if (this.removeMotionListener) this.removeMotionListener();
        if (this.removeResizeListener) this.removeResizeListener();
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

    lineSeries() {
        const { currentSeason, highestSeason, lowestSeason } = this.state;
        const specs = [];
        if (currentSeason) {
            specs.push({ id: 'current', season: currentSeason, role: 'this season', color: SERIES_COLOR.current });
        }
        if (highestSeason) {
            specs.push({ id: 'highest', season: highestSeason, role: 'highest', color: SERIES_COLOR.highest });
        }
        if (lowestSeason) {
            specs.push({ id: 'lowest', season: lowestSeason, role: 'lowest', color: SERIES_COLOR.lowest });
        }
        specs.push({
            id: AVERAGE_SEASON,
            season: AVERAGE_SEASON,
            role: null,
            color: this.props.referenceColor,
            dash: '5 5',
        });
        specs.push({
            id: LA_NINA_AVG,
            season: LA_NINA_AVG,
            role: null,
            color: SERIES_COLOR.laNina,
            dash: '6 3',
            linesOnly: true,
        });
        specs.push({
            id: EL_NINO_AVG,
            season: EL_NINO_AVG,
            role: null,
            color: SERIES_COLOR.elNino,
            dash: '6 3',
            linesOnly: true,
        });
        return specs;
    }

    renderLegend(specs) {
        return (
            <div className="snow-legend">
                <p className="snow-legend-unit">Values in inches</p>
                <ul aria-label="Chart series, in inches">
                    {specs.map((spec) => {
                        const hidden = !!this.state.hiddenSeries[spec.id];
                        return (
                            <li key={spec.id}>
                                <button
                                    type="button"
                                    className={hidden ? 'snow-legend-button is-off' : 'snow-legend-button'}
                                    aria-pressed={!hidden}
                                    onClick={() => this.toggleSeries(spec.id)}
                                >
                                    <span
                                        className="snow-legend-swatch"
                                        style={{ background: spec.color }}
                                        aria-hidden="true"
                                    />
                                    {seriesLabel(spec.season, spec.role)}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    }

    renderAxes(isMobile) {
        const width = this.state.viewportWidth;
        const animate = !this.state.reduceMotion;
        return (
            <>
                <CartesianGrid strokeDasharray="3 3" vertical={!isMobile} />
                <XAxis
                    dataKey="name"
                    ticks={axisTicks(width)}
                    interval={0}
                    minTickGap={0}
                    tickFormatter={(value) => formatAxisTick(value, width)}
                    tick={{ fontSize: 12 }}
                    tickMargin={6}
                    padding={{ left: 16, right: 16 }}
                    height={32}
                />
                <YAxis
                    width={52}
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Inches', angle: -90, dx: -8 }}
                />
                <Tooltip
                    formatter={this.tooltipFormatter}
                    labelFormatter={formatCalendarDay}
                    isAnimationActive={animate}
                    animationDuration={animate ? 400 : 0}
                />
            </>
        );
    }

    renderLines(specs, suffix) {
        const animate = !this.state.reduceMotion;
        return specs.map((spec) => (
            <Line
                key={spec.id}
                dot={false}
                connectNulls
                isAnimationActive={animate}
                animationDuration={animate ? 400 : 0}
                dataKey={`${spec.season}${suffix}`}
                name={seriesLabel(spec.season, spec.role)}
                stroke={spec.color}
                strokeWidth={2.5}
                strokeDasharray={spec.dash}
                hide={!!this.state.hiddenSeries[spec.id]}
            />
        ));
    }

    renderLineChart(title, dataKey, specs) {
        const isMobile = this.props.viewport && this.props.viewport.isMobile;
        const titleId = `snow-${dataKey}-title`;
        return (
            <section className="snow-chart" aria-labelledby={titleId}>
                <h2 id={titleId} className="snow-chart-title">{title}</h2>
                <div className={isMobile ? 'snow-chart-plot is-mobile' : 'snow-chart-plot'}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={this.state.data}
                            margin={{ top: 8, right: 8, left: 12, bottom: 0 }}
                        >
                            {!this.state.hiddenSeries[AVERAGE_SEASON] && lowConfidenceSpans(this.state.data).map(([x1, x2]) => (
                                <ReferenceArea
                                    key={`${x1}-${x2}`}
                                    x1={x1}
                                    x2={x2}
                                    fill={this.props.bandColor}
                                    fillOpacity={1}
                                    strokeOpacity={0}
                                    ifOverflow="hidden"
                                />
                            ))}
                            {this.renderAxes(isMobile)}
                            {this.renderLines(specs, dataKey)}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                {this.renderLegend(specs)}
            </section>
        );
    }

    renderBarChart(specs) {
        const isMobile = this.props.viewport && this.props.viewport.isMobile;
        const animate = !this.state.reduceMotion;
        return (
            <section className="snow-chart" aria-labelledby="snow-daily-title">
                <h2 id="snow-daily-title" className="snow-chart-title">New Daily Snowfall</h2>
                <div className={isMobile ? 'snow-chart-plot is-mobile' : 'snow-chart-plot'}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={this.state.data}
                            margin={{ top: 8, right: 8, left: 12, bottom: 0 }}
                            barSize={40}
                            barGap={-40}
                        >
                            {this.renderAxes(isMobile)}
                            {specs.map((spec) => (
                                <Bar
                                    key={spec.id}
                                    isAnimationActive={animate}
                                    animationDuration={animate ? 400 : 0}
                                    dataKey={`${spec.season}newDailySnowFall`}
                                    name={seriesLabel(spec.season, spec.role)}
                                    fill={spec.color}
                                    stroke={spec.color}
                                    hide={!!this.state.hiddenSeries[spec.id]}
                                />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                {this.renderLegend(specs)}
            </section>
        );
    }

    renderHeading() {
        return (
            <div className="snow-heading">
                <p className="snow-kicker">WA Snowfall</p>
                <h1 className="snow-title">{passNames[this.state.passName]}</h1>
                <p className="snow-season-line">
                    {seasonRange(this.state.currentSeason)} season: {describeEnso(this.state.currentSeason)}
                </p>
            </div>
        );
    }

    renderLabeledSelect({ id, label, name, value, children, autoFocus = false }) {
        return (
            <label className="snow-field" htmlFor={id}>
                <span>{label}</span>
                <select
                    id={id}
                    name={name}
                    value={value}
                    autoFocus={autoFocus}
                    onChange={evt => this.onChange(evt)}
                >
                    {children}
                </select>
            </label>
        );
    }

    closeControls = () => {
        this.setState({ controlsDrawerOpen: false }, () => {
            if (this.controlsButton) this.controlsButton.focus();
        });
    }

    render() {
        const isMobile = this.props.viewport && this.props.viewport.isMobile;

        if (!this.state.snowFallData) {
            return (
                <div className="snow-status">
                    <HomeButton />
                    <h1>WA Snowfall</h1>
                    {this.state.loadError ? (
                        <>
                            <div role="alert">
                                Couldn't load WA Snowfall data ({this.state.loadError}).
                            </div>
                            <button type="button" className="btn-primary snow-controls" onClick={this.loadData}>
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
        const ensoBadge = (
            <span className="enso-badge" data-phase={currentEnsoPhase}>
                {describeEnso(latestSeason)}
            </span>
        );

        const lineSpecs = this.lineSeries();
        const barSpecs = lineSpecs.filter(spec => !spec.linesOnly);
        const passOptions = Object.keys(passNames).map(name =>
            <option key={name} value={name}>{passNames[name]}</option>
        );
        const seasonChoices = seasonOptions.map(season =>
            <option key={season} value={season}>
                {seasonRange(season)}: {ensoPhase(oni[season]) || '?'} ({formatOni(oni[season])})
            </option>
        );

        return (
            <div className="snow-page">
                <HomeButton />
                {isMobile ? (
                    <header className="snow-header is-mobile">
                        {this.renderHeading()}
                        <button
                            type="button"
                            className="btn-primary snow-controls"
                            ref={(node) => { this.controlsButton = node; }}
                            onClick={() => this.setState({ controlsDrawerOpen: true })}
                        >
                            Controls
                        </button>
                    </header>
                ) : (
                    <header className="snow-header">
                        {this.renderHeading()}
                        <div className="snow-enso">
                            <span className="snow-enso-caption">Current ENSO status</span>
                            {ensoBadge}
                            <span className="snow-enso-winter">{seasonRange(latestSeason)} winter</span>
                        </div>
                        <div className="snow-selects">
                            {this.renderLabeledSelect({
                                id: 'snow-pass',
                                label: 'Mountain pass',
                                name: 'passNameSelect',
                                value: this.state.passName,
                                children: passOptions,
                            })}
                            {this.renderLabeledSelect({
                                id: 'snow-season',
                                label: 'Season',
                                name: 'seasonSelect',
                                value: this.state.currentSeason,
                                children: seasonChoices,
                            })}
                        </div>
                    </header>
                )}
                <div className={isMobile ? 'snow-main is-mobile' : 'snow-main'}>
                    {this.renderLineChart('Snow Depth', 'totalSnowFall', lineSpecs)}
                    {this.renderLineChart('Accumulated Snowfall', 'accumulatedSnowFall', lineSpecs)}
                    <p className="snow-note" data-testid="season-tail-note">
                        September and June readings are charted. Shading marks days averaged from only 3–6 seasons; on those days each average stays within {MAX_LOW_SAMPLE_STEP_INCHES} inches of the previous day.
                    </p>
                    {this.renderBarChart(barSpecs)}
                    <div className="snow-source">
                        Data Source: {' '}
                        <a
                            href="https://wsdot.com/travel/real-time/mountainpasses/snowfallreport"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            WSDOT Snowfall Data
                        </a>
                    </div>
                </div>
                {isMobile && (
                    <MobileDrawer
                        open={this.state.controlsDrawerOpen}
                        onClose={this.closeControls}
                        title="Snowfall controls"
                    >
                        <div className="mobile-drawer-section">Current ENSO status</div>
                        <div className="snow-enso">
                            {ensoBadge}
                            <span className="snow-enso-winter">{seasonRange(latestSeason)} winter</span>
                        </div>
                        {this.renderLabeledSelect({
                            id: 'snow-pass',
                            label: 'Mountain pass',
                            name: 'passNameSelect',
                            value: this.state.passName,
                            autoFocus: true,
                            children: passOptions,
                        })}
                        {this.renderLabeledSelect({
                            id: 'snow-season',
                            label: 'Season',
                            name: 'seasonSelect',
                            value: this.state.currentSeason,
                            children: seasonChoices,
                        })}
                    </MobileDrawer>
                )}
            </div>
        );
    }
}

/* The Average series is a neutral reference, not a season: #555555 on the
   light page, and the lighter --chart-reference grey in dark, where #555555
   was 2.6:1 against the chart background. Recharts and the legend swatch need
   a real colour, so read the token here. */
// Consecutive thin-sample days, as [first, last] calendar-day names.
function lowConfidenceSpans(rows) {
    const spans = [];
    let start = null;
    let end = null;
    for (const row of rows) {
        if (row.lowConfidence) {
            if (!start) start = row.name;
            end = row.name;
        } else if (start) {
            spans.push([start, end]);
            start = null;
        }
    }
    if (start) spans.push([start, end]);
    return spans;
}

function SnowWithChartTokens(props) {
    const { tokens } = useThemeTokens(['--chart-reference', '--color-primary-soft']);
    return (
        <Snow
            {...props}
            referenceColor={tokens['--chart-reference'] || '#555555'}
            bandColor={tokens['--color-primary-soft'] || 'rgba(22, 101, 52, 0.12)'}
        />
    );
}

export default withViewport(SnowWithChartTokens);
