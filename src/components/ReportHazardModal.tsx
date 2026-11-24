import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, MapPin, Star, X } from 'lucide-react';
import {
  HAMSTERLEY_BOUNDS,
  HAMSTERLEY_TRAILS,
  HAZARD_TYPE_META,
  SURFACE_META,
} from '../data/hamsterleyTrails';
import {
  DifficultyVote,
  GpsPosition,
  HazardReport,
  HazardType,
  SurfaceCondition,
} from '../types/trail';

interface ReportHazardModalProps {
  isOpen: boolean;
  initialTab?: 'hazard' | 'rating';
  defaultTrailId: string;
  gpsPosition: GpsPosition | null;
  pickedCoords: { lat: number; lng: number } | null;
  isOnline: boolean;
  isAuthenticated: boolean;
  onClose: () => void;
  onRequestPickOnMap: () => void;
  onSignIn: () => Promise<void>;
  onSubmitHazard: (
    data: Omit<
      HazardReport,
      'id' | 'authorId' | 'authorName' | 'status' | 'visibility' | 'confirmationsCount' | 'createdAtMs' | 'updatedAtMs'
    >
  ) => Promise<void>;
  onSubmitVote: (
    data: Omit<DifficultyVote, 'id' | 'authorId' | 'authorName' | 'visibility' | 'createdAtMs'>
  ) => Promise<void>;
}

