import {Container, Menu, Segment} from "semantic-ui-react";
import React from "react";

export const MenuHeader = (props) => (
    <Menu
        fixed={'top'}
        inverted
    >
        <Container>
            <Menu.Item as='a' href={'/'}>
                Home
            </Menu.Item>
            {props.menuItems.map(item => (
                <Menu.Item as='a' key={item.label} href={item.path}>{item.label}</Menu.Item>
            ))}
        </Container>
    </Menu>
);