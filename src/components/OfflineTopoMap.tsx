import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Compass,
  Eye,
  LocateFixed,
  Maximize2,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  AYHOPE_BECK_STREAM,
  BEDBURN_BECK_STREAM,
  FOREST_DRIVE_ROAD,
  FOREST_LANDMARKS,
  FOREST_ROAD_NETWORK,
  GRADE_META,
  HAMSTERLEY_BOUNDS,
  HAMSTERLEY_CENTER,
  HAMSTERLEY_WOODLAND_POLYGONS,
  HAZARD_TYPE_META,
  PIN_KIND_META,
  SPURLSWOOD_BECK_STREAM,
} from '../data/hamsterleyTrails';
import { GpsPosition, HazardReport, NavPin, NavTarget, Trail } from '../types/trail';

interface OfflineTopoMapProps {
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

function distToSegmentSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return (px - x1) ** 2 + (py - y1) ** 2;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return (px - projX) ** 2 + (py - projY) ** 2;
}

export const OfflineTopoMap: React.FC<OfflineTopoMapProps> = ({
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
  pickingMode = null,
  onCancelPickMode,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [center, setCenter] = useState(HAMSTERLEY_CENTER);
  const [zoom, setZoom] = useState(1.0);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const dragRef = useRef<{
    dragging: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    startCenter: { lat: number; lng: number };
  }>({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    startCenter: HAMSTERLEY_CENTER,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(300, Math.floor(entry.contentRect.width));
        const h = Math.max(320, Math.floor(entry.contentRect.height));
        setSize({ width: w, height: h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lngSpanBase = HAMSTERLEY_BOUNDS.maxLng - HAMSTERLEY_BOUNDS.minLng;
  const latSpanBase = HAMSTERLEY_BOUNDS.maxLat - HAMSTERLEY_BOUNDS.minLat;
  const aspectCos = Math.cos((HAMSTERLEY_CENTER.lat * Math.PI) / 180);

  const fitSelectedTrail = useCallback(() => {
    const trail = trails.find((t) => t.id === selectedTrailId);
    if (!trail || trail.coordinates.length === 0) return;

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

    const trailLatSpan = Math.max(0.008, (maxLat - minLat) * 1.8);
    const trailLngSpan = Math.max(0.014, (maxLng - minLng) * 1.8);
    const neededZoom = Math.min(latSpanBase / trailLatSpan, lngSpanBase / trailLngSpan);
    const clampedZoom = Math.max(1.0, Math.min(2.6, Math.round(neededZoom * 10) / 10));

    setCenter({
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
    });
    setZoom(clampedZoom);
  }, [trails, selectedTrailId, latSpanBase, lngSpanBase]);

  useEffect(() => {
    if (fitTrailTrigger > 0) {
      fitSelectedTrail();
    }
  }, [fitTrailTrigger, fitSelectedTrail]);

  const project = (lat: number, lng: number) => {
    const scale =
      Math.min(size.width / (lngSpanBase * aspectCos), size.height / latSpanBase) *
      0.92 *
      zoom;
    const x = size.width / 2 + (lng - center.lng) * aspectCos * scale;
    const y = size.height / 2 - (lat - center.lat) * scale;
    return { x, y };
  };

  const unproject = (x: number, y: number) => {
    const scale =
      Math.min(size.width / (lngSpanBase * aspectCos), size.height / latSpanBase) *
      0.92 *
      zoom;
    const lng = center.lng + (x - size.width / 2) / (aspectCos * scale);
    const lat = center.lat - (y - size.height / 2) / scale;
    return { lat, lng };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Topographic Paper Base
    ctx.fillStyle = '#EFEFE8';
    ctx.fillRect(0, 0, size.width, size.height);

    // 2. Hamsterley Woodland Canopy Polygons
    HAMSTERLEY_WOODLAND_POLYGONS.forEach((pts) => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const s = project(p.lat, p.lng);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.fillStyle = '#DCE6D4';
      ctx.fill();
      ctx.strokeStyle = '#C7D6BE';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // 3. OS-style Elevation Contour Rings
    const contourHubs = [
      { lat: 54.689, lng: -1.892, maxR: 0.016, rings: 7 },
      { lat: 54.681, lng: -1.936, maxR: 0.015, rings: 6 },
      { lat: 54.6512, lng: -1.8982, maxR: 0.011, rings: 5 },
      { lat: 54.635, lng: -1.99, maxR: 0.014, rings: 6 },
      { lat: 54.691, lng: -1.982, maxR: 0.014, rings: 6 },
    ];
    ctx.strokeStyle = '#C9D3C3';
    ctx.lineWidth = 1;
    contourHubs.forEach((hub) => {
      for (let r = 1; r <= hub.rings; r++) {
        const frac = r / hub.rings;
        const rxLat = hub.maxR * frac * 0.72;
        const rxLng = hub.maxR * frac * 1.45;
        ctx.beginPath();
        for (let a = 0; a <= 36; a++) {
          const theta = (a / 36) * Math.PI * 2;
          const wobble = 1 + 0.08 * Math.sin(theta * 3 + r);
          const p = project(
            hub.lat + Math.sin(theta) * rxLat * wobble,
            hub.lng + Math.cos(theta) * rxLng * wobble
          );
          if (a === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    });

    // 4. OS Grid Lines
    ctx.strokeStyle = 'rgba(116, 134, 122, 0.14)';
    ctx.lineWidth = 1;
    for (let lng = -2.01; lng <= -1.83; lng += 0.02) {
      const top = project(54.71, lng);
      const bot = project(54.61, lng);
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(bot.x, bot.y);
      ctx.stroke();
    }
    for (let lat = 54.61; lat <= 54.71; lat += 0.012) {
      const left = project(lat, -2.02);
      const right = project(lat, -1.83);
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
    }

    // 5. Forest Streams
    const drawStream = (pts: { lat: number; lng: number }[], width: number) => {
      ctx.beginPath();
      pts.forEach((pt, idx) => {
        const p = project(pt.lat, pt.lng);
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = '#60A5FA';
      ctx.globalAlpha = isTrailFocused ? 0.55 : 0.85;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.stroke();
    };
    ctx.save();
    drawStream(BEDBURN_BECK_STREAM, 2.8);
    drawStream(SPURLSWOOD_BECK_STREAM, 2.0);
    drawStream(AYHOPE_BECK_STREAM, 1.6);
    ctx.restore();

    // 6. Forest Road Gravel Fire-Road Web & Main Forest Drive (recedes cleanly in Focus Mode)
    ctx.save();
    FOREST_ROAD_NETWORK.forEach((road) => {
      ctx.beginPath();
      road.forEach((pt, idx) => {
        const p = project(pt.lat, pt.lng);
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = '#7E5A8A';
      ctx.lineWidth = isTrailFocused ? 1.5 : 2.0;
      ctx.globalAlpha = isTrailFocused ? 0.25 : 0.58;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    });

    ctx.beginPath();
    FOREST_DRIVE_ROAD.forEach((pt, idx) => {
      const p = project(pt.lat, pt.lng);
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.globalAlpha = isTrailFocused ? 0.38 : 0.78;
    ctx.strokeStyle = '#5B3F66';
    ctx.lineWidth = isTrailFocused ? 2.2 : 3.0;
    ctx.stroke();
    ctx.restore();

    // 7. Draw Unselected Trails first (sunk into map when focused), Selected Trail crisp on top
    const ordered = [...trails].sort((a, b) =>
      a.id === selectedTrailId ? 1 : b.id === selectedTrailId ? -1 : 0
    );

    ordered.forEach((trail) => {
      const isSelected = trail.id === selectedTrailId;
      const isReceded = isTrailFocused && !isSelected;
      const color = GRADE_META[trail.grade].color;
      const isOffPiste = trail.category === 'off-piste';

      ctx.save();
      if (!isReceded) {
        ctx.beginPath();
        trail.coordinates.forEach((pt, idx) => {
          const p = project(pt.lat, pt.lng);
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.strokeStyle = isSelected ? '#FFFFFF' : 'rgba(255,255,255,0.68)';
        ctx.lineWidth = isSelected ? 8.5 : 4.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      ctx.beginPath();
      trail.coordinates.forEach((pt, idx) => {
        const p = project(pt.lat, pt.lng);
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 5.0 : isReceded ? 1.5 : 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (isOffPiste) {
        ctx.setLineDash(isSelected ? [9, 5] : isReceded ? [4, 4] : [6, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = isSelected ? 1 : isReceded ? 0.17 : 0.65;
      ctx.stroke();

      // Highlighted START & END nodes on the selected trail
      if (isSelected && trail.coordinates.length > 0) {
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        const startPt = project(trail.coordinates[0].lat, trail.coordinates[0].lng);
        const endCoord = trail.coordinates[trail.coordinates.length - 1];
        const endPt = project(endCoord.lat, endCoord.lng);

        // End ring
        ctx.beginPath();
        ctx.arc(endPt.x, endPt.y, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = '#141A17';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Start marker dot + crisp START tag
        ctx.beginPath();
        ctx.arc(startPt.x, startPt.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        ctx.fillStyle = '#141A17';
        ctx.fillRect(startPt.x + 8, startPt.y - 8, 38, 15);
        ctx.font = '700 9px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('START', startPt.x + 27, startPt.y - 0.5);
      }

      ctx.restore();
    });

    // 8. Rider Recorded Breadcrumb Track
    if (breadCrumbs.length > 1) {
      ctx.save();
      ctx.beginPath();
      breadCrumbs.forEach((pt, i) => {
        const p = project(pt.lat, pt.lng);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = '#D94E1F';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.restore();
    }

    // 9. Active Pin Navigation Vector Line
    if (gpsPosition && activeNavTarget) {
      const start = project(gpsPosition.lat, gpsPosition.lng);
      const end = project(activeNavTarget.lat, activeNavTarget.lng);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 5;
      ctx.setLineDash([8, 6]);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = '#0F766E';
      ctx.lineWidth = 2.8;
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.restore();
    }

    // 10. Surrounding Peaks & Key Landmarks
    FOREST_LANDMARKS.forEach((lm) => {
      const p = project(lm.lat, lm.lng);
      if (lm.kind === 'peak') {
        ctx.save();
        ctx.globalAlpha = isTrailFocused ? 0.55 : 0.85;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 5);
        ctx.lineTo(p.x + 4.5, p.y + 3);
        ctx.lineTo(p.x - 4.5, p.y + 3);
        ctx.closePath();
        ctx.fillStyle = '#16A34A';
        ctx.fill();
        ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#3F624D';
        ctx.textAlign = 'center';
        ctx.fillText(lm.name, p.x, p.y - 8);
        ctx.restore();
      } else if (!isTrailFocused) {
        ctx.fillStyle = '#334139';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // 11. Active Hazard Markers (unrelated hazards sink to clean small dots when trail is focused)
    hazards
      .filter((h) => h.status === 'active')
      .forEach((h) => {
        const p = project(h.lat, h.lng);
        const isClear = h.hazardType === 'clear_trail';
        const isSel = h.id === selectedHazardId;
        const isDeemphasized =
          isTrailFocused && h.trailId !== selectedTrailId && !isSel;
        const fill = isClear ? '#15803D' : h.severity >= 3 ? '#DC2626' : '#D97706';

        ctx.save();
        if (isDeemphasized) {
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - (isSel ? 12 : 9));
          ctx.lineTo(p.x + (isSel ? 10 : 8), p.y + (isSel ? 7 : 5));
          ctx.lineTo(p.x - (isSel ? 10 : 8), p.y + (isSel ? 7 : 5));
          ctx.closePath();
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = '700 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(isClear ? '✓' : '!', p.x, p.y + 4);
        }
        ctx.restore();
      });

    // 12. Trail Drop-In & Custom Navigation Pins (only show full pin + label for relevant/car-park/custom/target pins)
    navPins.forEach((pin) => {
      const p = project(pin.lat, pin.lng);
      const meta = PIN_KIND_META[pin.pinKind];
      const isSelected = pin.id === selectedPinId;
      const isTarget = activeNavTarget?.id === pin.id;
      const isProminent =
        pin.trailId === selectedTrailId ||
        pin.pinKind === 'car_park' ||
        !pin.isBuiltIn ||
        isSelected ||
        isTarget;

      ctx.save();
      if (!isProminent) {
        // Subtle calm dot so map never gets swamped with 25 overlapping pin labels
        ctx.globalAlpha = isTrailFocused ? 0.28 : 0.65;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isTrailFocused ? 3.5 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = meta.color;
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.restore();
        return;
      }

      if (isTarget) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 17, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 118, 110, 0.18)';
        ctx.fill();
        ctx.strokeStyle = '#0F766E';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }

      const r = isSelected || isTarget ? 11 : 8.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + r + 4);
      ctx.lineTo(p.x - r, p.y - 2);
      ctx.arc(p.x, p.y - 2, r, Math.PI, 0, false);
      ctx.closePath();
      ctx.fillStyle = meta.color;
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#141A17' : '#FFFFFF';
      ctx.lineWidth = isSelected ? 2.5 : 1.8;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(meta.glyph, p.x, p.y - 2);

      const shortLabel = pin.name
        .replace(' Drop-In', '')
        .replace(' Uplift Top Gate', ' Uplift')
        .replace(' Bike Park Base', ' Base')
        .replace(' Car Park', '');

      ctx.font =
        isSelected || isTarget
          ? '700 11px "Plus Jakarta Sans", sans-serif'
          : '600 10px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 3.2;
      ctx.strokeText(shortLabel, p.x + 12, p.y - 2);
      ctx.fillStyle = isTarget ? '#0F766E' : '#141A17';
      ctx.fillText(shortLabel, p.x + 12, p.y - 2);
      ctx.restore();
    });

    // 13. Live Rider GPS Beacon + Heading Cone
    if (gpsPosition) {
      const p = project(gpsPosition.lat, gpsPosition.lng);
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(217, 78, 31, 0.16)';
      ctx.fill();

      if (gpsPosition.heading !== null) {
        const rad = ((gpsPosition.heading - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, 26, rad - 0.4, rad + 0.4);
        ctx.closePath();
        ctx.fillStyle = 'rgba(217, 78, 31, 0.28)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = '#D94E1F';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
  }, [
    size,
    center,
    zoom,
    trails,
    selectedTrailId,
    isTrailFocused,
    hazards,
    selectedHazardId,
    navPins,
    selectedPinId,
    activeNavTarget,
    gpsPosition,
    breadCrumbs,
  ]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      startCenter: center,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.hypot(dx, dy) > 4) {
      dragRef.current.moved = true;
    }
    const scale =
      Math.min(size.width / (lngSpanBase * aspectCos), size.height / latSpanBase) *
      0.92 *
      zoom;
    setCenter({
      lat: dragRef.current.startCenter.lat + dy / scale,
      lng: dragRef.current.startCenter.lng - dx / (aspectCos * scale),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasClick = !dragRef.current.moved;
    dragRef.current.dragging = false;
    if (!wasClick) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (pickingMode && onPickCoordinate) {
      const geo = unproject(clickX, clickY);
      onPickCoordinate(
        Math.round(geo.lat * 10000) / 10000,
        Math.round(geo.lng * 10000) / 10000
      );
      return;
    }

    // 1. Check NavPin hit first
    for (const pin of navPins) {
      const pp = project(pin.lat, pin.lng);
      if (Math.hypot(pp.x - clickX, pp.y - clickY) < 16) {
        onSelectHazard(null);
        onSelectPin(pin.id);
        return;
      }
    }

    // 2. Check hazard hit
    for (const h of hazards.filter((x) => x.status === 'active')) {
      const hp = project(h.lat, h.lng);
      if (Math.hypot(hp.x - clickX, hp.y - clickY) < 15) {
        onSelectPin(null);
        onSelectHazard(h.id);
        return;
      }
    }

    // 3. Check nearest trail polyline segment (much smoother & more accurate than vertices!)
    let bestTrailId: string | null = null;
    let bestDistSq = 18 * 18;
    for (const t of trails) {
      for (let i = 0; i < t.coordinates.length - 1; i++) {
        const a = project(t.coordinates[i].lat, t.coordinates[i].lng);
        const b = project(t.coordinates[i + 1].lat, t.coordinates[i + 1].lng);
        const dSq = distToSegmentSq(clickX, clickY, a.x, a.y, b.x, b.y);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestTrailId = t.id;
        }
      }
    }
    if (bestTrailId) {
      onSelectPin(null);
      onSelectHazard(null);
      onSelectTrail(bestTrailId);
    } else {
      onSelectPin(null);
      onSelectHazard(null);
    }
  };

  const selectedTrail = trails.find((t) => t.id === selectedTrailId) || trails[0];
  const selectedHazard = hazards.find((h) => h.id === selectedHazardId) || null;
  const selectedPin = navPins.find((p) => p.id === selectedPinId) || null;
  const linkedTrail = selectedPin
    ? trails.find((t) => t.id === selectedPin.trailId) || null
    : null;
  const canDeleteSelectedPin =
    !!selectedPin &&
    !selectedPin.isBuiltIn &&
    (selectedPin.authorId === currentUserId || selectedPin.authorId === 'local-offline');

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[380px] rounded-xl overflow-hidden border border-[#D4DAD1] bg-[#EFEFE8] select-none"
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          dragRef.current.dragging = false;
        }}
        className={`w-full h-full block touch-none ${
          pickingMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
        }`}
      />

      {/* Top-left Trail Focus HUD */}
      {selectedTrail && !pickingMode && (
        <div className="absolute top-3 left-3 right-3 sm:right-auto max-w-[360px] bg-white/95 backdrop-blur-sm border border-[#DDE2DC] rounded-xl px-3 py-2 text-xs text-[#141A17] shadow-sm z-10 flex flex-wrap items-center gap-2">
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
              onClick={fitSelectedTrail}
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

      {/* Picking Pin Banner */}
      {pickingMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#141A17] text-white text-xs font-semibold pl-3.5 pr-2 py-2 rounded-lg shadow-md flex items-center gap-2.5 z-10">
          <span>
            {pickingMode === 'nav-pin'
              ? 'Tap anywhere on the map to drop your navigation pin'
              : 'Tap anywhere on the map to drop hazard pin'}
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

      {/* Selected Navigation Pin Floating Card */}
      {selectedPin && (
        <div className="absolute bottom-3 left-3 right-16 sm:right-auto sm:min-w-[300px] sm:max-w-sm bg-white border border-[#DDE2DC] rounded-xl p-3.5 shadow-md z-10">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div
                className="text-[11px] font-bold"
                style={{ color: PIN_KIND_META[selectedPin.pinKind].color }}
              >
                {PIN_KIND_META[selectedPin.pinKind].label}
                {selectedPin.isBuiltIn
                  ? ' · Trailhead'
                  : selectedPin.visibility === 'private'
                    ? ' · Private Pin'
                    : ' · Public Pin'}
              </div>
              <div className="text-sm font-bold text-[#141A17] mt-0.5">
                {selectedPin.name}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[#525E57] mt-0.5">
                {selectedPin.lat.toFixed(4)}° N, {Math.abs(selectedPin.lng).toFixed(4)}° W
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelectPin(null)}
              aria-label="Close pin details"
              className="text-[#525E57] hover:text-[#141A17] p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateToPin(selectedPin)}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0F766E] text-white text-xs font-semibold hover:bg-[#0D5D57] flex items-center gap-1.5 cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5" />
              Navigate to Pin
            </button>
            {linkedTrail && (
              <button
                type="button"
                onClick={() => onSelectTrail(linkedTrail.id)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#DDE2DC] text-xs font-semibold text-[#141A17] hover:bg-[#FAFBF9] flex items-center gap-1.5 cursor-pointer"
              >
                <Compass className="w-3.5 h-3.5 text-[#D94E1F]" />
                Select Trail
              </button>
            )}
            {canDeleteSelectedPin && onDeletePin && (
              <button
                type="button"
                onClick={() => onDeletePin(selectedPin)}
                className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[#FECACA] text-xs font-semibold text-[#DC2626] hover:bg-[#FEF2F2] flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )}
          </div>
        </div>
      )}

      {/* Selected Hazard Card */}
      {selectedHazard && !selectedPin && (
        <div className="absolute bottom-3 left-3 right-16 sm:right-auto sm:max-w-sm bg-white border border-[#DDE2DC] rounded-xl p-3 shadow-md z-10">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-[#D94E1F]">
                {HAZARD_TYPE_META[selectedHazard.hazardType].label}
              </div>
              <div className="text-sm font-bold text-[#141A17] mt-0.5">
                {selectedHazard.title}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelectHazard(null)}
              className="text-xs text-[#525E57] hover:text-[#141A17] px-2 py-1 cursor-pointer"
            >
              Close
            </button>
          </div>
          <p className="text-xs text-[#525E57] mt-1">{selectedHazard.description}</p>
        </div>
      )}

      {/* Bottom-right Map Controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        {gpsPosition && (
          <button
            type="button"
            onClick={() => {
              setCenter({ lat: gpsPosition.lat, lng: gpsPosition.lng });
              setZoom(1.45);
            }}
            title="Center on Rider GPS"
            className="w-11 h-11 rounded-lg bg-white border border-[#DDE2DC] flex items-center justify-center text-[#D94E1F] hover:bg-[#FAFBF9] shadow-sm cursor-pointer"
          >
            <LocateFixed className="w-5 h-5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(3.8, Math.round((z + 0.3) * 10) / 10))}
          title="Zoom in"
          className="w-11 h-11 rounded-lg bg-white border border-[#DDE2DC] flex items-center justify-center text-[#141A17] hover:bg-[#FAFBF9] shadow-sm cursor-pointer"
        >
          <Plus className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.7, Math.round((z - 0.3) * 10) / 10))}
          title="Zoom out"
          className="w-11 h-11 rounded-lg bg-white border border-[#DDE2DC] flex items-center justify-center text-[#141A17] hover:bg-[#FAFBF9] shadow-sm cursor-pointer"
        >
          <Minus className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setCenter(HAMSTERLEY_CENTER);
            setZoom(1.0);
          }}
          title="Reset forest view"
          className="w-11 h-11 rounded-lg bg-white border border-[#DDE2DC] flex items-center justify-center text-[#525E57] hover:text-[#141A17] hover:bg-[#FAFBF9] shadow-sm cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
