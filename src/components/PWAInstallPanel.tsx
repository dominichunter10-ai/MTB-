import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  LogIn,
  Package,
  RefreshCw,
  Share,
  ShieldCheck,
  Smartphone,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { OfflineForestPack, PendingSyncItem } from '../lib/offlineStorage';

interface PWAInstallPanelProps {
  trailCount: number;
  offlinePack: OfflineForestPack | null;
  pendingSync: PendingSyncItem[];
  isOnline: boolean;
  forcedOffline: boolean;
  isSignedIn: boolean;
  userEmail: string | null;
  userName: string | null;
  ridesCount: number;
  onToggleForcedOffline: (val: boolean) => void;
  onDownloadPack: () => Promise<void>;
  onDeletePack: () => Promise<void>;
  onFlushSync: () => Promise<void>;
  onSignIn: () => Promise<void>;
  onDeleteAccountAndData: () => Promise<void>;
  onClearLocalData: () => Promise<void>;
}

export const PWAInstallPanel: React.FC<PWAInstallPanelProps> = ({
  trailCount,
  offlinePack,
  pendingSync,
  isOnline,
  forcedOffline,
  isSignedIn,
  userEmail,
  userName,
  ridesCount,
  onToggleForcedOffline,
  onDownloadPack,
  onDeletePack,
  onFlushSync,
  onSignIn,
  onDeleteAccountAndData,
  onClearLocalData,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [downloading, setDownloading] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [confirmClearLocal, setConfirmClearLocal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [clearingLocal, setClearingLocal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopyUrl = async () => {
    if (!currentOrigin || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(currentOrigin);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      // Clipboard blocked in restricted iframe
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await onDownloadPack();
    } finally {
      setDownloading(false);
    }
  };

  const handleConfirmAccountDelete = async () => {
    setDeleteError(null);
    setDeletingAccount(true);
    try {
      await onDeleteAccountAndData();
      setConfirmDeleteAccount(false);
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : 'Could not complete deletion. Please ensure popups are allowed if re-authentication is prompted.'
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleConfirmLocalClear = async () => {
    setDeleteError(null);
    setClearingLocal(true);
    try {
      await onClearLocalData();
      setConfirmClearLocal(false);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Unable to clear local storage.'
      );
    } finally {
      setClearingLocal(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Free Mobile App Install Section (Android & iOS) */}
      <div className="bg-white border border-[#DDE2DC] rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="space-y-1.5 max-w-2xl">
            <div className="text-xs font-semibold text-[#D94E1F]">
              Free App Download · Android & iPhone / iPad
            </div>
            <h2 className="text-2xl font-bold text-[#141A17] font-display text-balance">
              Install HamsterleyMTB on Your Handlebars
            </h2>
            <p className="text-sm text-[#525E57] leading-relaxed">
              Install free directly to your Android or Apple home screen—zero app store fees, full-screen GPS tracking, and instant offline topo access when signal drops in Bedburn Valley.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {isInstalled ? (
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#DCFCE7] text-[#166534] text-sm font-semibold">
                <Check className="w-4 h-4" />
                Installed on Device
              </div>
            ) : isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#D94E1F] text-white text-sm font-semibold hover:bg-[#B83E14] transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Install Free App
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowIOSGuide((s) => !s)}
                className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#141A17] text-white text-sm font-semibold hover:bg-[#232D28] transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
                {isIOS ? 'Install on iPhone / iPad' : 'Mobile Install Guide'}
              </button>
            )}
          </div>
        </div>

        {(showIOSGuide || isIOS) && !isInstalled && (
          <div className="mt-5 pt-5 border-t border-[#E5E8E3] grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="bg-[#FAFBF9] border border-[#E5E8E3] rounded-xl p-4">
              <div className="font-bold text-[#141A17] flex items-center gap-2">
                <Share className="w-4 h-4 text-[#D94E1F]" />
                iPhone & iPad (Safari)
              </div>
              <ol className="mt-2 space-y-1 text-xs text-[#525E57] list-decimal list-inside">
                <li>Open this app in Safari on your iPhone or iPad.</li>
                <li>Tap the Share icon at the bottom of the screen.</li>
                <li>Scroll down and tap Add to Home Screen for full offline mode.</li>
              </ol>
            </div>
            <div className="bg-[#FAFBF9] border border-[#E5E8E3] rounded-xl p-4">
              <div className="font-bold text-[#141A17] flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#15803D]" />
                Android (Chrome / Edge)
              </div>
              <ol className="mt-2 space-y-1 text-xs text-[#525E57] list-decimal list-inside">
                <li>Tap Install Free App above when prompted by Chrome.</li>
                <li>Or open the browser menu (⋮) and choose Install app.</li>
                <li>Works offline with cached GPS topo contours in the forest.</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* Offline Forest Pack & Field Simulation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#DDE2DC] rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-[#141A17] font-display">
                Hamsterley Offline Forest Pack
              </h3>
              <span className="text-xs font-mono tabular-nums text-[#525E57]">
                {offlinePack ? `${Math.round(offlinePack.sizeBytes / 1024)} KB Cached` : 'Not Downloaded'}
              </span>
            </div>
            <p className="text-sm text-[#525E57] mt-2 leading-relaxed">
              Stores all {trailCount} official & off-piste trails, 10m topographic contour vectors, Bedburn Beck, car parks, and latest hazard snapshots inside local device storage for zero-signal forest navigation.
            </p>

            {offlinePack && (
              <div className="mt-4 pt-4 border-t border-[#E5E8E3] grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-[#525E57]">Trails Cached</div>
                  <div className="font-bold font-mono tabular-nums text-base text-[#141A17]">
                    {offlinePack.trailCount}
                  </div>
                </div>
                <div>
                  <div className="text-[#525E57]">GPS Nodes</div>
                  <div className="font-bold font-mono tabular-nums text-base text-[#141A17]">
                    {offlinePack.waypointCount}
                  </div>
                </div>
                <div>
                  <div className="text-[#525E57]">Pack Version</div>
                  <div className="font-bold font-mono tabular-nums text-base text-[#141A17]">
                    {offlinePack.version}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#141A17] text-white text-xs font-semibold hover:bg-[#232D28] flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              {downloading
                ? 'Caching Trail Pack…'
                : offlinePack
                  ? 'Update Offline Pack'
                  : 'Download Offline Forest Pack'}
            </button>
            {offlinePack && (
              <button
                type="button"
                onClick={onDeletePack}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#DDE2DC] text-xs font-semibold text-[#525E57] hover:text-[#DC2626] hover:border-[#FECACA] flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Clear Cache
              </button>
            )}
          </div>
        </div>

        {/* Connectivity & Offline Sync Queue */}
        <div className="bg-white border border-[#DDE2DC] rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-[#141A17] font-display">
                Offline Navigation & Sync Queue
              </h3>
              <span
                className={`text-xs font-semibold ${
                  isOnline ? 'text-[#15803D]' : 'text-[#D97706]'
                }`}
              >
                {isOnline ? 'Online' : 'Offline Active'}
              </span>
            </div>
            <p className="text-sm text-[#525E57] mt-2 leading-relaxed">
              Test offline navigation before heading into the trees, or inspect hazard reports queued locally while riding out of mobile coverage.
            </p>

            <div className="mt-4 pt-4 border-t border-[#E5E8E3] flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[#141A17] flex items-center gap-2">
                  <WifiOff className="w-4 h-4 text-[#525E57]" />
                  Force Offline Topo Mode
                </div>
                <div className="text-xs text-[#525E57]">
                  Simulates zero-signal forest conditions using local vector maps
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleForcedOffline(!forcedOffline)}
                className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  forcedOffline
                    ? 'bg-[#D94E1F] text-white'
                    : 'bg-[#F1F2ED] text-[#141A17] hover:bg-[#E5E8E3]'
                }`}
              >
                {forcedOffline ? 'Offline Sim On' : 'Enable Sim'}
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#E5E8E3] flex items-center justify-between gap-3">
            <div className="text-xs text-[#525E57] font-mono tabular-nums">
              {pendingSync.length === 0
                ? 'All local reports synced'
                : `${pendingSync.length} report(s) waiting for signal`}
            </div>
            {pendingSync.length > 0 && isOnline && (
              <button
                type="button"
                onClick={onFlushSync}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#141A17] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Sync Now
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Account, Privacy & Free Android APK Export */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Privacy, Account & In-App Deletion (App Store / Play Store Requirement) */}
        <div className="bg-white border border-[#DDE2DC] rounded-2xl p-6 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-[#141A17] font-display flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#15803D]" />
                Privacy, Location & Account Data
              </h3>
              <span className="text-[11px] font-semibold text-[#525E57]">
                Store Compliance
              </span>
            </div>

            <p className="text-xs text-[#525E57] leading-relaxed">
              Your GPS location is processed on-device solely for live trail proximity, compass bearings, and ride stats. No advertising SDKs or third-party trackers are used. Community hazards, difficulty votes, custom nav pins, and ride logs are only synced to your account when you sign in.
            </p>

            <div className="bg-[#FAFBF9] border border-[#E5E8E3] rounded-xl p-3.5 text-xs space-y-1">
              {isSignedIn ? (
                <>
                  <div className="font-semibold text-[#141A17]">
                    Signed in as {userName || 'Hamsterley Rider'}
                  </div>
                  {userEmail && (
                    <div className="text-[#525E57] font-mono">{userEmail}</div>
                  )}
                  <div className="text-[#525E57] font-mono tabular-nums pt-1">
                    {ridesCount} saved ride(s) · {pendingSync.length} local queued item(s)
                  </div>
                </>
              ) : (
                <>
                  <div className="font-semibold text-[#141A17]">
                    Local Device Mode (Signed Out)
                  </div>
                  <div className="text-[#525E57] font-mono tabular-nums">
                    {ridesCount} local ride(s) · {pendingSync.length} queued item(s)
                  </div>
                </>
              )}
            </div>

            {deleteError && (
              <div className="text-xs text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-3.5 py-2.5">
                {deleteError}
              </div>
            )}
          </div>

          <div className="space-y-3 pt-2 border-t border-[#E5E8E3]">
            {isSignedIn ? (
              !confirmDeleteAccount ? (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setConfirmDeleteAccount(true);
                  }}
                  className="min-h-[44px] w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEE2E2] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Account & All Data
                </button>
              ) : (
                <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-4 space-y-3">
                  <div className="text-xs font-semibold text-[#991B1B] leading-relaxed">
                    This permanently deletes your Firebase sign-in account, cloud ride logs, custom nav pins, hazard reports, difficulty votes, and local device cache. This cannot be undone.
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={deletingAccount}
                      onClick={handleConfirmAccountDelete}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#DC2626] text-white text-xs font-semibold hover:bg-[#B91C1C] disabled:opacity-60 cursor-pointer"
                    >
                      {deletingAccount ? 'Deleting Account & Data…' : 'Confirm Permanent Deletion'}
                    </button>
                    <button
                      type="button"
                      disabled={deletingAccount}
                      onClick={() => setConfirmDeleteAccount(false)}
                      className="min-h-[44px] px-4 py-2 rounded-xl border border-[#DDE2DC] bg-white text-xs font-semibold text-[#141A17] hover:bg-[#FAFBF9] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )
            ) : !confirmClearLocal ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={onSignIn}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#141A17] text-white text-xs font-semibold hover:bg-[#232D28] flex items-center gap-2 cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  Sign in with Google
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setConfirmClearLocal(true);
                  }}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#DDE2DC] text-xs font-semibold text-[#525E57] hover:text-[#DC2626] hover:border-[#FECACA] flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear Local Device Data
                </button>
              </div>
            ) : (
              <div className="bg-[#FAFBF9] border border-[#DDE2DC] rounded-xl p-4 space-y-3">
                <div className="text-xs font-semibold text-[#141A17]">
                  Clear all cached rides, offline forest packs, cached conditions, and unsynced items from this browser/device?
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={clearingLocal}
                    onClick={handleConfirmLocalClear}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#DC2626] text-white text-xs font-semibold hover:bg-[#B91C1C] disabled:opacity-60 cursor-pointer"
                  >
                    {clearingLocal ? 'Clearing…' : 'Confirm Clear Local Data'}
                  </button>
                  <button
                    type="button"
                    disabled={clearingLocal}
                    onClick={() => setConfirmClearLocal(false)}
                    className="min-h-[44px] px-4 py-2 rounded-xl border border-[#DDE2DC] bg-white text-xs font-semibold text-[#141A17] hover:bg-[#FAFBF9] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Free Android APK Export (Zero Play Store Fee) */}
        <div className="bg-white border border-[#DDE2DC] rounded-2xl p-6 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-[#141A17] font-display flex items-center gap-2">
                <Package className="w-5 h-5 text-[#D94E1F]" />
                Free Android APK Export ($0 Fee)
              </h3>
              <span className="text-xs font-mono text-[#15803D] font-semibold">
                Sideload Ready
              </span>
            </div>

            <p className="text-xs text-[#525E57] leading-relaxed">
              Install directly onto any Android phone as a standalone <code className="font-mono text-[#141A17]">.apk</code> without paying Google Play’s registration fee. Choose whichever method fits best:
            </p>

            <div className="bg-[#FAFBF9] border border-[#E5E8E3] rounded-xl p-4 space-y-2.5 text-xs text-[#39423D]">
              <div className="font-bold text-[#141A17]">
                Option A — Instant Browser APK via PWABuilder (No PC Tools)
              </div>
              <p className="text-[#525E57] leading-relaxed">
                Copy your published Shared App URL and paste it into PWABuilder → Package for Android → download the signed <code className="font-mono text-[#141A17]">.apk</code> in ~60 seconds.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#141A17] text-white font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-[#232D28]"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-[#22C55E]" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedUrl ? 'App URL Copied' : 'Copy App URL'}
                </button>
                <a
                  href="https://www.pwabuilder.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#DDE2DC] bg-white text-[#141A17] font-semibold inline-flex items-center gap-1.5 hover:bg-[#F1F2ED]"
                >
                  Open PWABuilder
                  <ExternalLink className="w-3.5 h-3.5 text-[#525E57]" />
                </a>
              </div>
            </div>

            <div className="bg-[#FAFBF9] border border-[#E5E8E3] rounded-xl p-4 space-y-1.5 text-xs text-[#39423D]">
              <div className="font-bold text-[#141A17]">
                Option B — Automated Offline Capacitor APK (Included Scripts)
              </div>
              <ol className="space-y-1 text-[#525E57] list-decimal list-inside">
                <li>
                  <strong className="text-[#141A17]">Free Cloud Build:</strong> Push to GitHub — <code className="font-mono text-[#141A17]">.github/workflows/build-apk.yml</code> automatically builds <code className="font-mono text-[#141A17]">HamsterleyMTB.apk</code> for download in Actions Artifacts.
                </li>
                <li>
                  <strong className="text-[#141A17]">Local PC Build:</strong> Export and run <code className="font-mono text-[#141A17]">bash scripts/build-apk.sh</code> (Java 17 + Android SDK) to output <code className="font-mono text-[#141A17]">dist-apk/HamsterleyMTB.apk</code>.
                </li>
              </ol>
            </div>
          </div>

          <div className="pt-3 border-t border-[#E5E8E3] flex flex-wrap items-center justify-between gap-2 text-xs text-[#525E57] font-mono">
            <span>Package: com.hamsterleymtb.app</span>
            <span>Output: HamsterleyMTB.apk</span>
          </div>
        </div>
      </div>
    </div>
  );
};
