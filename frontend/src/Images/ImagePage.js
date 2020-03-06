import React, { Component } from "react";
import TextField from "@material-ui/core/TextField";
import CircularProgress from '@material-ui/core/CircularProgress';
import Autocomplete from "@material-ui/lab/Autocomplete";

class ImagePage extends Component {
    API_GATEWAY_ENDPOINT = "http://127.0.0.1:5000";

    keys = ['season', 'basin', 'storm_number', 'storm_agency', 'storm_name', 'type', 'sensor', 'resolution',
        'image_url', 'year', 'month', 'day', 'hour', 'minute', 'second', 'satellite', 'extension'];

    seasonsOptions = Array.from({length: 2020-1997}, (v, k) => k+1997);

    state = {
        seasonSelections: [],
        basinSelections: [],
        storm_nameSelections: [],
        typeSelections: [],
        sensorSelections: [],
        resolutionSelections: [],
        satelliteSelections: [],
        extensionSelections: [],
        allImageOptions: {
            basin: [],
            storm_name: [],
            type: [],
            sensor: [],
            resolution: [],
            satellite: [],
            extension: []
        },
        imageOptions: {
            basin: [],
            storm_name: [],
            type: [],
            sensor: [],
            resolution: [],
            satellite: [],
            extension: []
        },
        count: -1
    };

    componentDidMount = async () => {
        this.fetchOptions({}, []);
        this.fetchImageCount({});
    };

    inputChange = async (evt, value, id) => {
        switch (id) {
            case "season":
                await this.setState({ seasonSelections: value});
                break;
            case "basin":
                await this.setState({ basinSelections: value});
                break;
            case "storm_name":
                await this.setState({ storm_nameSelections: value});
                break;
            case "type":
                await this.setState({ typeSelections: value});
                break;
            case "sensor":
                await this.setState({ sensorSelections: value});
                break;
            case "resolution":
                await this.setState({ resolutionSelections: value});
                break;
            case "satellite":
                await this.setState({ satelliteSelections: value});
                break;
            case "extension":
                await this.setState({ extensionSelections: value});
                break;
            default:
                break;
        }
        const seasonQuery = {"$or": this.state.seasonSelections.map(season => {return {"season":season}})};
        const basinQuery = {"$or": this.state.basinSelections.map(basin => {return {"basin":basin}})};
        const storm_nameQuery = {"$or": this.state.storm_nameSelections.map(storm_name => {return {"storm_name":storm_name}})};
        const typeQuery = {"$or": this.state.typeSelections.map(type => {return {"type":type}})};
        const sensorQuery = {"$or": this.state.sensorSelections.map(sensor => {return {"sensor":sensor}})};
        const resolutionQuery = {"$or": this.state.resolutionSelections.map(resolution => {return {"resolution":resolution}})};
        const satelliteQuery = {"$or": this.state.satelliteSelections.map(satellite => {return {"satellite":satellite}})};
        const extensionQuery = {"$or": this.state.extensionSelections.map(extension => {return {"extension":extension}})};
        const queryList = [seasonQuery, basinQuery, storm_nameQuery, typeQuery, sensorQuery, resolutionQuery,
            satelliteQuery, extensionQuery].filter(query => query["$or"].length > 0)
        if (queryList.length > 0) {
            const query = {"$and": queryList};
            console.log(JSON.stringify(query));
            this.fetchImageCount(query);
        } else {
            this.fetchImageCount({});
        }
    };

    /*
     * This function takes all of the key/value pairs of the "request" object and transforms them into url query
     * parameters. So if you get a request object that looks like:
     * { keyOne: valueOne, keyTwo: valueTwo },
     * It will then transform them into a string of the form:
     * keyOne=valueOne&keyTwo=valueTwo
     */
    getQueryParamsFromRequest = request => Object.keys(request).map(key => (`${key}=${request[key]}`)).join("&");

    fetchImageCount = async (query) => {
        this.setState({ count: -1});
        console.log(JSON.stringify(query));
                    fetch(`${this.API_GATEWAY_ENDPOINT}/images/imageCount`, {
            method: "POST",
            body: JSON.stringify(query),
            headers: {
                "Content-Type": "application/json"
            }
            }).then((response) => {
                return response.json();
            }).then((data) => {
                console.log(data);
                this.setState({ count: data.count});
            });
    };

