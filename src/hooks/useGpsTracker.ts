import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bearingDegrees,
  distanceToTrailMeters,
  haversineKm,
} from '../data/hamsterleyTrails';
import { GpsPosition, NavTarget, Trail } from '../types/trail';

export type GpsMode = 'idle' | 'live' | 'simulated';

interface GpsTrackerState {
  mode: GpsMode;
  position: GpsPosition | null;
  error: string | null;
  isRecording: boolean;
  elapsedSec: number;
  distanceKm: number;
  elevationGainM: number;
  breadCrumbs: { lat: number; lng: number }[];
  offRouteMeters: number | null;
  nearestIndex: number;
  nextWaypointDistanceKm: number | null;
  nextWaypointBearing: number | null;
  nextWaypointName: string | null;
  nextWaypointInstruction: string | null;
  navTargetDistanceKm: number | null;
  navTargetBearing: number | null;
  navTargetEleDeltaM: number | null;
}

export function useGpsTracker(
  activeTrail: Trail,
  activeNavTarget: NavTarget | null = null
) {
  const [mode, setMode] = useState<GpsMode>('idle');
  const [position, setPosition] = useState<GpsPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceKm, setDistanceKm] = useState(0);
  const [elevationGainM, setElevationGainM] = useState(0);
  const [breadCrumbs, setBreadCrumbs] = useState<{ lat: number; lng: number }[]>([]);

  const watchIdRef = useRef<number | null>(null);
  const simProgressRef = useRef(0);
  const lastPointRef = useRef<{ lat: number; lng: number; ele: number | null } | null>(null);

  const stopGps = useCallback(() => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setMode('idle');
    setIsRecording(false);
  }, []);

  const ingestPosition = useCallback(
    (nextPos: GpsPosition) => {
      setPosition(nextPos);
      if (isRecording) {
        setBreadCrumbs((prev) => {
          const last = prev[prev.length - 1];
          if (!last || haversineKm(last, nextPos) > 0.015) {
            return [...prev.slice(-400), { lat: nextPos.lat, lng: nextPos.lng }];
          }
          return prev;
        });

        if (lastPointRef.current) {
          const stepKm = haversineKm(lastPointRef.current, nextPos);
          if (stepKm > 0.004 && stepKm < 0.5) {
            setDistanceKm((d) => Math.round((d + stepKm) * 100) / 100);
          }
          if (
            nextPos.ele !== null &&
            lastPointRef.current.ele !== null &&
            nextPos.ele > lastPointRef.current.ele
          ) {
            const climb = nextPos.ele - lastPointRef.current.ele;
            if (climb < 40) {
              setElevationGainM((g) => Math.round(g + climb));
            }
          }
        }
        lastPointRef.current = { lat: nextPos.lat, lng: nextPos.lng, ele: nextPos.ele };
      }
    },
    [isRecording]
  );

  const startLiveGps = useCallback(
    (beginRecording = false) => {
      setError(null);
      if (!('geolocation' in navigator)) {
        setError('Geolocation is not supported on this device. Try Trail Demo Mode.');
        return;
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (beginRecording) {
        setDistanceKm(0);
        setElevationGainM(0);
        setElapsedSec(0);
        setBreadCrumbs([]);
        lastPointRef.current = null;
        setIsRecording(true);
      }
      setMode('live');

      watchIdRef.current = navigator.geolocation.watchPosition(
        (geo) => {
          const speedKmh =
            geo.coords.speed !== null && geo.coords.speed >= 0
              ? Math.round(geo.coords.speed * 3.6 * 10) / 10
              : 0;
          ingestPosition({
            lat: geo.coords.latitude,
            lng: geo.coords.longitude,
            ele: geo.coords.altitude !== null ? Math.round(geo.coords.altitude) : null,
            accuracy: Math.round(geo.coords.accuracy),
            speedKmh,
            heading: geo.coords.heading,
            timestamp: geo.timestamp,
          });
        },
        (geoErr) => {
          setError(
            geoErr.code === 1
              ? 'Location access denied. Allow GPS or switch to Simulated Forest Ride.'
              : 'Waiting for GPS satellite lock in forest canopy…'
          );
        },
        {
          enableHighAccuracy: true,
          maximumAge: 3000,
          timeout: 12000,
        }
      );
    },
    [ingestPosition]
  );

  const startSimulatedRide = useCallback(
    (beginRecording = true) => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setError(null);
      simProgressRef.current = 0;
      if (beginRecording) {
        setDistanceKm(0);
        setElevationGainM(0);
        setElapsedSec(0);
        setBreadCrumbs([]);
        lastPointRef.current = null;
        setIsRecording(true);
      }
      setMode('simulated');
      const startPt = activeTrail.coordinates[0];
      setPosition({
        lat: startPt.lat,
        lng: startPt.lng,
        ele: startPt.ele,
        accuracy: 6,
        speedKmh: 18.4,
        heading: bearingDegrees(startPt, activeTrail.coordinates[1] || startPt),
        timestamp: Date.now(),
      });
    },
    [activeTrail]
  );

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (mode !== 'simulated') return;
    const coords = activeTrail.coordinates;
    if (coords.length < 2) return;

    const interval = window.setInterval(() => {
      simProgressRef.current = (simProgressRef.current + 0.045) % (coords.length - 1);
      const idx = Math.floor(simProgressRef.current);
      const frac = simProgressRef.current - idx;
      const a = coords[idx];
      const b = coords[Math.min(idx + 1, coords.length - 1)];

      const lat = a.lat + (b.lat - a.lat) * frac;
      const lng = a.lng + (b.lng - a.lng) * frac;
      const ele = Math.round(a.ele + (b.ele - a.ele) * frac);
      const heading = bearingDegrees(a, b);
      const slope = b.ele - a.ele;
      const speedKmh = slope < -5 ? 27.5 : slope > 5 ? 11.8 : 19.2;

      ingestPosition({
        lat,
        lng,
        ele,
        accuracy: 5,
        speedKmh,
        heading,
        timestamp: Date.now(),
      });
    }, 900);

    return () => window.clearInterval(interval);
  }, [mode, activeTrail, ingestPosition]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  let offRouteMeters: number | null = null;
  let nearestIndex = 0;
  let nextWaypointDistanceKm: number | null = null;
  let nextWaypointBearing: number | null = null;
  let nextWaypointName: string | null = null;
  let nextWaypointInstruction: string | null = null;
  let navTargetDistanceKm: number | null = null;
  let navTargetBearing: number | null = null;
  let navTargetEleDeltaM: number | null = null;

  if (position) {
    const prox = distanceToTrailMeters(position, activeTrail);
    offRouteMeters = prox.minMeters;
    nearestIndex = prox.nearestIndex;

    const targetWaypoint =
      activeTrail.waypoints.find((w) => {
        const d = haversineKm(position, w);
        return d > 0.08;
      }) ||
      activeTrail.waypoints[activeTrail.waypoints.length - 1] || {
        name: `${activeTrail.name} Finish`,
        lat: activeTrail.coordinates[activeTrail.coordinates.length - 1].lat,
        lng: activeTrail.coordinates[activeTrail.coordinates.length - 1].lng,
        instruction: 'Continue along trail line to sector exit.',
      };

    nextWaypointName = targetWaypoint.name;
    nextWaypointInstruction = targetWaypoint.instruction;
    nextWaypointDistanceKm =
      Math.round(haversineKm(position, targetWaypoint) * 100) / 100;
    nextWaypointBearing = Math.round(bearingDegrees(position, targetWaypoint));

    if (activeNavTarget) {
      navTargetDistanceKm =
        Math.round(haversineKm(position, activeNavTarget) * 100) / 100;
      navTargetBearing = Math.round(bearingDegrees(position, activeNavTarget));
      if (position.ele !== null && typeof activeNavTarget.ele === 'number') {
        navTargetEleDeltaM = Math.round(activeNavTarget.ele - position.ele);
      }
    }
  }

  const state: GpsTrackerState = {
    mode,
    position,
    error,
    isRecording,
    elapsedSec,
    distanceKm,
    elevationGainM,
    breadCrumbs,
    offRouteMeters,
    nearestIndex,
    nextWaypointDistanceKm,
    nextWaypointBearing,
    nextWaypointName,
    nextWaypointInstruction,
    navTargetDistanceKm,
    navTargetBearing,
    navTargetEleDeltaM,
  };

  return {
    ...state,
    startLiveGps,
    startSimulatedRide,
    stopGps,
    setIsRecording,
  };
}
