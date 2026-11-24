import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [forcedOffline, setForcedOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    isOnline: browserOnline && !forcedOffline,
    browserOnline,
    forcedOffline,
    setForcedOffline,
  };
}