    /**
     * This fetchs options based on what has been selected so far
     * @param query
     * @returns {Promise<void>}
     */
    fetchOptions = async (query, keys) => {
        console.log(query);
        const request = {"query": query, "keys": keys};
        console.log(request);
        fetch(`${this.API_GATEWAY_ENDPOINT}/images/options`, {
            method: "POST",
            body: JSON.stringify(request),
            headers: {
                "Content-Type": "application/json"
            }
        }).then((response) => {
            return response.json();
        }).then((data) => {
            this.setState({ imageOptions: Object.assign(this.state.imageOptions, data.options) });
            if (query === {}) {
                this.setState({ allImageOptions: data.options })
            }
        });
    };

    /**
     * Call this when we finally want to search for images
     * @param query
     * @returns {Promise<void>}
     */
    fetchQuery = async (query, limit) => {
        fetch(`${this.API_GATEWAY_ENDPOINT}/images/query`, {
            method: "POST",
            body: JSON.stringify({"query": query, "limit": limit}),
            headers: {
                "Content-Type": "application/json"
            }
        }).then((response) => {
            return response.json();
        }).then((data) => {
            console.log(data)
        });
    };

    render () {
        return (<div>
            <Autocomplete
                multiple
                id="season"
                options={this.seasonsOptions}
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
            <Autocomplete
                multiple
                id="basin"
                options={this.state.imageOptions.basin}
                getOptionLabel={option => option}
                style={{width: 300}}
                renderInput={params => (
                    <TextField
                        {...params}
                        variant="standard"
                        label="Basin"
                        placeholder="ATL"
                        fullWidth
                    />
                )}
                onChange={(evt, value) => this.inputChange(evt, value, "basin")}
            />
            <Autocomplete
                multiple
                id="storm_name"
                options={this.state.imageOptions.storm_name}
                getOptionLabel={option => option}
                style={{width: 300}}
                renderInput={params => (
                    <TextField
                        {...params}
                        variant="standard"
                        label="Storm Name"
                        placeholder="ISABEL"
                        fullWidth
                    />
                )}
                onChange={(evt, value) => this.inputChange(evt, value, "storm_name")}
            />
            <Autocomplete
                multiple
                id="type"
                options={this.state.imageOptions.type}
                groupBy={option => option.firstLetter}
                getOptionLabel={option => option}
                style={{width: 300}}
                renderInput={params => (
                    <TextField
                        {...params}
                        variant="standard"
                        label="Type"
                        placeholder=""
                        fullWidth
                    />
                )}
                onChange={(evt, value) => this.inputChange(evt, value, "type")}
            />
            <Autocomplete
                multiple
                id="sensor"
                options={this.state.imageOptions.sensor}
                getOptionLabel={option => option}
                style={{width: 300}}
                renderInput={params => (
                    <TextField
                        {...params}
                        variant="standard"
                        label="Sensor"
                        placeholder=""
                        fullWidth
                    />
                )}
                onChange={(evt, value) => this.inputChange(evt, value, "sensor")}
            />
            <Autocomplete
                multiple
                id="resolution"
                options={this.state.imageOptions.resolution}
                getOptionLabel={option => option}
                style={{width: 300}}
                renderInput={params => (
                    <TextField
                        {...params}
                        variant="standard"
                        label="Resolution"
                        placeholder=""
                        fullWidth
                    />
                )}
                onChange={(evt, value) => this.inputChange(evt, value, "resolution")}
            />
            <Autocomplete
                multiple
                id="satellite"
                options={this.state.imageOptions.satellite}
                getOptionLabel={option => option}
                style={{width: 300}}
                renderInput={params => (
                    <TextField
                        {...params}
                        variant="standard"
                        label="Satellite"
                        placeholder=""
                        fullWidth
                    />
                )}
                onChange={(evt, value) => this.inputChange(evt, value, "satellite")}
            />
            <Autocomplete
                multiple
                id="extension"
                options={this.state.imageOptions.extension}
                getOptionLabel={option => option}
                style={{width: 300}}
                renderInput={params => (
                    <TextField
                        {...params}
                        variant="standard"
                        label="Extension"
                        placeholder="jpg, png"
                        fullWidth
                    />
                )}
                onChange={(evt, value) => this.inputChange(evt, value, "extension")}
            />
            <span>Count {this.state.count !== -1 ? this.state.count : <CircularProgress/>}</span>
        </div>);
    }
}

export default ImagePage;