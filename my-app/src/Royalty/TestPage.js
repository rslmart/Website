import React, {Component} from "react";
import {convertToChart, fetchPerson, getCertainNumberOfConnections} from "./RoyalTreeUtils";

class TestPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            data: {}
        };
    }
    async componentDidMount() {
        fetchPerson({}, {}, "Q160337").then(data => {
            console.log(data);
            this.setState({data });
        });
    }

    render() {
        return (<pre>{JSON.stringify(this.state.data, null, 2)}</pre>)
    }
}

export default TestPage;