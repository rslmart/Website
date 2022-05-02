import React, { useState, useMemo } from "react"
import Image from 'next/image'
import Map, {Marker, Popup, Source, Layer} from 'react-map-gl';
import "mapbox-gl/dist/mapbox-gl.css";
import Pin from "./pin";
import PIC_DATA from "./Pics/LakeDistrict/16_4_2022/data.json"



const accessToken = "pk.eyJ1Ijoicm1tYXJ0aW4wMiIsImEiOiJjazhzeGVnZHcwZTJ4M2ZwYWN0bWY2ZTh3In0.vjI-gVYxkKLmWzVp7uevjg";
const last_pic = 257;

export default function TravelMap(props) {
    const [popupInfo, setPopupInfo] = useState(null);

    const skyLayer = {
        id: 'sky',
        type: 'sky',
        paint: {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 0.0],
            'sky-atmosphere-sun-intensity': 15
        }
    };

    const get_jpg = index => PIC_DATA[index + '.JPG']

    const pins = useMemo(
        () =>
            Array.from(Array(last_pic).keys()).map(index => {
                const pic = get_jpg(index);
                pic.image = index + '.JPG'
                return <Marker
                    key={`marker-${index}`}
                    longitude={pic.lon}
                    latitude={pic.lat}
                    anchor="bottom"
                    onClick={e => {
                        // If we let the click event propagates to the map, it will immediately close the popup
                        // with `closeOnClick: true`
                        e.originalEvent.stopPropagation();
                        setPopupInfo(pic);
                    }}
                >
                    <Pin/>
                </Marker>
            }),
        []
    );

    return <div>
        <Map
            mapboxAccessToken={accessToken}
            initialViewState={{
                longitude: -3.016054,
                latitude: 54.527232,
                zoom: 14,
                pitch: 60
            }}
            style={{width: "100vw", height: "100vh"}}
            mapStyle="mapbox://styles/mapbox/satellite-streets-v11"
            terrain={{source: 'mapbox-dem', exaggeration: 1.5}}
        >
            <Source
                id="mapbox-dem"
                type="raster-dem"
                url="mapbox://mapbox.mapbox-terrain-dem-v1"
                tileSize={512}
                maxzoom={14}
            />
            <Layer {...skyLayer} />
            <Source
                id="route"
                type="geojson"
                data={{
                    'type': 'Feature',
                    'properties': {},
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': props.trailGeoJson
                    }
                }}
            />
            <Layer {...{
                'id': 'route',
                'type': 'line',
                'source': 'route',
                'layout': {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                'paint': {
                    'line-color': '#fc0303',
                    'line-width': 8
                }
            }} />
            {pins}
            {popupInfo && (
                <Popup
                    anchor="top"
                    longitude={Number(popupInfo.lon)}
                    latitude={Number(popupInfo.lat)}
                    onClose={() => setPopupInfo(null)}
                >
                    <div>
                    </div>
                    <Image layout="fill" src={"/Pics/LakeDistrict/16_4_2022/" + popupInfo.image} />
                </Popup>
            )}
            </Map>
        <div style={{width: "100vw", height: "0vh"}}>
        </div>
    </div>;
}