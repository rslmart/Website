/* Mapbox basemaps under deck.gl (Hurricane, Tectonics).

   global.css lifts Mapbox's control corners (wordmark, attribution) above
   the deck.gl canvas. Pointer events on a control still bubble up to the
   deck.gl wrapper, where deck.gl would treat a click on the attribution as a
   click on the map (selecting a plate or storm under it) or start a pan.
   Stop the gesture-starting events at the control container; the controls'
   own handlers and link navigation still run. Move/up/end events must keep
   bubbling: deck.gl's input library listens for them on window, and a drag
   released over the attribution would otherwise never end (the map keeps
   panning). Pass as the <Map onLoad> handler. */

const CONTROL_EVENTS = [
    "pointerdown", "mousedown", "touchstart",
    "click", "dblclick", "wheel", "contextmenu",
];

const stop = (event) => event.stopPropagation();

export function isolateMapControls(event) {
    const container = event?.target?.getContainer?.()?.querySelector(".mapboxgl-control-container");
    if (!container || container.dataset.isolated) return;
    container.dataset.isolated = "true";
    CONTROL_EVENTS.forEach((type) => container.addEventListener(type, stop, { passive: true }));
}