export const ReportHazardModal: React.FC<ReportHazardModalProps> = ({
  isOpen,
  initialTab = 'hazard',
  defaultTrailId,
  gpsPosition,
  pickedCoords,
  isOnline,
  isAuthenticated,
  onClose,
  onRequestPickOnMap,
  onSignIn,
  onSubmitHazard,
  onSubmitVote,
}) => {
  const [tab, setTab] = useState<'hazard' | 'rating'>(initialTab);
  const [trailId, setTrailId] = useState(defaultTrailId);

  // Hazard form state
  const [hazardType, setHazardType] = useState<HazardType>('fallen_tree');
  const [severity, setSeverity] = useState<1 | 2 | 3 | 4>(3);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Rating form state
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [surfaceCondition, setSurfaceCondition] = useState<SurfaceCondition>('hero_dirt');
  const [comment, setComment] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedTrail =
    HAMSTERLEY_TRAILS.find((t) => t.id === trailId) || HAMSTERLEY_TRAILS[0];
  const midpoint =
    selectedTrail.coordinates[Math.floor(selectedTrail.coordinates.length / 2)];

  const clampLat = (lat: number) =>
    Math.min(54.759, Math.max(54.581, Math.round(lat * 10000) / 10000));
  const clampLng = (lng: number) =>
    Math.min(-1.751, Math.max(-2.049, Math.round(lng * 10000) / 10000));

  const useGps =
    gpsPosition &&
    gpsPosition.lat >= HAMSTERLEY_BOUNDS.minLat - 0.05 &&
    gpsPosition.lat <= HAMSTERLEY_BOUNDS.maxLat + 0.05 &&
    gpsPosition.lng >= HAMSTERLEY_BOUNDS.minLng - 0.05 &&
    gpsPosition.lng <= HAMSTERLEY_BOUNDS.maxLng + 0.05;

  const targetCoords = pickedCoords
    ? { lat: clampLat(pickedCoords.lat), lng: clampLng(pickedCoords.lng), source: 'Map Pin' }
    : useGps && gpsPosition
      ? { lat: clampLat(gpsPosition.lat), lng: clampLng(gpsPosition.lng), source: 'Live GPS' }
      : { lat: clampLat(midpoint.lat), lng: clampLng(midpoint.lng), source: 'Trail Midpoint' };

  const handleHazardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanTitle = title.trim();
    const cleanDesc = description.trim();
    if (cleanTitle.length < 3 || cleanTitle.length > 100) {
      setFormError('Title must be between 3 and 100 characters.');
      return;
    }
    if (cleanDesc.length < 1 || cleanDesc.length > 400) {
      setFormError('Description must be between 1 and 400 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmitHazard({
        trailId,
        hazardType,
        severity,
        title: cleanTitle,
        description: cleanDesc,
        lat: targetCoords.lat,
        lng: targetCoords.lng,
      });
      setTitle('');
      setDescription('');
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save report.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanComment = comment.trim().slice(0, 240);
    setSubmitting(true);
    try {
      await onSubmitVote({
        trailId,
        rating,
        surfaceCondition,
        comment: cleanComment,
      });
      setComment('');
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save rating.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Trail Condition & Difficulty Report"
    >
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-[#DDE2DC] shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-[#E5E8E3] px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#141A17] font-display">
              Report Trail Update
            </h2>
            <p className="text-xs text-[#525E57]">
              {isOnline
                ? 'Syncs directly with Hamsterley riders'
                : 'Offline mode — will queue locally and sync automatically'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[#525E57] hover:bg-[#F6F6F3] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Segmented Tab Switch */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#F1F2ED] rounded-xl">
            <button
              type="button"
              onClick={() => {
                setTab('hazard');
                setFormError(null);
              }}
              className={`min-h-[42px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                tab === 'hazard'
                  ? 'bg-white text-[#141A17] shadow-xs'
                  : 'text-[#525E57] hover:text-[#141A17]'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-[#D94E1F]" />
              Report Hazard
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('rating');
                setFormError(null);
              }}
              className={`min-h-[42px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                tab === 'rating'
                  ? 'bg-white text-[#141A17] shadow-xs'
                  : 'text-[#525E57] hover:text-[#141A17]'
              }`}
            >
              <Star className="w-4 h-4 text-[#D97706]" />
              Rate Live Difficulty
            </button>
          </div>

          {!isAuthenticated && isOnline && (
            <div className="bg-[#FAFBF9] border border-[#DDE2DC] rounded-xl p-3.5 flex items-center justify-between gap-3">
              <div className="text-xs text-[#525E57]">
                Sign in with Google to publish live reports to the community feed.
              </div>
              <button
                type="button"
                onClick={onSignIn}
                className="px-3 py-2 rounded-lg bg-[#141A17] text-white text-xs font-semibold whitespace-nowrap shrink-0 hover:bg-[#232D28] cursor-pointer"
              >
                Sign in
              </button>
            </div>
          )}

          {/* Trail Selector */}
          <div>
            <label
              htmlFor="report-trail-select"
              className="block text-xs font-semibold text-[#141A17] mb-1.5"
            >
              Select Trail
            </label>
            <select
              id="report-trail-select"
              value={trailId}
              onChange={(e) => setTrailId(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[#DDE2DC] bg-white px-3 text-sm text-[#141A17] focus:outline-none focus:border-[#141A17]"
            >
              {HAMSTERLEY_TRAILS.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.gradeLabel}] {t.name}
                </option>
              ))}
            </select>
          </div>

          {formError && (
            <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-xs font-medium text-[#991B1B]">
              {formError}
            </div>
          )}

          {tab === 'hazard' ? (
            <form onSubmit={handleHazardSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#141A17] mb-1.5">
                  Condition / Hazard Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(Object.keys(HAZARD_TYPE_META) as HazardType[]).map((type) => {
                    const meta = HAZARD_TYPE_META[type];
                    const active = hazardType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setHazardType(type);
                          setSeverity(meta.defaultSeverity);
                        }}
                        className={`min-h-[42px] px-3 py-2 rounded-xl border text-left text-xs font-medium transition-colors cursor-pointer ${
                          active
                            ? 'border-[#141A17] bg-[#F6F6F3] text-[#141A17] font-semibold'
                            : 'border-[#E5E8E3] text-[#525E57] hover:bg-[#FAFBF9]'
                        }`}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#141A17] mb-1.5">
                  Severity Level ({severity} / 4)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {([1, 2, 3, 4] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSeverity(lvl)}
                      className={`min-h-[42px] rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                        severity === lvl
                          ? 'bg-[#141A17] text-white border-[#141A17]'
                          : 'bg-white text-[#525E57] border-[#DDE2DC] hover:bg-[#FAFBF9]'
                      }`}
                    >
                      {lvl === 1 ? '1 · Clear' : lvl === 2 ? '2 · Minor' : lvl === 3 ? '3 · Caution' : '4 · Blocked'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="hazard-title"
                  className="block text-xs font-semibold text-[#141A17] mb-1.5"
                >
                  Short Headline
                </label>
                <input
                  id="hazard-title"
                  type="text"
                  maxLength={100}
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Fallen larch across mid chute"
                  className="w-full min-h-[44px] rounded-xl border border-[#DDE2DC] px-3 text-sm text-[#141A17] focus:outline-none focus:border-[#141A17]"
                />
              </div>

              <div>
                <label
                  htmlFor="hazard-desc"
                  className="block text-xs font-semibold text-[#141A17] mb-1.5"
                >
                  Rider Details & Bypass Info
                </label>
                <textarea
                  id="hazard-desc"
                  rows={3}
                  maxLength={400}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe exact section, speed warning, or high-line bypass…"
                  className="w-full rounded-xl border border-[#DDE2DC] p-3 text-sm text-[#141A17] focus:outline-none focus:border-[#141A17]"
                />
              </div>

              <div className="bg-[#FAFBF9] border border-[#E5E8E3] rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#141A17] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#D94E1F]" />
                    Pin Location ({targetCoords.source})
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-[#525E57] mt-0.5">
                    {targetCoords.lat.toFixed(4)}, {targetCoords.lng.toFixed(4)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onRequestPickOnMap}
                  className="px-3 py-2 rounded-lg border border-[#DDE2DC] bg-white text-xs font-semibold text-[#141A17] hover:bg-[#F6F6F3] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Pick on Map
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting || (isOnline && !isAuthenticated)}
                className="w-full min-h-[48px] rounded-xl bg-[#D94E1F] text-white text-sm font-semibold hover:bg-[#B83E14] disabled:opacity-50 transition-colors cursor-pointer"
              >
                {submitting
                  ? 'Saving Report…'
                  : isOnline
                    ? 'Publish Trail Report'
                    : 'Queue Report Offline'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVoteSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#141A17] mb-1.5">
                  How Hard Is It Riding Today? ({rating} / 5)
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {([1, 2, 3, 4, 5] as const).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setRating(val)}
                      className={`min-h-[44px] rounded-xl border text-xs font-bold font-mono tabular-nums transition-colors cursor-pointer ${
                        rating === val
                          ? 'bg-[#141A17] text-white border-[#141A17]'
                          : 'bg-white text-[#525E57] border-[#DDE2DC] hover:bg-[#FAFBF9]'
                      }`}
                    >
                      {val}.0
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#141A17] mb-1.5">
                  Current Surface & Grip
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(SURFACE_META) as SurfaceCondition[]).map((surf) => {
                    const active = surfaceCondition === surf;
                    return (
                      <button
                        key={surf}
                        type="button"
                        onClick={() => setSurfaceCondition(surf)}
                        className={`min-h-[42px] px-3 py-2 rounded-xl border text-left text-xs font-medium transition-colors cursor-pointer ${
                          active
                            ? 'border-[#141A17] bg-[#F6F6F3] text-[#141A17] font-semibold'
                            : 'border-[#E5E8E3] text-[#525E57] hover:bg-[#FAFBF9]'
                        }`}
                      >
                        {SURFACE_META[surf].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="vote-comment"
                  className="block text-xs font-semibold text-[#141A17] mb-1.5"
                >
                  Quick Trail Note (Optional)
                </label>
                <textarea
                  id="vote-comment"
                  rows={2}
                  maxLength={240}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="e.g. Dry top to bottom, roots gripping well on soft compound."
                  className="w-full rounded-xl border border-[#DDE2DC] p-3 text-sm text-[#141A17] focus:outline-none focus:border-[#141A17]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || (isOnline && !isAuthenticated)}
                className="w-full min-h-[48px] rounded-xl bg-[#141A17] text-white text-sm font-semibold hover:bg-[#232D28] disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {submitting
                  ? 'Updating Live Difficulty…'
                  : isOnline
                    ? 'Submit Live Difficulty Rating'
                    : 'Queue Rating Offline'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
