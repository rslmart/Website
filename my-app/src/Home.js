import React from "react";
import { Link } from "react-router-dom";
import pic from "./Travel/Pics/Me_Matterhorn.png";
import './index.css';
import '../node_modules/react-vis/dist/style.css';

const childStyle = {"width": "100%", "height": "100%", "fontSize": "50px"}

function home() {
    return (
        <div style={{ "height": "100vh", "width": "100%", "display": "flex", "flexDirection": "column" }}>
            <Link to="/Bio" style={childStyle}>
                <button style={childStyle}>
                    Resume/CV
                </button>
            </Link>
            <Link to="/Hurricane" style={childStyle}>
                <button style={childStyle}>
                    Hurricanes
                </button>
            </Link>
            <Link to="/RoyalTree" style={childStyle}>
                <button style={childStyle}>
                    RoyalTree
                </button>
            </Link>
        </div>
    );

}

export default home;