import React, {Component, useState} from 'react';
import DeckGL from '@deck.gl/react';
import {Container, Form, Grid, Input, Label} from "semantic-ui-react";
import Utils from "../Common/Utils";
import ReactMapGL from 'react-map-gl';
import {MenuHeader} from "../Common/CommonComponents";
import { Slider, Rail, Handles, Tracks, Ticks } from "react-compound-slider";
import { CompoundSlider, SliderRail, Handle, Track, Tick } from '../Common/CompoundSlider'

const TOKEN = "pk.eyJ1Ijoicm1tYXJ0aW4wMiIsImEiOiJjazhzeGVnZHcwZTJ4M2ZwYWN0bWY2ZTh3In0.vjI-gVYxkKLmWzVp7uevjg";

const sliderStyle = {
  position: "relative",
  width: "100%"
};

const MapForm = props => (
    <Form>
        <Form.Group widths={"equal"}>
            <Form.Field>
                <label>Season</label>
                <Form.Dropdown
                    fluid
                    id="season"
                    placeholder='2001'
                    multiple
                    search
                    options={props.ibtracOptions.season}
                    onChange={props.handleDropdownChange}
                />
            </Form.Field>
            <Form.Field>
                <label>Basin</label>
                <Form.Dropdown
                    fluid
                    id="basin"
                    placeholder='ATL'
                    multiple
                    search
                    options={props.ibtracOptions.basin}
                    onChange={props.handleDropdownChange}
                />
            </Form.Field>
        </Form.Group>
        <Form.Group widths={"equal"}>
        <Form.Field>
            <label>Subbasin</label>
            <Form.Dropdown
                fluid
                id="subbasin"
                placeholder='ATL'
                multiple
                search
                options={props.ibtracOptions.subbasin}
                onChange={props.handleDropdownChange}
            />
        </Form.Field>
        <Form.Field>
            <label>Storm Name</label>
            <Form.Dropdown
                fluid
                id="name"
                placeholder="Isabel"
                multiple
                search
                options={props.ibtracOptions.name}
                onChange={props.handleDropdownChange}
            />
        </Form.Field>
            </Form.Group>
        <Form.Field>
            <label>Plot Type</label>
            <Form.Dropdown
                id="plotType"
                placeholder="Please select one"
                options={[
                    { text: "Heatmap", value: "heatmap"},
                    { text: "Scatter Plot", value: "scatter"},
                    { text: "Grid Layer", value: "grid" },
                    { text: "Grid Layer Max", value: "gridMax" },
                    { text: "Grid Layer Min", value: "gridMin" },
                    { text: "Storm Paths", value: "line"}
                    ]}
                onChange={props.handlePlotTypeChange}
            />
        </Form.Field>
        <Form.Field width={16}>
            <label>Day</label>
            <CompoundSlider
                id="day"
                domain={[1,31]}
                sliderStyle={sliderStyle}
                onSlideEnd={props.handleDateSliderChange}
            />
        </Form.Field>
        <Form.Field width={16}>
            <label>Month</label>
            <CompoundSlider
                id="month"
                domain={[1,12]}
                sliderStyle={sliderStyle}
                onSlideEnd={props.handleDateSliderChange}
            />
        </Form.Field>
        <Form.Field width={16}>
            <label>Year</label>a
            <CompoundSlider
                id="year"
                domain={[1851,2020]}
                sliderStyle={sliderStyle}
                onSlideEnd={props.handleDateSliderChange}
            />
        </Form.Field>
        <Form.Field width={16}>
            <label>Query</label>
            <span>{JSON.stringify(props.query)}</span>
        </Form.Field>
        <Form.Button
            content={`Fetch Data`}
            loading={props.loadingIbtracQuery}
            onClick={props.fetchQuery}
        />
    </Form>
);

