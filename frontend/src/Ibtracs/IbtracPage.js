import React, { useState } from 'react';
import DeckGL from '@deck.gl/react';
import {Container, Form, Grid, Input, Label} from "semantic-ui-react";
import Utils from "../Common/Utils";
import PolylineOverlay from "../Common/PolylineOverlay";

const TOKEN = "pk.eyJ1Ijoicm1tYXJ0aW4wMiIsImEiOiJjazhzeGVnZHcwZTJ4M2ZwYWN0bWY2ZTh3In0.vjI-gVYxkKLmWzVp7uevjg";

export const IbtracPage = props => (
    <Container style={{ marginTop: '7em', width: "100vw", height: "100vh" }}>
        <Container>
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
                <Form.Group widths={"equal"}>
                    <Form.Field>
                        <label>Plot Type</label>
                        <Form.Dropdown
                            id="plotType"
                            options={[{ text: "Heatmap", value: "heatmap"},
                                { text: "Scatter Plot", value: "scatter"},
                                { text: "Storm Paths", value: "line"}]}
                            onChange={props.handleDropdownChange}
                        />
                    </Form.Field>
                    <Form.Field>
                        <label>Wind</label>
                        <Input
                            id="wind_min"
                            placeholder="Min"
                            type="number"
                            onChange={props.handleInputChange}
                            labelPosition='right'
                        >
                            <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "wind", true, "0")}</Label>
                                <input />
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
                                <input />
                            <Label>{Utils.IBTRACS_KEYS["wmo_wind"]}</Label>
                        </Input>
                    </Form.Field>
                    <Form.Field>
                        <label>Pressure</label>
                        <Input
                            id="pres_min"
                            placeholder="Min"
                            type="number"
                            labelPosition='right'
                            onChange={props.handleInputChange}
                        >
                            <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "pres", true, "0")}</Label>
                                    <input />
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
                                    <input />
                            <Label>{Utils.IBTRACS_KEYS["wmo_pres"]}</Label>
                        </Input>
                    </Form.Field>
                    <Form.Field>
                        <label>Gust</label>
                        <Input
                            id="gust_min"
                            placeholder="Min"
                            type="number"
                            labelPosition='right'
                            onChange={props.handleInputChange}
                        >
                            <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "gust", true, "0")}</Label>
                                    <input />
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
                                    <input />
                            <Label>{Utils.IBTRACS_KEYS["wmo_wind"]}</Label>
                        </Input>
                    </Form.Field>
                </Form.Group>
                <Form.Group widths={"equal"}>
                    <Form.Field>
                        <label>Latitude</label>
                        <Input
                            id="lat_min"
                            placeholder="Min"
                            type="number"
                            labelPosition='right'
                            onChange={props.handleInputChange}
                        >
                            <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "lat", true, "0")}</Label>
                                    <input />
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
                                    <input />
                            <Label>{Utils.IBTRACS_KEYS["lat"]}</Label>
                        </Input>
                    </Form.Field>
                    <Form.Field>
                        <label>Longitude</label>
                        <Input
                            id="lon_min"
                            placeholder="Min"
                            type="number"
                            labelPosition='right'
                            onChange={props.handleInputChange}
                        >
                            <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "lon", true, "0")}</Label>
                                    <input />
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
                                    <input />
                            <Label>{Utils.IBTRACS_KEYS["lon"]}</Label>
                        </Input>
                    </Form.Field>
                    <Form.Field>
                        <label>Distance to Land</label>
                        <Input
                            id="dist2land_min"
                            placeholder="Min"
                            type="number"
                            labelPosition='right'
                            onChange={props.handleInputChange}
                        >
                            <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "dist2land", true, "0")}</Label>
                                    <input />
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
                                    <input />
                            <Label>{Utils.IBTRACS_KEYS["dist2land"]}</Label>
                        </Input>
                    </Form.Field>
                    <Form.Field>
                        <label>Storm Speed</label>
                        <Input
                            id="speed_min"
                            placeholder="Min"
                            type="number"
                            labelPosition='right'
                            onChange={props.handleInputChange}
                        >
                            <Label basic>{Utils.displayMinMaxValue(props.ibtracOptions, "speed", true, "0")}</Label>
                                    <input />
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
                                    <input />
                            <Label>{Utils.IBTRACS_KEYS["speed"]}</Label>
                        </Input>
                    </Form.Field>
                </Form.Group>
                <Form.Button
                    content={`Fetch Data`}
                    loading={props.loadingIbtracQuery}
                    onClick={props.fetchQuery}
                />
            </Form>
        </Container>
        <Container style={{ width: "100%", height: "65%" }}>
            <DeckGL
                width={"100%"}
                height={"100%"}
                {...props.viewport}
                mapboxApiAccessToken={TOKEN}
                onViewportChange={props.onViewPortChange}
            >
                <PolylineOverlay points={props.points} />
            </DeckGL>
        </Container>
    </Container>
);