import {
  Camera,
  LineLayer,
  MapView,
  MarkerView,
  PointAnnotation,
  ShapeSource as ShapeSourceComponent,
  StyleURL,
} from '@rnmapbox/maps';
import {
  useEffect,
  useRef,
  type ComponentType,
  type ElementRef,
  type ReactNode,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BusFrontIcon } from './components/Icons';
import { color } from './theme';

// This file owns every @rnmapbox/maps import so AttendanceScreen can skip
// requiring it inside Expo Go, where the Mapbox native module doesn't exist
// (a top-level import there crashes the whole bundle, not just the map).

// @rnmapbox/maps' generated .d.ts for ShapeSource merges two mismatched
// constructor signatures, which breaks JSX prop-checking even for valid
// usage — same workaround already used in the parent app's HomeScreen.
const ShapeSource = ShapeSourceComponent as unknown as ComponentType<{
  id: string;
  shape: GeoJSON.Feature<GeoJSON.LineString>;
  children?: ReactNode;
}>;

export type LatLng = { lat: number; lng: number };

export type StopPoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export type PickupPin = {
  id: string;
  lat: number;
  lng: number;
  label: string;
};

// A fixed street-level zoom the camera holds steady at, matching the
// parent app's live-tracking view — was previously recomputed on every GPS
// fix via fitBounds (below), which zoomed in and out unpredictably as the
// distance between the bus, the current stop, and pickup pins changed
// while driving, instead of behaving like a normal follow-the-vehicle nav
// view.
const LIVE_ZOOM = 14;

function buildLineFeature(points: LatLng[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map((p) => [p.lng, p.lat]),
    },
  };
}

export function AttendanceMap({
  initialCenter,
  routeLinePoints,
  upcomingStops,
  currentStop,
  pickupPins,
  busPosition,
}: {
  initialCenter: [number, number];
  routeLinePoints: LatLng[];
  upcomingStops: StopPoint[];
  currentStop: StopPoint | null;
  pickupPins: PickupPin[];
  busPosition: LatLng | null;
}) {
  const cameraRef = useRef<ElementRef<typeof Camera> | null>(null);

  // Follow the bus at a fixed zoom — falls back to the current stop, then
  // the first pickup pin, before the first GPS fix arrives. Re-centers on
  // every fix; the phone is mounted, nobody is pinch-zooming mid-drive.
  useEffect(() => {
    const center: LatLng | null =
      busPosition ??
      (currentStop ? { lat: currentStop.latitude, lng: currentStop.longitude } : null) ??
      (pickupPins[0] ? { lat: pickupPins[0].lat, lng: pickupPins[0].lng } : null);

    if (!center) return;

    cameraRef.current?.setCamera({
      centerCoordinate: [center.lng, center.lat],
      zoomLevel: LIVE_ZOOM,
      animationDuration: 600,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStop?.id, busPosition?.lat, busPosition?.lng]);

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      styleURL={StyleURL.Street}
      scrollEnabled
      zoomEnabled
      pitchEnabled={false}
      attributionEnabled={false}
      logoEnabled={false}
    >
      <Camera
        ref={cameraRef}
        defaultSettings={{ centerCoordinate: initialCenter, zoomLevel: LIVE_ZOOM }}
      />

      {/* The road ahead: bus → current stop → every remaining stop */}
      {routeLinePoints.length > 1 && (
        <ShapeSource id="run-line" shape={buildLineFeature(routeLinePoints)}>
          <LineLayer
            id="run-line-layer"
            style={{
              lineColor: color.danfo,
              lineWidth: 4,
              lineCap: 'round',
              lineJoin: 'round',
              lineDasharray: [0.2, 1.8],
            }}
          />
        </ShapeSource>
      )}

      {/* Upcoming stops after the current one — small waypoints */}
      {upcomingStops.map((s) => (
        <PointAnnotation key={s.id} id={`waypoint-${s.id}`} coordinate={[s.longitude, s.latitude]}>
          <View style={styles.waypointDot} />
        </PointAnnotation>
      ))}

      {/* The current stop — where the driver is headed right now */}
      {currentStop && (
        <PointAnnotation
          key={`current-${currentStop.id}`}
          id="current-stop"
          coordinate={[currentStop.longitude, currentStop.latitude]}
        >
          <View style={styles.currentStopPin}>
            <View style={styles.currentStopPinInner} />
          </View>
        </PointAnnotation>
      )}

      {/* Student doors at the current stop (initial-letter pins) */}
      {pickupPins.map((pin) => (
        <PointAnnotation key={pin.id} id={`pin-${pin.id}`} coordinate={[pin.lng, pin.lat]}>
          <View style={styles.pickupPin}>
            <Text style={styles.pickupPinText}>{pin.label}</Text>
          </View>
        </PointAnnotation>
      ))}

      {/* The bus — this phone, live */}
      {busPosition && (
        <MarkerView
          coordinate={[busPosition.lng, busPosition.lat]}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.busMarker}>
            <BusFrontIcon size={20} color={color.danfo} />
          </View>
        </MarkerView>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  waypointDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: color.white,
    borderWidth: 3,
    borderColor: color.ink,
  },
  currentStopPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.danfo,
    borderWidth: 3,
    borderColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentStopPinInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.ink,
  },
  pickupPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.ink,
  },
  pickupPinText: {
    color: color.ink,
    fontWeight: '800',
    fontSize: 12,
  },
  busMarker: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: color.danfo,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 6,
  },
});
