import React, {useCallback, useState} from "react";
import {useNavigate} from 'react-router-dom';
import DeckGL from '@deck.gl/react';
import {PathLayer} from '@deck.gl/layers';
import {Map} from "react-map-gl";
import CREDENTIALS from "../credentials.json";
// import Thirlmere_to_Ambleside from "./MapData/Helvellyn/Thirlmere_to_Ambleside";

/*
Map showing different trips via path layer, can then click on trip for day-by-day detail
Italy Trip
Italy Trip 2
Ambleside
Swizterland
 */

const INITIAL_VIEW_STATE = {
    latitude: 48,
    longitude: 6,
    zoom: 4,
    bearing: 0,
    pitch: 0,
}

function Travel() {
    const navigate = useNavigate();
    const [hoverInfo, setHoverInfo] = useState({});

    const pathLayer = new PathLayer({
        id: 'path-layer',
        data: [
            {
                path: [[12.32, 45.43], [11.26, 43.77], [12.5, 41.9]],
                name: 'Italy 2019',
                color: [255, 0, 0]
            },
            {
                path: [[-0.076, 51.50820], [-2.965227, 54.430511]],
                name: 'Lake District 2022',
                link: "/Travel/LakeDistrict",
                color: [0, 255, 0]
            }
        ],
        pickable: true,
        widthScale: 5,
        widthMinPixels: 4,
        getPath: d => d.path,
        getColor: d => d.color,
        onHover: info => setHoverInfo(info),
        onClick: info => navigate(info.object.link)
    });


    return (
        <div style={{width: "100vw", height: "100vh"}}>
            <DeckGL
                initialViewState={INITIAL_VIEW_STATE}
                controller={true}
                layers={[pathLayer]}
            >
                <Map
                    mapboxAccessToken={CREDENTIALS["MAP_TOKEN"]}
                    mapStyle="mapbox://styles/mapbox/dark-v9"
                >
                    {hoverInfo.object && (
                        <div
                            style={{position: 'absolute', zIndex: 1, pointerEvents: 'none', left: hoverInfo.x, top: hoverInfo.y, backgroundColor: "White"}}
                        >
                            { hoverInfo.object.name }
                        </div>
                    )}
                </Map>
            </DeckGL>
        </div>
    );
}

export default Travel;