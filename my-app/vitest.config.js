import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

/* Unit and component tests (`npm test`). Reuses the app's Vite config so JSX,
   the SVG-as-component plugin and aliases behave as in the real build. */
export default defineConfig((configEnv) =>
    mergeConfig(viteConfig(configEnv), {
        test: {
            environment: "jsdom",
            include: ["src/**/*.test.{js,jsx,mjs}"],
            setupFiles: ["./src/test/setup.js"],
            // Map pages are tested in their no-token state: whatever is in
            // .env.local or the shell, tests never see a real Mapbox token.
            env: { VITE_MAPBOX_TOKEN: "" },
            restoreMocks: true,
            unstubEnvs: true,
        },
    })
);
