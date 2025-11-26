
import React from 'react';
import { Player, Allocation, MajorCard } from '../types';
import FarmTile from './FarmTile';
import { calculateAllocation, calculateScore } from '../utils/gameLogic';
import { LIMIT_FENCES, LIMIT_STABLES } from '../constants';

interface Props {
  player: Player;
  isActive: boolean;
  isNextStart: boolean;
  onFarmClick: (tileIdx: number) => void;
  onFenceClick?: (tileIdx: number, side: 't'|'b'|'l'|'r') => void;
  onMajorClick?: (major: MajorCard) => void;
  onConvertClick?: () => void;
}

const resIcon = (icon: string, val: number, color: string = "bg-gray-200") => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-black font-bold text-xs mx-0.5 ${color}`}>
    <span className="mr-0.5">{icon}</span>{val}
  </span>
);

const PlayerPanel: React.FC<Props> = ({ player, isActive, isNextStart, onFarmClick, onFenceClick, onMajorClick, onConvertClick }) => {
  const allocation = calculateAllocation(player);
  const score = calculateScore(player);

  // Stats calculation
  const remainingFences = LIMIT_FENCES - player.fences.size;
  const remainingStables = LIMIT_STABLES - player.stablesCount;

  // Convert Button Logic
  const canConvert = isActive && player.type === 'human';

  return (
    <div 
      className={`
        p-3 rounded-lg border-l-[6px] transition-all duration-200 shadow-md relative
        ${isActive ? 'bg-slate-600 scale-[1.01] shadow-xl z-10 border-white' : 'bg-slate-700 border-gray-400 opacity-90'}
      `}
    >
      {/* HEADER: Name | Convert Button | Score */}
      <div className="flex justify-between items-center mb-2 pb-1 border-b border-white/10">
        <div className="font-bold text-lg flex items-center" style={{ color: player.color }}>
          {player.name}
          {isNextStart && <span className="ml-2 text-sm" title="Starting Player">🚩</span>}
          <span className="ml-2 text-xs text-gray-400 font-normal">
            ({player.res.workers}/{player.res.maxWorkers} 👷)
          </span>
        </div>

        <div className="flex items-center gap-3">
            {/* Convert Food Button: Persistent, Oval, Narrow */}
            <button 
                onClick={(e) => { 
                    e.stopPropagation(); 
                    if (canConvert && onConvertClick) onConvertClick(); 
                }}
                disabled={!canConvert}
                className={`
                    flex items-center gap-1 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-all
                    ${canConvert 
                        ? 'bg-yellow-700 hover:bg-yellow-600 border-yellow-500 text-white shadow-md cursor-pointer' 
                        : 'bg-slate-800 border-slate-600 text-slate-500 opacity-60 cursor-not-allowed'}
                `}
                title={canConvert ? "Convert resources to Food" : "Wait for your turn"}
            >
                <span>🍲</span> Convert
            </button>

            {/* Score */}
            <div className="text-yellow-400 font-bold text-sm flex items-center gap-1 bg-black/20 px-2 py-0.5 rounded">
                🌟 {score}
            </div>
        </div>
      </div>

      {/* RESOURCES ROW */}
      <div className="flex flex-wrap gap-1 mb-1 text-sm">
        {resIcon('🪵', player.res.wood, 'bg-[#a1887f]')}
        {resIcon('🧱', player.res.clay, 'bg-[#ef9a9a]')}
        {resIcon('🎋', player.res.reed, 'bg-[#eeeeee]')}
        {resIcon('🪨', player.res.stone, 'bg-[#bdbdbd]')}
        <span className="text-gray-500 mx-1">|</span>
        {resIcon('🥣', player.res.food, 'bg-[#ffcc80]')}
        {resIcon('🌾', player.res.grain, 'bg-[#fff176]')}
        {resIcon('🥕', player.res.veg, 'bg-[#ffab91]')}
      </div>
      
      {/* ANIMALS & BEGGING ROW */}
      <div className="flex flex-wrap gap-1 mb-2 text-sm items-center">
        {resIcon('🐑', player.animals.sheep, 'bg-[#80deea]')}
        {resIcon('🐗', player.animals.boar, 'bg-[#bcaaa4]')}
        {resIcon('🐮', player.animals.cow, 'bg-[#a5d6a7]')}
        
        {/* Remaining Structures Display */}
        <span className="text-[10px] text-gray-400 ml-auto flex gap-2">
            <span title="Remaining Fences">🚧 {remainingFences}</span>
            <span title="Remaining Stables">🏚️ {remainingStables}</span>
        </span>

        {player.begging > 0 && (
             <span className="inline-flex items-center px-1.5 py-0.5 rounded text-white bg-red-600 font-bold text-xs mx-0.5 border border-red-400 ml-2">
                🆘 {player.begging}
            </span>
        )}
      </div>

      {/* MAIN CONTENT: FARM (Left) + CARDS (Right) */}
      <div className="flex gap-3">
          
          {/* FARM GRID */}
          <div className="inline-block bg-green-800 p-1.5 rounded border-2 border-green-900 shadow-inner">
            <div className="grid grid-cols-5 grid-rows-3 gap-1 bg-green-800">
              {player.farm.map((_, i) => (
                <FarmTile 
                    key={i} 
                    p={player} 
                    idx={i} 
                    content={allocation.distribution[i]} 
                    onClick={() => onFarmClick(i)}
                    onFenceClick={onFenceClick ? (side) => onFenceClick(i, side) : undefined}
                />
              ))}
            </div>
          </div>

          {/* CARDS COLUMN (Right Side) */}
          <div className="flex-1 flex flex-col gap-2 min-w-[80px]">
              
              {/* Majors Section */}
              <div className="bg-black/20 p-1.5 rounded h-full border border-white/5">
                  <div className="text-[10px] text-gray-400 uppercase font-bold mb-1 border-b border-white/10">Majors</div>
                  <div className="flex flex-wrap gap-1 content-start">
                      {player.majors.length === 0 && <span className="text-[10px] text-gray-600 italic">None</span>}
                      {player.majors.map(m => (
                          <div 
                            key={m.id} 
                            onClick={() => onMajorClick && onMajorClick(m)}
                            className="w-8 h-10 bg-orange-700 border border-orange-400 rounded-sm text-[10px] flex flex-col items-center justify-center text-white cursor-help hover:scale-110 transition-transform shadow-sm leading-none text-center" 
                            title={m.name}
                          >
                              <span className="scale-75">{m.name.substring(0, 2)}</span>
                          </div>
                      ))}
                  </div>
              </div>

              {/* Placeholders for Future Expansions (Minors / Occupations) */}
              {/* 
              <div className="bg-black/20 p-1.5 rounded border border-white/5 opacity-50">
                  <div className="text-[10px] text-gray-500 uppercase font-bold">Minors</div>
              </div>
              */}
          </div>
      </div>
    </div>
  );
};

export default PlayerPanel;