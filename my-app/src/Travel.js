import React from "react";
import TravelMap from './TravelMap';
import Thirlmere_to_Ambleside from "./MapData/Helvellyn/Thirlmere_to_Ambleside";

function gpxToGeoJson(gpxFile) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(gpxFile, "application/xml");
    const coordinates = Array.from(doc.getElementsByTagName("trkpt")).map(trackPoint => {
        return [parseFloat(trackPoint.attributes["lon"].value), parseFloat(trackPoint.attributes["lat"].value)];
    });
    return coordinates;
}


function Travel() {
    return (
        <TravelMap
            name="Lake District: Day 1"
            trailGeoJson={gpxToGeoJson(Thirlmere_to_Ambleside)}
        />
    );
}

export default Travel;