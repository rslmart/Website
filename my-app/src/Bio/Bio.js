import React from "react";
import './Bio.css';
import { Link } from "react-router-dom";

function Bio() {

    return (
        <div className="resume-container">
            <h1 className="resume-title">Russell Makoa Martin</h1>
            <div style={{ textAlign: "center", marginBottom: "10px" }}><a href="https://github.com/rslmart">My Github</a>{" | "}
                <a href="https://www.linkedin.com/in/russell-makoa-martin/">My LinkedIn</a></div>
            <div className="section">
                <h2>Work Experience</h2>
                <div className="work-experience">
                    <div className="job-details">
                        <h3 className="job-title">Software Engineer</h3>
                        <p className="dates">Nov 2023-Current</p>
                        <p className="company">Stealth Startup, Seattle, WA</p>
                    </div>
                </div>
                <div className="work-experience">
                    <div className="job-details">
                        <h3 className="job-title">Software Development Engineer II</h3>
                        <p className="dates">Jan 2022-Sept 2023</p>
                        <p className="company">Amazon Web Services, London, UK</p>
                    </div>
                    <ul>
                        <li>Backend development for new machine learning features on DevOps Guru</li>
                        <li>Technologies include ECS, DynamoDB, Cloudwatch, SQS, SNS, Lambda, and more</li>
                    </ul>
                </div>
                <div className="work-experience">
                    <div className="job-details">
                        <h3 className="job-title">Software Development Engineer II</h3>
                       <p className="dates">July 2019-Dec 2022</p>
                        <p className="company">Amazon Web Services, Arlington, VA</p>
                    </div>
                </div>
                <div className="work-experience">
                    <div className="job-details">
                        <h3 className="job-title">Software Development Engineer I</h3>
                        <p className="dates">July 2019-July 2021</p>
                        <p className="company">Amazon Web Services, Arlington, VA</p>
                    </div>
                    <ul>
                        <li>2nd member to join team building a new internal website</li>
                        <li>Full stack development using React and AWS</li>
                    </ul>
                </div>
                <div className="work-experience">
                    <div className="job-details">
                        <h3 className="job-title">Assistant Systems Administrator</h3>
                        <p className="dates">Sept 2018-May 2019</p>
                        <p className="company">William & Mary</p>
                    </div>
                    <ul>
                        <li>Helped assemble, set up, and maintain servers and user machines</li>
                        <li>Use knowledge of Linux systems to provide support as needed</li>
                    </ul>
                </div>
                <div className="work-experience">
                    <div className="job-details">
                        <h3 className="job-title">Information Security Intern</h3>
                        <p className="dates">Summer 2018</p>
                        <p className="company">Take-Two Interactive</p>
                    </div>
                    <ul>
                        <li>Developed python tools to help Information Security Team</li>
                        <li>Full stack development of tooling website using Flask and Apache</li>
                    </ul>
                </div>
                <div className="work-experience">
                    <div className="job-details">
                        <h3 className="job-title">Online Engineering Intern</h3>
                        <p className="dates">Summer 2016</p>
                        <p className="company">Take-Two Interactive</p>
                    </div>
                    <ul>
                        <li>Created and improved OE team python tools for server management</li>
                        <li>Utilized APIs for Akamai Prolexic, Arbor, Imperva, Splunk, Cisco firewalls and switches</li>
                    </ul>
                </div>
            </div>

            <div className="section">
                <h2>Skills</h2>
                <div className="skills">
                    <ul className="skills-list">
                        <li>(Proficient): Java, Python, Javascript, React, Go, C++, Linux, Git</li>
                        <li>(Familiar): Keras, C, CUDA, SQL, Matlab, AWS Lambda, API Gateway, DynamoDB, S3, Athena, Glue,
                            Quicksight, Route 53, Cloudwatch, X-Ray
                        </li>
                    </ul>
                </div>
            </div>

            <div className="section">
                <h2>Education</h2>
                <div className="education">
                    <div className="job-details">
                        <p className="degree">Master of Computer Science</p>
                        <p>Sept 2018-May 2019</p>
                        <p>College of William and Mary, Williamsburg, VA</p>
                    </div>
                    <ul>
                        <li>GPA: 3.73</li>
                        <li>Full Scholarship</li>
                        <li>Relevant Coursework: Machine Learning, Systems Security, Data Analysis and
                            Simulation, GPU Architecture, Compiler and Parallel Computing</li>
                    </ul>

                </div>
                <div className="education">
                    <div className="job-details">
                        <p className="degree">Bachelor of Computer Science</p>
                        <p>Sept 2015-May 2018</p>
                        <p>College of William and Mary, Williamsburg, VA</p>
                    </div>
                    <ul>
                        <li>GPA: 3.62</li>
                        <li>Monroe Scholar - top 10% of entering class, awarded $3,000 research grant</li>
                    </ul>
                </div>
            </div>

            <div className="section">
                <h2>Projects</h2>
                <div className="projects">
                    <div className="project">
                        <div className="job-details">
                            <h3 className="project-title">Royal Family Tree</h3>
                            <p className="technologies">Javascript / Python</p>
                            <p>2023 - WIP</p>
                        </div>
                        <ul>
                            <li>Graphs family tree of European royalty scraped from wikipedia</li>
                            <li><Link to="/RoyalTree">RoyalTree Page</Link></li>
                        </ul>
                    </div>
                    <div className="project">
                        <div className="job-details">
                            <h3 className="project-title">Hurricane Tracks Webpage</h3>
                            <p className="technologies">Javascript / Python</p>
                            <p>2022 - WIP</p>
                        </div>
                        <ul>
                            <li>Graphs historical hurricane tracks using Deck.gl</li>
                            <li><Link to="/Hurricane">Hurricanes Page</Link></li>
                        </ul>
                    </div>
                    <div className="project">
                        <div className="job-details">
                            <h3 className="project-title">Master’s Project OSRS GE Neural Network</h3>
                            <p className="technologies">Python (Keras)</p>
                            <p>Spring 2019</p>
                        </div>
                        <ul>
                            <li>Studied and implemented many machine learning financial prediction systems</li>
                            <li><a href="https://github.com/rmmartin02/OSRS_Research">Github Link</a></li>
                        </ul>
                    </div>
                    <div className="project">
                        <div className="job-details">
                            <h3 className="project-title">Branch Targeted Buffer</h3>
                            <p className="technologies">C/Python</p>
                            <p>Fall 2018</p>
                        </div>
                        <ul>
                            <li>Created a covert channel via branch target buffer on Intel CPUs</li>
                            <li>Used knowledge of assembly code and microarchitectural optimizations</li>
                            <li><a href="https://github.com/rmmartin02/CS680_Research">Github Link</a></li>
                        </ul>
                    </div>
                    <div className="project">
                        <div className="job-details">
                            <h3 className="project-title">OSRS Game Automation</h3>
                            <p className="technologies">Java</p>
                            <p>2014 - early 2016</p>
                        </div>
                        <ul>
                            <li>User count peaked at over 10,000 between several scripts</li>
                            <li><a href="https://github.com/rmmartin02/Bots">Github Link</a></li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );

}

export default Bio;