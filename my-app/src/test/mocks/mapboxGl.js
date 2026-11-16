/* mapbox-gl needs WebGL. Pages use it through react-map-gl (also mocked);
   this stub only keeps a direct import from crashing. */
class MockMap {
    constructor(options) {
        this.options = options;
    }
    on() { return this; }
    off() { return this; }
    once() { return this; }
    remove() {}
    resize() { return this; }
    getCanvas() { return document.createElement("canvas"); }
}

const mapboxgl = {
    Map: MockMap,
    accessToken: "",
    supported: () => false,
    setRTLTextPlugin() {},
};

export const Map = MockMap;
export default mapboxgl;
