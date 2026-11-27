import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteUser,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithCredential,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  collection,
  deleteDoc,
  doc,
  DocumentReference,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  Download,
  Flag,
  Layers,
  List,
  LogIn,
  LogOut,
  Map as MapIcon,
  MapPin,
  Navigation,
  Play,
  Plus,
  Search,
  Square,
  Star,
  ThumbsUp,
  WifiOff,
  X,
} from 'lucide-react';
import { ElevationProfile } from './components/ElevationProfile';
import { GoogleTrailMap } from './components/GoogleTrailMap';
import { NavPinModal } from './components/NavPinModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallPanel } from './components/PWAInstallPanel';
import { ReportHazardModal } from './components/ReportHazardModal';
import { TrailColourLegend, TrailGradeMarker } from './components/TrailGradeBadge';
import {
  BASELINE_DIFFICULTY_VOTES,
  BASELINE_HAZARD_REPORTS,
  BUILT_IN_DROP_IN_PINS,
  compassDirection,
  computeLiveTrailRating,
  GRADE_META,
  HAMSTERLEY_TRAILS,
  HAZARD_TYPE_META,
  PIN_KIND_META,
  SURFACE_META,
} from './data/hamsterleyTrails';
import { useGpsTracker } from './hooks/useGpsTracker';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePWAInstall } from './hooks/usePWAInstall';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testConnection,
} from './lib/firebase';
import {
  cacheHazardsAndVotes,
  cacheNavPins,
  cacheRideLog,
  clearAllLocalUserData,
  deleteOfflineForestPack,
  downloadOfflineForestPack,
  getOfflineForestPack,
  listPendingSync,
  OfflineForestPack,
  PendingSyncItem,
  queuePendingSync,
  readCachedHazardsAndVotes,
  readCachedNavPins,
  readCachedRides,
  removePendingSync,
} from './lib/offlineStorage';
import { downloadTrailGpx } from './lib/gpxExport';
import {
  DifficultyVote,
  HazardReport,
  NavPin,
  NavTarget,
  RideLog,
  RiderSkillLevel,
  TrailCategory,
  TrailGrade,
} from './types/trail';

const GOOGLE_MAPS_API_KEY =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';

// Google sign-in: browsers use the normal popup. The Android app cannot show a
// popup, so it uses native Google sign-in and hands the token to Firebase.
const isNativeApp = Capacitor.isNativePlatform();

async function getNativeGoogleCredential() {
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result.credential?.idToken;
  if (!idToken) {
    throw new Error('Google sign-in did not return a token. Please try again.');
  }
  return GoogleAuthProvider.credential(
    idToken,
    result.credential?.accessToken ?? undefined
  );
}

async function startGoogleSignIn(): Promise<void> {
  if (!isNativeApp) {
    await signInWithPopup(auth, googleProvider);
    return;
  }
  await signInWithCredential(auth, await getNativeGoogleCredential());
}

// Opens Google Maps (app or browser) with turn-by-turn driving directions.
function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

async function startGoogleReauth(currentUser: User): Promise<void> {
  if (!isNativeApp) {
    await reauthenticateWithPopup(currentUser, googleProvider);
    return;
  }
  await reauthenticateWithCredential(
    currentUser,
    await getNativeGoogleCredential()
  );
}

type ActiveTab = 'map' | 'trails' | 'hazards' | 'offline';
type MapLayerMode = 'terrain' | 'satellite' | 'offline-topo';

