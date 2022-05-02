import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import Home from "./Home";
import Bio from "./Bio";
import Travel from "./Travel";

const rootElement = document.getElementById("root");
ReactDOM.render(
    <BrowserRouter>
        <Routes>
            <Route exact path="/" element={<Home/>} />
            <Route path="/Bio" element={<Bio/>} />
            <Route path="/Travel" element={<Travel/>} />
        </Routes>
    </BrowserRouter>,
    rootElement
);
