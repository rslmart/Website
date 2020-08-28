import React, {Component} from "react";
import {MenuHeader} from "../Common/CommonComponents";
import {HurdatPage} from "./HurdatPage";
import {ScatterplotLayer} from "@deck.gl/layers";
import {HeatmapLayer, GridLayer} from "@deck.gl/aggregation-layers";
import {Container, Form, Grid, Input, Label, Card, List} from "semantic-ui-react";
import {WebMercatorViewport} from "@deck.gl/core";
import {FlyToInterpolator} from "deck.gl";
// 3rd-party easing functions
import "d3-ease";
import { range } from "lodash";
import {easeCubic} from "d3-ease";

class HurdatHandler extends Component {
    //API_GATEWAY_ENDPOINT = "http://192.168.0.184:5000";
    API_GATEWAY_ENDPOINT = "http://127.0.0.1:5000/";

    dropdownIds = ["season", "basin", "subbasin", "name"];

    state = {
        loadingHurdatQuery: false,
        viewState: {
            longitude: -74.006,
            latitude: 40.7128,
            zoom: 6
        },
        allHurdatOptions: {
        },
        hurdatOptions: {
            season: range(1851, 2019,).map(option => ({key: option, value: option, text: option})),
            name: ["ABBY", "ABLE", "AGNES", "ALBERTO", "ALEX", "ALFA", "ALICE", "ALICIA", "ALLEN", "ALLISON", "ALMA",
                "ALPHA", "AMELIA", "AMY", "ANA", "ANDREA", "ANDREW", "ANITA", "ANNA", "ARLENE", "ARTHUR", "AUDREY",
                "BABE", "BAKER", "BARBARA", "BARRY", "BECKY", "BELLE", "BERTHA", "BERYL", "BESS", "BETA", "BETH",
                "BETSY", "BETTY", "BEULAH", "BILL", "BLANCHE", "BOB", "BONNIE", "BRENDA", "BRET", "CAMILLE", "CANDICE",
                "CANDY", "CARLA", "CARMEN", "CAROL", "CAROLINE", "CARRIE", "CELIA", "CESAR", "CHANTAL", "CHARLEY",
                "CHARLIE", "CHLOE", "CHRIS", "CHRISTINE", "CINDY", "CLARA", "CLAUDETTE", "CLEO", "COLIN", "CONNIE",
                "CORA", "CRISTOBAL", "DAISY", "DANIELLE", "DANNY", "DAVID", "DAWN", "DEAN", "DEBBIE", "DEBBY", "DEBRA", "DELIA",
                "DELTA", "DENNIS", "DIANA", "DIANE", "DOG", "DOLLY", "DON", "DONNA", "DORA", "DORIA", "DORIAN", "DORIS", "DOROTHY",
                "DOTTIE", "EARL", "EASY", "EDITH", "EDNA", "EDOUARD", "EIGHT", "ELAINE", "ELENA", "ELEVEN", "ELLA", "ELLEN", "ELOISE",
                "EMILY", "EMMY", "EPSILON", "ERIKA", "ERIN", "ERNESTO", "ESTHER", "ETHEL", "EVE", "EVELYN", "FABIAN", "FAITH", "FAY",
                "FAYE", "FELICE", "FELIX", "FERN", "FERNAND", "FIFI", "FIFTEEN", "FIONA", "FIVE", "FLORA", "FLORENCE", "FLOSSIE",
                "FLOSSY", "FLOYD", "FOUR", "FOX", "FRAN", "FRANCELIA", "FRANCES", "FRANKLIN", "FRED", "FREDERIC", "FRIEDA", "GABRIELLE",
                "GAIL", "GAMMA", "GASTON", "GEORGE", "GEORGES", "GERDA", "GERT", "GERTRUDE", "GILBERT", "GILDA", "GINGER", "GINNY", "GLADYS",
                "GLORIA", "GONZALO", "GORDON", "GRACE", "GRACIE", "GRETA", "GUSTAV", "HALLIE", "HANNA", "HANNAH", "HARVEY", "HATTIE",
                "HAZEL", "HEIDI", "HELENA", "HELENE", "HENRI", "HERMINE", "HILDA", "HOLLY", "HOPE", "HORTENSE", "HOW", "HUGO", "HUMBERTO",
                "IAN", "IDA", "IGOR", "IKE", "ILSA", "IMELDA", "INEZ", "INGA", "INGRID", "IONE", "IRENE", "IRIS", "IRMA", "ISAAC", "ISABEL",
                "ISBELL", "ISIDORE", "ITEM", "IVAN", "JANET", "JANICE", "JEANNE", "JENNY", "JERRY", "JIG", "JOAN", "JOAQUIN", "JOSE",
                "JOSEPHINE", "JOYCE", "JUAN", "JUDITH", "JULIA", "JULIET", "KARA", "KAREN", "KARL", "KATE", "KATIA", "KATIE", "KATRINA",
                "KEITH", "KENDRA", "KING", "KIRK", "KLAUS", "KRISTY", "KYLE", "LARRY", "LAURA", "LAURIE", "LEE", "LENNY", "LESLIE", "LILI",
                "LISA", "LOIS", "LORENZO", "LOVE", "LUIS", "MARCO", "MARIA", "MARILYN", "MARTHA", "MATTHEW", "MELISSA", "MICHAEL", "MICHELLE",
                "MIKE", "MINDY", "MITCH", "NADINE", "NANA", "NATE", "NESTOR", "NICHOLAS", "NICOLE", "NINE", "NINETEEN", "NOEL", "ODETTE", "OLGA",
                "OMAR", "ONE", "OPAL", "OPHELIA", "OSCAR", "OTTO", "PABLO", "PALOMA", "PATTY", "PAULA", "PETER", "PHILIPPE", "RAFAEL", "REBEKAH",
                "RICHARD", "RINA", "RITA", "ROXANNE", "SANDY", "SEAN", "SEBASTIEN", "SHARY", "SIXTEEN", "STAN", "TAMMY", "TANYA", "TEN", "THREE",
                "TOMAS", "TONY", "TWENTY-TWO", "TWO", "UNNAMED", "VINCE", "WILMA", "ZETA"].map(option => ({key: option, value: option, text: option}))
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
        hurdatData: [],
        plotType: "scatter",
        dataLayer: null,
        dataLayerValues: {
            radiusPixels: 30,
            intensity: 1,
            threshold: .05,
            cellSize: 100000,
            elevationScale: 100,

        }
    };

    handleDropdownChange = async (evt, {id, value}) => {
        await this.setState(prevState => ({
            selections: Object.assign(prevState.selections, { [id]: value })
        }));
        const keys = this.state.selections[id].length > value.length ? [] : [id];
        const query = this.generateQuery();
        this.setState({ query });
        this.generateOptions(await this.fetchOptions(query, keys));
        //this.fetchRecordCount(query);
        //this.generateOptions(await this.fetchOptions(query, keys));
    };

    handleInputChange = async (evt, {id, value}) => {
        const intValue = parseInt(value);
        await this.setState(prevState => ({
            selections: Object.assign(prevState.selections, { [id]: intValue })
        }));
        const keys = value.length === 0 ? [] : [id];
        const query = this.generateQuery();
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

    /**
     * Call this when we finally want to search for hurdat records
     * @param query
     * @returns {Promise<void>}
     */
    fetchQuery = async () => {
        let data = {};
        this.setState({ loadingHurdatQuery: true, hurdatData: [] });
        await fetch(`${this.API_GATEWAY_ENDPOINT}/hurdat/query`, {
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
        await this.setState({
            loadingHurdatQuery: false,
            hurdatData: data.hurdatData
        });
    };

    renderTooltip = () => {
        const {hoveredObject, pointerX, pointerY} = this.state || {};
        return hoveredObject && (
            <Card style={{position: "absolute", zIndex: 1, pointerEvents: "none", left: pointerX, top: pointerY}}>
                <Card.Content>
                  <Card.Header>{hoveredObject.name}</Card.Header>
                  <Card.Meta>
                    <span className="date">{hoveredObject.date}</span>
                  </Card.Meta>
                  <Card.Description>
                      <List>
                          <List.Item>Wind: {hoveredObject.wind || "-"}</List.Item>
                          <List.Item>Pressure: {hoveredObject.pres || "-"}</List.Item>
                          <List.Item>Gust: {hoveredObject.gust || "-"}</List.Item>
                      </List>
                  </Card.Description>
                </Card.Content>
            </Card>
        );
    };

    onViewStateChange = ({viewState}) => {
        const {width, height, ...etc} = viewState;
        this.setState({viewState: etc});
    };

    render () {
        return (
            <HurdatPage
                viewState={this.state.viewState}
                onViewStateChange={this.onViewStateChange}
                hurdatOptions={this.state.hurdatOptions}
                loadingHurdatQuery={this.state.loadingHurdatQuery}
                hurdatData={this.state.hurdatData}
                dataLayer={this.state.dataLayer}
                fetchQuery={this.fetchQuery}
                query={this.state.query}
                plotType={this.state.plotType}
                dataLayerValues={this.state.dataLayerValues}
                handleDateSliderChange={this.handleDateSliderChange}
                handleDropdownChange={this.handleDropdownChange}
                handleInputChange={this.handleInputChange}
                handlePlotTypeChange={this.handlePlotTypeChange}
                handleDataLayerValueChange={this.handleDataLayerValueChange}
                renderTooltip={this.renderTooltip()}
            />
        );
    }
}

export default HurdatHandler;