import { setAccessToken } from '@rnmapbox/maps';

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

if (token) {
  setAccessToken(token);
}
