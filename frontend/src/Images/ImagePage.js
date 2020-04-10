import {Container, Form, Image, Placeholder, Statistic} from "semantic-ui-react";
import {DateTimeInput} from "semantic-ui-calendar-react";
import React, {Component} from "react";
import Utils from "../Common/Utils";

export const ImagePage = props => (
    <Container style={{ marginTop: '7em' }}>
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
                        options={props.imageOptions.season}
                        onChange={props.handleInputChange}
                    />
                </Form.Field>
                <Form.Field>
                    <label>Basin</label>
                    <Form.Dropdown
                        fluid
                        id="basin"
                        placeholder='ATL'
                        multiple
                        search
                        options={props.imageOptions.basin}
                        onChange={props.handleInputChange}
                    />
                </Form.Field>
                <Form.Field>
                    <label>Storm Name</label>
                    <Form.Dropdown
                        fluid
                        id="name"
                        placeholder="Isabel"
                        multiple
                        search
                        options={props.imageOptions.storm_name}
                        onChange={props.handleInputChange}
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
                        options={props.imageOptions.type}
                        onChange={props.handleInputChange}
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
                        options={props.imageOptions.sensor}
                        onChange={props.handleInputChange}
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
                        options={props.imageOptions.resolution}
                        onChange={props.handleInputChange}
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
                        options={props.imageOptions.satellite}
                        onChange={props.handleInputChange}
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
                        options={props.imageOptions.extension}
                        onChange={props.handleInputChange}
                    />
                </Form.Field>
            </Form.Group>
            <Form.Group>
                <Form.Field>
                    <label>Start Date</label>
                    <DateTimeInput
                      name="startTime"
                      placeholder="Date Time"
                      dateFormat="YYYY-MM-DD"
                      clearable
                      onClear={props.handleInputChange}
                      minDate={props.beginDate}
                      maxDate={props.endTime}
                      value={props.startTime}
                      iconPosition="left"
                      onChange={props.handleInputChange}
                    />
                </Form.Field>
                <Form.Field>
                    <label>End Date</label>
                    <DateTimeInput
                      name="endTime"
                      placeholder="Date Time"
                      dateFormat="YYYY-MM-DD"
                      clearable
                      onClear={props.handleInputChange}
                      minDate={props.startTime}
                      maxDate={props.endDate}
                      value={props.endTime}
                      iconPosition="left"
                      onChange={props.handleInputChange}
                    />
                </Form.Field>
            </Form.Group>
            <Form.Group widths={"equal"}>
                <Form.Field>
                    <label>Image Count</label>
                    {props.count !== -1 ? props.count : "Loading"}
                </Form.Field>
                <Form.Field>
                    <label>Query:</label>
                    {JSON.stringify(props.query)}
                </Form.Field>
            </Form.Group>
            <Form.Button onClick={props.fetchQuery}>Get Images</Form.Button>
        </Form>
        <Container>
            {props.imageElements}
            {!props.loadingImages && props.imageElements.length > 0 ?
                <DataViewer
                    imageItems={props.imageItems}
                    imageElementsStatus={props.imageElementsStatus}
                    ibtracsInfo={props.ibtracsInfo}
                />
             : ""}
        </Container>
    </Container>
);

class DataViewer extends Component {

    state = {
        imageIndex: 0
    };

    selectImage = (e, { value }) => {
        const imageIndex = parseInt(value);
        this.setState({imageIndex});
    };

    render() {
        const ibtracData = this.props.ibtracsInfo[this.props.imageItems[this.state.imageIndex].ibtracs];
        return (
            <div>
                {this.props.imageElementsStatus[this.state.imageIndex] ?
                    <Image
                        src={this.props.imageItems[this.state.imageIndex].image_url}
                        alt={this.props.imageItems[this.state.imageIndex].image}
                    />
                : <Placeholder>
                    <Placeholder.Image />
                  </Placeholder>}
                  {this.props.ibtracsInfo[this.props.imageItems[this.state.imageIndex].ibtracs] ?
                      Utils.generateIbtracsStatisticItems(ibtracData) :
                      <Statistic.Group>
                          <Statistic label='Time' value={this.props.imageItems[this.state.imageIndex].date} />
                      </Statistic.Group>
                  }
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
            </div>
        );
    }
}