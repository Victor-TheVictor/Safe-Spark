
import fs from "node:fs";

const inputPath = "public/emergencyPhones.json";
const outputPath = "public/emergencyPhones.geojson";

// This script overwrites the verified map dataset; rerun only when you intend to replace it and will revalidate every location.
const rawData = JSON.parse(
  fs.readFileSync(inputPath, "utf8")
);

const locations = rawData.children?.locations ?? [];

const geojson = {
  type: "FeatureCollection",
  features: locations
    .filter(
      (item) =>
        Number.isFinite(item.lat) &&
        Number.isFinite(item.lng) &&
        item.lat !== 0 &&
        item.lng !== 0
    )
    .map((item) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [item.lng, item.lat]
      },
      properties: {
        id: item.id,
        name: item.name,
        description: item.description,
        level: item.level,
        reference: item.reference,
        mapId: item.mapId
      }
    }))
};

fs.writeFileSync(
  outputPath,
  JSON.stringify(geojson, null, 2)
);

console.log(
  `Successfully converted ${geojson.features.length} emergency phones.`
);
