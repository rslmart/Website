import React, { Component } from 'react';
import snowFallData from './Data/pass_snowfall_data.json';
import { ResponsiveContainer, LineChart, CartesianGrid, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Line } from 'recharts';

/*
TODO:
Add "average" season
Add links
    Ski resort
    WS_DOT webcams
Create lambda that updates data daily (in season)
    Runs python script that makes request, then uploads to S3
Add forecast?
 */


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

const getDateArray = () => {
    return [
        Array.apply(null, Array(31)).map(Number.prototype.valueOf,0),
        Array.apply(null, Array(30)).map(Number.prototype.valueOf,0),
        Array.apply(null, Array(31)).map(Number.prototype.valueOf,0),
        Array.apply(null, Array(31)).map(Number.prototype.valueOf,0),
        Array.apply(null, Array(28)).map(Number.prototype.valueOf,0),
        Array.apply(null, Array(31)).map(Number.prototype.valueOf,0),
        Array.apply(null, Array(30)).map(Number.prototype.valueOf,0),
        Array.apply(null, Array(31)).map(Number.prototype.valueOf,0)
    ];
}

const convertData = (passName, data) => {
    const chartData = {}
    const averageData = {}
    let passData = data[passName];
    const highestPerYear_accumulatedSnowFall = {}
    const highestPerYear_totalSnowFall = {}
    Object.entries(passData).forEach(([season, seasonData]) => {
        chartData[season] = []
        averageData[season] = {
            "newDailySnowFall": getDateArray(),
            "totalSnowFall": getDateArray(),
            "accumulatedSnowFall": getDateArray()
        }
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
                    chartData[season].push({
                        'name': `${dailySnow['day']}-${month}`,
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
                    const index = dailySnow["day"] - 1;
                    if (month === 'Feb' && index === 28) {
                        averageData[season]["newDailySnowFall"][27] = averageData[season]["newDailySnowFall"][27] + dailySnow["newDailySnowFall"];
                        averageData[season]["totalSnowFall"][27] = averageData[season]["newDailySnowFall"][27] + dailySnow["totalSnowFall"];
                        averageData[season]["accumulatedSnowFall"][27] = averageData[season]["newDailySnowFall"][27] + dailySnow["accumulatedSnowFall"];
                    } else {
                        averageData[season]["newDailySnowFall"][index] = averageData["newDailySnowFall"];
                        averageData[season]["totalSnowFall"][index] = averageData["totalSnowFall"];
                        averageData[season]["accumulatedSnowFall"][index] = averageData["accumulatedSnowFall"];
                    }
                })
            }
        })
        highestPerYear_accumulatedSnowFall[season] = highest_accumulatedSnowFall
        highestPerYear_totalSnowFall[season] = highest_totalSnowFall
    })
    return [chartData, averageData, highestPerYear_accumulatedSnowFall, highestPerYear_totalSnowFall]
}

class Snow extends Component {
    constructor(props) {
        super(props);

        this.state = {
            passName: "Stevens_Pass_US-2",
            currentSeason: "2024",
            highestSeason: "",
            lowestSeason: "",
            data: [],
        };
    }

    onChange = async (evt) => {
        if (evt.target.name === "passNameSelect") {
            this.changePass(evt.target.value, this.state.currentSeason);
        }
        if (evt.target.name === "seasonSelect") {
            this.changePass(this.state.passName, evt.target.value);
        }
    }

    componentDidMount() {
        this.changePass(this.state.passName, this.state.currentSeason);
    }

    changePass(passName, currentSeason) {
        const [chartData, averageData, highestPerYear_accumulatedSnowFall, highestPerYear_totalSnowFall]
            = convertData(passName, snowFallData)

        // Find highest season
        // Find lowest season
        let highest_accumulatedSnowFall = highestPerYear_accumulatedSnowFall["2024"]
        let lowest_accumulatedSnowFall = highestPerYear_accumulatedSnowFall["2024"]
        Object.entries(highestPerYear_accumulatedSnowFall).forEach(([season, seasonData]) => {
            if (seasonData["amount"] > highest_accumulatedSnowFall["amount"]) {
                highest_accumulatedSnowFall = seasonData;
            }
            if (seasonData["amount"] < lowest_accumulatedSnowFall["amount"]) {
                lowest_accumulatedSnowFall = seasonData;
            }
        })
        // Find latest season
        // Merge chartData for all 3 together
        const finalData = [];
        months.forEach((month, month_number) => {
            for (let i = 0; i <= days_in_a_month[month_number]; i++) {
                finalData.push({
                    'name': `${i}-${month}`,
                })
            }
        })
        const seasons = [currentSeason, highest_accumulatedSnowFall["season"], lowest_accumulatedSnowFall["season"]]
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
        return (
            <div style={{ height: '33vh'}}>
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
                        <Tooltip />
                        <Legend />
                        <Line
                            dot={false}
                            connectNulls={true}
                            dataKey={`${this.state.currentSeason}${dataKey}`}
                            name={this.state.currentSeason}
                            stroke={"#8884d8"}
                        />
                        <Line
                            dot={false}
                            connectNulls={true}
                            dataKey={`${this.state.highestSeason}${dataKey}`}
                            name={this.state.highestSeason}
                            stroke={"#82ca9d"}
                        />
                        <Line
                            dot={false}
                            connectNulls={true}
                            dataKey={`${this.state.lowestSeason}${dataKey}`}
                            name={this.state.lowestSeason}
                            stroke={"#ff8042"}
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
            backgroundColor: '#f0f0f0',
            padding: '10px 20px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            display: 'flex',
            justifyContent: 'space-between', // Changed to space-between
            alignItems: 'center'
        };

        const titleStyle = {
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#333'
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

        return (
            <div>
                <div style={titleBarStyle}>
                    <div style={titleStyle}>{passNames[this.state.passName]}</div>
                    <div style={selectContainerStyle}>
                        <select style={selectStyle} name="passNameSelect" value={this.state.passName} onChange={evt => this.onChange(evt)}>
                            {Object.keys(passNames).map(name =>
                                <option key={name} value={name}>{passNames[name]}</option>)}
                        </select>
                        <select style={selectStyle} name="seasonSelect" value={this.state.currentSeason} onChange={evt => this.onChange(evt)}>
                            {Object.keys(snowFallData[this.state.passName]).map(season =>
                                <option key={season} value={season}>{season}</option>)}
                        </select>
                    </div>
                </div>
                <div style={{
                    width: '100%',
                    height: '100vh',
                    padding: '20px',
                    paddingTop: '80px',
                    boxSizing: 'border-box'
                }}>
                    {this.renderLineChart(
                        `Snow Depth`,
                        `totalSnowFall`
                    )}

                    {this.renderLineChart(
                        `Accumulated Snowfall`,
                        `accumulatedSnowFall`
                    )}

                        <div style={{ height: '33vh'}}>
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
                                    <Tooltip />
                                    <Legend />
                                    <Bar
                                        dataKey={`${this.state.currentSeason}newDailySnowFall`}
                                        name={this.state.currentSeason}
                                        fill="#8884d8"
                                        stroke="#8884d8"
                                    />
                                    <Bar
                                        dataKey={`${this.state.highestSeason}newDailySnowFall`}
                                        name={this.state.highestSeason}
                                        fill="#82ca9d"
                                        stroke="#82ca9d"
                                    />
                                    <Bar
                                        dataKey={`${this.state.lowestSeason}newDailySnowFall`}
                                        name={this.state.lowestSeason}
                                        fill="#ff8042"
                                        stroke="#ff8042"
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
            </div>
        );
    }
}

export default Snow;