import React, {Component} from "react";
import {MenuHeader} from "../Common/CommonComponents";
import {IbtracPage} from './IbtracPage';
import ReactMapGL from "react-map-gl";

class IbtracHandler extends Component {
    API_GATEWAY_ENDPOINT = "http://192.168.0.184:5000";
    //API_GATEWAY_ENDPOINT = "http://127.0.0.1:5000/";

    dropdownIds = ["season", "basin", "subbasin", "name"];

    state = {
        viewport: {
            height: "100vh",
            width: "100vw",
            location: [48.6908333333, 9.14055555556],
            zoom: 6,
        },
        allIbtracOptions: {
            season: [],
            basin: [],
            subbasin: [],
            name: []
        },
        ibtracOptions: {
            season: [],
            basin: [],
            subbasin: [],
            name: []
        },
        selections: {
            season: [],
            basin: [],
            subbasin: [],
            name: []
        },
        query: "",
        requestTime: 0
    };

    componentDidMount = async () => {
        const response = await this.fetchOptions({}, []);
        await this.setState({
            allIbtracOptions: response.options,
            beginDate: new Date(response.beginDate),
            endDate: new Date(response.endDate)
        });
        this.generateOptions(response);
        // this.fetchIbtracCount(query);
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
        return fetch(`${this.API_GATEWAY_ENDPOINT}/ibtracs/options`, {
            method: "POST",
            body: JSON.stringify(request),
            mode: "cors",
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        }).then((response) => {
            return response.json();
        }).then((data) => {
            this.setState({ loadingOptions: false });
            return data;
        });
    };

    handleInputChange = async (evt, {name, id, value}) => {
        console.log(name);
        console.log(id);
        console.log(value);
        // not date change
        let removing = true;
        if (id) {
            removing = this.state.selections[id].length > value.length;
            await this.setState(prevState => ({
                selections: Object.assign(prevState.selections, { [id]: value })
            }));
        }
        // date change
        else if (name) {
            if (value) {
                await this.setState({ [name]: value });
            }
            else {
                if (name === "startTime") {
                    await this.setState({ [name]: "1997-06-20 09:31" });
                }
                if (name === "endTime") {
                    await this.setState({ [name]: "2019-12-30 12:40" });
                }
            }
        }
        const keys = removing ? [] : [id];
        await this.generateQuery();
        this.generateOptions(await this.fetchOptions(this.state.query, keys));
        //this.fetchRecordCount(query);
        //this.generateOptions(await this.fetchOptions(query, keys));
    };

    generateQuery = () => {
        const selections = Object.assign({}, this.state.selections);
        const queryList = [];
        Object.keys(selections).forEach(key => {
            if (key.includes("max") || key.includes("min")) {
                if (selections[key]) {
                    const actualKey = key.split("_")[1];
                    if (key.includes("max")) {
                        queryList.push({[actualKey]: {"$lte": selections[key]}})
                    } else {
                        queryList.push({[actualKey]: {"$gte": selections[key]}})
                    }
                }
            } else if (selections[key].length > 0) {
                queryList.push({ [key]: selections[key] });
            }
        });
        this.setState({query: JSON.stringify({ "$and": queryList })})
    };

    generateOptions = async (response) => {
        if (response.requestTime > this.state.requestTime) {
            this.setState({ requestTime: response.requestTime });
            const newOptions = response.options;
            const allOptions = JSON.parse(JSON.stringify(this.state.allIbtracOptions));
            const ibtracOptions = JSON.parse(JSON.stringify(this.state.ibtracOptions));
            this.dropdownIds.forEach(key => {
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
                Object.assign(ibtracOptions, {[key]: options});
            });
            this.setState({
                ibtracOptions,
                beginDate: response.beginDate,
                endDate: response.endDate,
                startTime: response.beginDate,
                endTime: response.endDate
            });
        } else {
            console.log(`Bad Request Resposne:${response.requestTime} State:${this.state.requestTime}`)
        }
    };

    onViewPortChange = (viewport) => {
        const {width, height, ...etc} = viewport;
        this.setState({viewport: etc});
    };

    render () {
        return (
            <div>
                <MenuHeader
                    menuItems={[]}
                />
                <IbtracPage
                    points={[[90,90],[0,0]]}
                    viewport={this.state.viewport}
                    onViewPortChange={this.onViewPortChange}
                    ibtracOptions={this.state.ibtracOptions}
                    handleInputChange={this.handleInputChange}
                />
            </div>
        );
    }
}

export default IbtracHandler;