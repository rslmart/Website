import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./Home";
import Bio from "./Bio/Bio";
import Hurricane from "./Hurricane/Hurricane";
import RoyalTree from "./Royalty/RoyalTreePage";
import SnowPage from "./Snow/SnowPage";
import Tectonics from "./Tectonics/Tectonics";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);
root.render(
    <BrowserRouter>
        <Routes>
            <Route exact path="/" element={<Home/>} />
            <Route path="/Bio" element={<Bio/>} />
            <Route path="/Hurricane" element={<Hurricane/>} />
            <Route path="/RoyalTree" element={<RoyalTree/>} />
            <Route path="/Snow" element={<SnowPage/>} />
            <Route path="/Tectonics" element={<Tectonics/>} />
        </Routes>
    </BrowserRouter>
);
