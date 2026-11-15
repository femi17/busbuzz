import type { StyleSpecification } from 'maplibre-gl';

/**
 * Free OpenStreetMap raster tiles for the admin dashboard, rendered through
 * MapLibre GL — no token, no per-load cost. Same split as the parent PWA:
 * pins come from Mapbox geocoding (accurate NG addresses); the base map is
 * just streets + context, so OSM's labels are enough. One object to swap for
 * self-hosted Protomaps tiles at scale.
 */
export const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};
