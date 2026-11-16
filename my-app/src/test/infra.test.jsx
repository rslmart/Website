import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Home from "../Home";
import { takeBlockedRequests } from "./networkGuard";

describe("test infrastructure", () => {
    it("never exposes a Mapbox token", () => {
        expect(import.meta.env.VITE_MAPBOX_TOKEN).toBe("");
    });

    it("blocks real network requests", async () => {
        await expect(fetch("https://example.com/")).rejects.toThrow();
        expect(takeBlockedRequests()).toEqual(["https://example.com/"]);
    });

    it("renders the Home route", () => {
        render(
            <MemoryRouter>
                <Home />
            </MemoryRouter>
        );
        expect(screen.getByRole("heading", { level: 1, name: "Makoa Martin" })).toBeInTheDocument();
    });
});
