import React from "react";
import { Link } from "react-router-dom";
import './index.css';

const childStyle = {"width": "100%", "height": "100%", "fontSize": "50px"}

function home() {
    return (
        <div style={{
            minHeight: "100vh",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center", // Center buttons vertically
            alignItems: "center", // Center buttons horizontally
            background: "#f0f2f5" // Optional: Add background color
        }}>
            <Link to="/Bio" style={{ width: "80%", margin: "10px" }}>
                <button className="menu-button">
                    Resume/CV
                </button>
            </Link>
            <Link to="/Hurricane" style={{ width: "80%", margin: "10px" }}>
                <button className="menu-button">
                    Hurricanes
                </button>
            </Link>
            <Link to="/RoyalTree" style={{ width: "80%", margin: "10px" }}>
                <button className="menu-button">
                    RoyalTree
                </button>
            </Link>
            <Link to="/Snow" style={{ width: "80%", margin: "10px" }}>
                <button className="menu-button">
                    Snow
                </button>
            </Link>
        </div>
    );

}

export default home;