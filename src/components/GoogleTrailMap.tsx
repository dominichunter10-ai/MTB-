import React, { useEffect, useState } from 'react';
import {
  AdvancedMarker,
  APILoadingStatus,
  APIProvider,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Compass, Eye, Maximize2, Navigation, Trash2 } from 'lucide-react';
import {
  FOREST_DRIVE_ROAD,
  FOREST_LANDMARKS,
  FOREST_ROAD_NETWORK,
  GRADE_META,
  HAMSTERLEY_CENTER,
  HAZARD_TYPE_META,
  PIN_KIND_META,
} from '../data/hamsterleyTrails';
import { GpsPosition, HazardReport, NavPin, NavTarget, Trail } from '../types/trail';
import { OfflineTopoMap } from './OfflineTopoMap';

interface GoogleTrailMapProps {
  apiKey: string;
  isOnline: boolean;
  quotaExceeded: boolean;
  mapStyleMode: 'terrain' | 'satellite' | 'offline-topo';
  trails: Trail[];
  selectedTrailId: string;
  onSelectTrail: (trailId: string) => void;
  isTrailFocused: boolean;
  onToggleTrailFocus: () => void;
  fitTrailTrigger?: number;
  hazards: HazardReport[];
  selectedHazardId: string | null;
  onSelectHazard: (hazardId: string | null) => void;
  navPins: NavPin[];
  selectedPinId: string | null;
  onSelectPin: (pinId: string | null) => void;
  activeNavTarget: NavTarget | null;
  onNavigateToPin: (pin: NavPin) => void;
  onDeletePin?: (pin: NavPin) => void;
  currentUserId?: string | null;
  gpsPosition: GpsPosition | null;
  breadCrumbs: { lat: number; lng: number }[];
  onPickCoordinate?: (lat: number, lng: number) => void;
  pickingMode?: null | 'hazard' | 'nav-pin';
  onCancelPickMode?: () => void;
}

const TrailViewportController: React.FC<{
  trail: Trail | undefined;
  fitTrigger: number;
}> = ({ trail, fitTrigger }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !trail || fitTrigger <= 0 || trail.coordinates.length === 0) return;

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const c of trail.coordinates) {
      if (c.lat < minLat) minLat = c.lat;
      if (c.lat > maxLat) maxLat = c.lat;
      if (c.lng < minLng) minLng = c.lng;
      if (c.lng > maxLng) maxLng = c.lng;
    }

    const padLat = Math.max(0.0028, (maxLat - minLat) * 0.25);
    const padLng = Math.max(0.0042, (maxLng - minLng) * 0.25);

    map.fitBounds(
      {
        north: maxLat + padLat,
        south: minLat - padLat,
        east: maxLng + padLng,
        west: minLng - padLng,
      },
      52
    );
  }, [map, trail, fitTrigger]);

  return null;
};

const TrailPolylineLayer: React.FC<{
  trail: Trail;
  isSelected: boolean;
  isTrailFocused: boolean;
  onSelect: () => void;
}> = ({ trail, isSelected, isTrailFocused, onSelect }) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib) return;
    const color = GRADE_META[trail.grade].color;
    const isOffPiste = trail.category === 'off-piste';
    const isReceded = isTrailFocused && !isSelected;
    const path = trail.coordinates.map((c) => ({ lat: c.lat, lng: c.lng }));

    let casingLine: InstanceType<typeof mapsLib.Polyline> | null = null;
    if (isSelected) {
      casingLine = new mapsLib.Polyline({
        path,
        geodesic: true,
        strokeColor: '#FFFFFF',
        strokeOpacity: 0.96,
        strokeWeight: 9,
        zIndex: 33,
        clickable: false,
        map,
      });
    }

    const polyline = new mapsLib.Polyline({
      path,
      geodesic: true,
      strokeColor: color,
      strokeOpacity: isOffPiste
        ? 0
        : isSelected
          ? 1
          : isReceded
            ? 0.16
            : 0.62,
      strokeWeight: isSelected ? 5 : isReceded ? 1.8 : 2.8,
      zIndex: isSelected ? 35 : isReceded ? 6 : 12,
      icons: isOffPiste
        ? [
            {
              icon: {
                path: 'M 0,-1 0,1',
                strokeColor: color,
                strokeOpacity: isSelected ? 1 : isReceded ? 0.2 : 0.68,
                scale: isSelected ? 4.2 : isReceded ? 1.8 : 2.6,
              },
              offset: '0',
              repeat: isSelected ? '13px' : '12px',
            },
          ]
        : undefined,
      map,
    });

    const listener = polyline.addListener('click', onSelect);
    return () => {
      listener.remove();
      polyline.setMap(null);
      if (casingLine) casingLine.setMap(null);
    };
  }, [map, mapsLib, trail, isSelected, isTrailFocused, onSelect]);

  return null;
};

