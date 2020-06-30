import React, {Component} from "react";
import {MenuHeader} from "../Common/CommonComponents";
import {CachePage} from "./CachePage";

class CacheHandler extends Component {
    render () {
        return (
            <div>
                <MenuHeader
                    menuItems={[{label: "Images", path: "/images"}, {label: "Ibtracs", path: "/ibtracs"}]}
                />
                <CachePage/>
            </div>
        );
    }
}

export default CacheHandler;