import React from 'react';
import { GRADE_META } from '../data/hamsterleyTrails';
import { TrailGrade } from '../types/trail';

interface TrailGradeMarkerProps {
  grade: TrailGrade;
  size?: 'sm' | 'md';
}

export const TrailGradeMarker: React.FC<TrailGradeMarkerProps> = ({
  grade,
  size = 'md',
}) => {
  const meta = GRADE_META[grade];
  const isDoubleBlack = grade === 'double-black';

  return (
    <span className="inline-flex items-center gap-2 shrink-0 whitespace-nowrap">
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center rounded-sm font-mono font-bold ${
          size === 'sm' ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-[10px]'
        }`}
        style={{
          backgroundColor: meta.color,
          color: meta.textOnColor,
        }}
      >
        {isDoubleBlack ? '◆◆' : grade === 'black' ? '◆' : grade === 'orange' ? '▲' : '●'}
      </span>
      <span
        className={`font-semibold tracking-tight ${
          size === 'sm' ? 'text-xs' : 'text-xs sm:text-sm'
        }`}
        style={{ color: grade === 'green' || grade === 'blue' || grade === 'red' || grade === 'orange' ? meta.color : '#141A17' }}
      >
        {meta.label}
      </span>
    </span>
  );
};

export const TrailColourLegend: React.FC<{
  activeGrade: TrailGrade | 'all';
  onSelectGrade: (grade: TrailGrade | 'all') => void;
}> = ({ activeGrade, onSelectGrade }) => {
  const orderedGrades: TrailGrade[] = [
    'green',
    'blue',
    'red',
    'black',
    'double-black',
    'orange',
  ];

  return (
    <div className="bg-white border border-[#DDE2DC] rounded-xl p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <span className="text-xs font-semibold text-[#141A17]">
          Trail Colour Key — Easy to Extreme
        </span>
        {activeGrade !== 'all' && (
          <button
            type="button"
            onClick={() => onSelectGrade('all')}
            className="text-xs font-semibold text-[#D94E1F] hover:underline cursor-pointer"
          >
            Show All Grades
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {orderedGrades.map((g) => {
          const meta = GRADE_META[g];
          const selected = activeGrade === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => onSelectGrade(selected ? 'all' : g)}
              className={`min-h-[44px] flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                selected
                  ? 'border-[#141A17] bg-[#F6F6F3]'
                  : 'border-[#E5E8E3] bg-white hover:bg-[#FAFBF9]'
              }`}
            >
              <span
                className="w-3 h-7 rounded-sm shrink-0"
                style={{ backgroundColor: meta.color }}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-[#141A17] truncate">
                  {meta.shortLabel}
                </span>
                <span className="block text-[11px] text-[#525E57] truncate">
                  {g === 'double-black' ? 'Off-Piste Pro' : g === 'orange' ? 'Jump Park' : g.charAt(0).toUpperCase() + g.slice(1)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