const MapForm2 = props => (
    <Form>
        <Form.Field width={16}>
            <label>Wind</label>
            <Input
                id="wind_min"
                placeholder="Min"
                type="number"
                onChange={props.handleInputChange}
                labelPosition='right'
            >
                <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "wind", true, "0")}</Label>
                    <input/>
                <Label>{Utils.IBTRACS_KEYS["wmo_wind"]}</Label>
            </Input>
            <Input
                id="wind_max"
                placeholder="Max"
                type="number"
                onChange={props.handleInputChange}
                labelPosition='right'
            >
                <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "wind", false, "0")}</Label>
                    <input/>
                <Label>{Utils.IBTRACS_KEYS["wmo_wind"]}</Label>
            </Input>
        </Form.Field>
        <Form.Field width={16}>
            <label>Pressure</label>
            <Input
                id="pres_min"
                placeholder="Min"
                type="number"
                labelPosition='right'
                onChange={props.handleInputChange}
            >
                <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "pres", true, "0")}</Label>
                        <input/>
                <Label>{Utils.IBTRACS_KEYS["wmo_pres"]}</Label>
            </Input>
            <Input
                id="pres_max"
                placeholder="Max"
                type="number"
                labelPosition='right'
                onChange={props.handleInputChange}
            >
                <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "pres", false, "0")}</Label>
                        <input/>
                <Label>{Utils.IBTRACS_KEYS["wmo_pres"]}</Label>
            </Input>
        </Form.Field>
        <Form.Field width={16}>
            <label>Gust</label>
            <Input
                id="gust_min"
                placeholder="Min"
                type="number"
                labelPosition='right'
                onChange={props.handleInputChange}
            >
                <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "gust", true, "0")}</Label>
                        <input/>
                <Label>{Utils.IBTRACS_KEYS["wmo_wind"]}</Label>
            </Input>
            <Input
                id="gust_max"
                placeholder="Max"
                type="number"
                labelPosition='right'
                onChange={props.handleInputChange}
            >
                <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "gust", false, "0")}</Label>
                        <input/>
                <Label>{Utils.IBTRACS_KEYS["wmo_wind"]}</Label>
            </Input>
        </Form.Field>
        <Form.Field width={16}>
            <label>Latitude</label>
            <Input
                id="lat_min"
                placeholder="Min"
                type="number"
                labelPosition='right'
                onChange={props.handleInputChange}
            >
                <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "lat", true, "0")}</Label>
                        <input/>
                <Label>{Utils.IBTRACS_KEYS["lat"]}</Label>
            </Input>
            <Input
                id="lat_max"
                placeholder="Max"
                type="number"
                labelPosition='right'
                onChange={props.handleInputChange}
            >
                <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "lat", false, "0")}</Label>
                        <input/>
                <Label>{Utils.IBTRACS_KEYS["lat"]}</Label>
            </Input>
        </Form.Field>
        <Form.Field width={16}>
            <label>Longitude</label>
            <Input
                id="lon_min"
                placeholder="Min"
                type="number"
                labelPosition='right'
                onChange={props.handleInputChange}
            >
                <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "lon", true, "0")}</Label>
                        <input/>
                <Label>{Utils.IBTRACS_KEYS["lon"]}</Label>
            </Input>
            <Input
                id="lon_max"
                placeholder="Max"
                type="number"
                labelPosition='right'
                onChange={props.handleInputChange}
            >
                <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "lon", false, "0")}</Label>
                        <input/>
                <Label>{Utils.IBTRACS_KEYS["lon"]}</Label>
            </Input>
        </Form.Field>
        <Form.Field width={16}>
            <label>Distance to Land</label>
            <Input
                id="dist2land_min"
                placeholder="Min"
                type="number"
                labelPosition='right'
                onChange={props.handleInputChange}
            >
                <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "dist2land", true, "0")}</Label>
                        <input/>
                <Label>{Utils.IBTRACS_KEYS["dist2land"]}</Label>
            </Input>
            <Input
                id="dist2land_max"
                placeholder="Max"
                type="number"
                labelPosition='right'
                onChange={props.handleInputChange}
            >
                <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "dist2land", false, "0")}</Label>
                        <input/>
                <Label>{Utils.IBTRACS_KEYS["dist2land"]}</Label>
            </Input>
        </Form.Field>
        <Form.Field width={16}>
            <label>Storm Speed</label>
            <Input
                id="speed_min"
                placeholder="Min"
                type="number"
                labelPosition='right'
                onChange={props.handleInputChange}
            >
                <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "speed", true, "0")}</Label>
                        <input/>
                <Label>{Utils.IBTRACS_KEYS["speed"]}</Label>
            </Input>
            <Input
                id="speed_max"
                placeholder="Max"
                type="number"
                labelPosition='right'
                onChange={props.handleInputChange}
            >
                <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "speed", false, "0")}</Label>
                        <input/>
                <Label>{Utils.IBTRACS_KEYS["speed"]}</Label>
            </Input>
        </Form.Field>
    </Form>
);

