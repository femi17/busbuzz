import type { StyleSpecification } from "maplibre-gl";

/**
 * Free OpenStreetMap raster tiles, rendered through MapLibre GL — no access
 * token, no per-load cost. We deliberately split map concerns:
 *   - PINS come from Mapbox geocoding (accurate Nigerian street addresses),
 *     stored as lat/lng when an admin adds a child.
 *   - The BASE MAP is just streets + context, so OSM's own labels are enough.
 *
 * OSM's tile usage policy requires visible attribution (added as a compact
 * control on each map) and is fine for pilot-scale traffic. The upgrade path
 * at scale is self-hosted Protomaps tiles — swap this one style object.
 */
export const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};
