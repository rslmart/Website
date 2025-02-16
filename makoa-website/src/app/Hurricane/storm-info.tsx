import * as React from 'react';
import {
    VictoryChart,
    VictoryAxis,
    VictoryLine,
    VictoryScatter,
    VictoryTheme,
    VictoryLabel,
    VictoryContainer,
    VictoryVoronoiContainer
} from 'victory';
import styled from 'styled-components';
import { getColorFromWindSpeed } from "./HurricaneClient"

// Type definitions
interface TrackPoint {
    date_time: string;
    wind: number;
    pressure?: number;
    ir_image_url?: string;
    [key: string]: any;
}

interface StormInfoData {
    name: string;
    season: number;
    track_points: TrackPoint[];
    min_pressure?: number;
}

interface StormInfoProps {
    stormInfo: StormInfoData;
    selectedPoint: number;
    onChange: (event: React.ChangeEvent<HTMLInputElement> | React.MouseEvent<HTMLButtonElement>) => void;
    exitStormInfo: () => void;
}

// Styled components
const StormInfoContainer = styled.div`
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.9);
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  z-index: 1000;
  max-width: 340px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0 8px;
`;

const ImageContainer = styled.div`
  margin: 10px 0;
  img {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
  }
`;

const ChartContainer = styled.div`
  margin: 10px 0;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 15px 0;
  
  input[type="range"] {
    flex: 1;
  }
`;

const InfoRow = styled.div`
  margin: 8px 0;
  font-size: 0.9rem;
`;

const NavigationButton = styled.button`
  padding: 4px 8px;
  min-width: 32px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  
  &:hover {
    background: #f0f0f0;
  }
`;

const StormInfo: React.FC<StormInfoProps> = React.memo(({
                                                            stormInfo,
                                                            selectedPoint,
                                                            onChange,
                                                            exitStormInfo
                                                        }) => {
    const pointInfo = stormInfo.track_points[selectedPoint];

    const getColorToHex = (windSpeed: number): string => {
        const color = getColorFromWindSpeed(windSpeed);
        return `#${color[0].toString(16).padStart(2, '0')}${color[1].toString(16).padStart(2, '0')}${color[2].toString(16).padStart(2, '0')}`;
    };

    const windData = stormInfo.track_points.map((point, i) => ({
        x: new Date(point.date_time).getTime(),
        y: point.wind,
        fill: getColorToHex(point.wind),
        opacity: i === selectedPoint ? 1 : 0.75,
        stroke: i === selectedPoint ? "#000000" : "#FFFFFF",
        size: 4
    }));

    const pressureData = stormInfo.track_points.map(point => ({
        x: new Date(point.date_time).getTime(),
        y: point.pressure || 1000
    }));

    const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange({
            ...e,
            target: {
                ...e.target,
                name: "selectedPoint",
                value: e.target.value
            }
        });
    };

    return (
        <StormInfoContainer>
            <Header>
                <h3>{stormInfo.name} {stormInfo.season}</h3>
                <CloseButton onClick={exitStormInfo}>&times;</CloseButton>
            </Header>

            {pointInfo.ir_image_url && (
                <ImageContainer>
                    <img
                        src={pointInfo.ir_image_url}
                        alt="Infrared satellite imagery"
                    />
                </ImageContainer>
            )}

            <ChartContainer>
                <VictoryChart
                    theme={VictoryTheme.material}
                    width={300}
                    height={150}
                    domainPadding={{ x: [0, 20] }}
                    containerComponent={<VictoryContainer responsive={false}/>}
                >
                    <VictoryAxis
                        tickFormat={(x) => new Date(x).toLocaleDateString("en-US", { month: 'short', day: 'numeric' })}
                        label="Time"
                        style={{ tickLabels: { fontSize: 8, angle: -45, textAnchor: 'end' } }}
                    />
                    <VictoryAxis dependentAxis label="Wind Speed (knots)" />
                    <VictoryLine
                        style={{ data: { stroke: "black" } }}
                        data={windData}
                    />
                    <VictoryScatter
                        data={windData}
                        style={{ data: { fill: ({ datum }) => datum.fill, stroke: ({ datum }) => datum.stroke, opacity: ({ datum }) => datum.opacity, size: ({ datum }) => datum.size } }}
                    />
                </VictoryChart>
            </ChartContainer>

            {stormInfo.min_pressure && (
                <ChartContainer>
                    <VictoryChart
                        theme={VictoryTheme.material}
                        width={300}
                        height={150}
                        domainPadding={{ x: [0, 20] }}
                        containerComponent={<VictoryContainer responsive={false}/>}
                    >
                        <VictoryAxis
                            tickFormat={(x) => new Date(x).toLocaleDateString("en-US", { month: 'short', day: 'numeric' })}
                            label="Time"
                            style={{ tickLabels: { fontSize: 8, angle: -45, textAnchor: 'end' } }}
                        />
                        <VictoryAxis dependentAxis label="Pressure (mb)" />
                        <VictoryLine
                            style={{ data: { stroke: "#000000" } }}
                            data={pressureData}
                        />
                        <VictoryScatter
                            data={[{
                                x: new Date(pointInfo.date_time).getTime(),
                                y: pointInfo.pressure || 1000,
                            }]}
                            style={{ data: { fill: "#000000" } }}
                        />
                    </VictoryChart>
                </ChartContainer>
            )}

            <Controls>
                <NavigationButton
                    name="backwardSelectedPoint"
                    onClick={onChange}
                    disabled={selectedPoint === 0}
                >
                    {"<"}
                </NavigationButton>

                <input
                    name="selectedPoint"
                    type="range"
                    value={selectedPoint}
                    min={0}
                    max={stormInfo.track_points.length - 1}
                    onChange={handleRangeChange}
                />

                <NavigationButton
                    name="forwardSelectedPoint"
                    onClick={onChange}
                    disabled={selectedPoint === stormInfo.track_points.length - 1}
                >
                    {">"}
                </NavigationButton>
            </Controls>

            <InfoRow>
                <strong>Date/Time:</strong> {new Date(pointInfo.date_time).toLocaleString()}
            </InfoRow>
            <InfoRow>
                <strong>Wind:</strong> {pointInfo.wind} knots |{" "}
                <strong>Pressure:</strong> {pointInfo.pressure || 'N/A'} mb
            </InfoRow>
        </StormInfoContainer>
    );
}, (prevProps, nextProps) => {
    return prevProps.selectedPoint === nextProps.selectedPoint &&
        prevProps.stormInfo === nextProps.stormInfo;
});

export default StormInfo;