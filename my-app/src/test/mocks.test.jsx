import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DeckGL from "@deck.gl/react";
import { WebMercatorViewport } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import { Map } from "react-map-gl";
import cytoscape from "cytoscape";
import { Line, LineChart, ResponsiveContainer } from "recharts";

describe("jsdom mocks", () => {
    it("render deck.gl and react-map-gl without WebGL", () => {
        render(
            <DeckGL layers={[new ScatterplotLayer({ id: "points" })]}>
                <Map mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN} />
            </DeckGL>
        );
        expect(screen.getByTestId("mock-deckgl")).toHaveAttribute("data-layer-ids", "points");
        expect(screen.getByTestId("mock-map")).toHaveAttribute("data-has-token", "false");
    });

    it("keep real Web Mercator math", () => {
        const viewport = new WebMercatorViewport({ width: 800, height: 600, longitude: 0, latitude: 0, zoom: 1 });
        const [x, y] = viewport.project([0, 0]);
        expect(x).toBeCloseTo(400);
        expect(y).toBeCloseTo(300);
    });

    it("stub cytoscape as a chainable no-op", () => {
        const cy = cytoscape({ elements: [] });
        expect(cy.elements().fit().length).toBe(0);
        expect(cytoscape.instances).toContain(cy);
    });

    it("give Recharts a fixed-size container", () => {
        const { container } = render(
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={[{ x: 1, y: 2 }, { x: 2, y: 3 }]}>
                    <Line dataKey="y" isAnimationActive={false} />
                </LineChart>
            </ResponsiveContainer>
        );
        expect(container.querySelector("svg.recharts-surface")).toHaveAttribute("width", "800");
    });
});
