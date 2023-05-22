import React from "react";
import {Link } from "react-router-dom";
import pic from "./Travel/Pics/Me_Matterhorn.png";
import './index.css';
import '../node_modules/react-vis/dist/style.css';

function home() {

    return (
        <div className={"app"}>
            <img src={pic} alt="logo"/>
            <Link to="/bio">
                <button
                    className={"tile1"}
                >
                    Bio
                </button>
            </Link>
            <Link to="/travel">
                <button
                    className={"tile2"}
                >
                    Travels
                </button>
            </Link>
            <Link to="/hurricane">
                <button
                    className={"tile3"}
                >
                    Hurricanes
                </button>
            </Link>
            <Link to="/blog">
                <button
                    className={"tile4"}
                >
                    Blog / Random Stuff
                </button>
            </Link>
        </div>
    );

}

export default home;