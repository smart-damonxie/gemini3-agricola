

import React from 'react';
import { Player } from '../types';

interface Props {
  p: Player;
  idx: number;
  content: { icon: string; type: string }[];
  capacity?: { current: number; max: number };
  onClick: () => void;
  onFenceClick?: (side: 't'|'b'|'l'|'r') => void;
}

const FarmTile: React.FC<Props> = ({ p, idx, content, capacity, onClick, onFenceClick }) => {
  const type = p.farm[idx];
  const isRoom = type === 1;
  const isField = type === 2;
  const isStable = type === 5;
  
  // Fence detection
  const hasFence = (side: string) => {
      if (side === 't') return p.fences.has(`${idx}-t`);
      if (side === 'l') return p.fences.has(`${idx}-l`);
      if (side === 'r') return (idx % 5 === 4) ? p.fences.has(`${idx}-r`) : p.fences.has(`${idx + 1}-l`);
      if (side === 'b') return (idx >= 10) ? p.fences.has(`${idx}-b`) : p.fences.has(`${idx + 5}-t`);
      return false;
  };

  let bgClass = 'bg-green-600/80'; // Empty
  if (isRoom) {
     bgClass = p.houseType === 'wood' ? 'bg-wood' : p.houseType === 'clay' ? 'bg-clay' : 'bg-stone';
  } else if (isField) {
     bgClass = 'bg-[url("https://www.transparenttextures.com/patterns/dirt.png")] bg-yellow-900/60 border-yellow-900/80 shadow-inner';
  }

  // Fence interaction overlay classes
  const fenceZoneBase = "absolute z-40 cursor-pointer hover:bg-white/40 transition-colors";

  return (
    <div 
      className={`relative w-[55px] h-[55px] rounded-sm border border-black/10 cursor-pointer ${bgClass} select-none`}
      onClick={onClick}
    >
      {/* Room decoration */}
      {isRoom && (
        <>
          <div className="absolute top-1 left-1 w-3 h-3 bg-sky-200 border border-black/20 shadow-sm z-10" />
          <div className="absolute bottom-1 right-1 w-5 h-3.5 bg-white/40 border border-black/10 rounded-sm z-10" />
        </>
      )}

      {/* Stable */}
      {isStable && <div className="absolute top-0.5 right-0.5 text-xs z-10 drop-shadow-md">🏚️</div>}

      {/* Capacity Indicator (a/b) */}
      {capacity && capacity.max > 0 && (
          <div className="absolute top-0.5 right-0.5 bg-black/50 text-white text-[8px] px-1 rounded z-30 pointer-events-none">
              {capacity.current}/{capacity.max}
          </div>
      )}

      {/* Farm Content (Crops) */}
      {isField && p.farmContent[idx] && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {Array.from({length: Math.min(5, p.farmCounts[idx])}).map((_, k) => (
                <div key={k} className="absolute text-sm drop-shadow-md" style={{top: 4+k*4, left: 4+k*4}}>
                   {p.farmContent[idx] === 'grain' ? '🌾' : '🥕'}
                </div>
            ))}
            {p.farmCounts[idx] > 1 && (
                <div className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] px-1 rounded">
                    {p.farmCounts[idx]}
                </div>
            )}
        </div>
      )}

      {/* Animals / Workers / Scattered Content */}
      {content.map((item, i) => {
         // Consistent random scattering based on index
         const seed = (idx * 13 + i * 7) % 100;
         const top = 5 + (seed % 25);
         const left = 5 + ((seed * 3) % 25);
         
         if (item.type === 'worker') {
             return (
                 <div key={i} className="absolute z-20" style={{top: 15, left: 15}}>
                     <div className="w-6 h-6 rounded-full border border-white shadow-md flex items-center justify-center" style={{backgroundColor: p.color}}>
                        <span className="text-white text-[10px] drop-shadow-md">👷</span>
                     </div>
                 </div>
             );
         }

         return (
             <div key={i} className="absolute text-sm pointer-events-none drop-shadow-md z-20" style={{top, left}}>
                 {item.icon}
             </div>
         );
      })}

      {/* Render Fences - Positioned in the 4px grid gaps */}
      {hasFence('t') && <div className="absolute top-[-6px] left-[-6px] right-[-6px] h-2 bg-sky-400 z-30 pointer-events-none shadow-sm rounded-sm" />}
      {hasFence('b') && <div className="absolute bottom-[-6px] left-[-6px] right-[-6px] h-2 bg-sky-400 z-30 pointer-events-none shadow-sm rounded-sm" />}
      {hasFence('l') && <div className="absolute left-[-6px] top-[-6px] bottom-[-6px] w-2 bg-sky-400 z-30 pointer-events-none shadow-sm rounded-sm" />}
      {hasFence('r') && <div className="absolute right-[-6px] top-[-6px] bottom-[-6px] w-2 bg-sky-400 z-30 pointer-events-none shadow-sm rounded-sm" />}

      {/* Fence Click Zones (Only if onFenceClick is provided) */}
      {onFenceClick && (
          <>
            <div className={`${fenceZoneBase} top-[-8px] left-0 right-0 h-5`} onClick={(e) => { e.stopPropagation(); onFenceClick('t'); }} title="Build Fence" />
            <div className={`${fenceZoneBase} bottom-[-8px] left-0 right-0 h-5`} onClick={(e) => { e.stopPropagation(); onFenceClick('b'); }} title="Build Fence" />
            <div className={`${fenceZoneBase} top-0 bottom-0 left-[-8px] w-5`} onClick={(e) => { e.stopPropagation(); onFenceClick('l'); }} title="Build Fence" />
            <div className={`${fenceZoneBase} top-0 bottom-0 right-[-8px] w-5`} onClick={(e) => { e.stopPropagation(); onFenceClick('r'); }} title="Build Fence" />
          </>
      )}
    </div>
  );
};

export default FarmTile;
