import { Component } from 'react';
import snowFallData from './Data/pass_snowfall_data.json';
import { ResponsiveContainer, LineChart, CartesianGrid, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Line } from 'recharts';

// ------------------ Type Definitions ------------------
interface SnowState {
    passName: string;
    currentSeason: string;
    highestSeason: string;
    lowestSeason: string;
    data: ChartDataItem[];
}

interface ChartDataItem {
    name: string;
    [key: string]: number | string;
}

interface MonthData {
    month: string;
    dailySnowFall: DailySnowFall[];
}

interface DailySnowFall {
    day: number;
    newDailySnowFall: number;
    totalSnowFall: number;
    accumulatedSnowFall: number;
}

interface SnowfallData {
    [passName: string]: {
        [season: string]: MonthData[];
    };
}

interface HighestSnowFall {
    season: string;
    month: string;
    day: number;
    amount: number;
}

// ------------------ Constants ------------------
const PASS_NAMES: Record<string, string> = {
    'Blewett_Pass_US-97': 'Blewett Pass US-97',
    'Sherman_Pass_SR-20': 'Sherman Pass SR-20',
    'Stevens_Pass_US-2': 'Stevens Pass US-2',
    'Snoqualmie_Pass_I-90': 'Snoqualmie Pass I-90',
    'White_Pass_US-12': 'White Pass US-12'
};

const MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
const DAYS_IN_MONTH = [31, 30, 31, 31, 28, 31, 30, 31];
const MONTH_PRIORITY = Object.fromEntries(MONTHS.map((month, index) => [month, index]));

// ------------------ Utility Functions ------------------
const customDateSort = (a: ChartDataItem, b: ChartDataItem): number => {
    const [aDay, aMonth] = a.name.split('-');
    const [bDay, bMonth] = b.name.split('-');

    const aPriority = MONTH_PRIORITY[aMonth] ?? Infinity;
    const bPriority = MONTH_PRIORITY[bMonth] ?? Infinity;

    return aPriority - bPriority || parseInt(aDay) - parseInt(bDay);
};

const getInitialDataStructure = (): ChartDataItem[] => {
    return MONTHS.flatMap((month, monthIndex) =>
        Array.from({ length: DAYS_IN_MONTH[monthIndex] }, (_, day) => ({
            name: `${day + 1}-${month}`
        }))
    ).sort(customDateSort);
};

// ------------------ Data Transformation ------------------
const processPassData = (passName: string, data: any) => {
    const passData = data[passName];
    const chartData: Record<string, ChartDataItem[]> = {};
    const highestRecords = {
        accumulated: new Map<string, HighestSnowFall>(),
        total: new Map<string, HighestSnowFall>()
    };

    Object.entries(passData).forEach(([season, monthsData]) => {
        const typedMonthsData = monthsData as Array<{ month: string; dailySnowFall: DailySnowFall[] }>;

        chartData[season] = [];

        typedMonthsData.forEach(({ month, dailySnowFall }) => {
            dailySnowFall.forEach((daily) => {
                const dataPoint: ChartDataItem = {
                    name: `${daily.day}-${month}`,
                    newDailySnowFall: daily.newDailySnowFall,
                    totalSnowFall: daily.totalSnowFall,
                    accumulatedSnowFall: daily.accumulatedSnowFall,
                };

                chartData[season].push(dataPoint);

                // Update highest records
                ['accumulated', 'total'].forEach((type) => {
                    const current = highestRecords[type as keyof typeof highestRecords].get(season) || { amount: -Infinity };
                    const value = daily[`${type}SnowFall` as keyof DailySnowFall] as number;

                    if (value > current.amount) {
                        highestRecords[type as keyof typeof highestRecords].set(season, {
                            season,
                            month,
                            day: daily.day,
                            amount: value
                        });
                    }
                });
            });
        });

        chartData[season].sort(customDateSort);
    });

    return { chartData, highestRecords };
};

// ------------------ Main Component ------------------
class Snow extends Component<{}, SnowState> {
    state: SnowState = {
        passName: 'Stevens_Pass_US-2',
        currentSeason: '2024',
        highestSeason: '',
        lowestSeason: '',
        data: getInitialDataStructure()
    };

    componentDidMount() {
        this.updateChartData();
    }

    handleSelectionChange = (type: 'pass' | 'season', value: string) => {
        this.setState(
            prev => ({
                passName: type === 'pass' ? value : prev.passName,
                currentSeason: type === 'season' ? value : prev.currentSeason
            }),
            this.updateChartData
        );
    };

