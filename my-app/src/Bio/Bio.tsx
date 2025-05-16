import React from "react";
import styles from './Bio.module.css';
import { Link } from "react-router-dom";

const Bio: React.FC = () => {
    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>Russell Makoa Martin</h1>
                <div className={styles.contactInfo}>
                    makoa1693@gmail.com | 757-323-5802 | <a href="https://makoa.link"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className={styles.link}>www.makoa.link</a>
                    <br/>
                    <a href="https://github.com/rslmart"
                       target="_blank"
                       rel="noopener noreferrer"
                       className={styles.link}>GitHub</a> |
                    <a href="https://www.linkedin.com/in/russell-makoa-martin/"
                       target="_blank"
                       rel="noopener noreferrer"
                       className={styles.link}>LinkedIn</a>
                </div>
            </header>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Work Experience</h2>
                {/* Job items structure same as before, converted to use styles */}
                {/* Example for one job item: */}
                <div className={styles.jobItem}>
                    <div className={styles.jobHeader}>
                        <h3>Software Engineer</h3>
                        <div className={styles.company}>AI Stealth Startup</div>
                        <div className={styles.location}>Seattle, WA</div>
                        <div className={styles.date}>Nov 2023 - Current</div>
                    </div>
                    <ul>
                    <li>Develop critical network infrastructure (Go, Prometheus) for AI/ML workloads</li>
                    <li>Design secure gRPC APIs (Go) to automate device communication and monitoring</li>
                    <li>Build GitLab CI/CD pipelines for deployment automation and testing</li>
                </ul>
            </div>

            <div className={styles.jobItem}>
                <div className={styles.jobHeader}>
                    <h3>Software Engineer II</h3>
                    <div className={styles.company}>AWS AI/ML</div>
                    <div className={styles.location}>London, UK</div>
                    <div className={styles.date}>Jan 2022 - Oct 2023</div>
                </div>
                <ul>
                    <li>Enhanced ML-driven anomaly detection (Java/Kotlin) for AWS services across 16 regions</li>
                    <li>Improved distributed workflows using ECS clusters, Lambda, and SQS</li>
                    <li>Automated deployments/alarms via CDK and CloudFormation</li>
                </ul>
            </div>

            <div className={styles.jobItem}>
                <div className={styles.jobHeader}>
                    <h3>Software Engineer II</h3>
                    <div className={styles.company}>AWS Networking</div>
                    <div className={styles.location}>Arlington, VA</div>
                    <div className={styles.date}>July 2021 - Dec 2021</div>
                </div>
            </div>

            <div className={styles.jobItem}>
                <div className={styles.jobHeader}>
                    <h3>Software Engineer I</h3>
                    <div className={styles.company}>AWS Networking</div>
                    <div className={styles.location}>Arlington, VA</div>
                    <div className={styles.date}>July 2019 - July 2021</div>
                </div>
                <ul>
                    <li>Second developer hired; built Java/JavaScript (React) inventory and workflow management system using AWS services</li>
                    <li>Promoted after 2 years for architecting and launching the platform</li>
                    <li>Mentored and scaled team from 2 to 9 engineers</li>
                </ul>
            </div>

            <div className={styles.jobItem}>
                <div className={styles.jobHeader}>
                    <h3>Assistant Sys Admin</h3>
                    <div className={styles.company}>William & Mary</div>
                    <div className={styles.location}>Williamsburg, VA</div>
                    <div className={styles.date}>Sept 2018 - May 2019</div>
                </div>
            </div>

            <div className={styles.jobItem}>
                <div className={styles.jobHeader}>
                    <h3>Online Team Intern</h3>
                    <div className={styles.company}>Take-Two Interactive</div>
                    <div className={styles.location}>NYC</div>
                    <div className={styles.date}>Summer 2016 & 2018</div>
                </div>
                <ul>
                    <li>Developed python tools to help Information Security Team and server management</li>
                    <li>Full stack development of tooling website using Flask and Apache</li>
                </ul>
            </div>
        </section>

            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Skills</h2>
                <div className={styles.skillsContainer}>
                    <div className={styles.skillCategory}>
                    <h3>Proficient</h3>
                    <p>Go, Python, Java, JavaScript, React, C++, Linux, Git</p>
                </div>
                    <div className={styles.skillCategory}>
                    <h3>Familiar</h3>
                    <p>Keras, Prometheus, C, CUDA, SQL, Matlab, AWS Lambda, API Gateway, DynamoDB, S3, Athena, Glue, Quicksight, Route 53, Cloudwatch, X-Ray</p>
                </div>
            </div>
        </section>

        <section className={styles.section}>
            <h2>Education</h2>
            <div className={styles.educationItem}>
                <div className={styles.jobHeader}>
                    <h3>College of William and Mary</h3>
                    <div className={styles.location}>Williamsburg, VA</div>
                </div>
                <p><strong>Master of Computer Science</strong> GPA: 3.73 (Sept 2018-May 2019)</p>
                <p><strong>Bachelor of Computer Science</strong> GPA: 3.62 (Sept 2015-May 2018)</p>
                <p>Relevant Coursework: Machine Learning, Systems Security, Data Analysis and Simulation, GPU Architecture, Compiler and Parallel Computing</p>
            </div>
        </section>

        <section className={styles.section}>
            <h2>Projects</h2>
            <div className={styles.projectItem}>
                <h3>RoyalTree Webpage</h3>
                <div className={styles.techStack}>JavaScript / Python (2023 - WIP)</div>
                <p>Visualized European royal genealogies using Python data scraping and React</p>
                <Link to="/RoyalTree">View Project</Link>
            </div>

            <div className={styles.projectItem}>
                <h3>Hurricane Tracks Webpage</h3>
                <div className={styles.techStack}>JavaScript / Python (2022 - WIP)</div>
                <p>Mapped historical storm data with Python, React, and Deck.gl</p>
                <Link to="/Hurricane">View Project</Link>
            </div>

            <div className={styles.projectItem}>
                <h3>Master’s Project OSRS GE Neural Network</h3>
                <div className={styles.techStack}>Python (Keras) (Spring 2019)</div>
                <p>Studied and implemented quantitative and machine learning financial prediction systems</p>
            </div>

            <div className={styles.projectItem}>
                <h3>OSRS Game Automation</h3>
                <div className={styles.techStack}>Java (2014 - early 2016)</div>
                <p>User count peaked at over 10,000 between several scripts</p>
            </div>
        </section>

        <div className={styles.cvSection}>
            <h2 className={styles.sectionTitle}>Cover Letter</h2>
            <div className={styles.cvSubSection}>
                <h3 className={styles.sectionTitle}>Stealth Startup</h3>
                <p className={styles.cvParagraph}>
                    Starting December 2023, I have been part of the networking team at an AI Datacenter startup,
                    supporting a critical server component that serves as a foundational platform for internal teams.
                    My responsibilities include monitoring, updating, and securing network devices, as well as
                    designing secure APIs and environments to facilitate device interaction. A core focus of my
                    role has been driving automation and testing efforts, such as developing gRPC APIs for device
                    communication and building robust GitLab CI/CD pipelines to automate builds, deployments,
                    and testing workflows.
                </p>
            </div>

            <div className={styles.cvSubSection}>
                <h3 className={styles.sectionTitle}>Devops Guru</h3>
                <p className={styles.cvParagraph}>
                    From December 2022 to October 2023, I worked as a backend developer on DevOps Guru,
                    an AWS service that is currently available in 16 regions. This machine learning-powered
                    service provides users with insights and remedial actions for anomalous behavior in their
                    other AWS services.
                </p>
                <p className={styles.cvParagraph}>
                    Our team is responsible for detecting users' AWS resources and subsequently identifying all
                    the relevant CloudWatch metrics associated with these resources. To accomplish this, we
                    utilized a series of distributed ECS clusters served through Lambda and SQS. The results
                    were then published to DynamoDB, S3, and SNS, allowing other Lambdas and ECS clusters to
                    proceed with further stages of the process. We implemented a cellular architecture for
                    the system's components. Deployments and alarms were fully automated using CDK or
                    CloudFormation templates and pipelines.
                </p>
            </div>

            <div className={styles.cvSubSection}>
                <h3 className={styles.sectionTitle}>AWS Networking</h3>
                <p className={styles.cvParagraph}>
                    Upon completing my undergraduate degree in May 2019, I joined AWS as a member of a newly
                    established AWS Networking team in July 2019. AWS Networking is responsible for building
                    the physical and logical infrastructure that underpins all AWS services. As the second
                    developer hired onto the team, following the Senior SDE, I created and deployed the project's
                    initial infrastructure, which included API Gateway, Route53, Cognito, XRay, Lambda, Cloudwatch,
                    DynamoDB, DynamoDB streams, and S3. All of this was managed using CloudFormation templates and
                    pipelines, ensuring full integration and unit test coverage. Additionally, I took the lead in
                    designing most of the frontend using React. The project was a success, and I helped in growing
                    the development team to nine members, with most of them onboarded under my supervision. In
                    recognition of my contributions in enhancing the customer experience and code quality, I was
                    promoted in July 2021, two years after joining the team.
                </p>
            </div>

            <div className={styles.cvSubSection}>
                <h3 className={styles.sectionTitle}>Professional Experience Prior to Graduation</h3>
                <p className={styles.cvParagraph}>
                    During the final year of my Masters program, I was hired as an Assistant System Administrator to
                    assist in managing the growing infrastructure of the Computer Science department. This involved
                    overseeing several computer labs, two server rooms, and the personal machines of research
                    professors. Through this experience, I gained valuable knowledge in server administration.
                </p>
                <p className={styles.cvParagraph}>
                    In the summers of 2016 and 2018, I completed internships with the Online Engineering team at
                    Take Two, a leading video game publisher under the Rockstar/2K brand. During my time with the
                    team, I collaborated on writing Python scripts to boost productivity while learning how the
                    massive GTA Online servers were managed. The internship later transitioned into the Information
                    Security team, where I received experience on corporate information security measures employed
                    to keep the service secure.
                </p>
            </div>

            <div className={styles.cvSubSection}>
                <h3 className={styles.sectionTitle}>Personal Projects</h3>
                <p className={styles.cvParagraph}>
                    <strong>RoyalTrees:</strong> After moving to Europe I became fascinated with the intricate and
                    long history of the monarchies there. The drama was sometimes hard to track however so I wanted
                    to create a tool to visualize these large, complicated families. As part of this I used python
                    to scrape and organize data from wikidata. I then used react and javascript to turn this data
                    into clean, easy to follow family trees on my website.{" "}
                    <a href="http://makoa.link/RoyalTree" target="_blank" rel="noopener noreferrer">
                        View Project
                    </a>
                </p>
                <p className={styles.cvParagraph}>
                    <strong>Hurricane Tracks:</strong> As an avid surfer and east coaster, I have a keen interest in
                    hurricanes and meteorology. Leveraging my passion for these topics, I utilized Python to filter,
                    format, and organize a large amount of data (over 300,000 data points) on historical hurricane
                    and typhoon tracks for my personal website at www.makoa.link. Using React and Deck.gl, I created
                    interactive visualizations that made it easy to view and filter this information.{" "}
                    <a href="http://makoa.link/Hurricane" target="_blank" rel="noopener noreferrer">
                        View Project
                    </a>
                </p>
            </div>
            <div className={styles.cvSubSection}>
                <h3 className={styles.sectionTitle}>Beginnings</h3>
                <p className={styles.cvParagraph}>
                    My journey in programming began by creating simple computers within the video game Minecraft when
                    I was 12 years old. In high school, I further honed my skills using Java to design bots that played
                    the classic video game Runescape. Through my involvement in the gaming community, I gained a
                    wealth of knowledge in Java programming and went on to develop several successful bots that
                    attracted over 10,000 users.
                </p>
            </div>
        </div>
    </div>
    );

}

export default Bio;