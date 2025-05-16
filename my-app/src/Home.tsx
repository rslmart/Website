import React from "react";
import { Link } from "react-router-dom";
import './index.css';

const Home: React.FC = () => {
    return (
        <div style={{
            minHeight: "100vh",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            background: "#36393e"
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
};

export default Home;