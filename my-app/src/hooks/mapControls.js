/* Mapbox basemaps under deck.gl (Hurricane, Tectonics).

   global.css lifts Mapbox's control corners (wordmark, attribution) above
   the deck.gl canvas. Pointer events on a control still bubble up to the
   deck.gl wrapper, where deck.gl would treat a click on the attribution as a
   click on the map (selecting a plate or storm under it) or start a pan.
   Stop them at the control container; the controls' own handlers and link
   navigation still run. Pass as the <Map onLoad> handler. */

const CONTROL_EVENTS = [
    "pointerdown", "pointerup", "pointermove",
    "mousedown", "mouseup", "mousemove",
    "touchstart", "touchend", "touchmove",
    "click", "dblclick", "wheel", "contextmenu",
];

const stop = (event) => event.stopPropagation();

export function isolateMapControls(event) {
    const container = event?.target?.getContainer?.()?.querySelector(".mapboxgl-control-container");
    if (!container || container.dataset.isolated) return;
    container.dataset.isolated = "true";
    CONTROL_EVENTS.forEach((type) => container.addEventListener(type, stop, { passive: true }));
}
