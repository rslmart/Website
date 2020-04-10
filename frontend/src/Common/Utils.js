import {Statistic} from "semantic-ui-react";
import React, {Component} from "react";

export default class Utils {

    static IBTRACS_KEYS = {"sid":"","season":"Year","number":" ","basin":" ","subbasin":" ","name":" ","iso_time":" ",
        "nature":" ","lat":"° N","lon":"° E","wmo_wind":"kts","wmo_pres":"mb","wmo_agency":" ",
        "track_type":" ","dist2land":"km","landfall":"km","iflag":" ","usa_agency":" ","usa_atcf_id":" ",
        "usa_lat":"degrees_north","usa_lon":"degrees_east","usa_record":" ","usa_status":" ","usa_wind":"kts",
        "usa_pres":"mb","usa_sshs":"1","usa_r34_ne":"nmile","usa_r34_se":"nmile","usa_r34_sw":"nmile",
        "usa_r34_nw":"nmile","usa_r50_ne":"nmile","usa_r50_se":"nmile","usa_r50_sw":"nmile","usa_r50_nw":"nmile",
        "usa_r64_ne":"nmile","usa_r64_se":"nmile","usa_r64_sw":"nmile","usa_r64_nw":"nmile","usa_poci":"mb",
        "usa_roci":"nmile","usa_rmw":"nmile","usa_eye":"nmile","tokyo_lat":"degrees_north","tokyo_lon":"degrees_east",
        "tokyo_grade":"1","tokyo_wind":"kts","tokyo_pres":"mb","tokyo_r50_dir":" ","tokyo_r50_long":"nmile",
        "tokyo_r50_short":"nmile","tokyo_r30_dir":" ","tokyo_r30_long":"nmile","tokyo_r30_short":"nmile",
        "tokyo_land":"1","cma_lat":"degrees_north","cma_lon":"degrees_east","cma_cat":"1","cma_wind":"kts",
        "cma_pres":"mb","hko_lat":"degrees_north","hko_lon":"degrees_east","hko_cat":" ","hko_wind":"kts",
        "hko_pres":"mb","newdelhi_lat":"degrees_north","newdelhi_lon":"degrees_east","newdelhi_grade":" ",
        "newdelhi_wind":"kts","newdelhi_pres":"mb","newdelhi_ci":"1","newdelhi_dp":"mb","newdelhi_poci":"mb",
        "reunion_lat":"degrees_north","reunion_lon":"degrees_east","reunion_type":" ","reunion_wind":"kts",
        "reunion_pres":"mb","reunion_tnum":"1","reunion_ci":"1","reunion_rmw":"nmile","reunion_r34_ne":"nmile",
        "reunion_r34_se":"nmile","reunion_r34_sw":"nmile","reunion_r34_nw":"nmile","reunion_r50_ne":"nmile",
        "reunion_r50_se":"nmile","reunion_r50_sw":"nmile","reunion_r50_nw":"nmile","reunion_r64_ne":"nmile",
        "reunion_r64_se":"nmile","reunion_r64_sw":"nmile","reunion_r64_nw":"nmile","bom_lat":"degrees_north",
        "bom_lon":"degrees_east","bom_type":" ","bom_wind":"kts","bom_pres":"mb","bom_tnum":"1","bom_ci":"1",
        "bom_rmw":"nmile","bom_r34_ne":"nmile","bom_r34_se":"nmile","bom_r34_sw":"nmile","bom_r34_nw":"nmile",
        "bom_r50_ne":"nmile","bom_r50_se":"nmile","bom_r50_sw":"nmile","bom_r50_nw":"nmile","bom_r64_ne":"nmile",
        "bom_r64_se":"nmile","bom_r64_sw":"nmile","bom_r64_nw":"nmile","bom_roci":"nmile","bom_poci":"mb",
        "bom_eye":"nmile","bom_pos_method":" ","bom_pres_method":" ","nadi_lat":"degrees_north",
        "nadi_lon":"degrees_east","nadi_cat":"1","nadi_wind":"kts","nadi_pres":"mb",
        "wellington_lat":"degrees_north","wellington_lon":"degrees_east","wellington_wind":"kts",
        "wellington_pres":"mb","ds824_lat":"degrees_north","ds824_lon":"degrees_east","ds824_stage":" ",
        "ds824_wind":"kts","ds824_pres":"mb","td9636_lat":"degrees_north","td9636_lon":"degrees_east",
        "td9636_stage":" ","td9636_wind":"kts","td9636_pres":"mb","td9635_lat":"degrees_north",
        "td9635_lon":"degrees_east","td9635_wind":"kts","td9635_pres":"mb","td9635_roci":"nmile",
        "neumann_lat":"degrees_north","neumann_lon":"degrees_east","neumann_class":" ","neumann_wind":"kts",
        "neumann_pres":"mb","mlc_lat":"degrees_north","mlc_lon":"degrees_east","mlc_class":" ","mlc_wind":"kts",
        "mlc_pres":"mb","usa_gust":"kts","bom_gust":"kts","bom_gust_per":"second","reunion_gust":"kts",
        "reunion_gust_per":"second","usa_seahgt":"ft","usa_searad_ne":"nmile","usa_searad_se":"nmile",
        "usa_searad_sw":"nmile","usa_searad_nw":"nmile","speed":"kts","dir":"°"};

    /*
    TODO:
     Take in list of all possible variable keys (second group) so they are always evenly spaced
     */
    static generateIbtracsStatisticItems = (ibtracObject) => {
        const firstItems = [];
        const excludeList = ["sid","season","number","basin","subbasin","name","nature","landfall", "wind", "pres",
            "gust", "lon", "lat", "dist2land", "_id", "imageIds", "iflag", "date", "storm_dir", "storm_dir", "track_type"];
        const firstGroup = ["_wind", "_gust", "_pres", "lat", "lon", "storm_speed", "storm_dir","dist2land"];
        const firstGroupLabels = ["Wind", "Gust", "Pressure", "Latitude", "Longitude", "Storm Speed", "Storm Direction","Distance to Land"];
        firstGroup.forEach((term, i) => {
            const item = {};
            const foundKey = Object.keys(ibtracObject).find(key => key.includes(term));
            let foundValue = ibtracObject[foundKey];
            if (term === 'lon' || term === 'lat') {
                foundValue = (Math.round(parseFloat(foundValue) * 10) / 10).toFixed(1);
            }
            firstItems.push({
                key: foundKey,
                label: firstGroupLabels[i],
                value: foundKey ? `${foundValue} ${Utils.IBTRACS_KEYS[foundKey]}` : "-",
                text: true
            })
        });
        const secondItems = [];
        Object.keys(ibtracObject).forEach((key,i) => {
            const keyUpper = key.toUpperCase();
            if (excludeList.findIndex(excluded => key.includes(excluded)) < 0) {
                secondItems.push({
                    key: key,
                    label: key,
                    value: `${ibtracObject[key]} ${Utils.IBTRACS_KEYS[key]}`,
                    text: true
                })
            }
        });
        return (
            <div>
                <Statistic.Group items={firstItems} widths={firstItems.length}/>
                <Statistic.Group items={secondItems} />
            </div>
        )
    };

    static displayMinMaxValue = (ibtracOptions, key, min, defaultVal) => (
        ibtracOptions[key] ? ibtracOptions[key][min ? "min" : "max"][key] || defaultVal : defaultVal
    );
    
    static searchForTerm = (object, term) => (object[Object.keys(object).find(key => key.includes(term))])
};