const BreadcrumbPolylineLayer: React.FC<{
  points: { lat: number; lng: number }[];
}> = ({ points }) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib || points.length < 2) return;
    const poly = new mapsLib.Polyline({
      path: points,
      strokeColor: '#D94E1F',
      strokeOpacity: 0.95,
      strokeWeight: 4,
      zIndex: 45,
      map,
    });
    return () => {
      poly.setMap(null);
    };
  }, [map, mapsLib, points]);

  return null;
};

const ForestRoadNetworkLayer: React.FC<{ isTrailFocused: boolean }> = ({
  isTrailFocused,
}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib) return;
    const polylines = [
      ...FOREST_ROAD_NETWORK.map(
        (road) =>
          new mapsLib.Polyline({
            path: road.map((pt) => ({ lat: pt.lat, lng: pt.lng })),
            geodesic: true,
            strokeColor: '#7E5A8A',
            strokeOpacity: isTrailFocused ? 0.22 : 0.45,
            strokeWeight: isTrailFocused ? 1.5 : 2,
            zIndex: 4,
            clickable: false,
            map,
          })
      ),
      new mapsLib.Polyline({
        path: FOREST_DRIVE_ROAD.map((pt) => ({ lat: pt.lat, lng: pt.lng })),
        geodesic: true,
        strokeColor: '#5B3F66',
        strokeOpacity: isTrailFocused ? 0.36 : 0.65,
        strokeWeight: isTrailFocused ? 2.2 : 3,
        zIndex: 5,
        clickable: false,
        map,
      }),
    ];
    return () => {
      polylines.forEach((p) => p.setMap(null));
    };
  }, [map, mapsLib, isTrailFocused]);

  return null;
};

const TargetNavPolylineLayer: React.FC<{
  from: GpsPosition | null;
  target: NavTarget | null;
}> = ({ from, target }) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib || !from || !target) return;
    const poly = new mapsLib.Polyline({
      path: [
        { lat: from.lat, lng: from.lng },
        { lat: target.lat, lng: target.lng },
      ],
      geodesic: true,
      strokeColor: '#0F766E',
      strokeOpacity: 0,
      strokeWeight: 4,
      zIndex: 48,
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 0.95,
            scale: 3.5,
          },
          offset: '0',
          repeat: '14px',
        },
      ],
      map,
    });
    return () => {
      poly.setMap(null);
    };
  }, [map, mapsLib, from, target]);

  return null;
};

