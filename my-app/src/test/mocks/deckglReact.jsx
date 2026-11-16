import React from "react";

/* <DeckGL> renders a container listing its layer ids and renders plain
   children (e.g. the base <Map>). The props of the latest render are kept in
   `lastDeckProps.current` so tests can inspect layers and view state. */
export const lastDeckProps = { current: null };

const DeckGL = React.forwardRef(function MockDeckGL(props, ref) {
    lastDeckProps.current = props;
    const layers = (props.layers ?? []).flat(Infinity).filter(Boolean);
    const children = typeof props.children === "function" ? null : props.children;
    return (
        <div ref={ref} data-testid="mock-deckgl" data-layer-ids={layers.map((layer) => layer.id).join(",")}>
            {children}
        </div>
    );
});

export default DeckGL;
