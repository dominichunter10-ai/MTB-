import {
  AYHOPE_BECK_STREAM,
  BEDBURN_BECK_STREAM,
  BUILT_IN_DROP_IN_PINS,
  FOREST_DRIVE_ROAD,
  FOREST_LANDMARKS,
  FOREST_ROAD_NETWORK,
  HAMSTERLEY_TRAILS,
  HAMSTERLEY_WOODLAND_POLYGONS,
  SPURLSWOOD_BECK_STREAM,
} from '../data/hamsterleyTrails';
import { DifficultyVote, HazardReport, NavPin, RideLog } from '../types/trail';

const DB_NAME = 'hamsterley-mtb-offline-v1';
const DB_VERSION = 2;

export interface OfflineForestPack {
  id: 'hamsterley-pack';
  version: string;
  downloadedAtMs: number;
  trailCount: number;
  waypointCount: number;
  sizeBytes: number;
  trails: typeof HAMSTERLEY_TRAILS;
  landmarks: typeof FOREST_LANDMARKS;
  builtInPins: typeof BUILT_IN_DROP_IN_PINS;
  woodlandPolygons: typeof HAMSTERLEY_WOODLAND_POLYGONS;
  forestRoadNetwork: typeof FOREST_ROAD_NETWORK;
  stream: typeof BEDBURN_BECK_STREAM;
  spurlswoodStream: typeof SPURLSWOOD_BECK_STREAM;
  ayhopeStream: typeof AYHOPE_BECK_STREAM;
  forestRoad: typeof FOREST_DRIVE_ROAD;
}

export interface PendingSyncItem {
  id: string;
  kind: 'hazard' | 'vote' | 'ride' | 'pin';
  payload: HazardReport | DifficultyVote | RideLog | NavPin;
  queuedAtMs: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('packs')) {
        db.createObjectStore('packs', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('hazardsCache')) {
        db.createObjectStore('hazardsCache', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('votesCache')) {
        db.createObjectStore('votesCache', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pendingSync')) {
        db.createObjectStore('pendingSync', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('ridesCache')) {
        db.createObjectStore('ridesCache', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('navPinsCache')) {
        db.createObjectStore('navPinsCache', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function downloadOfflineForestPack(): Promise<OfflineForestPack> {
  const waypointCount =
    HAMSTERLEY_TRAILS.reduce(
      (sum, t) => sum + t.coordinates.length + t.waypoints.length,
      0
    ) + BUILT_IN_DROP_IN_PINS.length;
  const rawPayload = {
    id: 'hamsterley-pack' as const,
    version: '2026.12',
    downloadedAtMs: Date.now(),
    trailCount: HAMSTERLEY_TRAILS.length,
    waypointCount,
    trails: HAMSTERLEY_TRAILS,
    landmarks: FOREST_LANDMARKS,
    builtInPins: BUILT_IN_DROP_IN_PINS,
    woodlandPolygons: HAMSTERLEY_WOODLAND_POLYGONS,
    forestRoadNetwork: FOREST_ROAD_NETWORK,
    stream: BEDBURN_BECK_STREAM,
    spurlswoodStream: SPURLSWOOD_BECK_STREAM,
    ayhopeStream: AYHOPE_BECK_STREAM,
    forestRoad: FOREST_DRIVE_ROAD,
  };
  const encoded = new TextEncoder().encode(JSON.stringify(rawPayload));
  const pack: OfflineForestPack = {
    ...rawPayload,
    sizeBytes: encoded.byteLength,
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('packs', 'readwrite');
    tx.objectStore('packs').put(pack);
    tx.oncomplete = () => resolve(pack);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOfflineForestPack(): Promise<OfflineForestPack | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('packs', 'readonly');
      const req = tx.objectStore('packs').get('hamsterley-pack');
      req.onsuccess = () => resolve((req.result as OfflineForestPack) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deleteOfflineForestPack(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('packs', 'readwrite');
    tx.objectStore('packs').delete('hamsterley-pack');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cacheHazardsAndVotes(
  hazards: HazardReport[],
  votes: DifficultyVote[]
): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['hazardsCache', 'votesCache'], 'readwrite');
      const hStore = tx.objectStore('hazardsCache');
      const vStore = tx.objectStore('votesCache');
      hStore.clear();
      vStore.clear();
      hazards.forEach((h) => hStore.put(h));
      votes.forEach((v) => vStore.put(v));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB unavailable in private sandbox; ignore gracefully
  }
}

export async function readCachedHazardsAndVotes(): Promise<{
  hazards: HazardReport[];
  votes: DifficultyVote[];
}> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['hazardsCache', 'votesCache'], 'readonly');
      const hReq = tx.objectStore('hazardsCache').getAll();
      const vReq = tx.objectStore('votesCache').getAll();
      tx.oncomplete = () => {
        resolve({
          hazards: (hReq.result as HazardReport[]) || [],
          votes: (vReq.result as DifficultyVote[]) || [],
        });
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return { hazards: [], votes: [] };
  }
}

export async function cacheNavPins(pins: NavPin[]): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('navPinsCache', 'readwrite');
      const store = tx.objectStore('navPinsCache');
      store.clear();
      pins.forEach((p) => store.put(p));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore when storage unavailable
  }
}

export async function readCachedNavPins(): Promise<NavPin[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('navPinsCache', 'readonly');
      const req = tx.objectStore('navPinsCache').getAll();
      req.onsuccess = () => resolve((req.result as NavPin[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function queuePendingSync(item: PendingSyncItem): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingSync', 'readwrite');
    tx.objectStore('pendingSync').put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPendingSync(): Promise<PendingSyncItem[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('pendingSync', 'readonly');
      const req = tx.objectStore('pendingSync').getAll();
      req.onsuccess = () => resolve((req.result as PendingSyncItem[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function removePendingSync(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingSync', 'readwrite');
    tx.objectStore('pendingSync').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cacheRideLog(ride: RideLog): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('ridesCache', 'readwrite');
      tx.objectStore('ridesCache').put(ride);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore when storage unavailable
  }
}

export async function readCachedRides(): Promise<RideLog[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('ridesCache', 'readonly');
      const req = tx.objectStore('ridesCache').getAll();
      req.onsuccess = () => resolve((req.result as RideLog[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function clearAllLocalUserData(): Promise<void> {
  try {
    const db = await openDB();
    const storeNames = [
      'packs',
      'hazardsCache',
      'votesCache',
      'pendingSync',
      'ridesCache',
      'navPinsCache',
    ].filter((name) => db.objectStoreNames.contains(name));
    if (storeNames.length === 0) return;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeNames, 'readwrite');
      for (const storeName of storeNames) {
        tx.objectStore(storeName).clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB unavailable in private sandbox; ignore gracefully
  }
}

