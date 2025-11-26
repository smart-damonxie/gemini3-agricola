
import React from 'react';
import { Player, Allocation, MajorCard } from '../types';
import FarmTile from './FarmTile';
import { calculateAllocation, calculateScore } from '../utils/gameLogic';

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

  return (
    <div 
      className={`
        p-3 rounded-lg border-l-[6px] transition-all duration-200 shadow-md relative
        ${isActive ? 'bg-slate-600 scale-[1.01] shadow-xl z-10 border-white' : 'bg-slate-700 border-gray-400 opacity-90'}
      `}
    >
      <div className="flex justify-between items-center mb-2">
        <div className="font-bold text-lg flex items-center" style={{ color: player.color }}>
          {player.name}
          {isNextStart && <span className="ml-2 text-sm" title="Starting Player">🚩</span>}
          <span className="ml-2 text-xs text-gray-400 font-normal">
            (Workers: {player.res.workers}/{player.res.maxWorkers})
          </span>
        </div>
        <div className="text-yellow-400 font-bold text-sm">
          🌟 {score}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-2 text-sm">
        {resIcon('🪵', player.res.wood, 'bg-[#a1887f]')}
        {resIcon('🧱', player.res.clay, 'bg-[#ef9a9a]')}
        {resIcon('🎋', player.res.reed, 'bg-[#eeeeee]')}
        {resIcon('🪨', player.res.stone, 'bg-[#bdbdbd]')}
        <span className="text-gray-500">|</span>
        {resIcon('🥣', player.res.food, 'bg-[#ffcc80]')}
        {resIcon('🌾', player.res.grain, 'bg-[#fff176]')}
        {resIcon('🥕', player.res.veg, 'bg-[#ffab91]')}
      </div>
      
      <div className="flex flex-wrap gap-1 mb-2 text-sm">
        {resIcon('🐑', player.animals.sheep, 'bg-[#80deea]')}
        {resIcon('🐗', player.animals.boar, 'bg-[#bcaaa4]')}
        {resIcon('🐮', player.animals.cow, 'bg-[#a5d6a7]')}
        {player.begging > 0 && (
             <span className="inline-flex items-center px-1.5 py-0.5 rounded text-white bg-red-600 font-bold text-xs mx-0.5 border border-red-400">
                🆘 {player.begging}
            </span>
        )}
      </div>

      {/* Action Buttons for Active Human */}
      {isActive && player.type === 'human' && onConvertClick && (
          <div className="mb-2">
              <button 
                  onClick={(e) => { e.stopPropagation(); onConvertClick(); }}
                  className="w-full bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-bold py-1 px-2 rounded border border-yellow-500 shadow flex items-center justify-center gap-1"
              >
                  <span>🍲</span> Convert Food
              </button>
          </div>
      )}

      {/* Cards */}
      <div className="flex gap-1 mb-2 flex-wrap">
          {player.majors.map(m => (
              <div 
                key={m.id} 
                onClick={() => onMajorClick && onMajorClick(m)}
                className="w-6 h-8 bg-orange-700 border border-orange-400 rounded-sm text-[10px] flex items-center justify-center text-white cursor-help hover:scale-125 transition-transform" 
                title={m.name}
              >
                  {m.name.substring(0, 1)}
              </div>
          ))}
      </div>

      {/* Farm Grid */}
      <div className="inline-block bg-green-800 p-1.5 rounded border-2 border-green-900">
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
    </div>
  );
};

export default PlayerPanel;
