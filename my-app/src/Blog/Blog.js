import React from "react";
import {Link} from "react-router-dom";

function Blog() {
    return (
        <div>
            <Link to="/Blog/JSPerformanceTesting">
                <button>
                    JS Performance Testing
                </button>
            </Link>
            <Link to="/Blog/Education">
                <button>
                    Education
                </button>
            </Link>
        </div>
    );
}

export default Blog;