import { resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { defineConfig, loadEnv, createFilter, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";
import { ROUTES, applySiteMetaBlock, routeByPath } from "./src/siteMeta.js";
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    setEnv(mode);
    return {
        plugins: [
            react(),
            envPlugin(),
            devServerPlugin(),
            sourcemapPlugin(),
            buildPathPlugin(),
            basePlugin(),
            importPrefixPlugin(),
            htmlPlugin(mode),
            svgrPlugin(),
            routeHtmlPlugin(),
        ],
    };
});
function setEnv(mode) {
    Object.assign(process.env, loadEnv(mode, ".", ["REACT_APP_", "NODE_ENV", "PUBLIC_URL"]));
    process.env.NODE_ENV ||= mode;
    const { homepage } = JSON.parse(readFileSync("package.json", "utf-8"));
    process.env.PUBLIC_URL ||= homepage
        ? `${homepage.startsWith("http") || homepage.startsWith("/")
            ? homepage
            : `/${homepage}`}`.replace(/\/$/, "")
        : "";
}
// Expose `process.env` environment variables to your client code
// Migration guide: Follow the guide below to replace process.env with import.meta.env in your app, you may also need to rename your environment variable to a name that begins with VITE_ instead of REACT_APP_
// https://vitejs.dev/guide/env-and-mode.html#env-variables
function envPlugin() {
    return {
        name: "env-plugin",
        config(_, { mode }) {
            const env = loadEnv(mode, ".", ["REACT_APP_", "NODE_ENV", "PUBLIC_URL"]);
            return {
                define: Object.fromEntries(Object.entries(env).map(([key, value]) => [
                    `process.env.${key}`,
                    JSON.stringify(value),
                ])),
            };
        },
    };
}
// Setup HOST, SSL, PORT
// Migration guide: Follow the guides below
// https://vitejs.dev/config/server-options.html#server-host
// https://vitejs.dev/config/server-options.html#server-https
// https://vitejs.dev/config/server-options.html#server-port
function devServerPlugin() {
    return {
        name: "dev-server-plugin",
        config(_, { mode }) {
            const { HOST, PORT, HTTPS, SSL_CRT_FILE, SSL_KEY_FILE } = loadEnv(mode, ".", ["HOST", "PORT", "HTTPS", "SSL_CRT_FILE", "SSL_KEY_FILE"]);
            const https = HTTPS === "true";
            return {
                server: {
                    host: HOST || "0.0.0.0",
                    port: parseInt(PORT || "3000", 10),
                    open: true,
                    ...(https &&
                        SSL_CRT_FILE &&
                        SSL_KEY_FILE && {
                        https: {
                            cert: readFileSync(resolve(SSL_CRT_FILE)),
                            key: readFileSync(resolve(SSL_KEY_FILE)),
                        },
                    }),
                },
            };
        },
    };
}
// Migration guide: Follow the guide below
// https://vitejs.dev/config/build-options.html#build-sourcemap
function sourcemapPlugin() {
    return {
        name: "sourcemap-plugin",
        config(_, { mode }) {
            const { GENERATE_SOURCEMAP } = loadEnv(mode, ".", [
                "GENERATE_SOURCEMAP",
            ]);
            return {
                build: {
                    sourcemap: GENERATE_SOURCEMAP === "true",
                },
            };
        },
    };
}
// Migration guide: Follow the guide below
// https://vitejs.dev/config/build-options.html#build-outdir
function buildPathPlugin() {
    return {
        name: "build-path-plugin",
        config(_, { mode }) {
            const { BUILD_PATH } = loadEnv(mode, ".", [
                "BUILD_PATH",
            ]);
            return {
                build: {
                    outDir: BUILD_PATH || "build",
                },
            };
        },
    };
}
// Migration guide: Follow the guide below and remove homepage field in package.json
// https://vitejs.dev/config/shared-options.html#base
function basePlugin() {
    return {
        name: "base-plugin",
        config() {
            // The site is served from the domain root. package.json
            // `homepage: "."` is the CRA relative-path default; using it as
            // Vite's base rewrites icon links to `/./favicon-...` and would
            // point a nested route shell at the wrong script. Data URLs still
            // use process.env.PUBLIC_URL, which stays `.`.
            return { base: "/" };
        },
    };
}
// To resolve modules from node_modules, you can prefix paths with ~
// https://create-react-app.dev/docs/adding-a-sass-stylesheet
// Migration guide: Follow the guide below
// https://vitejs.dev/config/shared-options.html#resolve-alias
function importPrefixPlugin() {
    return {
        name: "import-prefix-plugin",
        config() {
            return {
                resolve: {
                    alias: [{ find: /^~([^/])/, replacement: "$1" }],
                },
            };
        },
    };
}
// In Create React App, SVGs can be imported directly as React components. This is achieved by svgr libraries.
// https://create-react-app.dev/docs/adding-images-fonts-and-files/#adding-svgs
function svgrPlugin() {
    const filter = createFilter("**/*.svg");
    const postfixRE = /[?#].*$/s;
    return {
        name: "svgr-plugin",
        async transform(code, id) {
            if (filter(id)) {
                const { transform } = await import("@svgr/core");
                const { default: jsx } = await import("@svgr/plugin-jsx");
                const filePath = id.replace(postfixRE, "");
                const svgCode = readFileSync(filePath, "utf8");
                const componentCode = await transform(svgCode, undefined, {
                    filePath,
                    caller: {
                        previousExport: code,
                        defaultPlugins: [jsx],
                    },
                });
                const res = await transformWithEsbuild(componentCode, id, {
                    loader: "jsx",
                });
                return {
                    code: res.code,
                    map: null,
                };
            }
        },
    };
}
/* One built shell per route, so /Bio's response already contains that
   page's title and share tags. Preview crawlers do not run the bundle.
   Rendering the React tree here would pull in Mapbox and deck.gl for a
   head that does not need them. */
function routeHtmlPlugin() {
    let outDir = "build";
    let command = "serve";
    return {
        name: "route-html",
        configResolved(config) {
            outDir = config.build.outDir;
            command = config.command;
        },
        transformIndexHtml(html, ctx) {
            if (command === "build") return html;
            const route = routeByPath(ctx?.originalUrl || "/") ?? ROUTES[0];
            return applySiteMetaBlock(html, route);
        },
        closeBundle() {
            if (command !== "build") return;
            const indexPath = resolve(outDir, "index.html");
            if (!existsSync(indexPath)) return;
            const shell = readFileSync(indexPath, "utf8");
            for (const route of ROUTES) {
                const html = applySiteMetaBlock(shell, route);
                if (route.path === "/") {
                    writeFileSync(indexPath, html);
                    continue;
                }
                // Vite's preview fallback rewrites /Bio to /Bio.html, and a
                // trailing slash rewrites /Bio/ to /Bio/index.html. Write
                // both so either URL has this route's tags before JS runs.
                const name = route.path.slice(1);
                writeFileSync(resolve(outDir, `${name}.html`), html);
                const dir = resolve(outDir, name);
                mkdirSync(dir, { recursive: true });
                writeFileSync(resolve(dir, "index.html"), html);
            }
        },
    };
}
// Replace %ENV_VARIABLES% in index.html
// https://vitejs.dev/guide/api-plugin.html#transformindexhtml
// Migration guide: Follow the guide below, you may need to rename your environment variable to a name that begins with VITE_ instead of REACT_APP_
// https://vitejs.dev/guide/env-and-mode.html#html-env-replacement
function htmlPlugin(mode) {
    const env = loadEnv(mode, ".", ["REACT_APP_", "NODE_ENV", "PUBLIC_URL"]);
    return {
        name: "html-plugin",
        transformIndexHtml: {
            order: "pre",
            handler(html) {
                return html.replace(/%(.*?)%/g, (match, p1) => env[p1] ?? match);
            },
        },
    };
}
