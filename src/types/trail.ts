export type TrailGrade =
  | 'green'
  | 'blue'
  | 'red'
  | 'black'
  | 'double-black'
  | 'orange';

export type TrailCategory = 'official' | 'off-piste';

export type RiderSkillLevel = 'all' | 'beginner' | 'intermediate' | 'advanced';

export type HazardType =
  | 'fallen_tree'
  | 'deep_mud'
  | 'washout'
  | 'slick_roots'
  | 'ice_frost'
  | 'forestry_ops'
  | 'clear_trail';

export type SurfaceCondition =
  | 'dry_fast'
  | 'hero_dirt'
  | 'greasy_roots'
  | 'muddy_bog'
  | 'ice_snow';

export type NavPinKind = 'drop_in' | 'car_park' | 'waypoint' | 'meetup';

export interface GeoPoint {
  lat: number;
  lng: number;
  ele: number;
}

export interface TrailWaypoint {
  name: string;
  lat: number;
  lng: number;
  instruction: string;
  distFromStartKm: number;
}

export interface Trail {
  id: string;
  name: string;
  sector: string;
  category: TrailCategory;
  grade: TrailGrade;
  gradeLabel: string;
  skillTier: Exclude<RiderSkillLevel, 'all'>;
  baseDifficulty: number;
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  estimatedMinutes: number;
  surface: string;
  summary: string;
  highlights: string[];
  direction?: 'downhill' | 'two-way' | 'loop';
  trailforksRating?: number;
  trailType?: string;
  coordinates: GeoPoint[];
  waypoints: TrailWaypoint[];
}

export interface NavPin {
  id: string;
  authorId: string;
  authorName: string;
  name: string;
  pinKind: NavPinKind;
  trailId: string;
  lat: number;
  lng: number;
  visibility: 'public' | 'private';
  createdAtMs: number;
  isBuiltIn?: boolean;
  pendingSync?: boolean;
}

export interface NavTarget {
  id: string;
  name: string;
  kind: NavPinKind;
  lat: number;
  lng: number;
  ele?: number;
  trailId?: string;
}

export interface HazardReport {
  id: string;
  authorId: string;
  authorName: string;
  trailId: string;
  hazardType: HazardType;
  severity: 1 | 2 | 3 | 4;
  title: string;
  description: string;
  lat: number;
  lng: number;
  status: 'active' | 'resolved';
  visibility: 'public';
  confirmationsCount: number;
  createdAtMs: number;
  updatedAtMs: number;
  isBaseline?: boolean;
  pendingSync?: boolean;
}

export interface DifficultyVote {
  id: string;
  authorId: string;
  authorName: string;
  trailId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  surfaceCondition: SurfaceCondition;
  comment: string;
  visibility: 'public';
  createdAtMs: number;
  isBaseline?: boolean;
  pendingSync?: boolean;
}

export interface RideLog {
  id: string;
  userId: string;
  trailId: string;
  trailName: string;
  distanceKm: number;
  elevationGainM: number;
  durationSec: number;
  avgSpeedKmh: number;
  createdAtMs: number;
  pendingSync?: boolean;
}

export interface LiveTrailRating {
  baseDifficulty: number;
  liveDifficulty: number;
  delta: number;
  activeHazardsCount: number;
  maxHazardSeverity: number;
  dominantSurface: SurfaceCondition;
  voteCount: number;
  statusLabel: 'Running Fast' | 'Tacky / Hero' | 'Caution Advised' | 'Technical / Wet' | 'Hazard Alert';
}

export interface GpsPosition {
  lat: number;
  lng: number;
  ele: number | null;
  accuracy: number;
  speedKmh: number;
  heading: number | null;
  timestamp: number;
}
