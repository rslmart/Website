import React, { Component } from "react";
import TextField from "@material-ui/core/TextField";
import Button from '@material-ui/core/Button';
import CircularProgress from '@material-ui/core/CircularProgress';
import Autocomplete from "@material-ui/lab/Autocomplete";
import Slider from '@material-ui/core/Slider';
import 'date-fns';
import Grid from '@material-ui/core/Grid';
import DateFnsUtils from '@date-io/date-fns';
import {
  MuiPickersUtilsProvider,
  KeyboardTimePicker,
  KeyboardDatePicker,
} from '@material-ui/pickers';
import Container from '@material-ui/core/Container';
import Paper from '@material-ui/core/Paper';
import Card from '@material-ui/core/Card';

class ImagePage extends Component {
    API_GATEWAY_ENDPOINT = "http://127.0.0.1:5000";

    keys = ['season', 'basin', 'storm_number', 'storm_agency', 'storm_name', 'type', 'sensor', 'resolution',
        'image_url', 'year', 'month', 'day', 'hour', 'minute', 'second', 'satellite', 'extension'];

    seasonsOptions = Array.from({length: 2020-1997}, (v, k) => k+1997);

    state = {
        loadingOptions: false,
        seasonSelections: [],
        basinSelections: [],
        storm_nameSelections: [],
        typeSelections: [],
        sensorSelections: [],
        resolutionSelections: [],
        satelliteSelections: [],
        extensionSelections: [],
        allImageOptions: {
            season: [],
            basin: [],
            storm_name: [],
            type: [],
            sensor: [],
            resolution: [],
            satellite: [],
            extension: []
        },
        imageOptions: {
            season: [],
            basin: [],
            storm_name: [],
            type: [],
            sensor: [],
            resolution: [],
            satellite: [],
            extension: []
        },
        query: {},
        count: -1,
        imageItems: [],
        imageIndex: 0,
        imageElements: [],
        earliestDate: new Date(),
        latestDate: new Date(),
        beginDate: new Date(),
        endDate: new Date()
    };

    componentDidMount = async () => {
        this.fetchImageCount({});
        const response = await this.fetchOptions({}, []);
        this.setState({
            allImageOptions: response.options,
            beginDate: new Date(response.beginDate),
            endDate: new Date(response.endDate)
        });
        this.generateOptions(response);
    };

