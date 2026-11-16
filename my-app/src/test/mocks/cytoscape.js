import { vi } from "vitest";

/* Cytoscape needs a laid-out canvas. The mock returns a chainable stub: any
   method returns the stub itself, collections are empty, and each
   cytoscape(options) call is recorded in `cytoscape.instances`. */
function chainable() {
    const target = {};
    const proxy = new Proxy(target, {
        get(obj, prop) {
            if (prop in obj) return obj[prop];
            if (prop === "then") return undefined;
            if (prop === Symbol.iterator) return [][Symbol.iterator].bind([]);
            if (prop === "length" || prop === "size") return prop === "length" ? 0 : () => 0;
            if (prop === "map" || prop === "filter" || prop === "toArray") return () => [];
            if (prop === "empty") return () => true;
            if (prop === "nonempty") return () => false;
            if (typeof prop === "symbol") return undefined;
            obj[prop] = vi.fn(() => proxy);
            return obj[prop];
        },
    });
    return proxy;
}

function cytoscape(options = {}) {
    const instance = chainable();
    instance.options = options;
    cytoscape.instances.push(instance);
    return instance;
}

cytoscape.instances = [];
cytoscape.use = vi.fn();

export default cytoscape;
