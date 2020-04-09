import React, {Component} from "react";
import {MenuHeader} from "../Common/CommonComponents";
import {IbtracPage} from './IbtracPage';

class IbtracHandler extends Component {
    //API_GATEWAY_ENDPOINT = "http://192.168.0.184:5000";
    API_GATEWAY_ENDPOINT = "http://127.0.0.1:5000/";
    state = {
        viewport: {
            latitude: 37.7577,
            longitude: -122.4376,
            zoom: 8
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
        // TODO: If removing value requery for that key (ie don't include it in generateOptions)
        const queryList = Object.keys(this.state.selections).map(key => (
            {"$or": this.state.selections[key].map(val => ({ [key]:val }))}
        )).filter(query => query["$or"].length > 0);

        // TODO: Only get options for dropdowns to the right
        // TODO: Potentially maintain mapping (at least for seasons/storms?)
        const query = {
            "$and": queryList,
            "startTime": this.state.startTime,
            "endTime": this.state.endTime
        };
        const keys = removing ? [] : [id];
        this.setState({query});
        this.fetchRecordCount(query);
        this.generateOptions(await this.fetchOptions(query, keys));
    };

    generateQuery = () => {
        const selections = Object.assign({}, this.state.selections);
        const queryList = [];
        Object.keys(selections).forEach(key => {
            if (key.includes("max") || key.includes("min")) {
                if (key.includes("max")) {

                } else {

                }
            } else {
                queryList.push({ key: selections[key] });
            }
        });
        this.setState({query: JSON.stringify({ "$and": queryList })})
    };

    onViewPortChange = (viewport) => {
        this.setState({viewport})
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