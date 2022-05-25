import React from "react";
import {Map} from "react-map-gl";

import MAP_TOKEN from "../credentials";
// import Thirlmere_to_Ambleside from "./MapData/Helvellyn/Thirlmere_to_Ambleside";

/*
Map showing different trips via path layer, can then click on trip for day-by-day detail
Italy Trip 1
Italy Trip 2
Ambleside
Swizterland
 */


const italyTrip1PathLayer = new PathLayer({
    id: 'path-layer',
    data,
    pickable: true,
    widthScale: 20,
    widthMinPixels: 2,
    getPath: d => d.path,
    getColor: d => colorToRGBArray(d.color),
    getWidth: d => 5
});

function Travel() {
    return (
        <div style={{width: "100vw", height: "100vh"}}>
            <DeckGL
                initialViewState={INITIAL_VIEW_STATE}
                controller={true}
                layers={this.state.layers}
                getTooltip={({object}) => this.getToolTip(object)}
            >
                <Map
                    mapboxAccessToken={MAP_TOKEN}
                    mapStyle="mapbox://styles/mapbox/dark-v9"
                />
            </DeckGL>
        </div>
    );
}

export default Travel;