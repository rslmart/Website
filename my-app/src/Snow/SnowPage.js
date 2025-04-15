import React, { Component } from 'react';
import snowFallData from './data/pass_snowfall_data.json';
import {CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis} from "recharts";

const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Apr', 'May']

// const getDateArray = () => {
//     return [
//         Array.apply(null, Array(31)).map(Number.prototype.valueOf,0),
//         Array.apply(null, Array(30)).map(Number.prototype.valueOf,0),
//         Array.apply(null, Array(31)).map(Number.prototype.valueOf,0),
//         Array.apply(null, Array(31)).map(Number.prototype.valueOf,0),
//         Array.apply(null, Array(28)).map(Number.prototype.valueOf,0),
//         Array.apply(null, Array(31)).map(Number.prototype.valueOf,0),
//         Array.apply(null, Array(30)).map(Number.prototype.valueOf,0)
//     ];
// }
//
// const convertData = (passName, data) => {
//     const newData = {}
//     let passData = data[passName];
//     Object.entries(passData).forEach(([year, yearData]) => {
//         newData[year] = {
//             "newDailySnowFall": getDateArray(),
//             "totalSnowFall": getDateArray(),
//             "accumulatedSnowFall": getDateArray()
//         }
//         months.forEach(month => {
//             const monthData = yearData.find(obj => obj.month === month)
//             if (monthData && "dailySnowFall" in monthData) {
//                 monthData.dailySnowFall.forEach(dailySnow => {
//                     const index = dailySnow["day"] - 1;
//                     if (month === 'Feb' && index === 28) {
//                         newData[year]["newDailySnowFall"][27] = newData[year]["newDailySnowFall"][27] + dailySnow["newDailySnowFall"];
//                         newData[year]["totalSnowFall"][27] = newData[year]["newDailySnowFall"][27] + dailySnow["totalSnowFall"];
//                         newData[year]["accumulatedSnowFall"][27] = newData[year]["newDailySnowFall"][27] + dailySnow["accumulatedSnowFall"];
//                     } else {
//                         newData[year]["newDailySnowFall"][index] = dailySnow["newDailySnowFall"];
//                         newData[year]["totalSnowFall"][index] = dailySnow["totalSnowFall"];
//                         newData[year]["accumulatedSnowFall"][index] = dailySnow["accumulatedSnowFall"];
//                     }
//                 })
//             }
//         })
//     })
//     return newData;
// }

const convertData = (passName, data) => {
    const newData = {}
    let passData = data[passName];
    const highestPerYear_accumulatedSnowFall = {}
    const highestPerYear_totalSnowFall = {}
    Object.entries(passData).forEach(([year, yearData]) => {
        newData[year] = []
        const highest_accumulatedSnowFall = {
            "year": '',
            "month": '',
            "day": 0,
            "amount": 0
        }
        const highest_totalSnowFall = {
            "year": '',
            "month": '',
            "day": 0,
            "amount": 0
        }
        months.forEach(month => {
            const monthData = yearData.find(obj => obj.month === month)
            if (monthData && "dailySnowFall" in monthData) {
                monthData.dailySnowFall.forEach(dailySnow => {
                    newData[year].push({
                        'name': `${dailySnow['day']}-${month}-${year}`,
                        'newDailySnowFall': dailySnow['newDailySnowFall'],
                        'totalSnowFall': dailySnow['totalSnowFall'],
                        'accumulatedSnowFall': dailySnow['accumulatedSnowFall'],
                    })
                    if (dailySnow["accumulatedSnowFall"] > highest_accumulatedSnowFall["amount"]) {
                        highest_accumulatedSnowFall["amount"] = dailySnow["accumulatedSnowFall"]
                        highest_accumulatedSnowFall["day"] = dailySnow["day"]
                        highest_accumulatedSnowFall["month"] = month
                        highest_accumulatedSnowFall["year"] = year

                    }
                    if (dailySnow["totalSnowFall"] > highest_totalSnowFall["amount"]) {
                        highest_totalSnowFall["amount"] = dailySnow["totalSnowFall"]
                        highest_totalSnowFall["day"] = dailySnow["day"]
                        highest_totalSnowFall["month"] = month
                        highest_totalSnowFall["year"] = year

                    }
                })
            }
        })
        highestPerYear_accumulatedSnowFall[year] = highest_accumulatedSnowFall
        highestPerYear_totalSnowFall[year] = highest_totalSnowFall
    })
    // Get highest year for each
}

class Snow extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        return (
            <LineChart width={730} height={250} data={data}
                   margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="pv" stroke="#8884d8" />
                <Line type="monotone" dataKey="uv" stroke="#82ca9d" />
            </LineChart>
    )}
}

export default Snow;