
import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import {
  LayerGroup,
  LayersControl,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./SafetyMap.css";

// VERIFIED MAP BASELINE: keep the Leaflet provider, IU center, zoom, and marker placement stable unless locations are revalidated.
const IU_CENTER = [39.1688, -86.5230];
const blueLightPhoneIcon = L.divIcon({
  className: "blue-light-phone-icon",
  html: '<span class="blue-light-phone-marker"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.8c.5-.5 1.3-.5 1.8 0l2 2c.5.5.5 1.2.1 1.7l-1.3 1.7a13.4 13.4 0 0 0 3 3l1.7-1.3c.5-.4 1.2-.4 1.7.1l2 2c.5.5.5 1.3 0 1.8l-1.2 1.2c-.8.8-2 1.1-3.1.7-4.3-1.5-7.7-4.9-9.2-9.2-.4-1.1-.1-2.3.7-3.1z"/></svg></span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -17],
});

function getFacilityName(properties = {}) {
  const name = properties.name?.trim();
  return !name || name.toLowerCase() === "emergency phone" ? "Blue Light Phone" : name;
}

function getLocationDescription(description = "") {
  return description
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export default function SafetyMap() {
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const locations = useMemo(() => {
    const groupedLocations = new Map();

    features.forEach((feature) => {
      const coordinates = feature.geometry?.coordinates;
      if (feature.geometry?.type !== "Point" || !Array.isArray(coordinates) || coordinates.length < 2) {
        return;
      }

      // Verified coordinate order: GeoJSON stores [longitude, latitude]; Leaflet receives [latitude, longitude].
      const [longitude, latitude] = coordinates;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      const key = `${longitude},${latitude}`;
      const location = groupedLocations.get(key) ?? {
        key,
        position: [latitude, longitude],
        facilities: [],
      };
      location.facilities.push(feature.properties ?? {});
      groupedLocations.set(key, location);
    });

    return [...groupedLocations.values()];
  }, [features]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadBlueLightPhones() {
      try {
        // This is the manually verified map dataset. Do not substitute or regenerate it without rechecking its locations.
        const response = await fetch("/emergencyPhones.geojson", {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const collection = await response.json();
        if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
          throw new Error("The map data is not a valid GeoJSON FeatureCollection.");
        }

        setFeatures(collection.features);
      } catch (fetchError) {
        if (fetchError.name !== "AbortError") {
          setError("Blue Light Phones could not be loaded. Please try again later.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadBlueLightPhones();
    return () => controller.abort();
  }, []);

  return (
    <div className="safety-map-wrapper">
      <MapContainer
        center={IU_CENTER}
        zoom={16}
        scrollWheelZoom={true}
        className="safety-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LayersControl position="topright">
          <LayersControl.Overlay checked name="Blue Light Phones">
            <LayerGroup>
              {locations.map((location) => {
                return (
                  <Marker
                    key={location.key}
                    position={location.position}
                    icon={blueLightPhoneIcon}
                  >
                    <Popup>
                      {location.facilities.map((properties, index) => {
                        const description = getLocationDescription(properties.description);
                        const key = properties.id ?? `${location.key}-${index}`;

                        return (
                          <div className="blue-light-phone-facility" key={key}>
                            <strong>{getFacilityName(properties)}</strong>
                            {description && <p className="blue-light-phone-description">{description}</p>}
                          </div>
                        );
                      })}
                    </Popup>
                  </Marker>
                );
              })}
            </LayerGroup>
          </LayersControl.Overlay>
        </LayersControl>
      </MapContainer>
      {loading && <div className="safety-map-status" role="status">Loading Blue Light Phones…</div>}
      {error && <div className="safety-map-status safety-map-error" role="alert">{error}</div>}
    </div>
  );
}
