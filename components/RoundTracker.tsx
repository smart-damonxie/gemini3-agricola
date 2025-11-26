
import React from 'react';
import { HARVEST_ROUNDS } from '../constants';

const STAGES = [
  { id: 1, label: "Stage 1", rounds: [1, 2, 3, 4] },
  { id: 2, label: "Stage 2", rounds: [5, 6, 7] },
  { id: 3, label: "Stage 3", rounds: [8, 9] },
  { id: 4, label: "Stage 4", rounds: [10, 11] },
  { id: 5, label: "Stage 5", rounds: [12, 13] },
  { id: 6, label: "Stage 6", rounds: [14] },
];

interface Props {
  currentRound: number;
}

const RoundTracker: React.FC<Props> = ({ currentRound }) => {
  return (
    <div className="flex flex-col select-none">
      <div className="flex items-center bg-stone-900/90 p-1.5 rounded-lg border border-stone-600 shadow-lg h-[42px] gap-1 overflow-x-auto max-w-full">
        {STAGES.map((stage, idx) => (
          <div key={stage.id} className="flex items-center h-full group">
            {/* Stage Divider */}
            {idx > 0 && <div className="w-[2px] h-5 bg-stone-700 mx-1 rounded-full" />}
            
            <div className="flex gap-[2px]">
                {stage.rounds.map((r) => {
                    const isHarvest = HARVEST_ROUNDS.includes(r);
                    const isCurrent = r === currentRound;
                    const isPast = r < currentRound;
                    
                    let bg = "bg-stone-800 border-stone-700";
                    let text = "text-stone-500";
                    let harvestColor = "text-stone-700";

                    if (isPast) {
                        bg = "bg-green-900/30 border-green-800/50";
                        text = "text-green-500/50";
                        harvestColor = "text-green-500/50";
                    }
                    if (isCurrent) {
                        bg = "bg-yellow-600 border-yellow-500 shadow-md ring-1 ring-yellow-400/50 scale-105 z-10";
                        text = "text-white font-bold";
                        harvestColor = "text-yellow-200";
                    }

                    return (
                        <div 
                            key={r}
                            className={`
                                relative w-[22px] h-[28px] flex flex-col items-center justify-center rounded-[3px] border transition-all duration-300
                                ${bg}
                            `}
                            title={`Round ${r} ${isHarvest ? '(Harvest)' : ''} - ${stage.label}`}
                        >
                            <span className={`text-[10px] leading-none ${text}`}>{r}</span>
                            {isHarvest && (
                                <span className={`text-[8px] leading-none mt-[1px] ${harvestColor}`}>🌾</span>
                            )}
                        </div>
                    );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RoundTracker;
