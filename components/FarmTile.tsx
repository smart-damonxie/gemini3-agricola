import React from 'react';
import { Player } from '../types';

interface Props {
  p: Player;
  idx: number;
  content: { icon: string; type: string }[];
  onClick: () => void;
}

const FarmTile: React.FC<Props> = ({ p, idx, content, onClick }) => {
  const type = p.farm[idx];
  const isRoom = type === 1;
  const isField = type === 2;
  const isStable = type === 5;
  
  // Fence detection
  const hasFence = (side: string) => p.fences.has(`${idx}-${side}`);

  let bgClass = 'bg-green-600/80'; // Empty
  if (isRoom) {
     bgClass = p.houseType === 'wood' ? 'bg-wood' : p.houseType === 'clay' ? 'bg-clay' : 'bg-stone';
  } else if (isField) {
     bgClass = 'bg-[url("https://www.transparenttextures.com/patterns/dirt.png")] bg-yellow-900/60 border-yellow-900/80 shadow-inner';
  }

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

      {/* Animals / Scattered Content */}
      {content.map((item, i) => {
         const seed = (idx * 13 + i * 7) % 100;
         const top = 2 + (seed % 30);
         const left = 2 + ((seed * 3) % 30);
         return (
             <div key={i} className="absolute text-sm pointer-events-none drop-shadow-md z-20" style={{top, left}}>
                 {item.icon}
             </div>
         );
      })}

      {/* Fences */}
      {hasFence('t') && <div className="absolute top-[-2px] left-[-2px] right-[-2px] h-2 bg-fence z-30 shadow-sm rounded-sm" />}
      {hasFence('b') && <div className="absolute bottom-[-2px] left-[-2px] right-[-2px] h-2 bg-fence z-30 shadow-sm rounded-sm" />}
      {hasFence('l') && <div className="absolute left-[-2px] top-[-2px] bottom-[-2px] w-2 bg-fence z-30 shadow-sm rounded-sm" />}
      {hasFence('r') && <div className="absolute right-[-2px] top-[-2px] bottom-[-2px] w-2 bg-fence z-30 shadow-sm rounded-sm" />}
    </div>
  );
};

export default FarmTile;