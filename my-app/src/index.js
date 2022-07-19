import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import Home from "./Home";
import Bio from "./Bio/Bio";
import Travel from "./Travel/Travel";
import Hurricane from "./Hurricane/Hurricane";
import Blog from "./Blog/Blog"
import JSPerfTesting from "./Blog/JSPerfTesting";
import Education from "./Blog/Education";

const rootElement = document.getElementById("root");
ReactDOM.render(
    <BrowserRouter>
        <Routes>
            <Route exact path="/" element={<Home/>} />
            <Route path="/Bio" element={<Bio/>} />
            <Route path="/Travel" element={<Travel/>} />
            <Route path="/Hurricane" element={<Hurricane/>} />
            <Route path="/Blog" element={<Blog/>} />
            <Route path="/Blog/JSPerformanceTesting" element={<JSPerfTesting/>} />
            <Route path="/Blog/Education" element={<Education/>} />
        </Routes>
    </BrowserRouter>,
    rootElement
);
