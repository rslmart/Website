import React from "react";
import {
    BrowserRouter as Router,
    Switch,
    Route
} from "react-router-dom";
import App from "./App";
import ImagePage from "./Images/ImagePage";

export default function WebsiteRouter() {
    return (
        <Router>
            <div>
                <Switch>
                    <Route exact path={`/`}>
                        <App/>
                    </Route>
                    <Route exact path={'/images'}>
                        <ImagePage/>
                    </Route>
                </Switch>
            </div>
        </Router>
    );
}