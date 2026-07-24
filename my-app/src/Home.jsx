import React from "react";
import { Link } from "react-router-dom";
import './index.css';

const PROJECTS = [
    {
        to: "/Bio",
        title: "Resume / CV",
        desc: "My background, experience, skills, and the projects I've built.",
        accent: "#2563eb",
    },
    {
        to: "/Hurricane",
        title: "Hurricanes",
        desc: "Every tropical cyclone on record (1842–present) on an interactive map, with tracks and satellite imagery.",
        accent: "#e0533d",
    },
    {
        to: "/Photos",
        title: "Photo Map",
        desc: "My favorite photos on a world map that clusters by region and splits as you zoom — plus a gallery and a scrubable timeline.",
        accent: "#f59e0b",
    },
    {
        to: "/RoyalTree",
        title: "RoyalTree",
        desc: "Interactive royal genealogies reconstructed from Wikidata — see how dynasties connect.",
        accent: "#9b59b6",
    },
    {
        to: "/Snow",
        title: "WA Snowfall",
        desc: "Washington mountain-pass snowfall by season, with ENSO (El Niño / La Niña) context.",
        accent: "#0ea5e9",
    },
    {
        to: "/Tectonics",
        title: "Tectonic Plates",
        desc: "Global plate boundaries, orogens, and plate velocities rendered on a 3D map.",
        accent: "#16a34a",
    },
];

function Home() {
    return (
        <div className="home">
            <header className="home-hero">
                <span className="home-eyebrow">Personal Projects</span>
                <h1 className="home-title">Makoa Martin</h1>
                <p className="home-subtitle">
                    A collection of interactive data-visualization projects — plus my resume.
                    Pick one to explore.
                </p>
            </header>

            <main className="home-grid">
                {PROJECTS.map((project) => (
                    <Link
                        key={project.to}
                        to={project.to}
                        className="home-card"
                        style={{ "--accent": project.accent }}
                    >
                        <h2 className="home-card-title">{project.title}</h2>
                        <p className="home-card-desc">{project.desc}</p>
                        <span className="home-card-cta">Explore</span>
                    </Link>
                ))}
            </main>

            <footer className="home-footer">
                <a href="https://github.com/rslmart" target="_blank" rel="noopener noreferrer">GitHub</a>
                {" · "}
                <a href="https://www.linkedin.com/in/russell-makoa-martin/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            </footer>
        </div>
    );
}

export default Home;
