import React, {Component} from "react";
import {fetchPerson, getCertainNumberOfConnections} from "./RoyalTreeUtils";

class TestPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            data: {}
        };
    }
    async componentDidMount() {
        const person = getCertainNumberOfConnections( "Q3044", 2, 2);
        this.setState({data: person });
    }

    render() {
        return (<pre>{JSON.stringify(this.state.data, null, 2)}</pre>)
    }
}

export default TestPage;