function formatDuration(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function formatTimeAgo(ms: number): string {
  const diffMin = Math.max(1, Math.floor((Date.now() - ms) / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const hrs = Math.floor(diffMin / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [mapLayer, setMapLayer] = useState<MapLayerMode>(
    GOOGLE_MAPS_API_KEY ? 'terrain' : 'offline-topo'
  );
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // Connectivity & Offline Pack
  const { isOnline, forcedOffline, setForcedOffline } = useOnlineStatus();
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [offlinePack, setOfflinePack] = useState<OfflineForestPack | null>(null);
  const [pendingSync, setPendingSync] = useState<PendingSyncItem[]>([]);

  // Trail Filters & Selection
  const [skillFilter, setSkillFilter] = useState<RiderSkillLevel>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TrailCategory>('all');
  const [gradeFilter, setGradeFilter] = useState<TrailGrade | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTrailId, setSelectedTrailId] = useState<string>(
    'red-hamsterley-classic'
  );
  const [isTrailFocused, setIsTrailFocused] = useState<boolean>(true);
  const [fitTrailTrigger, setFitTrailTrigger] = useState<number>(0);
  const [mapListTab, setMapListTab] = useState<'main' | 'off-piste'>('main');
  const [filterMapByTab, setFilterMapByTab] = useState<boolean>(false);
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [activeNavTarget, setActiveNavTarget] = useState<NavTarget | null>(null);

  // Community, Pins & Ride Data
  const [remoteHazards, setRemoteHazards] = useState<HazardReport[]>([]);
  const [remoteVotes, setRemoteVotes] = useState<DifficultyVote[]>([]);
  const [remotePublicPins, setRemotePublicPins] = useState<NavPin[]>([]);
  const [remotePrivatePins, setRemotePrivatePins] = useState<NavPin[]>([]);
  const [localQueuedHazards, setLocalQueuedHazards] = useState<HazardReport[]>([]);
  const [localQueuedVotes, setLocalQueuedVotes] = useState<DifficultyVote[]>([]);
  const [localQueuedPins, setLocalQueuedPins] = useState<NavPin[]>([]);
  const [rides, setRides] = useState<RideLog[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals & Pin Picking
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportInitialTab, setReportInitialTab] = useState<'hazard' | 'rating'>('hazard');
  const [navPinModalOpen, setNavPinModalOpen] = useState(false);
  const [pickingMode, setPickingMode] = useState<null | 'hazard' | 'nav-pin'>(null);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickedPinCoords, setPickedPinCoords] = useState<{ lat: number; lng: number } | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3600);
  }, []);

  // Quota listener
  useEffect(() => {
    const handler = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  // Boot check & IndexedDB load
  useEffect(() => {
    testConnection();
    getOfflineForestPack().then(setOfflinePack);
    readCachedRides().then((cached) => {
      if (cached.length > 0) setRides(cached);
    });
    readCachedHazardsAndVotes().then(({ hazards, votes }) => {
      if (hazards.length > 0) setRemoteHazards(hazards);
      if (votes.length > 0) setRemoteVotes(votes);
    });
    readCachedNavPins().then((cachedPins) => {
      if (cachedPins.length > 0) {
        setRemotePublicPins(cachedPins.filter((p) => p.visibility === 'public'));
        setRemotePrivatePins(cachedPins.filter((p) => p.visibility === 'private'));
      }
    });
    listPendingSync().then((items) => {
      setPendingSync(items);
      setLocalQueuedHazards(
        items.filter((i) => i.kind === 'hazard').map((i) => i.payload as HazardReport)
      );
      setLocalQueuedVotes(
        items.filter((i) => i.kind === 'vote').map((i) => i.payload as DifficultyVote)
      );
      setLocalQueuedPins(
        items.filter((i) => i.kind === 'pin').map((i) => i.payload as NavPin)
      );
    });
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Firestore real-time subscriptions (strictly gated on authReady && user)
  useEffect(() => {
    if (!authReady || !user) return;

    const hazardsQ = query(
      collection(db, 'hazardReports'),
      where('visibility', '==', 'public'),
      limit(60)
    );
    const unsubHazards = onSnapshot(
      hazardsQ,
      (snap) => {
        const list: HazardReport[] = snap.docs
          .map((d) => {
            const data = d.data();
            const createdTs = data.createdAt as Timestamp | undefined;
            const updatedTs = data.updatedAt as Timestamp | undefined;
            return {
              id: d.id,
              authorId: data.authorId,
              authorName: data.authorName,
              trailId: data.trailId,
              hazardType: data.hazardType,
              severity: data.severity,
              title: data.title,
              description: data.description,
              lat: data.lat,
              lng: data.lng,
              status: data.status,
              visibility: data.visibility,
              confirmationsCount: data.confirmationsCount,
              createdAtMs: createdTs ? createdTs.toMillis() : Date.now(),
              updatedAtMs: updatedTs ? updatedTs.toMillis() : Date.now(),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setRemoteHazards(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'hazardReports');
      }
    );

    const votesQ = query(
      collection(db, 'difficultyVotes'),
      where('visibility', '==', 'public'),
      limit(80)
    );
    const unsubVotes = onSnapshot(
      votesQ,
      (snap) => {
        const list: DifficultyVote[] = snap.docs
          .map((d) => {
            const data = d.data();
            const createdTs = data.createdAt as Timestamp | undefined;
            return {
              id: d.id,
              authorId: data.authorId,
              authorName: data.authorName,
              trailId: data.trailId,
              rating: data.rating,
              surfaceCondition: data.surfaceCondition,
              comment: data.comment,
              visibility: data.visibility,
              createdAtMs: createdTs ? createdTs.toMillis() : Date.now(),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setRemoteVotes(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'difficultyVotes');
      }
    );

    const ridesQ = query(
      collection(db, 'rides'),
      where('userId', '==', user.uid),
      limit(30)
    );
    const unsubRides = onSnapshot(
      ridesQ,
      (snap) => {
        const list: RideLog[] = snap.docs
          .map((d) => {
            const data = d.data();
            const createdTs = data.createdAt as Timestamp | undefined;
            return {
              id: d.id,
              userId: data.userId,
              trailId: data.trailId,
              trailName: data.trailName,
              distanceKm: data.distanceKm,
              elevationGainM: data.elevationGainM,
              durationSec: data.durationSec,
              avgSpeedKmh: data.avgSpeedKmh,
              createdAtMs: createdTs ? createdTs.toMillis() : Date.now(),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setRides(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'rides');
      }
    );

    const publicPinsQ = query(
      collection(db, 'navPins'),
      where('visibility', '==', 'public'),
      limit(80)
    );
    const unsubPublicPins = onSnapshot(
      publicPinsQ,
      (snap) => {
        const list: NavPin[] = snap.docs
          .map((d) => {
            const data = d.data();
            const createdTs = data.createdAt as Timestamp | undefined;
            return {
              id: d.id,
              authorId: data.authorId,
              authorName: data.authorName,
              name: data.name,
              pinKind: data.pinKind,
              trailId: data.trailId,
              lat: data.lat,
              lng: data.lng,
              visibility: data.visibility,
              createdAtMs: createdTs ? createdTs.toMillis() : Date.now(),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setRemotePublicPins(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'navPins');
      }
    );

    const myPinsQ = query(
      collection(db, 'navPins'),
      where('authorId', '==', user.uid),
      limit(50)
    );
    const unsubMyPins = onSnapshot(
      myPinsQ,
      (snap) => {
        const list: NavPin[] = snap.docs
          .map((d) => {
            const data = d.data();
            const createdTs = data.createdAt as Timestamp | undefined;
            return {
              id: d.id,
              authorId: data.authorId,
              authorName: data.authorName,
              name: data.name,
              pinKind: data.pinKind,
              trailId: data.trailId,
              lat: data.lat,
              lng: data.lng,
              visibility: data.visibility,
              createdAtMs: createdTs ? createdTs.toMillis() : Date.now(),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setRemotePrivatePins(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'navPins');
      }
    );

    return () => {
      unsubHazards();
      unsubVotes();
      unsubRides();
      unsubPublicPins();
      unsubMyPins();
    };
  }, [authReady, user]);

  // Cache latest conditions & pins locally for offline riding
  useEffect(() => {
    if (remoteHazards.length > 0 || remoteVotes.length > 0) {
      cacheHazardsAndVotes(remoteHazards, remoteVotes);
    }
  }, [remoteHazards, remoteVotes]);

  useEffect(() => {
    if (remotePublicPins.length > 0 || remotePrivatePins.length > 0) {
      cacheNavPins([...remotePrivatePins, ...remotePublicPins]);
    }
  }, [remotePublicPins, remotePrivatePins]);

  const handleSignIn = async () => {
    setAuthNotice(null);
    try {
      await startGoogleSignIn();
      showToast('Signed in — live trail sync active');
    } catch (err) {
      setAuthNotice(
        err instanceof Error ? err.message : 'Google Sign-In was cancelled.'
      );
    }
  };

  const handleSignOut = async () => {
    if (isNativeApp) {
      await FirebaseAuthentication.signOut().catch(() => undefined);
    }
    await signOut(auth);
    showToast('Signed out');
  };

  const handleClearLocalData = async () => {
    await clearAllLocalUserData();
    setOfflinePack(null);
    setPendingSync([]);
    setLocalQueuedHazards([]);
    setLocalQueuedVotes([]);
    setLocalQueuedPins([]);
    setRides([]);
    setRemoteHazards([]);
    setRemoteVotes([]);
    setRemotePublicPins([]);
    setRemotePrivatePins([]);
    setSelectedPinId(null);
    setActiveNavTarget(null);
    showToast('All local device rides, packs & queued updates cleared');
  };

  const handleDeleteAccountAndData = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      await handleClearLocalData();
      return;
    }
    if (!isOnline) {
      throw new Error(
        'Account deletion requires an internet connection to remove your cloud data and sign-in.'
      );
    }

    const uid = currentUser.uid;

    // Collect all user-owned Firestore documents matching firestore.rules list queries
    const refsToDelete: DocumentReference[] = [];

    const hazardsSnap = await getDocs(
      query(
        collection(db, 'hazardReports'),
        where('visibility', '==', 'public'),
        where('authorId', '==', uid)
      )
    );
    hazardsSnap.forEach((d) => refsToDelete.push(d.ref));

    const votesSnap = await getDocs(
      query(
        collection(db, 'difficultyVotes'),
        where('visibility', '==', 'public'),
        where('authorId', '==', uid)
      )
    );
    votesSnap.forEach((d) => refsToDelete.push(d.ref));

    const pinsSnap = await getDocs(
      query(collection(db, 'navPins'), where('authorId', '==', uid))
    );
    pinsSnap.forEach((d) => refsToDelete.push(d.ref));

    const ridesSnap = await getDocs(
      query(collection(db, 'rides'), where('userId', '==', uid))
    );
    ridesSnap.forEach((d) => refsToDelete.push(d.ref));

    refsToDelete.push(doc(db, 'users', uid));

    // Commit batched deletes in safe chunks of 400
    for (let i = 0; i < refsToDelete.length; i += 400) {
      const batch = writeBatch(db);
      for (const ref of refsToDelete.slice(i, i + 400)) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    // Delete Firebase Auth user (re-authenticates with Google if session is stale)
    try {
      await deleteUser(currentUser);
    } catch (err: unknown) {
      const authCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      if (authCode === 'auth/requires-recent-login') {
        await startGoogleReauth(currentUser);
        await deleteUser(currentUser);
      } else {
        throw err;
      }
    }

    await clearAllLocalUserData();
    setOfflinePack(null);
    setPendingSync([]);
    setLocalQueuedHazards([]);
    setLocalQueuedVotes([]);
    setLocalQueuedPins([]);
    setRides([]);
    setRemoteHazards((prev) => prev.filter((h) => h.authorId !== uid));
    setRemoteVotes((prev) => prev.filter((v) => v.authorId !== uid));
    setRemotePublicPins((prev) => prev.filter((p) => p.authorId !== uid));
    setRemotePrivatePins([]);
    setSelectedPinId(null);
    setActiveNavTarget(null);
    showToast('Your account and all saved rider data have been permanently deleted');
  };

  // Merge baseline + remote Firestore + local offline queue
  const allHazards = useMemo(() => {
    const seen = new Set<string>();
    const combined: HazardReport[] = [];
    for (const h of [...localQueuedHazards, ...remoteHazards, ...BASELINE_HAZARD_REPORTS]) {
      if (!seen.has(h.id)) {
        seen.add(h.id);
        combined.push(h);
      }
    }
    return combined.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [localQueuedHazards, remoteHazards]);

  const allVotes = useMemo(() => {
    const seen = new Set<string>();
    const combined: DifficultyVote[] = [];
    for (const v of [...localQueuedVotes, ...remoteVotes, ...BASELINE_DIFFICULTY_VOTES]) {
      if (!seen.has(v.id)) {
        seen.add(v.id);
        combined.push(v);
      }
    }
    return combined.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [localQueuedVotes, remoteVotes]);

  const allNavPins = useMemo(() => {
    const seen = new Set<string>();
    const combined: NavPin[] = [];
    for (const p of [
      ...localQueuedPins,
      ...remotePrivatePins,
      ...remotePublicPins,
      ...BUILT_IN_DROP_IN_PINS,
    ]) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        combined.push(p);
      }
    }
    return combined;
  }, [localQueuedPins, remotePrivatePins, remotePublicPins]);

  // Filtered trails
  const filteredTrails = useMemo(() => {
    return HAMSTERLEY_TRAILS.filter((t) => {
      if (skillFilter !== 'all' && t.skillTier !== skillFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (gradeFilter !== 'all' && t.grade !== gradeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          t.sector.toLowerCase().includes(q) ||
          t.summary.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [skillFilter, categoryFilter, gradeFilter, searchQuery]);

  // Separate Main Trails & Off-Piste Trails for the bottom-of-map tab browser
  const mapCategoryEligibleTrails = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return HAMSTERLEY_TRAILS.filter((t) => {
      if (skillFilter !== 'all' && t.skillTier !== skillFilter) return false;
      if (gradeFilter !== 'all' && t.grade !== gradeFilter) return false;
      if (q) {
        return (
          t.name.toLowerCase().includes(q) ||
          t.sector.toLowerCase().includes(q) ||
          t.summary.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [skillFilter, gradeFilter, searchQuery]);

  const mainTrailsList = useMemo(
    () => mapCategoryEligibleTrails.filter((t) => t.category === 'official'),
    [mapCategoryEligibleTrails]
  );

  const offPisteTrailsList = useMemo(
    () => mapCategoryEligibleTrails.filter((t) => t.category === 'off-piste'),
    [mapCategoryEligibleTrails]
  );

  const activeMapTabTrails =
    mapListTab === 'main' ? mainTrailsList : offPisteTrailsList;

  const mapViewportTrails = useMemo(() => {
    const base = filteredTrails.length > 0 ? filteredTrails : HAMSTERLEY_TRAILS;
    if (!filterMapByTab) return base;
    const targetCategory: TrailCategory =
      mapListTab === 'main' ? 'official' : 'off-piste';
    const subset = base.filter((t) => t.category === targetCategory);
    return subset.length > 0 ? subset : base;
  }, [filteredTrails, filterMapByTab, mapListTab]);

  const dropInPinByTrailId = useMemo(() => {
    const lookup: Record<string, NavPin> = {};
    for (const pin of allNavPins) {
      if (!pin.trailId) continue;
      if (!lookup[pin.trailId] || pin.pinKind === 'drop_in') {
        lookup[pin.trailId] = pin;
      }
    }
    return lookup;
  }, [allNavPins]);

  const selectedTrail = useMemo(() => {
    return (
      HAMSTERLEY_TRAILS.find((t) => t.id === selectedTrailId) || HAMSTERLEY_TRAILS[0]
    );
  }, [selectedTrailId]);

  const handleSelectTrailOnMap = useCallback((trailId: string) => {
    setSelectedTrailId(trailId);
    setIsTrailFocused(true);
  }, []);

  const handleFocusTrailFromUI = useCallback((trailId: string) => {
    setSelectedTrailId(trailId);
    setIsTrailFocused(true);
    setFitTrailTrigger((c) => c + 1);
  }, []);

  const prioritizedDropInPins = useMemo(() => {
    return [...allNavPins].sort((a, b) => {
      const score = (p: NavPin) => {
        if (activeNavTarget?.id === p.id) return 5;
        if (p.trailId === selectedTrail.id) return 4;
        if (!p.isBuiltIn) return 3;
        if (p.pinKind === 'car_park') return 2;
        return 1;
      };
      return score(b) - score(a);
    });
  }, [allNavPins, activeNavTarget, selectedTrail.id]);

  const trailRatings = useMemo(() => {
    const map: Record<string, ReturnType<typeof computeLiveTrailRating>> = {};
    for (const t of HAMSTERLEY_TRAILS) {
      map[t.id] = computeLiveTrailRating(t, allHazards, allVotes);
    }
    return map;
  }, [allHazards, allVotes]);

  const gps = useGpsTracker(selectedTrail, activeNavTarget);

  // Sync queued offline mutations back to Firestore when online + authenticated
  const flushOfflineQueue = useCallback(async () => {
    if (!isOnline || !user) return;
    const items = await listPendingSync();
    if (items.length === 0) return;

    let syncedCount = 0;
    for (const item of items) {
      if (item.kind === 'hazard') {
        const h = item.payload as HazardReport;
        const docId = h.id.replace(/[^a-zA-Z0-9_-]/g, '');
        const path = `hazardReports/${docId}`;
        try {
          await setDoc(doc(db, 'hazardReports', docId), {
            authorId: user.uid,
            authorName: (user.displayName || 'Hamsterley Rider').slice(0, 60),
            trailId: h.trailId,
            hazardType: h.hazardType,
            severity: h.severity,
            title: h.title.slice(0, 100),
            description: h.description.slice(0, 400),
            lat: h.lat,
            lng: h.lng,
            status: 'active',
            visibility: 'public',
            confirmationsCount: 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await removePendingSync(item.id);
          syncedCount++;
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }
      } else if (item.kind === 'vote') {
        const v = item.payload as DifficultyVote;
        const docId = v.id.replace(/[^a-zA-Z0-9_-]/g, '');
        const path = `difficultyVotes/${docId}`;
        try {
          await setDoc(doc(db, 'difficultyVotes', docId), {
            authorId: user.uid,
            authorName: (user.displayName || 'Hamsterley Rider').slice(0, 60),
            trailId: v.trailId,
            rating: v.rating,
            surfaceCondition: v.surfaceCondition,
            comment: v.comment.slice(0, 240),
            visibility: 'public',
            createdAt: serverTimestamp(),
          });
          await removePendingSync(item.id);
          syncedCount++;
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }
      } else if (item.kind === 'ride') {
        const r = item.payload as RideLog;
        const docId = r.id.replace(/[^a-zA-Z0-9_-]/g, '');
        const path = `rides/${docId}`;
        try {
          await setDoc(doc(db, 'rides', docId), {
            userId: user.uid,
            trailId: r.trailId,
            trailName: r.trailName.slice(0, 100),
            distanceKm: r.distanceKm,
            elevationGainM: r.elevationGainM,
            durationSec: r.durationSec,
            avgSpeedKmh: r.avgSpeedKmh,
            createdAt: serverTimestamp(),
          });
          await removePendingSync(item.id);
          syncedCount++;
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }
      } else if (item.kind === 'pin') {
        const p = item.payload as NavPin;
        const docId = p.id.replace(/[^a-zA-Z0-9_-]/g, '');
        const path = `navPins/${docId}`;
        try {
          await setDoc(doc(db, 'navPins', docId), {
            authorId: user.uid,
            authorName: (user.displayName || 'Hamsterley Rider').slice(0, 60),
            name: p.name.slice(0, 80),
            pinKind: p.pinKind,
            trailId: p.trailId.slice(0, 64),
            lat: p.lat,
            lng: p.lng,
            visibility: p.visibility,
            createdAt: serverTimestamp(),
          });
          await removePendingSync(item.id);
          syncedCount++;
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }
      }
    }

    const remaining = await listPendingSync();
    setPendingSync(remaining);
    setLocalQueuedHazards(
      remaining.filter((i) => i.kind === 'hazard').map((i) => i.payload as HazardReport)
    );
    setLocalQueuedVotes(
      remaining.filter((i) => i.kind === 'vote').map((i) => i.payload as DifficultyVote)
    );
    setLocalQueuedPins(
      remaining.filter((i) => i.kind === 'pin').map((i) => i.payload as NavPin)
    );
    if (syncedCount > 0) {
      showToast(`Synced ${syncedCount} offline trail update(s)`);
    }
  }, [isOnline, user, showToast]);

  useEffect(() => {
    if (isOnline && user && pendingSync.length > 0) {
      flushOfflineQueue();
    }
  }, [isOnline, user, pendingSync.length, flushOfflineQueue]);

  // Submit Hazard
  const handleCreateHazard = async (
    input: Omit<
      HazardReport,
      | 'id'
      | 'authorId'
      | 'authorName'
      | 'status'
      | 'visibility'
      | 'confirmationsCount'
      | 'createdAtMs'
      | 'updatedAtMs'
    >
  ) => {
    const id = `haz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const authorName = (user?.displayName || 'Offline Rider').slice(0, 60);

    if (!isOnline || !user) {
      const localHazard: HazardReport = {
        ...input,
        id,
        authorId: user?.uid || 'local-offline',
        authorName,
        status: 'active',
        visibility: 'public',
        confirmationsCount: 1,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        pendingSync: true,
      };
      await queuePendingSync({
        id,
        kind: 'hazard',
        payload: localHazard,
        queuedAtMs: Date.now(),
      });
      const updated = await listPendingSync();
      setPendingSync(updated);
      setLocalQueuedHazards(
        updated.filter((i) => i.kind === 'hazard').map((i) => i.payload as HazardReport)
      );
      setPickedCoords(null);
      showToast('Hazard saved offline — will sync when signal returns');
      return;
    }

    const path = `hazardReports/${id}`;
    try {
      await setDoc(doc(db, 'hazardReports', id), {
        authorId: user.uid,
        authorName,
        trailId: input.trailId,
        hazardType: input.hazardType,
        severity: input.severity,
        title: input.title,
        description: input.description,
        lat: input.lat,
        lng: input.lng,
        status: 'active',
        visibility: 'public',
        confirmationsCount: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setPickedCoords(null);
      showToast('Trail hazard alert published');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  // Submit Live Difficulty Rating Vote
  const handleCreateVote = async (
    input: Omit<
      DifficultyVote,
      'id' | 'authorId' | 'authorName' | 'visibility' | 'createdAtMs'
    >
  ) => {
    const id = `vote_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const authorName = (user?.displayName || 'Offline Rider').slice(0, 60);

    if (!isOnline || !user) {
      const localVote: DifficultyVote = {
        ...input,
        id,
        authorId: user?.uid || 'local-offline',
        authorName,
        visibility: 'public',
        createdAtMs: Date.now(),
        pendingSync: true,
      };
      await queuePendingSync({
        id,
        kind: 'vote',
        payload: localVote,
        queuedAtMs: Date.now(),
      });
      const updated = await listPendingSync();
      setPendingSync(updated);
      setLocalQueuedVotes(
        updated.filter((i) => i.kind === 'vote').map((i) => i.payload as DifficultyVote)
      );
      showToast('Difficulty vote saved offline');
      return;
    }

    const path = `difficultyVotes/${id}`;
    try {
      await setDoc(doc(db, 'difficultyVotes', id), {
        authorId: user.uid,
        authorName,
        trailId: input.trailId,
        rating: input.rating,
        surfaceCondition: input.surfaceCondition,
        comment: input.comment,
        visibility: 'public',
        createdAt: serverTimestamp(),
      });
      showToast('Live difficulty rating updated');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  // Drop Navigation Pin
  const handleCreateNavPin = async (
    input: Omit<NavPin, 'id' | 'authorId' | 'authorName' | 'createdAtMs'>,
    navigateNow: boolean
  ) => {
    const id = `pin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const authorName = (user?.displayName || 'Offline Rider').slice(0, 60);

    if (navigateNow) {
      setActiveNavTarget({
        id,
        name: input.name,
        kind: input.pinKind,
        lat: input.lat,
        lng: input.lng,
        trailId: input.trailId,
      });
      setSelectedPinId(id);
    }

    if (!isOnline || !user) {
      const localPin: NavPin = {
        ...input,
        id,
        authorId: user?.uid || 'local-offline',
        authorName,
        createdAtMs: Date.now(),
        pendingSync: true,
      };
      await queuePendingSync({
        id,
        kind: 'pin',
        payload: localPin,
        queuedAtMs: Date.now(),
      });
      const updated = await listPendingSync();
      setPendingSync(updated);
      setLocalQueuedPins(
        updated.filter((i) => i.kind === 'pin').map((i) => i.payload as NavPin)
      );
      setPickedPinCoords(null);
      showToast(`Pin "${input.name}" saved locally`);
      return;
    }

    const path = `navPins/${id}`;
    try {
      await setDoc(doc(db, 'navPins', id), {
        authorId: user.uid,
        authorName,
        name: input.name.slice(0, 80),
        pinKind: input.pinKind,
        trailId: input.trailId.slice(0, 64),
        lat: input.lat,
        lng: input.lng,
        visibility: input.visibility,
        createdAt: serverTimestamp(),
      });
      setPickedPinCoords(null);
      showToast(`Pin "${input.name}" dropped on map`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleDeleteNavPin = async (pin: NavPin) => {
    if (pin.isBuiltIn) return;
    if (selectedPinId === pin.id) setSelectedPinId(null);
    if (activeNavTarget?.id === pin.id) setActiveNavTarget(null);

    if (pin.pendingSync) {
      await removePendingSync(pin.id);
      const updated = await listPendingSync();
      setPendingSync(updated);
      setLocalQueuedPins(
        updated.filter((i) => i.kind === 'pin').map((i) => i.payload as NavPin)
      );
      showToast('Local pin removed');
      return;
    }

    if (!user || pin.authorId !== user.uid) return;
    const path = `navPins/${pin.id}`;
    try {
      await deleteDoc(doc(db, 'navPins', pin.id));
      showToast('Navigation pin deleted');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handleNavigateToPin = (pin: NavPin) => {
    setActiveNavTarget({
      id: pin.id,
      name: pin.name,
      kind: pin.pinKind,
      lat: pin.lat,
      lng: pin.lng,
      trailId: pin.trailId,
    });
    setSelectedPinId(pin.id);
    if (HAMSTERLEY_TRAILS.some((t) => t.id === pin.trailId)) {
      setSelectedTrailId(pin.trailId);
      setIsTrailFocused(true);
      setFitTrailTrigger((c) => c + 1);
    }
    showToast(`Compass locked to ${pin.name}`);
  };

  // Atomic Confirm Hazard Vote
  const handleConfirmHazard = async (hazard: HazardReport) => {
    if (hazard.isBaseline) {
      showToast('Baseline survey report — publish your own live update anytime');
      return;
    }
    if (!user) {
      await handleSignIn();
      return;
    }
    const voteId = `confirm_${user.uid}`;
    const reportRef = doc(db, 'hazardReports', hazard.id);
    const voteRef = doc(db, 'hazardReports', hazard.id, 'votes', voteId);

    try {
      const batch = writeBatch(db);
      batch.set(voteRef, {
        voterId: user.uid,
        reportId: hazard.id,
        voteType: 'confirm',
        createdAt: serverTimestamp(),
      });
      batch.update(reportRef, {
        confirmationsCount: hazard.confirmationsCount + 1,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      showToast('Hazard confirmed');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `hazardReports/${hazard.id}`);
    }
  };

  // Atomic Resolve Hazard Vote
  const handleResolveHazard = async (hazard: HazardReport) => {
    if (hazard.isBaseline) {
      showToast('Baseline survey item cannot be modified');
      return;
    }
    if (!user) {
      await handleSignIn();
      return;
    }
    const voteId = `resolve_${user.uid}`;
    const reportRef = doc(db, 'hazardReports', hazard.id);
    const voteRef = doc(db, 'hazardReports', hazard.id, 'votes', voteId);

    try {
      const batch = writeBatch(db);
      batch.set(voteRef, {
        voterId: user.uid,
        reportId: hazard.id,
        voteType: 'resolve',
        createdAt: serverTimestamp(),
      });
      batch.update(reportRef, {
        status: 'resolved',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      showToast('Hazard marked cleared');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `hazardReports/${hazard.id}`);
    }
  };

  // Save Completed GPS Ride
  const handleSaveRide = async () => {
    const durationSec = Math.max(1, gps.elapsedSec);
    const distanceKm = Math.max(0.1, gps.distanceKm || 0.4);
    const avgSpeedKmh =
      Math.round((distanceKm / (durationSec / 3600)) * 10) / 10;
    const id = `ride_${Date.now()}`;
    const newRide: RideLog = {
      id,
      userId: user?.uid || 'local-offline',
      trailId: selectedTrail.id,
      trailName: selectedTrail.name,
      distanceKm,
      elevationGainM: gps.elevationGainM,
      durationSec,
      avgSpeedKmh: Math.min(100, avgSpeedKmh),
      createdAtMs: Date.now(),
      pendingSync: !isOnline || !user,
    };

    gps.stopGps();
    await cacheRideLog(newRide);
    setRides((prev) => [newRide, ...prev]);

    if (!isOnline || !user) {
      await queuePendingSync({
        id,
        kind: 'ride',
        payload: newRide,
        queuedAtMs: Date.now(),
      });
      setPendingSync(await listPendingSync());
      showToast('Ride saved locally to device');
      return;
    }

    try {
      await setDoc(doc(db, 'rides', id), {
        userId: user.uid,
        trailId: newRide.trailId,
        trailName: newRide.trailName,
        distanceKm: newRide.distanceKm,
        elevationGainM: newRide.elevationGainM,
        durationSec: newRide.durationSec,
        avgSpeedKmh: newRide.avgSpeedKmh,
        createdAt: serverTimestamp(),
      });
      showToast('Ride log saved to your profile');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `rides/${id}`);
    }
  };

  const handleDownloadPack = async () => {
    const pack = await downloadOfflineForestPack();
    setOfflinePack(pack);
    showToast('Hamsterley Offline Pack cached to device');
  };

  const handleDeletePack = async () => {
    await deleteOfflineForestPack();
    setOfflinePack(null);
    showToast('Offline cache cleared');
  };

  const selectedRating = trailRatings[selectedTrail.id];
  const activeHazardsOnSelected = allHazards.filter(
    (h) => h.trailId === selectedTrail.id && h.status === 'active'
  );

  return (
    <div className="min-h-screen bg-[#F6F6F3] text-[#141A17] flex flex-col pb-16 lg:pb-0">
      {/* Required Google Maps Platform Demo Quota Banner */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Top Bar Contract: Exactly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#DDE2DC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('map');
            }}
            className="text-lg sm:text-xl font-bold tracking-tight text-[#141A17] font-display whitespace-nowrap shrink-0"
          >
            HamsterleyMTB
          </a>

          {/* Zone 2: 4 concise single-line nav links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden lg:flex items-center gap-7 text-sm font-medium text-[#525E57]"
          >
            {(
              [
                { id: 'map', label: 'Trail Map' },
                { id: 'trails', label: 'Trail Directory' },
                { id: 'hazards', label: 'Live Hazards' },
                { id: 'offline', label: 'Offline & App' },
              ] as const
            ).map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                    active
                      ? 'text-[#141A17] font-semibold border-[#D94E1F]'
                      : 'border-transparent hover:text-[#141A17]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="min-h-[40px] px-3.5 py-2 rounded-lg border border-[#DDE2DC] bg-white text-xs font-semibold text-[#141A17] hover:bg-[#F6F6F3] transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="max-w-[110px] truncate">
                  {user.displayName || 'Rider'}
                </span>
                <LogOut className="w-3.5 h-3.5 text-[#525E57]" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-[#141A17] text-white text-xs font-semibold hover:bg-[#232D28] transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Subtle Toast / Auth Notice */}
      {(toastMessage || authNotice) && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-3">
          <div
            className={`rounded-xl px-4 py-2.5 text-xs font-semibold flex items-center justify-between gap-3 border ${
              authNotice
                ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
                : 'bg-[#141A17] border-[#141A17] text-white'
            }`}
          >
            <span>{authNotice || toastMessage}</span>
            <button
              type="button"
              onClick={() => {
                setAuthNotice(null);
                setToastMessage(null);
              }}
              className="underline opacity-80 hover:opacity-100 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-5">
        {/* Welcome / Mobile App Download + Skill Filter Strip */}
        <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#141A17] font-display text-balance">
              Hamsterley Forest Trail & GPS Navigator
            </h1>
            <p className="text-sm text-[#525E57] mt-1">
              County Durham · {HAMSTERLEY_TRAILS.length} official & off-piste routes · Live rider difficulty ratings & offline topo maps
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Skill Filter for New & Experienced Riders */}
            <div
              className="inline-flex items-center p-1 bg-[#EAECE5] rounded-xl overflow-x-auto max-w-full"
              role="group"
              aria-label="Filter by rider experience"
            >
              {(
                [
                  { id: 'all', label: 'All Riders' },
                  { id: 'beginner', label: 'New / Easy' },
                  { id: 'intermediate', label: 'Red XC' },
                  { id: 'advanced', label: 'Pro / Off-Piste' },
                ] as const
              ).map((lvl) => (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => setSkillFilter(lvl.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    skillFilter === lvl.id
                      ? 'bg-white text-[#141A17] shadow-xs'
                      : 'text-[#525E57] hover:text-[#141A17]'
                  }`}
                >
                  {lvl.label}
                </button>
              ))}
            </div>

            {/* Quick Install Free App button if available */}
            {!isInstalled && (
              <button
                type="button"
                onClick={() => (isInstallable ? install() : setActiveTab('offline'))}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#DDE2DC] bg-white text-xs font-semibold text-[#141A17] hover:bg-[#FAFBF9] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#D94E1F]" />
                Free Mobile App
              </button>
            )}
          </div>
        </section>

        {/* Colour Key Up Front */}
        {activeTab !== 'offline' && (
          <TrailColourLegend
            activeGrade={gradeFilter}
            onSelectGrade={setGradeFilter}
          />
        )}

        {/* TAB 1: TRAIL MAP & LIVE GPS TELEMETRY */}
        {activeTab === 'map' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5 items-stretch">
            {/* Left Dominant Anchor: Interactive Map + GPS Cockpit */}
            <div className="flex flex-col gap-4 min-w-0">
              {/* Map Layer Toolbar */}
              <div className="bg-white border border-[#DDE2DC] rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 p-0.5 bg-[#F1F2ED] rounded-lg">
                  {(
                    [
                      { id: 'terrain', label: 'Terrain' },
                      { id: 'satellite', label: 'Satellite' },
                      { id: 'offline-topo', label: 'Offline Topo' },
                    ] as const
                  ).map((layer) => (
                    <button
                      key={layer.id}
                      type="button"
                      onClick={() => setMapLayer(layer.id)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        mapLayer === layer.id || (!isOnline && layer.id === 'offline-topo')
                          ? 'bg-white text-[#141A17] shadow-xs'
                          : 'text-[#525E57] hover:text-[#141A17]'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      {layer.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (pickingMode === 'nav-pin') {
                        setPickingMode(null);
                      } else {
                        setSelectedPinId(null);
                        setSelectedHazardId(null);
                        setPickingMode('nav-pin');
                        showToast('Tap anywhere on the map to drop your navigation pin');
                      }
                    }}
                    className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer border ${
                      pickingMode === 'nav-pin'
                        ? 'bg-[#141A17] text-white border-[#141A17]'
                        : 'bg-white text-[#141A17] border-[#DDE2DC] hover:bg-[#FAFBF9]'
                    }`}
                  >
                    <MapPin className="w-4 h-4 text-[#0F766E]" />
                    {pickingMode === 'nav-pin' ? 'Cancel Pin Drop' : 'Drop Nav Pin'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReportInitialTab('hazard');
                      setReportModalOpen(true);
                    }}
                    className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#D94E1F] text-white text-xs font-semibold hover:bg-[#B83E14] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Report Hazard
                  </button>
                </div>
              </div>

              {/* Quick Drop-In & Custom Navigation Pins Strip */}
              <div className="bg-white border border-[#DDE2DC] rounded-xl px-3 py-2 flex items-center gap-2 overflow-x-auto">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#525E57] whitespace-nowrap shrink-0">
                  Drop-In Pins:
                </span>
                {prioritizedDropInPins.map((pin) => {
                  const isTarget = activeNavTarget?.id === pin.id;
                  const isForSelectedTrail = pin.trailId === selectedTrail.id;
                  const meta = PIN_KIND_META[pin.pinKind];
                  const shortLabel = pin.name
                    .replace(' Drop-In', '')
                    .replace(' Uplift Top Gate', ' Uplift')
                    .replace(' Car Park', '');
                  return (
                    <button
                      key={pin.id}
                      type="button"
                      onClick={() => handleNavigateToPin(pin)}
                      className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        isTarget
                          ? 'bg-[#0F766E] text-white border-[#0F766E]'
                          : isForSelectedTrail
                            ? 'bg-[#141A17] text-white border-[#141A17]'
                            : 'bg-[#FAFBF9] text-[#141A17] border-[#DDE2DC] hover:bg-[#F1F2ED]'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-xs shrink-0"
                        style={{
                          backgroundColor: isTarget ? '#FFFFFF' : meta.color,
                        }}
                      />
                      <span>{shortLabel}</span>
                    </button>
                  );
                })}
              </div>

              {/* Map Viewport */}
              <div className="h-[420px] sm:h-[520px] lg:h-[560px]">
                <GoogleTrailMap
                  apiKey={GOOGLE_MAPS_API_KEY}
                  isOnline={isOnline}
                  quotaExceeded={quotaExceeded}
                  mapStyleMode={mapLayer}
                  trails={mapViewportTrails}
                  selectedTrailId={selectedTrail.id}
                  isTrailFocused={isTrailFocused}
                  onToggleTrailFocus={() => setIsTrailFocused((v) => !v)}
                  fitTrailTrigger={fitTrailTrigger}
                  onSelectTrail={handleSelectTrailOnMap}
                  hazards={allHazards}
                  selectedHazardId={selectedHazardId}
                  onSelectHazard={setSelectedHazardId}
                  navPins={allNavPins}
                  selectedPinId={selectedPinId}
                  onSelectPin={setSelectedPinId}
                  activeNavTarget={activeNavTarget}
                  onNavigateToPin={handleNavigateToPin}
                  onDeletePin={handleDeleteNavPin}
                  currentUserId={user?.uid || null}
                  gpsPosition={gps.position}
                  breadCrumbs={gps.breadCrumbs}
                  pickingMode={pickingMode}
                  onCancelPickMode={() => setPickingMode(null)}
                  onPickCoordinate={(lat, lng) => {
                    const mode = pickingMode;
                    setPickingMode(null);
                    if (mode === 'nav-pin') {
                      setPickedPinCoords({ lat, lng });
                      setNavPinModalOpen(true);
                    } else {
                      setPickedCoords({ lat, lng });
                      setReportModalOpen(true);
                    }
                  }}
                />
              </div>

              {/* Bottom-of-Map Trail Browser: Main Trails vs Off-Piste Tabs */}
              <div className="bg-white border border-[#DDE2DC] rounded-2xl overflow-hidden">
                <div className="bg-[#FAFBF9] border-b border-[#E5E8E3] px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div
                    role="tablist"
                    aria-label="Hamsterley main and off-piste trail lists"
                    className="inline-flex items-center gap-1.5 p-1 bg-[#EAECE5] rounded-xl"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mapListTab === 'main'}
                      onClick={() => setMapListTab('main')}
                      className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
                        mapListTab === 'main'
                          ? 'bg-[#141A17] text-white shadow-xs'
                          : 'text-[#525E57] hover:text-[#141A17]'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-xs bg-[#16A34A] shrink-0" />
                      <span>Main Trails</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono tabular-nums ${
                          mapListTab === 'main'
                            ? 'bg-white/15 text-white'
                            : 'bg-white text-[#141A17]'
                        }`}
                      >
                        {mainTrailsList.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={mapListTab === 'off-piste'}
                      onClick={() => setMapListTab('off-piste')}
                      className={`min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
                        mapListTab === 'off-piste'
                          ? 'bg-[#141A17] text-white shadow-xs'
                          : 'text-[#525E57] hover:text-[#141A17]'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-xs bg-[#DC2626] shrink-0" />
                      <span>Off-Piste Trails</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono tabular-nums ${
                          mapListTab === 'off-piste'
                            ? 'bg-white/15 text-white'
                            : 'bg-white text-[#141A17]'
                        }`}
                      >
                        {offPisteTrailsList.length}
                      </span>
                    </button>
                  </div>

                  <button
                    type="button"
                    aria-pressed={filterMapByTab}
                    onClick={() => setFilterMapByTab((prev) => !prev)}
                    className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                      filterMapByTab
                        ? 'bg-[#0F766E] text-white border-[#0F766E]'
                        : 'bg-white text-[#141A17] border-[#DDE2DC] hover:bg-[#F1F2ED]'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    {filterMapByTab
                      ? `Map: ${mapListTab === 'main' ? 'Main Only' : 'Off-Piste Only'}`
                      : 'Focus Map on Tab'}
                  </button>
                </div>

                {activeMapTabTrails.length === 0 ? (
                  <div className="p-5 text-center space-y-2">
                    <div className="text-sm font-semibold text-[#141A17]">
                      No {mapListTab === 'main' ? 'Main' : 'Off-Piste'} trails match the current grade or search filter.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSkillFilter('all');
                        setGradeFilter('all');
                        setCategoryFilter('all');
                        setSearchQuery('');
                      }}
                      className="min-h-[40px] px-4 py-1.5 rounded-lg bg-[#141A17] text-white text-xs font-semibold cursor-pointer"
                    >
                      Reset Filters
                    </button>
                  </div>
                ) : (
                  <div className="max-h-[300px] overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {activeMapTabTrails.map((trail) => {
                      const gMeta = GRADE_META[trail.grade];
                      const rating = trailRatings[trail.id];
                      const isSelected = selectedTrail.id === trail.id;
                      const dropInPin = dropInPinByTrailId[trail.id];
                      const isNavLocked =
                        Boolean(dropInPin) && activeNavTarget?.id === dropInPin?.id;

                      return (
                        <div
                          key={trail.id}
                          className={`rounded-xl border overflow-hidden transition-colors flex flex-col justify-between ${
                            isSelected
                              ? 'border-[#141A17] bg-[#FAFBF9]'
                              : 'border-[#DDE2DC] bg-white hover:border-[#B9C1B8]'
                          }`}
                        >
                          <div
                            className="h-1.5 w-full"
                            style={{ backgroundColor: gMeta.color }}
                          />
                          <div className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <TrailGradeMarker grade={trail.grade} size="sm" />
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#525E57]">
                                    {trail.direction === 'downhill'
                                      ? 'DH Only'
                                      : trail.direction === 'two-way'
                                        ? '2-Way'
                                        : trail.category === 'official'
                                          ? 'Main Loop'
                                          : 'Off-Piste'}
                                  </span>
                                  {trail.trailforksRating && (
                                    <span className="text-[11px] font-bold font-mono tabular-nums text-[#B45309]">
                                      ★ {trail.trailforksRating.toFixed(1)}
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm font-bold text-[#141A17] leading-snug mt-1">
                                  {trail.name}
                                </div>
                                <div className="text-xs text-[#525E57]">
                                  {trail.sector}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-xs font-bold font-mono tabular-nums text-[#141A17]">
                                  {rating.liveDifficulty.toFixed(1)}/5
                                </div>
                                <div className="text-[10px] font-semibold text-[#525E57]">
                                  {rating.statusLabel}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 text-xs text-[#525E57] font-mono tabular-nums pt-0.5">
                              <span>
                                {trail.distanceKm} km · +{trail.elevationGainM}m / -{trail.elevationLossM}m
                              </span>
                              {rating.activeHazardsCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-[#B45309] font-sans font-semibold">
                                  <AlertTriangle className="w-3 h-3" />
                                  {rating.activeHazardsCount} hazard
                                  {rating.activeHazardsCount > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleFocusTrailFromUI(trail.id)}
                                className={`flex-1 min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                                  isSelected && isTrailFocused
                                    ? 'bg-[#141A17] text-white'
                                    : 'bg-[#F1F2ED] text-[#141A17] hover:bg-[#E5E8E3]'
                                }`}
                              >
                                {isSelected && isTrailFocused
                                  ? 'Focused on Map'
                                  : isSelected
                                    ? 'Focus Trail'
                                    : 'Show on Map'}
                              </button>
                              {dropInPin && (
                                <button
                                  type="button"
                                  onClick={() => handleNavigateToPin(dropInPin)}
                                  className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
                                    isNavLocked
                                      ? 'bg-[#0F766E] text-white'
                                      : 'border border-[#DDE2DC] bg-white text-[#141A17] hover:bg-[#FAFBF9]'
                                  }`}
                                >
                                  <Compass className="w-3.5 h-3.5" />
                                  {isNavLocked ? 'Locked' : 'Nav Pin'}
                                </button>
                              )}
                              {dropInPin && (
                                <a
                                  href={directionsUrl(dropInPin.lat, dropInPin.lng)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer border border-[#DDE2DC] bg-white text-[#141A17] hover:bg-[#FAFBF9]"
                                >
                                  <Navigation className="w-3.5 h-3.5 text-[#0F766E]" />
                                  Directions
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* GPS Live Ride Telemetry & Offline Bearing Strip */}
              <div className="bg-[#141A17] text-white rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {gps.mode !== 'idle' && (
                      <span
                        className="w-2.5 h-2.5 rounded-full bg-[#22C55E] animate-pulse shrink-0"
                        aria-label="Live GPS streaming"
                      />
                    )}
                    <div>
                      <div className="text-sm font-bold font-display">
                        {gps.mode === 'live'
                          ? 'Live Satellite GPS Active'
                          : gps.mode === 'simulated'
                            ? `Simulated Forest Ride — ${selectedTrail.name}`
                            : 'GPS Ride Computer Ready'}
                      </div>
                      <div className="text-xs text-[#A3B1AA] font-mono tabular-nums">
                        {gps.position
                          ? `${gps.position.lat.toFixed(4)}° N, ${Math.abs(gps.position.lng).toFixed(4)}° W · ±${gps.position.accuracy}m`
                          : 'Works 100% offline inside Hamsterley Forest'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {gps.mode === 'idle' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => gps.startLiveGps(true)}
                          className="min-h-[42px] px-4 py-2 rounded-xl bg-[#D94E1F] text-white text-xs font-semibold hover:bg-[#B83E14] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          Start Live GPS
                        </button>
                        <button
                          type="button"
                          onClick={() => gps.startSimulatedRide(true)}
                          className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white/10 text-white text-xs font-semibold hover:bg-white/20 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Demo Trail Ride
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleSaveRide}
                          className="min-h-[42px] px-4 py-2 rounded-xl bg-[#16A34A] text-white text-xs font-semibold hover:bg-[#15803D] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Finish & Save Ride
                        </button>
                        <button
                          type="button"
                          onClick={gps.stopGps}
                          className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white/10 text-white text-xs font-semibold hover:bg-white/20 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Square className="w-3.5 h-3.5" />
                          Stop
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {gps.error && (
                  <div className="text-xs text-amber-300 bg-amber-950/60 border border-amber-800/60 rounded-lg px-3 py-2">
                    {gps.error}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/10">
                  <div>
                    <div className="text-[11px] text-[#A3B1AA]">Speed</div>
                    <div className="text-lg font-bold font-mono tabular-nums">
                      {gps.position ? `${gps.position.speedKmh.toFixed(1)} km/h` : '0.0 km/h'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#A3B1AA]">Distance / Time</div>
                    <div className="text-lg font-bold font-mono tabular-nums">
                      {gps.distanceKm.toFixed(2)} km · {formatDuration(gps.elapsedSec)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#A3B1AA]">Trail Proximity</div>
                    <div className="text-lg font-bold font-mono tabular-nums">
                      {gps.offRouteMeters !== null
                        ? gps.offRouteMeters <= 45
                          ? 'On Trail'
                          : `${gps.offRouteMeters}m off`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#A3B1AA]">Next Waypoint</div>
                    <div className="text-lg font-bold font-mono tabular-nums flex items-center gap-1.5">
                      <Compass className="w-4 h-4 text-[#D94E1F]" />
                      {gps.nextWaypointDistanceKm !== null && gps.nextWaypointBearing !== null
                        ? `${gps.nextWaypointDistanceKm.toFixed(2)} km ${compassDirection(gps.nextWaypointBearing)}`
                        : 'Select trail'}
                    </div>
                  </div>
                </div>

                {activeNavTarget ? (
                  <div className="text-xs bg-[#0F766E]/25 border border-[#14B8A6]/40 rounded-lg px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Navigation className="w-4 h-4 text-[#5EEAD4] shrink-0" />
                      <div className="min-w-0">
                        <span className="font-semibold text-white">
                          Navigating to {activeNavTarget.name}
                        </span>
                        <span className="text-[#99F6E4] font-mono tabular-nums ml-2">
                          {gps.navTargetDistanceKm !== null && gps.navTargetBearing !== null
                            ? `${gps.navTargetDistanceKm.toFixed(2)} km ${compassDirection(gps.navTargetBearing)} (${gps.navTargetBearing}°)`
                            : 'Start Live GPS or Demo Ride for live bearing'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={directionsUrl(activeNavTarget.lat, activeNavTarget.lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#14B8A6] text-[#06231F] text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-[#5EEAD4]"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        Get Directions
                      </a>
                      <button
                        type="button"
                        onClick={() => setActiveNavTarget(null)}
                        className="text-[11px] font-semibold text-white/80 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        Clear Target
                      </button>
                    </div>
                  </div>
                ) : (
                  gps.nextWaypointName && (
                    <div className="text-xs text-[#D5DDD8] bg-white/5 rounded-lg px-3 py-2">
                      <span className="font-semibold text-white">{gps.nextWaypointName}: </span>
                      {gps.nextWaypointInstruction}
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Right Inspector Panel: Active Trail Details & Live Difficulty */}
            <aside className="bg-white border border-[#DDE2DC] rounded-2xl p-5 flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <TrailGradeMarker grade={selectedTrail.grade} />
                    <div className="flex items-center gap-2 text-xs font-medium text-[#525E57]">
                      {selectedTrail.trailforksRating && (
                        <span className="font-mono font-bold tabular-nums text-[#B45309]">
                          ★ {selectedTrail.trailforksRating.toFixed(1)} TF
                        </span>
                      )}
                      <span>
                        {selectedTrail.trailType ||
                          (selectedTrail.category === 'off-piste'
                            ? 'Off-Piste Enduro'
                            : 'Official Waymarked')}
                      </span>
                    </div>
                  </div>

                  <select
                    aria-label="Switch selected trail"
                    value={selectedTrail.id}
                    onChange={(e) => handleFocusTrailFromUI(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-[#DDE2DC] bg-[#FAFBF9] px-3 text-sm font-bold text-[#141A17] font-display focus:outline-none focus:border-[#141A17]"
                  >
                    {(filteredTrails.length > 0 ? filteredTrails : HAMSTERLEY_TRAILS).map(
                      (t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      )
                    )}
                  </select>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-[#525E57] font-mono tabular-nums">
                    <span>{selectedTrail.distanceKm} km</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      +{selectedTrail.elevationGainM}m / -{selectedTrail.elevationLossM}m
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>~{selectedTrail.estimatedMinutes} min</span>
                    {selectedTrail.direction && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-sans font-semibold text-[#141A17]">
                          {selectedTrail.direction === 'downhill'
                            ? 'Downhill Only'
                            : selectedTrail.direction === 'two-way'
                              ? 'Both Directions'
                              : 'Full Loop'}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Real-Time Dynamic Difficulty Meter */}
                <div className="bg-[#FAFBF9] border border-[#E2E6DF] rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#141A17]">
                      Real-Time Route Difficulty
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        selectedRating.maxHazardSeverity >= 3
                          ? 'text-[#DC2626]'
                          : selectedRating.delta >= 0.3
                            ? 'text-[#D97706]'
                            : 'text-[#15803D]'
                      }`}
                    >
                      {selectedRating.statusLabel}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold font-mono tabular-nums text-[#141A17]">
                        {selectedRating.liveDifficulty.toFixed(1)}
                      </span>
                      <span className="text-xs text-[#525E57] font-mono tabular-nums">
                        / 5.0 live (base {selectedRating.baseDifficulty.toFixed(1)})
                      </span>
                    </div>
                    <span className="text-xs font-mono tabular-nums font-semibold text-[#525E57]">
                      {selectedRating.delta > 0
                        ? `+${selectedRating.delta.toFixed(1)}`
                        : selectedRating.delta < 0
                          ? selectedRating.delta.toFixed(1)
                          : '0.0'}
                    </span>
                  </div>

                  {/* Difficulty Progress Bar */}
                  <div className="h-2 w-full rounded-full bg-[#E5E8E3] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${(selectedRating.liveDifficulty / 5) * 100}%`,
                        backgroundColor: GRADE_META[selectedTrail.grade].color,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#525E57]">
                    <span>Surface: {SURFACE_META[selectedRating.dominantSurface].label}</span>
                    <span className="font-mono tabular-nums">
                      {selectedRating.activeHazardsCount} hazard(s) · {selectedRating.voteCount} vote(s)
                    </span>
                  </div>
                </div>

                {/* Trail Summary, Tread & Trailforks Highlights */}
                <div>
                  <p className="text-sm text-[#39423D] leading-relaxed">
                    {selectedTrail.summary}
                  </p>
                  <div className="mt-2 text-xs text-[#525E57]">
                    <span className="font-semibold text-[#141A17]">Tread: </span>
                    {selectedTrail.surface}
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span className="font-semibold text-[#141A17]">Zone: </span>
                    {selectedTrail.sector}
                  </div>
                  {selectedTrail.highlights.length > 0 && (
                    <ul className="mt-2.5 space-y-1">
                      {selectedTrail.highlights.map((item) => (
                        <li
                          key={item}
                          className="text-xs text-[#39423D] flex items-start gap-1.5"
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-xs mt-1.5 shrink-0"
                            style={{ backgroundColor: GRADE_META[selectedTrail.grade].color }}
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Elevation Profile */}
                <ElevationProfile
                  trail={selectedTrail}
                  riderNearestIndex={gps.position ? gps.nearestIndex : null}
                />

                {/* Active Hazards on this Trail */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#141A17]">
                      Current Trail Reports ({activeHazardsOnSelected.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('hazards')}
                      className="text-xs font-semibold text-[#D94E1F] hover:underline cursor-pointer"
                    >
                      All Reports
                    </button>
                  </div>
                  {activeHazardsOnSelected.length === 0 ? (
                    <div className="text-xs text-[#525E57] bg-[#FAFBF9] border border-[#E5E8E3] rounded-xl p-3">
                      No active hazards reported on this track.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeHazardsOnSelected.slice(0, 2).map((h) => (
                        <div
                          key={h.id}
                          className="border border-[#E5E8E3] rounded-xl p-3 text-xs bg-white"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#D94E1F]">
                              {HAZARD_TYPE_META[h.hazardType].label}
                            </span>
                            <span className="text-[#525E57] font-mono tabular-nums">
                              {formatTimeAgo(h.createdAtMs)}
                            </span>
                          </div>
                          <div className="font-bold text-[#141A17] mt-0.5">{h.title}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-3 border-t border-[#E5E8E3]">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setReportInitialTab('rating');
                      setReportModalOpen(true);
                    }}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-[#DDE2DC] bg-white text-xs font-semibold text-[#141A17] hover:bg-[#FAFBF9] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Star className="w-3.5 h-3.5 text-[#D97706]" />
                    Rate Route
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReportInitialTab('hazard');
                      setReportModalOpen(true);
                    }}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-[#141A17] text-white text-xs font-semibold hover:bg-[#232D28] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Flag className="w-3.5 h-3.5 text-[#D94E1F]" />
                    Flag Hazard
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const file = downloadTrailGpx(selectedTrail);
                    showToast(`Exported ${file} for GPS watch or bike computer`);
                  }}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#DDE2DC] bg-[#FAFBF9] text-xs font-semibold text-[#141A17] hover:bg-[#F1F2ED] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#0F766E]" />
                  Export GPX Route (.gpx)
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* TAB 2: TRAIL DIRECTORY (OFFICIAL + OFF-PISTE) */}
        {activeTab === 'trails' && (
          <section className="space-y-4">
            <div className="bg-white border border-[#DDE2DC] rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-[#525E57] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Ant & Dec, Clown Shoes, Two Wheels, Honey Badger…"
                  className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-[#DDE2DC] text-sm text-[#141A17] focus:outline-none focus:border-[#141A17]"
                />
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#F1F2ED] rounded-xl overflow-x-auto">
                {(
                  [
                    { id: 'all', label: `All Tracks (${HAMSTERLEY_TRAILS.length})` },
                    { id: 'official', label: 'Official Waymarked' },
                    { id: 'off-piste', label: 'Off-Piste Enduro' },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      categoryFilter === cat.id
                        ? 'bg-white text-[#141A17] shadow-xs'
                        : 'text-[#525E57] hover:text-[#141A17]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredTrails.length === 0 ? (
              <div className="bg-white border border-[#DDE2DC] rounded-2xl p-8 text-center">
                <p className="text-sm font-semibold text-[#141A17]">
                  No Hamsterley trails match your current filters.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSkillFilter('all');
                    setCategoryFilter('all');
                    setGradeFilter('all');
                    setSearchQuery('');
                  }}
                  className="mt-3 px-4 py-2 rounded-xl bg-[#141A17] text-white text-xs font-semibold cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTrails.map((trail) => {
                  const rating = trailRatings[trail.id];
                  const gradeMeta = GRADE_META[trail.grade];
                  return (
                    <article
                      key={trail.id}
                      className="bg-white border border-[#DDE2DC] rounded-2xl overflow-hidden flex flex-col justify-between"
                    >
                      {/* Top Colour Bar showing Easy -> Extreme immediately */}
                      <div
                        className="h-2 w-full"
                        style={{ backgroundColor: gradeMeta.color }}
                        aria-hidden="true"
                      />

                      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <TrailGradeMarker grade={trail.grade} size="sm" />
                            <div className="flex items-center gap-2 text-[11px] font-medium text-[#525E57]">
                              {trail.trailforksRating && (
                                <span className="font-mono font-bold tabular-nums text-[#B45309]">
                                  ★ {trail.trailforksRating.toFixed(1)}
                                </span>
                              )}
                              <span>
                                {trail.direction === 'downhill'
                                  ? 'DH Only'
                                  : trail.direction === 'two-way'
                                    ? '2-Way'
                                    : trail.category === 'off-piste'
                                      ? 'Off-Piste'
                                      : 'Official'}
                              </span>
                            </div>
                          </div>

                          <h3 className="text-lg font-bold text-[#141A17] font-display mt-2">
                            {trail.name}
                          </h3>

                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#525E57] font-mono tabular-nums">
                            <span>{trail.distanceKm} km</span>
                            <span aria-hidden="true">·</span>
                            <span>+{trail.elevationGainM}m / -{trail.elevationLossM}m</span>
                            <span aria-hidden="true">·</span>
                            <span>~{trail.estimatedMinutes}m</span>
                          </div>

                          <p className="mt-2.5 text-xs text-[#525E57] leading-relaxed">
                            {trail.summary}
                          </p>
                        </div>

                        <div className="space-y-3 pt-3 border-t border-[#E5E8E3]">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#525E57]">
                              Live Rating:{' '}
                              <strong className="font-mono tabular-nums text-[#141A17]">
                                {rating.liveDifficulty.toFixed(1)}/5.0
                              </strong>
                            </span>
                            <span
                              className={`font-semibold ${
                                rating.maxHazardSeverity >= 3
                                  ? 'text-[#DC2626]'
                                  : rating.delta >= 0.3
                                    ? 'text-[#D97706]'
                                    : 'text-[#15803D]'
                              }`}
                            >
                              {rating.statusLabel}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                handleFocusTrailFromUI(trail.id);
                                setActiveTab('map');
                              }}
                              className="min-h-[42px] px-3 py-2 rounded-xl bg-[#141A17] text-white text-xs font-semibold hover:bg-[#232D28] cursor-pointer"
                            >
                              Open on Map
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTrailId(trail.id);
                                setReportInitialTab('rating');
                                setReportModalOpen(true);
                              }}
                              className="min-h-[42px] px-3 py-2 rounded-xl border border-[#DDE2DC] text-xs font-semibold text-[#141A17] hover:bg-[#FAFBF9] cursor-pointer"
                            >
                              Rate Today
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: LIVE HAZARDS & SOCIAL CONDITIONS FEED */}
        {activeTab === 'hazards' && (
          <section className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
            <div className="space-y-4">
              <div className="bg-white border border-[#DDE2DC] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-[#141A17] font-display">
                    Community Trail Hazards & Condition Reports
                  </h2>
                  <p className="text-xs text-[#525E57] mt-0.5">
                    Confirm active hazards or mark fallen trees cleared to keep Hamsterley live ratings accurate.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReportInitialTab('hazard');
                    setReportModalOpen(true);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D94E1F] text-white text-xs font-semibold hover:bg-[#B83E14] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Report Hazard
                </button>
              </div>

              <div className="space-y-3">
                {allHazards.map((h) => {
                  const trail = HAMSTERLEY_TRAILS.find((t) => t.id === h.trailId);
                  const isResolved = h.status === 'resolved';
                  return (
                    <div
                      key={h.id}
                      className={`bg-white border rounded-2xl p-4 sm:p-5 ${
                        isResolved ? 'border-[#E5E8E3] opacity-70' : 'border-[#DDE2DC]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span
                            className={`font-bold ${
                              isResolved
                                ? 'text-[#15803D]'
                                : h.hazardType === 'clear_trail'
                                  ? 'text-[#15803D]'
                                  : h.severity >= 3
                                    ? 'text-[#DC2626]'
                                    : 'text-[#D97706]'
                            }`}
                          >
                            {isResolved
                              ? 'Cleared / Resolved'
                              : HAZARD_TYPE_META[h.hazardType].label}
                          </span>
                          <span aria-hidden="true" className="text-[#525E57]">
                            ·
                          </span>
                          <span className="font-semibold text-[#141A17]">
                            {trail?.name || h.trailId}
                          </span>
                        </div>
                        <span className="text-xs text-[#525E57] font-mono tabular-nums">
                          {formatTimeAgo(h.createdAtMs)}
                          {h.pendingSync ? ' · Queued Offline' : ''}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-[#141A17] mt-1.5">
                        {h.title}
                      </h3>
                      <p className="text-sm text-[#525E57] mt-1 leading-relaxed">
                        {h.description}
                      </p>

                      <div className="mt-3 pt-3 border-t border-[#E5E8E3] flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-[#525E57]">
                          Reported by <strong className="text-[#141A17]">{h.authorName}</strong> ·{' '}
                          <span className="font-mono tabular-nums">
                            {h.confirmationsCount} confirmation(s)
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (trail) handleFocusTrailFromUI(trail.id);
                              setSelectedHazardId(h.id);
                              setActiveTab('map');
                            }}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#DDE2DC] text-xs font-semibold text-[#141A17] hover:bg-[#FAFBF9] cursor-pointer"
                          >
                            View on Map
                          </button>
                          {!isResolved && !h.isBaseline && !h.pendingSync && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleConfirmHazard(h)}
                                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#DDE2DC] text-xs font-semibold text-[#141A17] hover:bg-[#FAFBF9] flex items-center gap-1 cursor-pointer"
                              >
                                <ThumbsUp className="w-3.5 h-3.5" />
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResolveHazard(h)}
                                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#141A17] text-white text-xs font-semibold hover:bg-[#232D28] cursor-pointer"
                              >
                                Mark Cleared
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Recent Difficulty Votes & Saved Rides */}
            <div className="space-y-4">
              <div className="bg-white border border-[#DDE2DC] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold text-[#141A17] font-display">
                    Recent Rider Surface Votes
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setReportInitialTab('rating');
                      setReportModalOpen(true);
                    }}
                    className="text-xs font-semibold text-[#D94E1F] hover:underline cursor-pointer"
                  >
                    + Add Vote
                  </button>
                </div>
                <div className="space-y-3">
                  {allVotes.slice(0, 6).map((v) => {
                    const trail = HAMSTERLEY_TRAILS.find((t) => t.id === v.trailId);
                    return (
                      <div
                        key={v.id}
                        className="pb-3 border-b last:border-b-0 last:pb-0 border-[#E5E8E3] text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[#141A17] truncate">
                            {trail?.name || v.trailId}
                          </span>
                          <span className="font-mono tabular-nums font-bold text-[#141A17] shrink-0">
                            {v.rating}.0 / 5
                          </span>
                        </div>
                        <div className="text-[#525E57] mt-0.5">
                          {SURFACE_META[v.surfaceCondition].label} · {v.authorName} ·{' '}
                          {formatTimeAgo(v.createdAtMs)}
                        </div>
                        {v.comment && (
                          <p className="text-[#39423D] mt-1">{v.comment}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white border border-[#DDE2DC] rounded-2xl p-5">
                <h3 className="text-base font-bold text-[#141A17] font-display mb-3">
                  Your Recorded GPS Rides
                </h3>
                {rides.length === 0 ? (
                  <p className="text-xs text-[#525E57]">
                    Start Live GPS or Demo Trail Ride from the Trail Map to log your distance, climbing, and speed.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {rides.slice(0, 5).map((r) => (
                      <div
                        key={r.id}
                        className="border border-[#E5E8E3] rounded-xl p-3 text-xs"
                      >
                        <div className="font-bold text-[#141A17]">{r.trailName}</div>
                        <div className="font-mono tabular-nums text-[#525E57] mt-1">
                          {r.distanceKm.toFixed(2)} km · +{r.elevationGainM}m ·{' '}
                          {formatDuration(r.durationSec)} · {r.avgSpeedKmh} km/h
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* TAB 4: OFFLINE PACKS & FREE MOBILE APP */}
        {activeTab === 'offline' && (
          <PWAInstallPanel
            trailCount={HAMSTERLEY_TRAILS.length}
            offlinePack={offlinePack}
            pendingSync={pendingSync}
            isOnline={isOnline}
            forcedOffline={forcedOffline}
            isSignedIn={!!user}
            userEmail={user?.email || null}
            userName={user?.displayName || null}
            ridesCount={rides.length}
            onToggleForcedOffline={setForcedOffline}
            onDownloadPack={handleDownloadPack}
            onDeletePack={handleDeletePack}
            onFlushSync={flushOfflineQueue}
            onSignIn={handleSignIn}
            onDeleteAccountAndData={handleDeleteAccountAndData}
            onClearLocalData={handleClearLocalData}
          />
        )}
      </main>

      {/* Mobile Bottom Thumb-Zone Tab Bar (< lg) — compact height */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#DDE2DC] grid grid-cols-4 h-16"
      >
        {(
          [
            { id: 'map', label: 'Map', icon: MapIcon },
            { id: 'trails', label: 'Trails', icon: List },
            { id: 'hazards', label: 'Hazards', icon: AlertTriangle },
            { id: 'offline', label: 'Offline', icon: WifiOff },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold cursor-pointer ${
                active ? 'text-[#D94E1F]' : 'text-[#525E57]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Report Hazard & Live Difficulty Modal */}
      <ReportHazardModal
        isOpen={reportModalOpen}
        initialTab={reportInitialTab}
        defaultTrailId={selectedTrail.id}
        gpsPosition={gps.position}
        pickedCoords={pickedCoords}
        isOnline={isOnline}
        isAuthenticated={!!user}
        onClose={() => {
          setReportModalOpen(false);
          setPickingMode(null);
        }}
        onRequestPickOnMap={() => {
          setReportModalOpen(false);
          setActiveTab('map');
          setPickingMode('hazard');
        }}
        onSignIn={handleSignIn}
        onSubmitHazard={handleCreateHazard}
        onSubmitVote={handleCreateVote}
      />

      {/* Custom Navigation Pin Drop Modal */}
      <NavPinModal
        isOpen={navPinModalOpen}
        defaultTrailId={selectedTrail.id}
        initialCoords={pickedPinCoords}
        gpsPosition={gps.position}
        isOnline={isOnline}
        isAuthenticated={!!user}
        onClose={() => {
          setNavPinModalOpen(false);
          setPickingMode(null);
        }}
        onRequestPickOnMap={() => {
          setNavPinModalOpen(false);
          setActiveTab('map');
          setPickingMode('nav-pin');
        }}
        onSignIn={handleSignIn}
        onSubmitPin={handleCreateNavPin}
      />

      <OfflineIndicator isOnline={isOnline} hasOfflinePack={!!offlinePack} />
    </div>
  );
}