const DataLayerForm = props => {
    if (props.plotType === "heatmap") {
        return (
            <Form>
                <Form.Field>
                    <label>Pixel Radius</label>
                    <Form.Input
                        id="radiusPixels"
                        label={props.dataLayerValues.radiusPixels}
                        onChange={props.handleDataLayerValueChange}
                        type='range'
                        min={0}
                        max={100}
                        step={1}
                    />
                </Form.Field>
                <Form.Field>
                    <label>Intensity</label>
                    <Form.Input
                        id="intensity"
                        label={props.dataLayerValues.intensity}
                        onChange={props.handleDataLayerValueChange}
                        type='range'
                        min={0}
                        max={100}
                        step={1}
                    />
                </Form.Field>
                <Form.Field>
                    <label>Threshold</label>
                    <Form.Input
                        id="threshold"
                        label={props.dataLayerValues.threshold}
                        onChange={props.handleDataLayerValueChange}
                        type='range'
                        min={0}
                        max={1}
                        step={.01}
                    />
                </Form.Field>
            </Form>
        )
    }
    if (props.plotType.includes("grid")) {
                return (
            <Form>
                <Form.Field>
                    <label>Cell Size</label>
                    <Form.Input
                        id="cellSize"
                        label={props.dataLayerValues.cellSize}
                        onChange={props.handleDataLayerValueChange}
                        type='range'
                        min={0}
                        max={1000000}
                        step={10000}
                    />
                </Form.Field>
                <Form.Field>
                    <label>Elevation Scale</label>
                    <Form.Input
                        id="elevationScale"
                        label={props.dataLayerValues.elevationScale}
                        onChange={props.handleDataLayerValueChange}
                        type='range'
                        min={0}
                        max={1000}
                        step={10}
                    />
                </Form.Field>
            </Form>
        )
    }
    return (<div/>)
};

export const IbtracPage = props => (
    <div style={{height: "100%", margin: "0"}}>
        <div style={{ height: "4em"}}>
            <MenuHeader
                menuItems={[{label: "Images", path: "/images"}]}
            />
        </div>
        <div style={{ height: "100%" }}>
            {props.renderTooltip}
            <DeckGL
                viewState={props.viewState}
                controller={true}
                layers={[props.dataLayer]}
                onViewStateChange={props.onViewStateChange}
            >
                <ReactMapGL
                    mapboxApiAccessToken={TOKEN}
                >
                </ReactMapGL>
            </DeckGL>
            <div>
                <div style={{ float: "left", minHeight: "100%", height: "100%", padding: "10px", marginLeft: "10px", width: "10%", backgroundColor: "white", opacity: "85%" }}>
                    <MapForm
                        ibtracOptions={props.ibtracOptions}
                        loadingIbtracQuery={props.loadingIbtracQuery}
                        fetchQuery={props.fetchQuery}
                        query={props.query}
                        handleDropdownChange={props.handleDropdownChange}
                        handleDateSliderChange={props.handleDateSliderChange}
                        handleInputChange={props.handleInputChange}
                        handlePlotTypeChange={props.handlePlotTypeChange}
                    />
                    <DataLayerForm style={{ marginTop: "10px" }}
                        plotType={props.plotType}
                        dataLayerValues={props.dataLayerValues}
                        handleDataLayerValueChange={props.handleDataLayerValueChange}
                    />
                </div>
                <div style={{ float: "right", height: "100%", margin: "0", width: "10%", backgroundColor: "white", opacity: "85%" }}>
                    <MapForm2
                        ibtracOptions={props.ibtracOptions}
                        loadingIbtracQuery={props.loadingIbtracQuery}
                        fetchQuery={props.fetchQuery}
                        query={props.query}
                        handleDropdownChange={props.handleDropdownChange}
                        handleDateSliderChange={props.handleDateSliderChange}
                        handleInputChange={props.handleInputChange}
                        handlePlotTypeChange={props.handlePlotTypeChange}
                    />
                </div>
            </div>
        </div>
    </div>
);