import React, { Component } from "react";
import TextField from "@material-ui/core/TextField";
import Autocomplete from "@material-ui/lab/Autocomplete";

class ImagePage extends Component {
    keys = ['season', 'basin', 'storm_number', 'storm_agency', 'storm_name', 'type', 'sensor', 'resolution',
        'image_url', 'year', 'month', 'day', 'hour', 'minute', 'second', 'satellite', 'extension'];

    imageOptions = {
        seasons: Array.from({length: 2020-1997}, (v, k) => k+1997),
        basins: ['ATL', 'CPAC', 'EPAC', 'IO', 'SHEM', 'WPAC']
    };

    state = {
        seasonSelections: [],
        basinSelections: [],
        stormNameOptions: [],
        typeOptions: [],
        sensorOptions: [],
        resolutionOptions: [],
        satelliteOptions: []
    };

    getOptions = async (query) => {
        
    };

    /*
    {
        "$and": [
            {
                "$or": [
                    {"season":1997}, {"season":1998}]
            },
            {
                "$or": [
                    {"basin":"ATL"}, {"basin":"WPAC"}]
            }
        ]
    }
     */

    inputChange = async (evt, value, id) => {
        switch (id) {
            case "season":
                await this.setState({ seasonSelections: value});
                break;
            case "basin":
                await this.setState({ basinSelections: value});
                break;
            default:
                break;
        }

        const seasonQuery = {"$or": this.state.seasonSelections.map(season => {return {"season":season}})};
        const basinQuery = {"$or": this.state.basinSelections.map(basin => {return {"basin":basin}})};
        const query = {"$and": [seasonQuery, basinQuery]};
        console.log(JSON.stringify(query));
    };

    render () {
        return (<div>
            <Autocomplete
                multiple
                id="season"
                options={this.imageOptions.seasons}
                getOptionLabel={option => option}
                style={{width: 300}}
                renderInput={params => (
                    <TextField
                        {...params}
                        variant="standard"
                        label="Season"
                        placeholder="2001"
                        fullWidth
                    />
                )}
                onChange={(evt, value) => this.inputChange(evt, value, "season")}
            />
        </div>);
    }
}

export default ImagePage;