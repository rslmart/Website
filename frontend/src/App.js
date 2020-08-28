import React, { Component } from 'react';
import {
    Container,
    Header,
    Segment
} from 'semantic-ui-react';
import {MenuHeader} from "./Common/CommonComponents";

const menuItems = [
    {label: "Images", path: "/images"},
    {label: "Images", path: "/images"},
    {label: "Hurdat", path: "/hurdat"},
];

const HomepageContent = () => (
    <Container text>
        <Header
            as='h1'
            content='Russell Makoa Martin'
            style={{
                fontSize: '4em',
                fontWeight: 'normal',
                marginBottom: 0,
                marginTop: '3em',
            }}
        />
        <Header
            as='h2'
            content='An absolute legend.'
            style={{
                fontSize:'1.7em',
                fontWeight: 'normal',
                marginTop: '1.5em',
            }}
        />
    </Container>
);

function App () {
    return (
        <div>
             <MenuHeader
                menuItems={menuItems}
            />
            <Segment
                textAlign='center'
                style={{ minHeight: 700, padding: '1em 0em' }}
                vertical
              >
                <HomepageContent/>
            </Segment>
        </div>
    );
}

export default App