    updateChartData = () => {
        const { passName, currentSeason } = this.state;
        const { chartData, highestRecords } = processPassData(passName, snowFallData as SnowfallData);

        const seasons = Array.from(new Set([
            currentSeason,
            ...Array.from(highestRecords.accumulated.values())
                .sort((a, b) => b.amount - a.amount)
                .map(s => s.season)
        ])).slice(0, 3);

        const mergedData = getInitialDataStructure().map(baseItem => {
            const dataPoint: ChartDataItem = { ...baseItem };
            seasons.forEach(season => {
                const seasonData = chartData[season]?.find(d => d.name === baseItem.name);
                if (seasonData) {
                    dataPoint[`${season}_new`] = seasonData.newDailySnowFall;
                    dataPoint[`${season}_total`] = seasonData.totalSnowFall;
                    dataPoint[`${season}_accumulated`] = seasonData.accumulatedSnowFall;
                }
            });
            return dataPoint;
        });

        this.setState({
            data: mergedData,
            highestSeason: seasons[1] || '',
            lowestSeason: seasons[2] || ''
        });
    };

    renderChart(title: string, type: 'line' | 'bar', dataKey: string) {
        const { currentSeason, highestSeason, lowestSeason, data } = this.state;

        return (
            <div className="chart-container">
                <h4>{title}</h4>
                <ResponsiveContainer width="100%" height={300}>
                    {type === 'line' ? (
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="name"
                                tickFormatter={this.formatXAxis}
                                interval={Math.floor(data.length / 10)}
                            />
                            <YAxis label={{ value: 'Inches', angle: -90 }} />
                            <Tooltip />
                            <Legend />
                            {this.renderDataSeries(currentSeason, '#8884d8', 'line', dataKey)}
                            {highestSeason && this.renderDataSeries(highestSeason, '#82ca9d', 'line', dataKey)}
                            {lowestSeason && this.renderDataSeries(lowestSeason, '#ff8042', 'line', dataKey)}
                        </LineChart>
                    ) : (
                        <BarChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="name"
                                tickFormatter={this.formatXAxis}
                                interval={Math.floor(data.length / 10)}
                            />
                            <YAxis label={{ value: 'Inches', angle: -90 }} />
                            <Tooltip />
                            <Legend />
                            {this.renderDataSeries(currentSeason, '#8884d8', 'bar', dataKey)}
                            {highestSeason && this.renderDataSeries(highestSeason, '#82ca9d', 'bar', dataKey)}
                            {lowestSeason && this.renderDataSeries(lowestSeason, '#ff8042', 'bar', dataKey)}
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        );
    }

    renderDataSeries(season: string, color: string, type: 'line' | 'bar', dataKey: string) {
        const props = {
            key: season,
            dataKey: `${season}_${dataKey}`,
            name: season,
            stroke: color,
            fill: color,
            dot: false,
            connectNulls: true,
            isAnimationActive: false
        };

        return type === 'line' ? (
            <Line {...props} />
        ) : (
            <Bar {...props} />
        );
    }

    formatXAxis = (value: string) => {
        const [day, month] = value.split('-');
        return day === '1' || day === '15' ? `${month} ${day}` : '';
    };

    render() {
        const { passName, currentSeason } = this.state;
        const seasons = Object.keys((snowFallData as SnowfallData)[passName] || []);

        return (
            <div className="snow-container">
                <header className="controls-header">
                    <h1>{PASS_NAMES[passName]}</h1>
                    <div className="select-group">
                        <select
                            value={passName}
                            onChange={(e) => this.handleSelectionChange('pass', e.target.value)}
                        >
                            {Object.entries(PASS_NAMES).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                        <select
                            value={currentSeason}
                            onChange={(e) => this.handleSelectionChange('season', e.target.value)}
                        >
                            {seasons.map(season => (
                                <option key={season} value={season}>{season}</option>
                            ))}
                        </select>
                    </div>
                </header>

                <main className="charts-grid">
                    {this.renderChart('Snow Depth', 'line', 'total')}
                    {this.renderChart('Accumulated Snowfall', 'line', 'accumulated')}
                    {this.renderChart('Daily Snowfall', 'bar', 'new')}

                    <footer className="data-source">
                        Data provided by{' '}
                        <a href="https://wsdot.com/travel/real-time/mountainpasses/snowfallreport"
                           target="_blank"
                           rel="noopener noreferrer">
                            WSDOT
                        </a>
                    </footer>
                </main>
            </div>
        );
    }
}

export default Snow;