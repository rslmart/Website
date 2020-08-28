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
                    options={props.hurdatOptions.season}
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
                    options={props.hurdatOptions.name}
                    onChange={props.handleDropdownChange}
                />
            </Form.Field>
        </Form.Group>
        <Form.Field width={16}>
            <label>Query</label>
            <span>{JSON.stringify(props.query)}</span>
        </Form.Field>
        <Form.Button
            content={`Fetch Data`}
            loading={props.loadingHurdatQuery}
            onClick={props.fetchQuery}
        />
    </Form>
);

export const HurdatPage = props => (
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
                <div style={{ float: "left", minHeight: "100%", height: "100%", padding: "10px", marginLeft: "10px",backgroundColor: "white", opacity: "85%" }}>
                    <MapForm
                        hurdatOptions={props.hurdatOptions}
                        loadingHurdatQuery={props.loadingHurdatQuery}
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