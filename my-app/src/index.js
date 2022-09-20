import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import Home from "./Home";
import Bio from "./Bio/Bio";
import Travel from "./Travel/Travel";
import LakeDistrict from "./Travel/LakeDistrict/LakeDistrict"
import Hurricane from "./Hurricane/Hurricane";
import Blog from "./Blog/Blog"

const rootElement = document.getElementById("root");
ReactDOM.render(
    <BrowserRouter>
        <Routes>
            <Route exact path="/" element={<Hurricane/>} />
            <Route path="/Bio" element={<Bio/>} />
            <Route path="/Travel" element={<Travel/>} />
            <Route path="/Travel/LakeDistrict" element={<LakeDistrict/>} />
            <Route path="/Hurricane" element={<Hurricane/>} />
            <Route path="/Blog" element={<Blog/>} />
        </Routes>
    </BrowserRouter>,
    rootElement
);