    inputChange = async (evt, value, id) => {
        console.log(value);
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
        const seasonQuery = {"$or": this.state.seasonSelections.map(season => {return {"season":season.label}})};
        const basinQuery = {"$or": this.state.basinSelections.map(basin => {return {"basin":basin.label}})};
        const storm_nameQuery = {"$or": this.state.storm_nameSelections.map(storm_name => {return {"storm_name":storm_name.label}})};
        const typeQuery = {"$or": this.state.typeSelections.map(type => {return {"type":type.label}})};
        const sensorQuery = {"$or": this.state.sensorSelections.map(sensor => {return {"sensor":sensor.label}})};
        const resolutionQuery = {"$or": this.state.resolutionSelections.map(resolution => {return {"resolution":resolution.label}})};
        const satelliteQuery = {"$or": this.state.satelliteSelections.map(satellite => {return {"satellite":satellite.label}})};
        const extensionQuery = {"$or": this.state.extensionSelections.map(extension => {return {"extension":extension.label}})};
        const queryList = [seasonQuery, basinQuery, storm_nameQuery, typeQuery, sensorQuery, resolutionQuery,
            satelliteQuery, extensionQuery].filter(query => query["$or"].length > 0);
        if (queryList.length > 0) {
            const query = {"$and": queryList};
            this.fetchImageCount(query);
            this.setState({ query });
            this.generateOptions(await this.fetchOptions(query, [id]));
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
        this.setState({ loadingOptions: true });
        console.log(query);
        const request = {"query": query, "keys": keys};
        console.log(request);
        return fetch(`${this.API_GATEWAY_ENDPOINT}/images/options`, {
            method: "POST",
            body: JSON.stringify(request),
            headers: {
                "Content-Type": "application/json"
            }
        }).then((response) => {
            return response.json();
        }).then((data) => {
            this.setState({ loadingOptions: false });
            return data;
        });
    };

    /**
     * Call this when we finally want to search for images
     * @param query
     * @returns {Promise<void>}
     */
    fetchQuery = async () => {
        fetch(`${this.API_GATEWAY_ENDPOINT}/images/query`, {
            method: "POST",
            body: JSON.stringify({"query": this.state.query}),
            headers: {
                "Content-Type": "application/json"
            }
        }).then((response) => {
            return response.json();
        }).then((data) => {
            console.log(data);
            this.setState({ imageItems: data.imageItems, imageIndex: 0 });
            this.fetchImages(data.imageItems);
        });
    };

    fetchImages = async (imageItems) => {
        const imageElements = imageItems.map(imageItem => (<img src={imageItem.image_url}/>))
        this.setState({ imageElements });
    };

    generateOptions = async (response) => {
        const newOptions = response.options;
        const allOptions = JSON.parse(JSON.stringify(this.state.allImageOptions));
        const imageOptions = JSON.parse(JSON.stringify(this.state.imageOptions));
        Object.keys(newOptions).forEach(key => {
            const options = allOptions[key].map(value => {
                return {
                    label: value,
                    grouping: newOptions[key].includes(value) ? "In Selection" : "Out of Selection"
                }
            }).sort((a,b) => {
                if (a.grouping > b.grouping) {
                    return 1;
                }
                if (a.grouping < b.grouping) {
                    return -1;
                } else {
                    if (a.value > b.value) {
                        return 1;
                    }
                    if (a.value < b.value) {
                        return -1;
                    }
                    return 0;
                }
                return 0;
            });
            Object.assign(imageOptions, { [key]: options });
        });
        this.setState({
            imageOptions,
            earliestDate: new Date(response.beginDate),
            latestDate: new Date(response.endDate)
        });
    };

    handleDateChange = () => {
        // TODO: add this to query
        return;
    };

    render () {
        return (
            <Paper>
                <Card>
                <Container>
                    <Grid
                      container
                      direction="row"
                      justify="center"
                      alignItems="center"
                      spacing={3}
                    >
                    <Grid item xs={12} sm={3}>
                        <Autocomplete
                            multiple
                            id="season"
                            options={this.state.imageOptions.season}
                            groupBy={option => option.grouping}
                            getOptionLabel={option => option.label}
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
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <Autocomplete
                            multiple
                            id="basin"
                            options={this.state.imageOptions.basin}
                            groupBy={option => option.grouping}
                            getOptionLabel={option => option.label}
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
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <Autocomplete
                            multiple
                            id="storm_name"
                            options={this.state.imageOptions.storm_name}
                            groupBy={option => option.grouping}
                            getOptionLabel={option => option.label}
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
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <Autocomplete
                            multiple
                            id="type"
                            options={this.state.imageOptions.type}
                            groupBy={option => option.grouping}
                            getOptionLabel={option => option.label}
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
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <Autocomplete
                            multiple
                            id="sensor"
                            options={this.state.imageOptions.sensor}
                            groupBy={option => option.grouping}
                            getOptionLabel={option => option.label}
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
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <Autocomplete
                            multiple
                            id="resolution"
                            options={this.state.imageOptions.resolution}
                            groupBy={option => option.grouping}
                            getOptionLabel={option => option.label}
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
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <Autocomplete
                            multiple
                            id="satellite"
                            options={this.state.imageOptions.satellite}
                            groupBy={option => option.grouping}
                            getOptionLabel={option => option.label}
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
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <Autocomplete
                            multiple
                            id="extension"
                            options={this.state.imageOptions.extension}
                            groupBy={option => option.grouping}
                            getOptionLabel={option => option.label}
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
                    </Grid>
                        <Grid container item xs={12} spacing={3}>
                            <MuiPickersUtilsProvider utils={DateFnsUtils}>
                                <Grid item xs={3}>
                                    <KeyboardDatePicker
                                      disableToolbar
                                      variant="inline"
                                      format="MM/dd/yyyy"
                                      margin="normal"
                                      id="startDate"
                                      label="Pick start date"
                                      value={this.state.beginDate}
                                      onChange={this.handleDateChange}
                                      KeyboardButtonProps={{
                                        'aria-label': 'change date',
                                      }}
                                    />
                                </Grid>
                                <Grid item xs={3}>
                                    <KeyboardTimePicker
                                      margin="normal"
                                      id="startTime"
                                      label="Pick start time"
                                      value={this.state.beginDate}
                                      onChange={this.handleDateChange}
                                      KeyboardButtonProps={{
                                        'aria-label': 'change time',
                                      }}
                                    />
                                </Grid>
                                <Grid item xs={3}>
                                    <KeyboardDatePicker
                                      disableToolbar
                                      variant="inline"
                                      format="MM/dd/yyyy"
                                      margin="normal"
                                      id="endDate"
                                      label="Pick end date"
                                      value={this.state.endDate}
                                      onChange={this.handleDateChange}
                                      KeyboardButtonProps={{
                                        'aria-label': 'change date',
                                      }}
                                    />
                                </Grid>
                                <Grid item xs={3}>
                                    <KeyboardTimePicker
                                      margin="normal"
                                      id="endTime"
                                      label="Pick end time"
                                      value={this.state.endDate}
                                      onChange={this.handleDateChange}
                                      KeyboardButtonProps={{
                                        'aria-label': 'change time',
                                      }}
                                    />
                                </Grid>
                            </MuiPickersUtilsProvider>
                        </Grid>
                    <Grid item xs={12} sm={4}>
                        <span>Count: {this.state.count !== -1 ? this.state.count : <CircularProgress/>}</span>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <span>Query: {JSON.stringify(this.state.query)}</span>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Button variant="contained" onClick={this.fetchQuery}>Get Images</Button>
                    </Grid>
                </Grid>
            </Container>
            </Card>

            {this.state.loadingOptions ? <CircularProgress/> : <span></span>}

            {this.state.imageItems.length > 0 ?
            <Card>
                <Container>
                    <div style={{ display: "none" }}>
                        {this.state.imageElements}
                    </div>
                        {this.state.imageElements[this.state.imageIndex]}
                    <Slider
                        defaultValue={0}
                        aria-labelledby="discrete-slider-small-steps"
                        step={1}
                        marks
                        min={0}
                        max={this.state.imageItems.length - 1}
                        valueLabelDisplay="auto"
                        onChange={(evt, value) => {
                            this.setState({ imageIndex: value})
                        }}
                      />
                </Container>
            </Card> : ""}
        </Paper>);
    }
}

export default ImagePage;