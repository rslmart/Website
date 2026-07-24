import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, { Marker, NavigationControl, useControl } from "react-map-gl";
import Supercluster from "supercluster";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ArcLayer, ScatterplotLayer } from "@deck.gl/layers";
import "mapbox-gl/dist/mapbox-gl.css";
import HomeButton from "../components/HomeButton";
import "./photos.css";

// Self-hosted in S3, served via CloudFront at makoa.link/photos (mirrors the
// Royalty page's MONARCH_IMAGE_BASE). Override with VITE_PHOTO_BASE for local
// testing against a build_photos.py output folder served elsewhere.
const PHOTO_BASE = import.meta.env.VITE_PHOTO_BASE || "https://makoa.link/photos";
const MANIFEST_URL = `${PHOTO_BASE}/photos.json`;
const FLIGHTS_URL = `${PHOTO_BASE}/flights.json`;

const assetUrl = (path) => `${PHOTO_BASE}/${path}`;

const INITIAL_VIEW = { longitude: 5, latitude: 25, zoom: 1.4 };
const FOCUS_ZOOM = 9;

// deck.gl layers (flight arcs + airports) rendered as a Mapbox overlay. Kept in
// its own component so react-map-gl's useControl can attach it to the map.
function DeckOverlay({ layers, getTooltip }) {
    const overlay = useControl(() => new MapboxOverlay({ interleaved: false, pickingRadius: 6 }));
    overlay.setProps({ layers, getTooltip });
    return null;
}

