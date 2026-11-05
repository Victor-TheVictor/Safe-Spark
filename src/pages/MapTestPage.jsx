import SafetyMap from "../components/safety-map/SafetyMap";

export default function MapTestPage() {
  return (
    <div style={{ padding: "24px" }}>
      <h1>IU Campus Safety Map</h1>
      <div style={{ height: "600px" }}>
        <SafetyMap />
      </div>
    </div>
  );
}