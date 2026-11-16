import React from "react";

/* react-map-gl's <Map> renders an empty container with data attributes for
   assertions; controls, markers and sources render nothing or their children. */
export const Map = React.forwardRef(function MockMap({ mapStyle, mapboxAccessToken, children }, ref) {
    return (
        <div
            ref={ref}
            data-testid="mock-map"
            data-map-style={typeof mapStyle === "string" ? mapStyle : undefined}
            data-has-token={String(Boolean(mapboxAccessToken))}
        >
            {children}
        </div>
    );
});

const Nothing = () => null;
const Children = ({ children }) => <>{children ?? null}</>;

export const AttributionControl = Nothing;
export const NavigationControl = Nothing;
export const FullscreenControl = Nothing;
export const GeolocateControl = Nothing;
export const ScaleControl = Nothing;
export const Layer = Nothing;
export const Source = Children;
export const Marker = Children;
export const Popup = Children;
export const MapProvider = Children;
export const useMap = () => ({});
export default Map;
