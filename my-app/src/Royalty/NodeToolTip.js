import React from 'react'
const NodeToolTip = ({ x, y, node }) => {
    return (
        <div className={"nodeToolTips"} style={{ top: `${y}px`, left: `${x}px`}}>
            {node}
        </div>
    )
}

export default NodeToolTip