const HazardMarkerWithInfo: React.FC<{
  hazard: HazardReport;
  isSelected: boolean;
  isDeemphasized: boolean;
  onSelect: () => void;
  onClose: () => void;
}> = ({ hazard, isSelected, isDeemphasized, onSelect, onClose }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const isClear = hazard.hazardType === 'clear_trail';
  const bg = isClear ? '#15803D' : hazard.severity >= 3 ? '#DC2626' : '#D97706';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: hazard.lat, lng: hazard.lng }}
        onClick={onSelect}
        title={hazard.title}
        zIndex={isSelected ? 50 : isDeemphasized ? 15 : 28}
      >
        {isDeemphasized ? (
          <div
            className="w-3 h-3 rounded-full border border-white/80 opacity-45 hover:opacity-100 transition-opacity shadow-xs"
            style={{ backgroundColor: bg }}
          />
        ) : (
          <Pin
            background={bg}
            borderColor="#FFFFFF"
            glyphColor="#FFFFFF"
            glyphText={isClear ? '✓' : '!'}
            scale={0.9}
          />
        )}
      </AdvancedMarker>
      {isSelected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={240}>
          <div className="p-1 text-[#141A17]">
            <div className="text-[11px] font-bold text-[#D94E1F]">
              {HAZARD_TYPE_META[hazard.hazardType].label}
            </div>
            <div className="text-xs font-bold mt-0.5">{hazard.title}</div>
            <p className="text-[11px] text-[#525E57] mt-1">{hazard.description}</p>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

const NavPinMarkerWithInfo: React.FC<{
  pin: NavPin;
  isSelected: boolean;
  isTarget: boolean;
  isDeemphasized: boolean;
  linkedTrailName: string | null;
  canDelete: boolean;
  onSelect: () => void;
  onClose: () => void;
  onNavigate: () => void;
  onSelectTrail?: () => void;
  onDelete?: () => void;
}> = ({
  pin,
  isSelected,
  isTarget,
  isDeemphasized,
  linkedTrailName,
  canDelete,
  onSelect,
  onClose,
  onNavigate,
  onSelectTrail,
  onDelete,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const meta = PIN_KIND_META[pin.pinKind];

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: pin.lat, lng: pin.lng }}
        onClick={onSelect}
        title={pin.name}
        zIndex={isTarget ? 58 : isSelected ? 52 : isDeemphasized ? 14 : 36}
      >
        {isDeemphasized ? (
          <div
            className="w-2.5 h-2.5 rounded-full border border-white/80 opacity-40 hover:opacity-100 transition-opacity shadow-xs cursor-pointer"
            style={{ backgroundColor: meta.color }}
          />
        ) : (
          <Pin
            background={isTarget ? '#0F766E' : meta.color}
            borderColor={isSelected || isTarget ? '#141A17' : '#FFFFFF'}
            glyphColor="#FFFFFF"
            glyphText={meta.glyph}
            scale={isTarget ? 1.1 : 0.92}
          />
        )}
      </AdvancedMarker>
      {isSelected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={260}>
          <div className="p-1 text-[#141A17] space-y-2">
            <div>
              <div className="text-[11px] font-bold" style={{ color: meta.color }}>
                {meta.label}
              </div>
              <div className="text-xs font-bold mt-0.5">{pin.name}</div>
              {linkedTrailName && (
                <div className="text-[11px] text-[#525E57] mt-0.5">{linkedTrailName}</div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={onNavigate}
                className="px-2.5 py-1.5 rounded-md bg-[#0F766E] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Navigation className="w-3 h-3" />
                Navigate
              </button>
              {onSelectTrail && (
                <button
                  type="button"
                  onClick={onSelectTrail}
                  className="px-2.5 py-1.5 rounded-md border border-[#DDE2DC] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Compass className="w-3 h-3 text-[#D94E1F]" />
                  Trail
                </button>
              )}
              {canDelete && onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="px-2 py-1.5 rounded-md border border-[#FECACA] text-[#DC2626] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              )}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

const InnerGoogleMap: React.FC<
  Omit<GoogleTrailMapProps, 'apiKey' | 'isOnline' | 'quotaExceeded'> & {
    onFallbackToOffline: () => void;
  }
> = ({
  mapStyleMode,
  trails,
  selectedTrailId,
  onSelectTrail,
  isTrailFocused,
  onToggleTrailFocus,
  fitTrailTrigger = 0,
  hazards,
  selectedHazardId,
  onSelectHazard,
  navPins,
  selectedPinId,
  onSelectPin,
  activeNavTarget,
  onNavigateToPin,
  onDeletePin,
  currentUserId,
  gpsPosition,
  breadCrumbs,
  onPickCoordinate,
  pickingMode,
  onCancelPickMode,
  onFallbackToOffline,
}) => {
  const status = useApiLoadingStatus();
  const [localFitTrigger, setLocalFitTrigger] = useState(0);

  useEffect(() => {
    if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
      onFallbackToOffline();
    }
  }, [status, onFallbackToOffline]);

  const selectedTrail = trails.find((t) => t.id === selectedTrailId) || trails[0];
  const combinedFitTrigger = fitTrailTrigger + localFitTrigger;
  const startCoord = selectedTrail?.coordinates[0];
  const endCoord =
    selectedTrail && selectedTrail.coordinates.length > 1
      ? selectedTrail.coordinates[selectedTrail.coordinates.length - 1]
      : null;

  return (
    <div className="relative w-full h-full min-h-[380px] rounded-xl overflow-hidden border border-[#D4DAD1]">
      <GoogleMap
        defaultCenter={HAMSTERLEY_CENTER}
        defaultZoom={12}
        mapId="DEMO_MAP_ID"
        mapTypeId={mapStyleMode === 'satellite' ? 'hybrid' : 'terrain'}
        gestureHandling="greedy"
        disableDefaultUI={false}
        streetViewControl={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
        onClick={(ev) => {
          if (pickingMode && onPickCoordinate && ev.detail.latLng) {
            onPickCoordinate(
              Math.round(ev.detail.latLng.lat * 10000) / 10000,
              Math.round(ev.detail.latLng.lng * 10000) / 10000
            );
          }
        }}
      >
        <TrailViewportController trail={selectedTrail} fitTrigger={combinedFitTrigger} />
        <ForestRoadNetworkLayer isTrailFocused={isTrailFocused} />

        {trails.map((trail) => (
          <TrailPolylineLayer
            key={trail.id}
            trail={trail}
            isSelected={trail.id === selectedTrailId}
            isTrailFocused={isTrailFocused}
            onSelect={() => onSelectTrail(trail.id)}
          />
        ))}

        {/* Focused Trail Start & End Markers */}
        {isTrailFocused && startCoord && (
          <AdvancedMarker
            position={{ lat: startCoord.lat, lng: startCoord.lng }}
            title={`${selectedTrail.name} Start`}
            zIndex={42}
          >
            <div className="px-1.5 py-0.5 rounded bg-[#141A17] text-white text-[10px] font-bold tracking-wide border border-white shadow-sm">
              START
            </div>
          </AdvancedMarker>
        )}
        {isTrailFocused && endCoord && (
          <AdvancedMarker
            position={{ lat: endCoord.lat, lng: endCoord.lng }}
            title={`${selectedTrail.name} Finish`}
            zIndex={41}
          >
            <div className="w-3.5 h-3.5 rounded-full bg-white border-[3px] border-[#141A17] shadow-sm" />
          </AdvancedMarker>
        )}

        <BreadcrumbPolylineLayer points={breadCrumbs} />
        <TargetNavPolylineLayer from={gpsPosition} target={activeNavTarget} />

        {!isTrailFocused &&
          FOREST_LANDMARKS.filter((lm) => lm.kind === 'trailhead' || lm.kind === 'parking').map(
            (lm) => (
              <AdvancedMarker
                key={lm.id}
                position={{ lat: lm.lat, lng: lm.lng }}
                title={`${lm.name} (${lm.ele}m)`}
                zIndex={15}
              >
                <Pin
                  background="#141A17"
                  borderColor="#FFFFFF"
                  glyphColor="#F6F6F3"
                  scale={0.65}
                />
              </AdvancedMarker>
            )
          )}

        {navPins.map((pin) => {
          const linked = trails.find((t) => t.id === pin.trailId) || null;
          const canDelete =
            !pin.isBuiltIn &&
            (pin.authorId === currentUserId || pin.authorId === 'local-offline');
          const isTarget = activeNavTarget?.id === pin.id;
          const isPinSelected = selectedPinId === pin.id;
          const keepProminent =
            !isTrailFocused ||
            pin.trailId === selectedTrailId ||
            pin.pinKind === 'car_park' ||
            !pin.isBuiltIn ||
            isTarget ||
            isPinSelected;

          return (
            <NavPinMarkerWithInfo
              key={pin.id}
              pin={pin}
              isSelected={isPinSelected}
              isTarget={isTarget}
              isDeemphasized={!keepProminent}
              linkedTrailName={linked?.name || null}
              canDelete={canDelete}
              onSelect={() => {
                onSelectHazard(null);
                onSelectPin(pin.id);
              }}
              onClose={() => onSelectPin(null)}
              onNavigate={() => onNavigateToPin(pin)}
              onSelectTrail={linked ? () => onSelectTrail(linked.id) : undefined}
              onDelete={onDeletePin ? () => onDeletePin(pin) : undefined}
            />
          );
        })}

        {hazards
          .filter((h) => h.status === 'active')
          .map((h) => {
            const isSel = selectedHazardId === h.id;
            const isDeemphasized =
              isTrailFocused && h.trailId !== selectedTrailId && !isSel;
            return (
              <HazardMarkerWithInfo
                key={h.id}
                hazard={h}
                isSelected={isSel}
                isDeemphasized={isDeemphasized}
                onSelect={() => {
                  onSelectPin(null);
                  onSelectHazard(h.id);
                }}
                onClose={() => onSelectHazard(null)}
              />
            );
          })}

        {gpsPosition && (
          <AdvancedMarker
            position={{ lat: gpsPosition.lat, lng: gpsPosition.lng }}
            title="Live Rider GPS Position"
            zIndex={60}
          >
            <div className="w-5 h-5 rounded-full bg-[#D94E1F] border-[3px] border-white shadow-md" />
          </AdvancedMarker>
        )}
      </GoogleMap>

      {/* Top-left Trail Focus HUD */}
      {selectedTrail && !pickingMode && (
        <div className="absolute top-3 left-3 right-14 sm:right-auto max-w-[340px] bg-white/95 backdrop-blur-sm border border-[#DDE2DC] rounded-xl px-3 py-2 text-xs text-[#141A17] shadow-sm z-10 flex flex-wrap items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-xs shrink-0"
            style={{ backgroundColor: GRADE_META[selectedTrail.grade].color }}
          />
          <div className="min-w-0 flex-1">
            <div className="font-bold truncate">{selectedTrail.name}</div>
            <div className="text-[11px] text-[#525E57]">
              {isTrailFocused
                ? 'Focused · Other trails faded'
                : 'Overview · Tap any trail to focus'}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setLocalFitTrigger((c) => c + 1)}
              title="Zoom to fit trail"
              className="px-2 py-1.5 rounded-lg bg-[#F1F2ED] hover:bg-[#E5E8E3] text-[#141A17] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
              Fit
            </button>
            <button
              type="button"
              onClick={onToggleTrailFocus}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                isTrailFocused
                  ? 'bg-[#141A17] text-white hover:bg-[#27312C]'
                  : 'bg-[#0F766E] text-white hover:bg-[#0D5D57]'
              }`}
            >
              <Eye className="w-3 h-3" />
              {isTrailFocused ? 'Show All' : 'Focus'}
            </button>
          </div>
        </div>
      )}

      {pickingMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#141A17] text-white text-xs font-semibold pl-3.5 pr-2 py-2 rounded-lg shadow-md flex items-center gap-2.5 z-10">
          <span>
            {pickingMode === 'nav-pin'
              ? 'Tap on the map to drop your navigation pin'
              : 'Tap on the map to place your hazard pin'}
          </span>
          {onCancelPickMode && (
            <button
              type="button"
              onClick={onCancelPickMode}
              className="px-2 py-1 rounded bg-white/15 hover:bg-white/25 text-[11px] cursor-pointer"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const GoogleTrailMap: React.FC<GoogleTrailMapProps> = (props) => {
  const [mapsUnavailable, setMapsUnavailable] = useState(false);

  const shouldUseOfflineTopo =
    props.mapStyleMode === 'offline-topo' ||
    !props.isOnline ||
    props.quotaExceeded ||
    !props.apiKey ||
    mapsUnavailable;

  if (shouldUseOfflineTopo) {
    return (
      <OfflineTopoMap
        trails={props.trails}
        selectedTrailId={props.selectedTrailId}
        onSelectTrail={props.onSelectTrail}
        isTrailFocused={props.isTrailFocused}
        onToggleTrailFocus={props.onToggleTrailFocus}
        fitTrailTrigger={props.fitTrailTrigger}
        hazards={props.hazards}
        selectedHazardId={props.selectedHazardId}
        onSelectHazard={props.onSelectHazard}
        navPins={props.navPins}
        selectedPinId={props.selectedPinId}
        onSelectPin={props.onSelectPin}
        activeNavTarget={props.activeNavTarget}
        onNavigateToPin={props.onNavigateToPin}
        onDeletePin={props.onDeletePin}
        currentUserId={props.currentUserId}
        gpsPosition={props.gpsPosition}
        breadCrumbs={props.breadCrumbs}
        onPickCoordinate={props.onPickCoordinate}
        pickingMode={props.pickingMode}
        onCancelPickMode={props.onCancelPickMode}
      />
    );
  }

  return (
    <APIProvider apiKey={props.apiKey} libraries={['marker', 'geometry']} language="en" region="GB">
      <InnerGoogleMap
        mapStyleMode={props.mapStyleMode}
        trails={props.trails}
        selectedTrailId={props.selectedTrailId}
        onSelectTrail={props.onSelectTrail}
        isTrailFocused={props.isTrailFocused}
        onToggleTrailFocus={props.onToggleTrailFocus}
        fitTrailTrigger={props.fitTrailTrigger}
        hazards={props.hazards}
        selectedHazardId={props.selectedHazardId}
        onSelectHazard={props.onSelectHazard}
        navPins={props.navPins}
        selectedPinId={props.selectedPinId}
        onSelectPin={props.onSelectPin}
        activeNavTarget={props.activeNavTarget}
        onNavigateToPin={props.onNavigateToPin}
        onDeletePin={props.onDeletePin}
        currentUserId={props.currentUserId}
        gpsPosition={props.gpsPosition}
        breadCrumbs={props.breadCrumbs}
        onPickCoordinate={props.onPickCoordinate}
        pickingMode={props.pickingMode}
        onCancelPickMode={props.onCancelPickMode}
        onFallbackToOffline={() => setMapsUnavailable(true)}
      />
    </APIProvider>
  );
};
