import React, { useState, useMemo } from "react"
import Map, {Marker, Popup, Source, Layer} from 'react-map-gl';
import "mapbox-gl/dist/mapbox-gl.css";
import Pin from "./pin";
import PIC_DATA from "./Pics/Colorado/data.json"

const accessToken = "pk.eyJ1Ijoicm1tYXJ0aW4wMiIsImEiOiJjazhzeGVnZHcwZTJ4M2ZwYWN0bWY2ZTh3In0.vjI-gVYxkKLmWzVp7uevjg";

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

    const get_jpg = pic_name => PIC_DATA[pic_name]

    const pins = useMemo(
        () =>
            PIC_DATA.ordered_list.map((pic_name, index) => {
                const pic = get_jpg(pic_name);
                pic.image = pic_name;
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

    return <div style={{width: "100vw", height: "100vh"}}>
        <Map
            mapboxAccessToken={accessToken}
            initialViewState={{
                longitude: PIC_DATA[PIC_DATA.ordered_list[0]].lon,
                latitude: PIC_DATA[PIC_DATA.ordered_list[0]].lat,
                zoom: 14,
                pitch: 60
            }}
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
            {pins}
            {popupInfo && (
                <Popup
                    anchor="bottom"
                    longitude={Number(popupInfo.lon)}
                    latitude={Number(popupInfo.lat)}
                    onClose={() => setPopupInfo(null)}
                >
                    <div>
                        {popupInfo.datetime_original}
                    </div>
                </Popup>
            )}
        </Map>
    </div>;
}