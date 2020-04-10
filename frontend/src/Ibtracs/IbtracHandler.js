import React, {Component} from "react";
import {MenuHeader} from "../Common/CommonComponents";
import {IbtracPage} from './IbtracPage';
import ReactMapGL from "react-map-gl";

class IbtracHandler extends Component {
    API_GATEWAY_ENDPOINT = "http://192.168.0.184:5000";
    //API_GATEWAY_ENDPOINT = "http://127.0.0.1:5000/";

    state = {
        viewport: {
            height: "100vh",
            width: "100vw",
            location: [48.6908333333, 9.14055555556],
            zoom: 6,
        },
        ibtracOptions: {
            season: [],
            basin: [],
            subbasin: [],
            name: []
        },
        selections: {},
        query: ""
    };

    componentDidMount = async () => {
        console.log(this.fetchOptions({}, []));
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
        this.generateQuery();
        //this.fetchRecordCount(query);
        //this.generateOptions(await this.fetchOptions(query, keys));
    };

    generateQuery = () => {
        const selections = Object.assign({}, this.state.selections);
        const queryList = [];
        Object.keys(selections).forEach(key => {
            if (key.includes("max") || key.includes("min")) {
                if (key.includes("max")) {
                    queryList.push({ [key.split("_")[1]]: { "$lte": selections[key] } })
                } else {
                    queryList.push({ [key.split("_")[1]]: { "$gte": selections[key] } })
                }
            } else {
                queryList.push({ key: selections[key] });
            }
        });
        this.setState({query: JSON.stringify({ "$and": queryList })})
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