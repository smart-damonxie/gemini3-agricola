

import React from 'react';
import { Player, Allocation, MajorCard, ResourceType } from '../types';
import FarmTile from './FarmTile';
import { calculateAllocation, calculateScore, analyzeFarmLayout } from '../utils/gameLogic';
import { LIMIT_FENCES, LIMIT_STABLES } from '../constants';

interface Props {
  player: Player;
  isActive: boolean;
  isNextStart: boolean;
  onFarmClick: (tileIdx: number) => void;
  onFenceClick?: (tileIdx: number, side: 't'|'b'|'l'|'r') => void;
  onMajorClick?: (major: MajorCard) => void;
  onConvertClick?: () => void;
  onAdjustClick?: () => void;
  // Overflow props
  isOverflowing?: boolean;
  onDiscard?: (type: 'sheep'|'boar'|'cow') => void;
  onCook?: (type: 'sheep'|'boar'|'cow') => void;
  onConfirmOverflow?: () => void;
}

const resIcon = (icon: string, val: number, color: string = "bg-gray-200") => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-black font-bold text-xs mx-0.5 ${color}`}>
    <span className="mr-0.5">{icon}</span>{val}
  </span>
);

const PlayerPanel: React.FC<Props> = ({ 
    player, isActive, isNextStart, 
    onFarmClick, onFenceClick, onMajorClick, onConvertClick, onAdjustClick,
    isOverflowing, onDiscard, onCook, onConfirmOverflow
}) => {
  const allocation = calculateAllocation(player);
  const score = calculateScore(player);
  const layout = analyzeFarmLayout(player);

  const remainingFences = LIMIT_FENCES - player.fences.size;
  const remainingStables = LIMIT_STABLES - player.stablesCount;

  // Convert Button Logic
  const canConvert = isActive && player.type === 'human' && !isOverflowing;
  const canAdjust = player.type === 'human';

  const capacities: {[key:number]: {current:number, max:number}} = {};
  
  const countAnimalsInAlloc = (tIdx: number) => allocation.distribution[tIdx].filter(x => x.type === 'ani').length;

  layout.pastures.forEach(p => {
      if (p.tiles.length === 0) return;
      const primaryTile = Math.min(...p.tiles); 
      const totalAnimals = p.tiles.reduce((sum, t) => sum + countAnimalsInAlloc(t), 0);
      p.tiles.forEach(t => {
          if (t === primaryTile) {
              capacities[t] = { current: totalAnimals, max: p.capacity };
          }
      });
  });

  layout.singles.forEach(s => {
      capacities[s.idx] = { current: countAnimalsInAlloc(s.idx), max: s.capacity };
  });

  const overflowCounts = { sheep: 0, boar: 0, cow: 0 };
  if (allocation.overflow > 0) {
      let assignedSheep = 0, assignedBoar = 0, assignedCow = 0;
      allocation.distribution.flat().forEach(i => {
          if (i.icon === '🐑') assignedSheep++;
          if (i.icon === '🐗') assignedBoar++;
          if (i.icon === '🐮') assignedCow++;
      });
      overflowCounts.sheep = Math.max(0, player.animals.sheep - assignedSheep);
      overflowCounts.boar = Math.max(0, player.animals.boar - assignedBoar);
      overflowCounts.cow = Math.max(0, player.animals.cow - assignedCow);
  }
  
  // Cooking check for overflow
  const canCookOverflow = onCook && player.majors.some(m => m.cook);
  const getCookRate = (type: 'sheep'|'boar'|'cow') => {
      let rate = 0;
      player.majors.forEach(m => {
          if (m.cook && m.cook[type] > rate) rate = m.cook[type];
      });
      return rate;
  };

  return (
    <div 
      className={`
        p-3 rounded-lg border-l-[6px] transition-all duration-200 shadow-md relative
        ${isActive ? 'bg-slate-600 scale-[1.01] shadow-xl z-10 border-white' : 'bg-slate-700 border-gray-400 opacity-90'}
        ${isOverflowing ? 'ring-2 ring-red-500 animate-pulse' : ''}
      `}
    >
      {/* HEADER */}
      <div className="flex justify-between items-center mb-2 pb-1 border-b border-white/10">
        <div className="font-bold text-lg flex items-center" style={{ color: player.color }}>
          {player.name}
          {isNextStart && <span className="ml-2 text-sm" title="Starting Player">🚩</span>}
          <span className="ml-2 text-xs text-gray-400 font-normal">
            ({player.res.workers}/{player.res.maxWorkers} 👷)
          </span>
        </div>

        <div className="flex items-center gap-2">
            {canAdjust && (
                 <button 
                    onClick={(e) => { e.stopPropagation(); if (onAdjustClick) onAdjustClick(); }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase border transition-all bg-indigo-700 hover:bg-indigo-600 border-indigo-500 text-white shadow-sm"
                 >
                    🔄 Adjust
                 </button>
            )}

            <button 
                onClick={(e) => { e.stopPropagation(); if (canConvert && onConvertClick) onConvertClick(); }}
                disabled={!canConvert}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase border transition-all ${canConvert ? 'bg-yellow-700 hover:bg-yellow-600 border-yellow-500 text-white cursor-pointer' : 'bg-slate-800 border-slate-600 text-slate-500 opacity-50 cursor-not-allowed'}`}
            >
                🍲 Convert
            </button>

            <div className="text-yellow-400 font-bold text-sm bg-black/20 px-2 py-0.5 rounded">
                🌟 {score}
            </div>
        </div>
      </div>

      {/* OVERFLOW WARNING SECTION */}
      {isOverflowing && allocation.overflow > 0 && (
          <div className="bg-red-900/80 border border-red-500 p-2 rounded mb-2 flex flex-col gap-1 animate-bounce-short">
              <div className="flex gap-2 items-center text-xs font-bold text-white mb-1">
                  <span>⚠️ Overflow! Manage Animals:</span>
              </div>
              
              <div className="flex flex-wrap gap-2 items-center">
                  {overflowCounts.sheep > 0 && (
                      <div className="flex items-center gap-1 bg-black/20 rounded p-0.5">
                          <button onClick={() => onDiscard && onDiscard('sheep')} className="px-2 py-0.5 bg-red-700 hover:bg-red-600 rounded text-xs border border-red-500">Discard 🐑</button>
                          {canCookOverflow && <button onClick={() => onCook && onCook('sheep')} className="px-2 py-0.5 bg-orange-600 hover:bg-orange-500 rounded text-xs border border-orange-400 font-bold">Cook (+{getCookRate('sheep')}🍖)</button>}
                      </div>
                  )}
                  {overflowCounts.boar > 0 && (
                      <div className="flex items-center gap-1 bg-black/20 rounded p-0.5">
                          <button onClick={() => onDiscard && onDiscard('boar')} className="px-2 py-0.5 bg-red-700 hover:bg-red-600 rounded text-xs border border-red-500">Discard 🐗</button>
                          {canCookOverflow && <button onClick={() => onCook && onCook('boar')} className="px-2 py-0.5 bg-orange-600 hover:bg-orange-500 rounded text-xs border border-orange-400 font-bold">Cook (+{getCookRate('boar')}🍖)</button>}
                      </div>
                  )}
                  {overflowCounts.cow > 0 && (
                      <div className="flex items-center gap-1 bg-black/20 rounded p-0.5">
                          <button onClick={() => onDiscard && onDiscard('cow')} className="px-2 py-0.5 bg-red-700 hover:bg-red-600 rounded text-xs border border-red-500">Discard 🐮</button>
                          {canCookOverflow && <button onClick={() => onCook && onCook('cow')} className="px-2 py-0.5 bg-orange-600 hover:bg-orange-500 rounded text-xs border border-orange-400 font-bold">Cook (+{getCookRate('cow')}🍖)</button>}
                      </div>
                  )}
              </div>
              <div className="text-[10px] text-red-200 mt-1">Adjust pens or remove excess animals to proceed.</div>
          </div>
      )}
      
      {isOverflowing && allocation.overflow === 0 && (
          <div className="bg-green-900/80 border border-green-500 p-2 rounded mb-2 flex justify-between items-center">
              <span className="text-green-100 text-xs">Overflow Resolved.</span>
              <button onClick={onConfirmOverflow} className="px-3 py-0.5 bg-green-600 hover:bg-green-500 rounded text-xs font-bold text-white">End Turn</button>
          </div>
      )}

      {/* RESOURCES */}
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
      
      {/* ANIMALS */}
      <div className="flex flex-wrap gap-1 mb-2 text-sm items-center">
        {resIcon('🐑', player.animals.sheep, 'bg-[#80deea]')}
        {resIcon('🐗', player.animals.boar, 'bg-[#bcaaa4]')}
        {resIcon('🐮', player.animals.cow, 'bg-[#a5d6a7]')}
        
        <span className="text-[10px] text-gray-400 ml-auto flex gap-2">
            <span title="Remaining Fences">🚧 {remainingFences}</span>
            <span title="Remaining Stables">🏚️ {remainingStables}</span>
        </span>
        {player.begging > 0 && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-white bg-red-600 font-bold text-xs mx-0.5 border border-red-400 ml-2">🆘 {player.begging}</span>}
      </div>

      {/* FARM + CARDS */}
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
                    capacity={capacities[i]}
                    onClick={() => onFarmClick(i)}
                    onFenceClick={onFenceClick ? (side) => onFenceClick(i, side) : undefined}
                />
              ))}
            </div>
          </div>

          {/* CARDS */}
          <div className="flex-1 flex flex-col gap-2 min-w-[80px]">
              <div className="bg-black/20 p-1.5 rounded h-full border border-white/5">
                  <div className="text-[10px] text-gray-400 uppercase font-bold mb-1 border-b border-white/10">Majors</div>
                  <div className="flex flex-wrap gap-1 content-start">
                      {player.majors.length === 0 && <span className="text-[10px] text-gray-600 italic">None</span>}
                      {player.majors.map(m => (
                          <div key={m.id} onClick={() => onMajorClick && onMajorClick(m)} className="w-8 h-10 bg-orange-700 border border-orange-400 rounded-sm text-[10px] flex flex-col items-center justify-center text-white cursor-help hover:scale-110 transition-transform shadow-sm leading-none text-center" title={m.name}>
                              <span className="scale-75">{m.name.substring(0, 2)}</span>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default PlayerPanel;