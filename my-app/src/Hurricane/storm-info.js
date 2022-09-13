import * as React from 'react';
import {
    XYPlot,
    XAxis,
    YAxis,
    HorizontalGridLines,
    VerticalGridLines,
    LineSeries
} from 'react-vis';

function StormInfo(props) {
    const {stormInfo} = props;

    return (
        <div className="storm-info">
            <div>
                <h3  style={{float: "left", marginTop: 0, marginBottom: 0}}>{stormInfo["name"]} {stormInfo["season"]}</h3>
                <button style={{float: "right", }}>&times;</button>
            </div>
            <div>
                <XYPlot xType="time" width={300} height={150} style={{marginBottom: "10px"}}>
                    <XAxis title="Time" />
                    <YAxis title="Wind Speed (knots)" />
                    <LineSeries
                        data={stormInfo.track_points.map((point, i) => ({x: new Date(point.date_time).getTime(), y: point.wind}))}
                    />
                </XYPlot>
                {stormInfo.min_pressure && <XYPlot xType="time" width={300} height={150}>
                    <YAxis title="Pressure (mb)" />
                    {stormInfo.min_pressure && <LineSeries
                        data={stormInfo.track_points.map(point => ({x: new Date(point.date_time).getTime(), y: point.pressure}))}
                    />}

                </XYPlot>}
            </div>
        </div>
    );
}

export default React.memo(StormInfo);