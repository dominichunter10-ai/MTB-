import React from 'react';
import { GRADE_META, haversineKm } from '../data/hamsterleyTrails';
import { Trail } from '../types/trail';

interface ElevationProfileProps {
  trail: Trail;
  riderNearestIndex?: number | null;
}

export const ElevationProfile: React.FC<ElevationProfileProps> = ({
  trail,
  riderNearestIndex = null,
}) => {
  const coords = trail.coordinates;
  if (coords.length < 2) return null;

  const gradeColor = GRADE_META[trail.grade].color;
  const distances: number[] = [0];
  let totalKm = 0;
  for (let i = 1; i < coords.length; i++) {
    totalKm += haversineKm(coords[i - 1], coords[i]);
    distances.push(totalKm);
  }
  const maxDist = Math.max(totalKm, 0.1);
  const eles = coords.map((c) => c.ele);
  const minEle = Math.min(...eles) - 12;
  const maxEle = Math.max(...eles) + 12;
  const eleRange = Math.max(maxEle - minEle, 20);

  const width = 420;
  const height = 108;
  const padX = 10;
  const padY = 12;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const points = coords.map((pt, i) => {
    const x = padX + (distances[i] / maxDist) * plotW;
    const y = padY + plotH - ((pt.ele - minEle) / eleRange) * plotH;
    return { x, y, ele: pt.ele, dist: distances[i] };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${
    padY + plotH
  } L ${points[0].x.toFixed(1)} ${padY + plotH} Z`;

  const riderPt =
    riderNearestIndex !== null && points[riderNearestIndex]
      ? points[riderNearestIndex]
      : null;

  return (
    <div className="bg-[#FAFBF9] border border-[#E2E6DF] rounded-xl p-3">
      <div className="flex items-center justify-between text-xs text-[#525E57] mb-1.5">
        <span className="font-semibold text-[#141A17]">Elevation Profile</span>
        <span className="font-mono tabular-nums">
          {Math.min(...eles)}m min · {Math.max(...eles)}m peak
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-24 overflow-visible"
        role="img"
        aria-label={`Elevation profile for ${trail.name}`}
      >
        <defs>
          <linearGradient id={`eleGrad-${trail.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gradeColor} stopOpacity="0.26" />
            <stop offset="100%" stopColor={gradeColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line
          x1={padX}
          y1={padY + plotH / 2}
          x2={width - padX}
          y2={padY + plotH / 2}
          stroke="#E2E6DF"
          strokeDasharray="3 3"
          strokeWidth="1"
        />
        <path d={areaPath} fill={`url(#eleGrad-${trail.id})`} />
        <path
          d={linePath}
          fill="none"
          stroke={gradeColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {riderPt && (
          <g>
            <line
              x1={riderPt.x}
              y1={padY}
              x2={riderPt.x}
              y2={padY + plotH}
              stroke="#D94E1F"
              strokeWidth="1.5"
              strokeDasharray="2 2"
            />
            <circle
              cx={riderPt.x}
              cy={riderPt.y}
              r="5"
              fill="#D94E1F"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>
    </div>
  );
};
