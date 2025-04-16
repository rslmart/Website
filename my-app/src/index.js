import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./Home";
import Bio from "./Bio/Bio";
import Hurricane from "./Hurricane/Hurricane";
import RoyalTree from "./Royalty/RoyalTreePage";
import SnowPage from "./Snow/SnowPage";

const rootElement = document.getElementById("root");
ReactDOM.render(
    <BrowserRouter>
        <Routes>
            <Route exact path="/" element={<Home/>} />
            <Route path="/Bio" element={<Bio/>} />
            <Route path="/Hurricane" element={<Hurricane/>} />
            <Route path="/RoyalTree" element={<RoyalTree/>} />
            <Route path="/Snow" element={<SnowPage/>} />
        </Routes>
    </BrowserRouter>,
    rootElement
);
