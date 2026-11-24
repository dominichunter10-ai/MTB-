import React, { useEffect, useState } from 'react';
import { Globe, Lock, MapPin, Navigation, X } from 'lucide-react';
import {
  HAMSTERLEY_CENTER,
  HAMSTERLEY_TRAILS,
  PIN_KIND_META,
} from '../data/hamsterleyTrails';
import { GpsPosition, NavPin, NavPinKind } from '../types/trail';

interface NavPinModalProps {
  isOpen: boolean;
  defaultTrailId: string;
  initialCoords: { lat: number; lng: number } | null;
  gpsPosition: GpsPosition | null;
  isOnline: boolean;
  isAuthenticated: boolean;
  onClose: () => void;
  onRequestPickOnMap: () => void;
  onSignIn: () => Promise<void>;
  onSubmitPin: (
    data: Omit<NavPin, 'id' | 'authorId' | 'authorName' | 'createdAtMs'>,
    navigateNow: boolean
  ) => Promise<void>;
}

export const NavPinModal: React.FC<NavPinModalProps> = ({
  isOpen,
  defaultTrailId,
  initialCoords,
  gpsPosition,
  isOnline,
  isAuthenticated,
  onClose,
  onRequestPickOnMap,
  onSignIn,
  onSubmitPin,
}) => {
  const [name, setName] = useState('');
  const [pinKind, setPinKind] = useState<NavPinKind>('drop_in');
  const [trailId, setTrailId] = useState(defaultTrailId || 'general');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [navigateNow, setNavigateNow] = useState(true);
  const [useLiveGps, setUseLiveGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setUseLiveGps(false);
      setFormError(null);
      if (defaultTrailId) {
        setTrailId(defaultTrailId);
      }
    }
  }, [isOpen, defaultTrailId, initialCoords]);

  if (!isOpen) return null;

  const clampLat = (lat: number) =>
    Math.min(54.759, Math.max(54.581, Math.round(lat * 10000) / 10000));
  const clampLng = (lng: number) =>
    Math.min(-1.751, Math.max(-2.049, Math.round(lng * 10000) / 10000));

  const resolvedCoords =
    useLiveGps && gpsPosition
      ? { lat: clampLat(gpsPosition.lat), lng: clampLng(gpsPosition.lng), source: 'Live GPS' }
      : initialCoords
        ? { lat: clampLat(initialCoords.lat), lng: clampLng(initialCoords.lng), source: 'Tapped Map Point' }
        : gpsPosition
          ? { lat: clampLat(gpsPosition.lat), lng: clampLng(gpsPosition.lng), source: 'Live GPS' }
          : { lat: clampLat(HAMSTERLEY_CENTER.lat), lng: clampLng(HAMSTERLEY_CENTER.lng), source: 'Forest Centre' };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanName = name.trim();
    if (cleanName.length < 1 || cleanName.length > 80) {
      setFormError('Pin name must be between 1 and 80 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmitPin(
        {
          name: cleanName,
          pinKind,
          trailId: trailId || 'general',
          lat: resolvedCoords.lat,
          lng: resolvedCoords.lng,
          visibility,
        },
        navigateNow
      );
      setName('');
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save navigation pin.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Drop Navigation Pin"
    >
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-[#DDE2DC] shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-[#E5E8E3] px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#141A17] font-display">
              Drop Navigation Pin
            </h2>
            <p className="text-xs text-[#525E57]">
              Save a drop-in, parking spot, or meetup pin and navigate straight to it
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pin modal"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[#525E57] hover:bg-[#F6F6F3] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {!isAuthenticated && isOnline && (
            <div className="bg-[#FAFBF9] border border-[#DDE2DC] rounded-xl p-3.5 flex items-center justify-between gap-3">
              <div className="text-xs text-[#525E57]">
                Sign in with Google to sync pins across devices, or save offline locally.
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

          {formError && (
            <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-xs font-medium text-[#991B1B]">
              {formError}
            </div>
          )}

          <div className="bg-[#FAFBF9] border border-[#E5E8E3] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#141A17] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#D94E1F]" />
                Coordinates ({resolvedCoords.source})
              </div>
              <div className="text-xs font-mono tabular-nums text-[#525E57] mt-0.5">
                {resolvedCoords.lat.toFixed(4)}° N, {Math.abs(resolvedCoords.lng).toFixed(4)}° W
              </div>
            </div>
            <div className="flex items-center gap-2">
              {gpsPosition && (
                <button
                  type="button"
                  onClick={() => setUseLiveGps(true)}
                  className="px-2.5 py-2 rounded-lg border border-[#DDE2DC] bg-white text-xs font-semibold text-[#141A17] hover:bg-[#F6F6F3] cursor-pointer"
                >
                  Use GPS
                </button>
              )}
              <button
                type="button"
                onClick={onRequestPickOnMap}
                className="px-3 py-2 rounded-lg border border-[#141A17] bg-white text-xs font-semibold text-[#141A17] hover:bg-[#F6F6F3] cursor-pointer"
              >
                Tap Map to Move
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="navpin-name"
              className="block text-xs font-semibold text-[#141A17] mb-1.5"
            >
              Pin Label
            </label>
            <input
              id="navpin-name"
              type="text"
              maxLength={80}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. K-Line Secret Entry, Van Parked, Danny Hart’s Gap"
              className="w-full min-h-[44px] rounded-xl border border-[#DDE2DC] px-3 text-sm text-[#141A17] focus:outline-none focus:border-[#141A17]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#141A17] mb-1.5">
              Pin Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PIN_KIND_META) as NavPinKind[]).map((kind) => {
                const meta = PIN_KIND_META[kind];
                const active = pinKind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setPinKind(kind)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                      active
                        ? 'border-[#141A17] bg-[#F6F6F3] text-[#141A17] font-semibold'
                        : 'border-[#E5E8E3] text-[#525E57] hover:bg-[#FAFBF9]'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-md text-[10px] font-bold text-white flex items-center justify-center shrink-0"
                      style={{ backgroundColor: meta.color }}
                    >
                      {meta.glyph}
                    </span>
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="navpin-trail"
              className="block text-xs font-semibold text-[#141A17] mb-1.5"
            >
              Linked Trail (Optional)
            </label>
            <select
              id="navpin-trail"
              value={trailId}
              onChange={(e) => setTrailId(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[#DDE2DC] bg-white px-3 text-sm text-[#141A17] focus:outline-none focus:border-[#141A17]"
            >
              <option value="general">General Forest Location</option>
              {HAMSTERLEY_TRAILS.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.gradeLabel}] {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVisibility('private')}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                visibility === 'private'
                  ? 'border-[#141A17] bg-[#141A17] text-white'
                  : 'border-[#DDE2DC] bg-white text-[#525E57]'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              Private Pin
            </button>
            <button
              type="button"
              onClick={() => setVisibility('public')}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                visibility === 'public'
                  ? 'border-[#141A17] bg-[#141A17] text-white'
                  : 'border-[#DDE2DC] bg-white text-[#525E57]'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Public Community
            </button>
          </div>

          <label className="flex items-center gap-2.5 text-xs font-medium text-[#141A17] cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={navigateNow}
              onChange={(e) => setNavigateNow(e.target.checked)}
              className="w-4 h-4 accent-[#D94E1F] rounded"
            />
            Start compass navigation to this pin immediately
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[48px] rounded-xl bg-[#D94E1F] text-white text-sm font-semibold hover:bg-[#B83E14] disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Navigation className="w-4 h-4" />
            {submitting
              ? 'Dropping Pin…'
              : isOnline && isAuthenticated
                ? 'Save & Drop Pin'
                : 'Save Pin to Device'}
          </button>
        </form>
      </div>
    </div>
  );
};
