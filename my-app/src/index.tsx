import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "./Home.tsx";
import Bio from "./Bio/Bio.tsx";
import Snow from "./Snow/SnowPage.tsx";

const rootElement = document.getElementById("root");

if (rootElement) {
    const root = createRoot(rootElement);
    root.render(
        <StrictMode>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/Bio" element={<Bio />} />
                    <Route path="/Snow" element={<Snow />} />
                </Routes>
            </BrowserRouter>
        </StrictMode>
    );
}