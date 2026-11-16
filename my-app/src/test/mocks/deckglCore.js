/* @deck.gl/core: views and layers are plain records; WebMercatorViewport is
   the real math from @math.gl/web-mercator (what deck.gl's extends), so
   fitBounds/project give real numbers without WebGL. */
// @math.gl/web-mercator is a transitive dependency of deck.gl (not in package.json);
// if a deck.gl upgrade drops it, this import fails loudly and the mock needs updating.
import { WebMercatorViewport as MathViewport } from "@math.gl/web-mercator";
import { MockLayer } from "./deckglLayers.js";

class MockView {
    constructor(props = {}) {
        this.props = props;
        this.id = props.id;
    }
}

export class WebMercatorViewport extends MathViewport {}
export class MapView extends MockView {}
export class OrthographicView extends MockView {}
export class FlyToInterpolator {
    constructor(props = {}) {
        this.props = props;
    }
}
export class LinearInterpolator extends FlyToInterpolator {}
export class Layer extends MockLayer {}
export class CompositeLayer extends MockLayer {}
export const COORDINATE_SYSTEM = { LNGLAT: 1, METER_OFFSETS: 2, LNGLAT_OFFSETS: 3, CARTESIAN: 0 };
