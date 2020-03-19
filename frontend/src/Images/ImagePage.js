import React, { Component } from "react";
import {
    Container,
    Dropdown,
    Form,
    Loader,
    Image,
    Placeholder
} from 'semantic-ui-react';

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
        imageElementsStatus: [],
        earliestDate: new Date(),
        latestDate: new Date(),
        beginDate: new Date(),
        endDate: new Date(),
        selectedImage: (<div></div>),
        requestTime: 0
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

    inputChange = async (evt, {id , value}) => {
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
        // TODO: If removing value requery for that key (ie don't include it in generateOptions)
        const seasonQuery = {"$or": this.state.seasonSelections.map(season => {return {"season":season}})};
        const basinQuery = {"$or": this.state.basinSelections.map(basin => {return {"basin":basin}})};
        const storm_nameQuery = {"$or": this.state.storm_nameSelections.map(storm_name => {return {"storm_name":storm_name}})};
        const typeQuery = {"$or": this.state.typeSelections.map(type => {return {"type":type}})};
        const sensorQuery = {"$or": this.state.sensorSelections.map(sensor => {return {"sensor":sensor}})};
        const resolutionQuery = {"$or": this.state.resolutionSelections.map(resolution => {return {"resolution":resolution}})};
        const satelliteQuery = {"$or": this.state.satelliteSelections.map(satellite => {return {"satellite":satellite}})};
        const extensionQuery = {"$or": this.state.extensionSelections.map(extension => {return {"extension":extension}})};
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
        const imageElementsStatus = imageItems.map(item => false);
        await this.setState({ imageElementsStatus });
        const imageElements = imageItems.map((imageItem, index) => {
            return (<Image
                style={{ display: "none" }}
                src={imageItem.image_url}
                alt={imageItem.image}
                key={imageItem.image_url}
                onLoad={(index) => {
                this.setState(prevState => ({
                    imageElementsStatus: [
                      ...prevState.imageElementsStatus.slice(0, index),
                      true,
                      ...prevState.imageElementsStatus.slice(index + 1)
                ]}))}}
            />);
        });
        this.setState({ imageElements });
    };

    generateOptions = async (response) => {
        if (response.requestTime > this.state.requestTime) {
            this.setState({ requestTime: response.requestTime });
            const newOptions = response.options;
            const allOptions = JSON.parse(JSON.stringify(this.state.allImageOptions));
            const imageOptions = JSON.parse(JSON.stringify(this.state.imageOptions));
            Object.keys(newOptions).forEach(key => {
                const options = allOptions[key].map(value => {
                    const group = newOptions[key].includes(value);
                    return {
                        key: value,
                        text: value,
                        value: value,
                        icon: group ? "plus" : "minus",
                    }
                }).sort((a, b) => {
                    if (a.icon === "plus" && b.icon !== "plus") {
                        return -1;
                    }
                    if (a.icon !== "plus" && b.icon === "plus") {
                        return 1;
                    } else {
                        if (a.value > b.value) {
                            return 1;
                        }
                        if (a.value < b.value) {
                            return -1;
                        }
                        return 0;
                    }
                });
                Object.assign(imageOptions, {[key]: options});
            });
            this.setState({
                imageOptions,
                earliestDate: new Date(response.beginDate),
                latestDate: new Date(response.endDate)
            });
        } else {
            console.log(`Bad Request Resposne:${response.requestTime} State:${this.state.requestTime}`)
        }
    };

    handleDateChange = () => {
        // TODO: add this to query
        return;
    };

    render () {
        return (
            <Container>
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
                                options={this.state.imageOptions.season}
                                onChange={this.inputChange}
                            />
                        </Form.Field>
                        <Form.Field>
                            <label>Season</label>
                            <Form.Dropdown
                                fluid
                                id="basin"
                                placeholder='ATL'
                                multiple
                                search
                                options={this.state.imageOptions.basin}
                                onChange={this.inputChange}
                            />
                        </Form.Field>
                        <Form.Field>
                            <label>Storm Name</label>
                            <Form.Dropdown
                                fluid
                                id="storm_name"
                                placeholder="Isabel"
                                multiple
                                search
                                options={this.state.imageOptions.storm_name}
                                onChange={this.inputChange}
                            />
                        </Form.Field>
                        <Form.Field>
                            <label>Type</label>
                            <Form.Dropdown
                                fluid
                                id="type"
                                placeholder="vis"
                                multiple
                                search
                                options={this.state.imageOptions.type}
                                onChange={this.inputChange}
                            />
                        </Form.Field>
                    </Form.Group>
                    <Form.Group widths={"equal"}>
                        <Form.Field>
                            <label>Sensor</label>
                            <Form.Dropdown
                                fluid
                                id="sensor"
                                placeholder="goesvis"
                                multiple
                                search
                                options={this.state.imageOptions.sensor}
                                onChange={this.inputChange}
                            />
                        </Form.Field>
                        <Form.Field>
                            <label>Resolution</label>
                            <Form.Dropdown
                                fluid
                                id="resolution"
                                placeholder="1km"
                                multiple
                                search
                                options={this.state.imageOptions.resolution}
                                onChange={this.inputChange}
                            />
                        </Form.Field>
                        <Form.Field>
                            <label>Satellite</label>
                            <Form.Dropdown
                                fluid
                                id="satellite"
                                placeholder="goes15"
                                multiple
                                search
                                options={this.state.imageOptions.satellite}
                                onChange={this.inputChange}
                            />
                        </Form.Field>
                        <Form.Field>
                            <label>Extension</label>
                            <Form.Dropdown
                                fluid
                                id="extension"
                                placeholder="jpg"
                                multiple
                                search
                                options={this.state.imageOptions.extension}
                                onChange={this.inputChange}
                            />
                        </Form.Field>
                    </Form.Group>
                    <Form.Group widths={"equal"}>
                        <Form.Field>
                            <label>Image Count</label>
                            {this.state.count !== -1 ? this.state.count : "Loading"}
                        </Form.Field>
                        <Form.Field>
                            <label>Query:</label>
                            {JSON.stringify(this.state.query)}
                        </Form.Field>
                    </Form.Group>
                    <Form.Button onClick={this.fetchQuery}>Get Images</Form.Button>
                </Form>
                <Container>
                    {this.state.imageElements}
                    {this.state.imageElements.length > 0 ?
                        <DataViewer
                            imageItems={this.state.imageItems}
                            imageElementsStatus={this.state.imageElementsStatus}
                        />
                     : ""}
                </Container>
            </Container>
        );
    }
}

class DataViewer extends Component {

    state = {
        imageIndex: 0
    };

    selectImage = (e, { value }) => {
        const imageIndex = parseInt(value);
        this.setState({imageIndex});
    };

    render() {
        return (
            <Container>
                {this.props.imageElementsStatus[this.state.imageIndex] ?
                    <Image
                        src={this.props.imageItems[this.state.imageIndex].image_url}
                        alt={this.props.imageItems[this.state.imageIndex].image}
                    />
                : <Placeholder>
                    <Placeholder.Image />
                  </Placeholder>}
                  <span>{this.props.imageItems[this.state.imageIndex].date}</span>
                <Form.Input
                    fluid
                    label=''
                    min={0}
                    max={this.props.imageItems.length-1}
                    name=''
                    onChange={this.selectImage}
                    step={1}
                    type='range'
                    value={this.state.imageIndex}
                />
            </Container>
        );
    }
}

export default ImagePage;