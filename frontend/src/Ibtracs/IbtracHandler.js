import React, {Component} from "react";
import {MenuHeader} from "../Common/CommonComponents";
import {IbtracPage} from './IbtracPage';
import ReactMapGL from "react-map-gl";

class IbtracHandler extends Component {
    API_GATEWAY_ENDPOINT = "http://192.168.0.184:5000";
    // API_GATEWAY_ENDPOINT = "http://127.0.0.1:5000/";

    dropdownIds = ["season", "basin", "subbasin", "name"];

    state = {
        loadingIbtracQuery: false,
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
        typingTimeout: {},
        query: {},
        requestTime: 0,
        ibtracItems: []
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

    handleDropdownChange = async (evt, {id, value}) => {
        console.log(id);
        console.log(value);
        let removing = true;
        if (id) {
            removing = this.state.selections[id].length > value.length;
            await this.setState(prevState => ({
                selections: Object.assign(prevState.selections, { [id]: value })
            }));
        }
        const keys = removing ? [] : [id];
        const query = this.generateQuery();
        this.setState({ query });
        this.generateOptions(await this.fetchOptions(query, keys));
        //this.fetchRecordCount(query);
        //this.generateOptions(await this.fetchOptions(query, keys));
    };

        // TODO: Need to wait until a user has stopped typing for min/max fields
    // TODO: Should probably also just separate the min/max fields from the dropdown functions
    handleInputChange = async (evt, {id, value}) => {
        console.log(id);
        console.log(value);
        const intValue = parseInt(value);
        await this.setState(prevState => ({
            selections: Object.assign(prevState.selections, { [id]: intValue })
        }));
        const keys = value.length === 0 ? [] : [id];
        const query = this.generateQuery();
        console.log(query);
        this.setState({ query });

        if (this.state.typingTimeout[id]) {
            clearTimeout(this.state.typingTimeout[id]);
        }

        const self = this;
        this.setState(prevState => ({
            typingTimeout: Object.assign(prevState.typingTimeout, { [id]: setTimeout(
                 async () => {
                    self.generateOptions(await self.fetchOptions(query, keys));
                },
                1000
            )})
        }));

        //
        //this.fetchRecordCount(query);
        //this.generateOptions(await this.fetchOptions(query, keys));
    };

    generateQuery = () => {
        /*
        {"$and": [
                {
                    "$or": [
                        {
                            "basin":"ATL"
                        }
                    ]
                }
            ]
        }*/
        const selections = Object.assign({}, this.state.selections);
        const queryList = [];
        Object.keys(selections).forEach(key => {
            if (key.includes("max") || key.includes("min")) {
                if (selections[key]) {
                    const actualKey = key.split("_")[0];
                    if (key.includes("max")) {
                        queryList.push({[actualKey]: {"$lte": selections[key]}})
                    } else {
                        queryList.push({[actualKey]: {"$gte": selections[key]}})
                    }
                }
            } else if (selections[key].length > 0) {
                queryList.push({"$or": selections[key].map(selection => {return { [key]: selection }})});
            }
        });
        if (queryList.length > 0) {
            return { "$and": queryList }
        }
        return {};
    };

    generateOptions = async (response) => {
        if (response.requestTime > this.state.requestTime) {
            this.setState({ requestTime: response.requestTime });
            const newOptions = response.options;
            const allOptions = JSON.parse(JSON.stringify(this.state.allIbtracOptions));
            const ibtracOptions = JSON.parse(JSON.stringify(this.state.ibtracOptions));
            this.dropdownIds.forEach(key => {
                if (Object.keys(newOptions).includes(key)) {
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
                }
            });
            Object.keys(allOptions)
                .filter(key => !this.dropdownIds.includes(key))
                .forEach(key => Object.assign(ibtracOptions, {[key]: newOptions[key]}));
            console.log(ibtracOptions);
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

    /**
     * Call this when we finally want to search for ibtrac records
     * @param query
     * @returns {Promise<void>}
     */
    fetchQuery = async () => {
        let data = {};
        this.setState({ loadingIbtracQuery: true, ibtracItems: [] });
        await fetch(`${this.API_GATEWAY_ENDPOINT}/ibtracs/query`, {
            method: "POST",
            body: JSON.stringify({"query": this.state.query, "storm": false}),
            mode: "cors",
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        }).then((response) => {
            return response.json();
        }).then((responseJson) => {
            console.log(responseJson);
            data = responseJson;
        });
        console.log(data.ibtracItems);
        this.setState({ loadingIbtracQuery: false, ibtracItems: data.ibtracItems });
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
                    loadingIbtracQuery={this.state.loadingIbtracQuery}
                    ibtracItems={this.state.ibtracItems}
                    fetchQuery={this.fetchQuery}
                    handleDropdownChange={this.handleDropdownChange}
                    handleInputChange={this.handleInputChange}
                />
            </div>
        );
    }
}

export default IbtracHandler;