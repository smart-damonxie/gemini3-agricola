
import React from 'react';
import { Action, Player, ResourceType } from '../types';

interface Props {
  action: Action;
  occupiedBy?: Player;
  onClick: () => void;
  isFuture?: boolean;
  futureResources?: ResourceType[];
}

const getResIcon = (res: ResourceType) => {
    switch(res) {
        case 'wood': return '🪵';
        case 'clay': return '🧱';
        case 'reed': return '🎋';
        case 'stone': return '🪨';
        case 'food': return '🥣';
        case 'grain': return '🌾';
        case 'veg': return '🥕';
        case 'sheep': return '🐑';
        case 'boar': return '🐗';
        case 'cow': return '🐮';
        default: return '📦';
    }
};

const ActionSlot: React.FC<Props> = ({ action, occupiedBy, onClick, isFuture, futureResources }) => {
  if (isFuture) {
      return (
        <div className="flex flex-col items-center justify-center p-2 rounded border-2 border-dashed border-stone-700 bg-stone-800/30 text-stone-600 min-h-[60px] select-none relative">
            <span className="text-xs font-bold">{action.name}</span>
            {action.desc && <span className="text-[10px] mt-1">{action.desc}</span>}
            
            {/* Future Resources Overlay */}
            {futureResources && futureResources.length > 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                     <div className="flex gap-1 flex-wrap justify-center p-1">
                         {futureResources.map((res, i) => (
                             <span key={i} className="text-sm drop-shadow-md animate-pulse">{getResIcon(res)}</span>
                         ))}
                     </div>
                </div>
            )}
        </div>
      );
  }

  return (
    <div
      onClick={!occupiedBy ? onClick : undefined}
      className={`
        relative flex flex-col justify-between p-2 rounded border-2 min-h-[60px] transition-all duration-100 shadow-sm
        ${occupiedBy 
          ? 'bg-stone-300 border-stone-500 cursor-not-allowed' 
          : 'bg-stone-200 border-stone-400 text-stone-900 hover:bg-white hover:-translate-y-0.5 hover:border-yellow-500 cursor-pointer active:translate-y-0'}
      `}
    >
      {/* Accumulation Badge - Show if resources exist OR if accumulation is active and not taken */}
      {action.acc && action.cur !== undefined && (action.cur > 0 || !occupiedBy) && (
        <div className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-white shadow-sm z-10">
          {action.cur}
        </div>
      )}
      
      {/* Name */}
      <div className="font-bold text-xs leading-tight z-0 pr-4">
        {action.name}
      </div>
      
      {/* Description */}
      {action.desc && !occupiedBy && (
        <div className="text-[9px] text-stone-600 leading-none mt-1">{action.desc}</div>
      )}

      {/* Future Resources (If any explicitly assigned even to revealed cards) */}
      {futureResources && futureResources.length > 0 && (
           <div className="absolute bottom-1 right-1 flex gap-0.5 z-10">
                {futureResources.map((res, i) => (
                    <span key={i} className="text-[10px]">{getResIcon(res)}</span>
                ))}
           </div>
      )}

      {/* Worker Token Overlay */}
      {occupiedBy && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/5 rounded">
             <div 
                className="w-8 h-8 rounded-full border-2 border-white shadow-md flex items-center justify-center animate-bounce-short"
                style={{ backgroundColor: occupiedBy.color }}
                title={`${occupiedBy.name} occupied this`}
             >
                <span className="text-white text-xs drop-shadow-md">👷</span>
             </div>
        </div>
      )}
    </div>
  );
};

export default ActionSlot;
