import React from "react";
import {Link } from "react-router-dom";
import pic from "./Pics/Me_Matterhorn.png";
import './index.css';

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
        </div>
    );

}

export default home;