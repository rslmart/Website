import React from "react";
import { Link } from "react-router-dom";
import './index.css';

const PROJECTS = [
    {
        to: "/Bio",
        title: "Resume / CV",
        desc: "My background, experience, skills, and the projects I've built.",
    },
    {
        to: "/Hurricane",
        title: "Hurricanes",
        desc: "Every tropical cyclone on record (1842–present) on an interactive map, with tracks and satellite imagery.",
    },
    {
        to: "/RoyalTree",
        title: "RoyalTree",
        desc: "Interactive royal genealogies reconstructed from Wikidata — see how dynasties connect.",
    },
    {
        to: "/Snow",
        title: "WA Snowfall",
        desc: "Washington mountain-pass snowfall by season, with ENSO (El Niño / La Niña) context.",
    },
    {
        to: "/Tectonics",
        title: "Tectonic Plates",
        desc: "Global plate boundaries, orogens, and plate velocities rendered on a 3D map.",
    },
];

function Home() {
    return (
        <div className="home">
            <a className="home-skip" href="#home-projects">Skip to content</a>
            <header className="home-hero">
                <span className="home-eyebrow">Personal Projects</span>
                <h1 className="home-title">Makoa Martin</h1>
                <p className="home-subtitle">
                    A collection of interactive data-visualization projects — plus my resume.
                    Pick one to explore.
                </p>
            </header>

            <main id="home-projects" className="home-grid" tabIndex={-1}>
                {PROJECTS.map((project) => (
                    <Link
                        key={project.to}
                        to={project.to}
                        className="home-card"
                    >
                        <h2 className="home-card-title">{project.title}</h2>
                        <p className="home-card-desc">{project.desc}</p>
                        <span className="home-card-cta">Explore</span>
                    </Link>
                ))}
            </main>

            <footer className="home-footer">
                <a href="https://github.com/rslmart" target="_blank" rel="noopener noreferrer">GitHub</a>
                <span className="home-footer-sep" aria-hidden="true">·</span>
                <a href="https://www.linkedin.com/in/russell-makoa-martin/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            </footer>
        </div>
    );
}

export default Home;
