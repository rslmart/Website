import { describe, expect, it, vi } from "vitest";
import { isolateMapControls } from "./mapControls";

describe("isolateMapControls", () => {
    it("keeps clicks on Mapbox controls from reaching deck.gl, without blocking the control", () => {
        const wrapper = document.createElement("div"); // stands in for #deckgl-wrapper
        wrapper.innerHTML = `<div class="mapboxgl-map"><div class="mapboxgl-control-container">
            <a class="mapboxgl-ctrl-logo" href="#logo">Mapbox</a></div></div>`;
        document.body.appendChild(wrapper);
        const deckHandler = vi.fn();
        wrapper.addEventListener("click", deckHandler);
        wrapper.addEventListener("pointerdown", deckHandler);
        const map = { getContainer: () => wrapper.querySelector(".mapboxgl-map") };

        isolateMapControls({ target: map });
        isolateMapControls({ target: map }); // idempotent (reuseMaps fires load again)

        const logo = wrapper.querySelector("a");
        const ownHandler = vi.fn();
        logo.addEventListener("click", ownHandler);
        logo.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        logo.dispatchEvent(new Event("pointerdown", { bubbles: true }));

        expect(ownHandler).toHaveBeenCalledTimes(1);
        expect(deckHandler).not.toHaveBeenCalled();
        wrapper.remove();
    });

    it("lets a drag end over a control (pointerup/move still reach window)", () => {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = `<div class="mapboxgl-map"><div class="mapboxgl-control-container">
            <a class="mapboxgl-ctrl-logo" href="#logo">Mapbox</a></div></div>`;
        document.body.appendChild(wrapper);
        isolateMapControls({ target: { getContainer: () => wrapper.querySelector(".mapboxgl-map") } });
        const onWindow = vi.fn();
        window.addEventListener("pointerup", onWindow);
        window.addEventListener("pointermove", onWindow);
        const logo = wrapper.querySelector("a");
        logo.dispatchEvent(new Event("pointermove", { bubbles: true }));
        logo.dispatchEvent(new Event("pointerup", { bubbles: true }));
        expect(onWindow).toHaveBeenCalledTimes(2);
        window.removeEventListener("pointerup", onWindow);
        window.removeEventListener("pointermove", onWindow);
        wrapper.remove();
    });
});
