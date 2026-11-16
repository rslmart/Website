/* Every deck.gl layer becomes a record of its props; nothing is drawn. Used
   for both @deck.gl/layers and @deck.gl/aggregation-layers. */
export class MockLayer {
    constructor(props = {}) {
        this.props = props;
        this.id = props.id;
    }
}

const layer = (name) => ({ [name]: class extends MockLayer {} })[name];

export const ArcLayer = layer("ArcLayer");
export const BitmapLayer = layer("BitmapLayer");
export const ColumnLayer = layer("ColumnLayer");
export const GeoJsonLayer = layer("GeoJsonLayer");
export const IconLayer = layer("IconLayer");
export const LineLayer = layer("LineLayer");
export const PathLayer = layer("PathLayer");
export const PointCloudLayer = layer("PointCloudLayer");
export const PolygonLayer = layer("PolygonLayer");
export const ScatterplotLayer = layer("ScatterplotLayer");
export const SolidPolygonLayer = layer("SolidPolygonLayer");
export const TextLayer = layer("TextLayer");
export const ContourLayer = layer("ContourLayer");
export const CPUGridLayer = layer("CPUGridLayer");
export const GPUGridLayer = layer("GPUGridLayer");
export const GridLayer = layer("GridLayer");
export const HeatmapLayer = layer("HeatmapLayer");
export const HexagonLayer = layer("HexagonLayer");
export const ScreenGridLayer = layer("ScreenGridLayer");
