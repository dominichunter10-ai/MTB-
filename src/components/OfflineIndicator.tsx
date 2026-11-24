import React from 'react';
import { WifiOff } from 'lucide-react';

interface OfflineIndicatorProps {
  isOnline: boolean;
  hasOfflinePack: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  isOnline,
  hasOfflinePack,
}) => {
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-4 left-4 z-40 flex items-center gap-2 rounded-xl bg-[#141A17] text-white px-3.5 py-2 text-xs font-medium shadow-lg border border-white/10">
      <WifiOff className="w-3.5 h-3.5 text-[#D94E1F] shrink-0" />
      <span>
        Offline Mode — {hasOfflinePack ? 'Using Hamsterley Topo Pack' : 'Using cached trail data'}
      </span>
    </div>
  );
};
