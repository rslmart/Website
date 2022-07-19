import React, {useEffect} from "react";
import Graph from 'vis-react';

function Education() {
    useEffect(() => {
        const script = document.createElement('script');

        script.src = "https://viewer.diagrams.net/js/viewer-static.min.js";
        script.async = true;

        document.body.appendChild(script);

        return () => {
            document.body.removeChild(script);
        }
    }, []);

    return (
        <div>
            <div className="mxgraph" data-mxgraph="{&quot;highlight&quot;:&quot;#0000ff&quot;,&quot;nav&quot;:true,&quot;resize&quot;:true,&quot;toolbar&quot;:&quot;zoom layers tags lightbox&quot;,&quot;edit&quot;:&quot;_blank&quot;,&quot;xml&quot;:&quot;&lt;mxfile modified=\&quot;2022-07-19T15:26:12.890Z\&quot; host=\&quot;app.diagrams.net\&quot; agent=\&quot;5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36\&quot; etag=\&quot;qXs3511LRudOOplKggao\&quot; version=\&quot;20.1.1\&quot; type=\&quot;google\&quot;&gt;&lt;diagram id=\&quot;sTFGPoTkbsN9hNDawFk4\&quot; name=\&quot;Page-1\&quot;&gt;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&lt;/diagram&gt;&lt;/mxfile&gt;&quot;}"></div>
        </div>
    );
}

export default Education;