function formatDate(iso) {
    if (!iso) return "Undated";
    // Date-only strings (YYYY-MM-DD, e.g. flight dates) parse as UTC midnight,
    // which shifts back a day in western timezones — parse those as local.
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(iso);
    const d = dateOnly
        ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
        : new Date(iso);
    if (Number.isNaN(d.getTime())) return "Undated";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function PhotosPage() {
    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);

    const [viewMode, setViewMode] = useState("map"); // 'map' | 'gallery'
    const [viewState, setViewState] = useState(INITIAL_VIEW);
    const [bounds, setBounds] = useState([-180, -85, 180, 85]);
    const [focusedIndex, setFocusedIndex] = useState(0);
    const [lightboxIndex, setLightboxIndex] = useState(null);

    const [flights, setFlights] = useState([]);
    const [airports, setAirports] = useState({});
    const [showFlights, setShowFlights] = useState(true);
    const [flightListOpen, setFlightListOpen] = useState(false);
    const [selectedFlight, setSelectedFlight] = useState(null);

    const mapRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(MANIFEST_URL);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (cancelled) return;
                const list = Array.isArray(data) ? data : data.photos || [];
                setPhotos(list);
            } catch (err) {
                if (!cancelled) setLoadError(err.message || String(err));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Flights are optional; a missing flights.json just means no arcs.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(FLIGHTS_URL);
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                setFlights(data.flights || []);
                setAirports(data.airports || {});
            } catch {
                /* no flights overlay */
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Only show flights that have actually happened: up to one month before today
    // (client-side so it stays correct without re-running the pipeline).
    const visibleFlights = useMemo(() => {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - 1);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        return flights.filter((f) => f.date && f.date <= cutoffStr);
    }, [flights]);

    const flightLayers = useMemo(() => {
        if (!showFlights || !visibleFlights.length) return [];
        const at = (code) => airports[code];
        const arcData = visibleFlights.filter((f) => at(f.from) && at(f.to));
        const usedAirports = new Set();
        arcData.forEach((f) => { usedAirports.add(f.from); usedAirports.add(f.to); });
        return [
            new ArcLayer({
                id: "flight-arcs",
                data: arcData,
                greatCircle: true,
                getSourcePosition: (f) => [at(f.from).lng, at(f.from).lat],
                getTargetPosition: (f) => [at(f.to).lng, at(f.to).lat],
                getSourceColor: (f) => (f === selectedFlight ? [255, 255, 255, 255] : [56, 189, 248, 180]),
                getTargetColor: (f) => (f === selectedFlight ? [255, 255, 255, 255] : [245, 158, 11, 200]),
                getWidth: (f) => (f === selectedFlight ? 3.5 : 1.4),
                getHeight: 0,
                widthUnits: "pixels",
                pickable: true,
                autoHighlight: true,
                highlightColor: [255, 255, 255, 230],
                updateTriggers: {
                    getSourceColor: selectedFlight,
                    getTargetColor: selectedFlight,
                    getWidth: selectedFlight,
                },
            }),
            new ScatterplotLayer({
                id: "flight-airports",
                data: Object.values(airports).filter((a) => usedAirports.has(a.code)),
                getPosition: (a) => [a.lng, a.lat],
                getRadius: 3.5,
                radiusUnits: "pixels",
                getFillColor: [245, 158, 11, 230],
                stroked: true,
                getLineColor: [255, 255, 255, 220],
                lineWidthUnits: "pixels",
                getLineWidth: 1,
                pickable: true,
            }),
        ];
    }, [showFlights, visibleFlights, airports, selectedFlight]);

    // Frame a flight's arc on the map. Adjust longitudes so antimeridian routes
    // (e.g. SEA→TPE) frame the short way instead of zooming out to the whole globe.
    const zoomToFlight = useCallback((f) => {
        const a = airports[f.from];
        const b = airports[f.to];
        const map = mapRef.current;
        if (!a || !b || !map) return;
        let lngA = a.lng;
        let lngB = b.lng;
        if (Math.abs(lngA - lngB) > 180) {
            if (lngA < lngB) lngA += 360; else lngB += 360;
        }
        map.fitBounds(
            [[Math.min(lngA, lngB), Math.min(a.lat, b.lat)], [Math.max(lngA, lngB), Math.max(a.lat, b.lat)]],
            { padding: { top: 90, bottom: 170, left: 90, right: flightListOpen ? 380 : 90 }, duration: 1200, maxZoom: 7 }
        );
    }, [airports, flightListOpen]);

    const handleFlightClick = useCallback((f) => {
        setSelectedFlight(f);
        setShowFlights(true);
        zoomToFlight(f);
    }, [zoomToFlight]);

    const getFlightTooltip = useCallback(({ object, layer }) => {
        if (!object || !layer) return null;
        const style = {
            whiteSpace: "pre-line",
            fontSize: "12px",
            lineHeight: "1.45",
            background: "rgba(12, 16, 22, 0.92)",
            color: "#e6edf5",
            padding: "8px 10px",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.12)",
        };
        if (layer.id === "flight-airports") {
            return { text: `${object.code} — ${object.city}, ${object.country}`, style };
        }
        if (layer.id === "flight-arcs") {
            const from = airports[object.from];
            const to = airports[object.to];
            const route = `${object.from} → ${object.to}`;
            const cities = from && to ? `${from.city} → ${to.city}` : "";
            const flightNo = [object.airline, object.flight].filter(Boolean).join(" ");
            const lines = [
                route,
                cities,
                [formatDate(object.date), flightNo].filter(Boolean).join("  ·  "),
                object.aircraft,
            ].filter(Boolean);
            return { text: lines.join("\n"), style };
        }
        return null;
    }, [airports]);

    // Photos that have coordinates can go on the map; all photos appear in the
    // gallery and timeline (chronological order comes from the manifest).
    const placed = useMemo(
        () => photos.filter((p) => p.lat != null && p.lng != null),
        [photos]
    );

    // Build the cluster index once. map/reduce carry a representative photo
    // (the newest in each cluster) so a cluster can render one thumbnail.
    const clusterIndex = useMemo(() => {
        if (!placed.length) return null;
        const index = new Supercluster({
            radius: 60,
            maxZoom: 16,
            map: (props) => ({ repThumb: props.thumb, repDate: props.date || "" }),
            reduce: (acc, props) => {
                if ((props.repDate || "") >= (acc.repDate || "")) {
                    acc.repDate = props.repDate;
                    acc.repThumb = props.repThumb;
                }
            },
        });
        index.load(
            placed.map((p) => ({
                type: "Feature",
                properties: { photoId: p.id, thumb: p.thumb, date: p.date },
                geometry: { type: "Point", coordinates: [p.lng, p.lat] },
            }))
        );
        return index;
    }, [placed]);

    const clusters = useMemo(() => {
        if (!clusterIndex) return [];
        const zoom = Math.round(viewState.zoom);
        return clusterIndex.getClusters(bounds, zoom);
    }, [clusterIndex, bounds, viewState.zoom]);

    const idToIndex = useMemo(() => {
        const m = new Map();
        photos.forEach((p, i) => m.set(p.id, i));
        return m;
    }, [photos]);

    const syncBounds = useCallback((mapInstance) => {
        if (!mapInstance) return;
        const b = mapInstance.getBounds();
        setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    }, []);

    const flyTo = useCallback((photo, zoom = FOCUS_ZOOM) => {
        if (!photo || photo.lat == null || photo.lng == null) return;
        const map = mapRef.current;
        if (map) map.flyTo({ center: [photo.lng, photo.lat], zoom, duration: 1400 });
    }, []);

    const focusPhoto = useCallback((index, { fly = true } = {}) => {
        if (index < 0 || index >= photos.length) return;
        setFocusedIndex(index);
        const photo = photos[index];
        if (fly && photo.lat != null && photo.lng != null) {
            setViewMode("map");
            flyTo(photo);
        }
    }, [photos, flyTo]);

    const handleClusterClick = useCallback((cluster) => {
        if (!clusterIndex) return;
        const [lng, lat] = cluster.geometry.coordinates;
        const expansionZoom = Math.min(
            clusterIndex.getClusterExpansionZoom(cluster.id),
            18
        );
        const map = mapRef.current;
        if (map) map.flyTo({ center: [lng, lat], zoom: expansionZoom, duration: 900 });
    }, [clusterIndex]);

    // Lightbox navigation across the full chronological list.
    const openLightbox = useCallback((index) => setLightboxIndex(index), []);
    const closeLightbox = useCallback(() => setLightboxIndex(null), []);
    const stepLightbox = useCallback((delta) => {
        setLightboxIndex((cur) => {
            if (cur == null) return cur;
            const next = cur + delta;
            if (next < 0 || next >= photos.length) return cur;
            return next;
        });
    }, [photos.length]);

    useEffect(() => {
        const onKey = (e) => {
            if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
            if (lightboxIndex != null) {
                if (e.key === "Escape") closeLightbox();
                else if (e.key === "ArrowRight") stepLightbox(1);
                else if (e.key === "ArrowLeft") stepLightbox(-1);
                return;
            }
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            const next = focusedIndex + (e.key === "ArrowRight" ? 1 : -1);
            if (next < 0 || next >= photos.length) return;
            // Capture-phase + preventDefault so the map doesn't also pan.
            e.preventDefault();
            e.stopPropagation();
            focusPhoto(next, { fly: viewMode === "map" });
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [lightboxIndex, focusedIndex, photos.length, viewMode, closeLightbox, stepLightbox, focusPhoto]);

    const focused = photos[focusedIndex];
    const lightboxPhoto = lightboxIndex != null ? photos[lightboxIndex] : null;

    return (
        <div className="photos-page">
            <HomeButton />

            <div className="photos-toolbar">
                <div className="photos-toggle" role="tablist" aria-label="View mode">
                    <button
                        role="tab"
                        aria-selected={viewMode === "map"}
                        className={viewMode === "map" ? "active" : ""}
                        onClick={() => setViewMode("map")}
                    >
                        Map
                    </button>
                    <button
                        role="tab"
                        aria-selected={viewMode === "gallery"}
                        className={viewMode === "gallery" ? "active" : ""}
                        onClick={() => setViewMode("gallery")}
                    >
                        Gallery
                    </button>
                </div>
                {viewMode === "map" && visibleFlights.length > 0 && (
                    <>
                        <button
                            className={`photos-flights-toggle${showFlights ? " active" : ""}`}
                            onClick={() => setShowFlights((v) => !v)}
                            aria-pressed={showFlights}
                        >
                            {`Flights (${visibleFlights.length})`}
                        </button>
                        <button
                            className={`photos-flights-toggle${flightListOpen ? " active" : ""}`}
                            onClick={() => setFlightListOpen((v) => !v)}
                            aria-pressed={flightListOpen}
                        >
                            {flightListOpen ? "Hide list" : "Flight list"}
                        </button>
                    </>
                )}
            </div>

            {viewMode === "map" && (
                <div className="photos-map">
                    <MapGL
                        ref={mapRef}
                        reuseMaps
                        initialViewState={INITIAL_VIEW}
                        mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
                        mapStyle="mapbox://styles/mapbox/dark-v9"
                        onLoad={(e) => syncBounds(e.target)}
                        onMove={(e) => {
                            setViewState(e.viewState);
                            syncBounds(e.target);
                        }}
                    >
                        <NavigationControl position="bottom-right" showCompass={false} />

                        {flightLayers.length > 0 && (
                            <DeckOverlay layers={flightLayers} getTooltip={getFlightTooltip} />
                        )}

                        {clusters.map((feature) => {
                            const [lng, lat] = feature.geometry.coordinates;
                            const props = feature.properties;
                            if (props.cluster) {
                                return (
                                    <Marker key={`cluster-${feature.id}`} longitude={lng} latitude={lat}>
                                        <button
                                            className="photo-cluster"
                                            style={{ backgroundImage: `url(${assetUrl(props.repThumb)})` }}
                                            onClick={() => handleClusterClick(feature)}
                                            aria-label={`${props.point_count} photos`}
                                        >
                                            <span className="photo-cluster-count">{props.point_count}</span>
                                        </button>
                                    </Marker>
                                );
                            }
                            const index = idToIndex.get(props.photoId);
                            const isFocused = index === focusedIndex;
                            return (
                                <Marker key={`p-${props.photoId}`} longitude={lng} latitude={lat}>
                                    <button
                                        className={`photo-pin${isFocused ? " focused" : ""}`}
                                        style={{ backgroundImage: `url(${assetUrl(props.thumb)})` }}
                                        onClick={() => openLightbox(index)}
                                        aria-label={photos[index]?.caption || "View photo"}
                                    />
                                </Marker>
                            );
                        })}
                    </MapGL>

                    {focused && (
                        <div className="photos-focus-bar">
                            <img src={assetUrl(focused.gallery)} alt="" />
                            <div className="photos-focus-bar-row">
                                <div className="photos-focus-meta">
                                    <span className="photos-focus-date">{formatDate(focused.date)}</span>
                                    {focused.camera && (
                                        <span className="photos-focus-camera">{focused.camera}</span>
                                    )}
                                </div>
                                <button className="btn-primary" onClick={() => openLightbox(focusedIndex)}>
                                    View
                                </button>
                            </div>
                        </div>
                    )}

                    {flightListOpen && visibleFlights.length > 0 && (
                        <div className="photos-flight-list">
                            <div className="photos-flight-list-header">
                                <span>{`Flights (${visibleFlights.length})`}</span>
                                <button
                                    className="photos-flight-list-close"
                                    onClick={() => setFlightListOpen(false)}
                                    aria-label="Close flight list"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="photos-flight-list-scroll">
                                {[...visibleFlights].reverse().map((f, i) => {
                                    const from = airports[f.from];
                                    const to = airports[f.to];
                                    return (
                                        <button
                                            key={`${f.date}-${f.from}-${f.to}-${i}`}
                                            className={`photos-flight-row${f === selectedFlight ? " selected" : ""}`}
                                            onClick={() => handleFlightClick(f)}
                                        >
                                            <div className="pf-route">{`${f.from} → ${f.to}`}</div>
                                            <div className="pf-cities">
                                                {from && to ? `${from.city} → ${to.city}` : ""}
                                            </div>
                                            <div className="pf-meta">
                                                {[formatDate(f.date), [f.airline, f.flight].filter(Boolean).join(" "), f.aircraft]
                                                    .filter(Boolean)
                                                    .join("  ·  ")}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {viewMode === "gallery" && (
                <div className="photos-gallery">
                    {photos.map((p, i) => (
                        <button
                            key={p.id}
                            className="photos-gallery-item"
                            onClick={() => openLightbox(i)}
                        >
                            <img src={assetUrl(p.gallery)} alt={p.caption || ""} loading="lazy" />
                        </button>
                    ))}
                </div>
            )}

            {/* Timeline strip (both views) */}
            {photos.length > 0 && (
                <div className="photos-timeline">
                    <div className="photos-timeline-controls">
                        <button
                            aria-label="Previous photo"
                            disabled={focusedIndex <= 0}
                            onClick={() => focusPhoto(focusedIndex - 1)}
                        >
                            ‹
                        </button>
                        <span className="photos-timeline-date">
                            {focused ? formatDate(focused.date) : ""}
                        </span>
                        <button
                            aria-label="Next photo"
                            disabled={focusedIndex >= photos.length - 1}
                            onClick={() => focusPhoto(focusedIndex + 1)}
                        >
                            ›
                        </button>
                    </div>
                    <div className="photos-timeline-track">
                        {photos.map((p, i) => (
                            <button
                                key={p.id}
                                className={`photos-timeline-item${i === focusedIndex ? " active" : ""}`}
                                title={formatDate(p.date)}
                                onClick={() => focusPhoto(i)}
                                style={{ backgroundImage: `url(${assetUrl(p.thumb)})` }}
                            />
                        ))}
                    </div>
                </div>
            )}

            {lightboxPhoto && (
                <div className="photos-lightbox" onClick={closeLightbox}>
                    <button className="photos-lightbox-close" onClick={closeLightbox} aria-label="Close">
                        ×
                    </button>
                    {lightboxIndex > 0 && (
                        <button
                            className="photos-lightbox-nav prev"
                            onClick={(e) => { e.stopPropagation(); stepLightbox(-1); }}
                            aria-label="Previous"
                        >
                            ‹
                        </button>
                    )}
                    <figure className="photos-lightbox-figure" onClick={(e) => e.stopPropagation()}>
                        <img src={assetUrl(lightboxPhoto.large)} alt={lightboxPhoto.caption || ""} />
                        <figcaption>
                            <span>{formatDate(lightboxPhoto.date)}</span>
                            {lightboxPhoto.camera && <span>{lightboxPhoto.camera}</span>}
                            {lightboxPhoto.lat != null && (
                                <span>
                                    {lightboxPhoto.lat.toFixed(4)}, {lightboxPhoto.lng.toFixed(4)}
                                </span>
                            )}
                            {lightboxPhoto.lat != null && (
                                <button
                                    className="photos-lightbox-locate"
                                    onClick={() => {
                                        closeLightbox();
                                        focusPhoto(lightboxIndex);
                                    }}
                                >
                                    Show on map
                                </button>
                            )}
                        </figcaption>
                    </figure>
                    {lightboxIndex < photos.length - 1 && (
                        <button
                            className="photos-lightbox-nav next"
                            onClick={(e) => { e.stopPropagation(); stepLightbox(1); }}
                            aria-label="Next"
                        >
                            ›
                        </button>
                    )}
                </div>
            )}

            {(loading || loadError) && (
                <div className="photos-status">
                    {loadError ? `Could not load photos: ${loadError}` : "Loading photos…"}
                </div>
            )}
        </div>
    );
}

export default PhotosPage;
