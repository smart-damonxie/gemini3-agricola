
import React, { useState, useEffect, useRef } from 'react';
import { useGameLogic } from './hooks/useGameLogic';
import { BASE_ACTIONS, MAX_ROUNDS } from './constants';
import ActionSlot from './components/ActionSlot';
import PlayerPanel from './components/PlayerPanel';
import ScoringTable from './components/ScoringTable';
import RoundTracker from './components/RoundTracker';
import TestPanel from './components/TestPanel';
import AnimalManager from './components/AnimalManager';
import GameOverModal from './components/GameOverModal';
import MajorGallery from './components/MajorGallery';
import { calculateAllocation } from './utils/gameLogic';
import { Player } from './types';
// replaced: import { toggleMute, isMuted } from './utils/sound';

const App: React.FC = () => {
  const { 
    gameState, 
    players, 
    logs, 
    clickAction, 
    cancelMode, 
    handleFarmClick, 
    handleFenceClick, 
    confirmModeAction,
    switchTool,
    toggleSeed,
    setSubAction,
    selectMajor,
    renovate,
    viewingCard,
    openCardDetail,
    closeCardDetail,
    adjustHarvest,
    resetHarvest,
    confirmHarvest,
    toggleConversion,
    adjustConversion,
    confirmConversion,
    isAdjustingAnimals,
    toggleAnimalManager,
    saveAnimalAssignment,
    startGame,
    adjustBake,
    discardAnimal,
    cookOverflow,
    cookFromManager,
    discardFromManager,
    confirmOverflowEndTurn,
    resetOverflow,
    confirmFeedPhase,
    resetFeed,
    debug,
    // Audio props from useGameLogic
    playSound,
    toggleMute,
    isMuted
  } = useGameLogic();

  const [showMajorGallery, setShowMajorGallery] = useState(false);
  const [showScoring, setShowScoring] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);
  // removed: const [muted, setMuted] = useState(isMuted());
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  let activePlayer = players[(gameState.startPlayer + gameState.turnIdx) % 4];
  if (gameState.harvestPhase && gameState.harvestState) {
      activePlayer = players[gameState.harvestState.queue[gameState.harvestState.currentIdx]];
  }
  if (gameState.turnPhase === 'overflow' && gameState.overflowPlayer !== null) {
      activePlayer = players[gameState.overflowPlayer];
  }

  const getActionDetails = (actId: string) => {
    return gameState.baseActions.find(a => a.id === actId) || gameState.roundCards.find(a => a.id === actId);
  };

  const isConverting = activePlayer.type === 'human' && activePlayer.conversionTemp;
  const isHumanTurn = activePlayer.type === 'human' && !gameState.harvestPhase;
  const actionDetails = activePlayer.tempMode ? getActionDetails(activePlayer.tempMode.actId) : null;
  const humanPlayer = players.find(p => p.type === 'human');
  const hasBaker = activePlayer.majors.some(m => m.bakeRate || m.specialBake);
  const isFeedPhase = gameState.harvestSubPhase === 'feed' && activePlayer.type === 'human';

  const getStage = (r: number) => {
      if (r <= 4) return 1;
      if (r <= 7) return 2;
      if (r <= 9) return 3;
      if (r <= 11) return 4;
      if (r <= 13) return 5;
      return 6;
  };

  const handleToggleMute = () => {
      toggleMute();
      // No need to set local state, we use isMuted directly from hook
  };

  // Helper to check conversion capability
  const canConvert = (res: 'grain'|'veg'|'vegRaw'|'vegCook'|'sheep'|'boar'|'cow'|'reed'|'wood'|'clay') => {
      if (res === 'grain') return true; 
      if (res === 'veg' || res === 'vegRaw') return true;
      
      if (res === 'vegCook') {
           return activePlayer.majors.some(m => m.cook && m.cook.veg > 0);
      }

      if (['sheep', 'boar', 'cow'].includes(res)) {
          return activePlayer.majors.some(m => m.cook && m.cook[res as 'sheep'|'boar'|'cow']);
      }
      // Workshop conversions only allowed during FEED phase
      if (gameState.harvestSubPhase !== 'feed') return false;

      if (res === 'reed') {
          return activePlayer.majors.some(m => m.id === 'm6');
      }
      if (res === 'wood') {
          return activePlayer.majors.some(m => m.id === 'm7');
      }
      if (res === 'clay') {
          return activePlayer.majors.some(m => m.id === 'm8');
      }
      return false;
  };

  const getMaxVegCookRate = () => {
      let maxRate = 0;
      activePlayer.majors.forEach(m => {
          if (m.cook && m.cook.veg > maxRate) maxRate = m.cook.veg;
      });
      return maxRate;
  }

  return (
    <div className="min-h-screen bg-stone-900 text-stone-200 font-sans selection:bg-yellow-500/30 overflow-x-hidden">
      
      {/* HEADER */}
      <header className="bg-stone-800 border-b border-stone-700 p-3 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-yellow-500 tracking-tight hidden sm:block">Agricola Lite</h1>
            <RoundTracker currentRound={gameState.round} />
          </div>

          {/* FEED PHASE BANNER */}
          {isFeedPhase && (
               <div className="absolute left-1/2 transform -translate-x-1/2 top-2 bg-orange-900/90 border-2 border-orange-500 text-white px-6 py-2 rounded-lg shadow-xl animate-bounce-short flex items-center gap-4 z-50">
                   <div className="flex flex-col items-center">
                       <span className="text-[10px] text-orange-300 uppercase font-bold tracking-wider">Feeding Phase</span>
                       <span className="text-sm font-bold">Food Needed: <span className="text-yellow-400">{activePlayer.res.maxWorkers * 2}</span></span>
                   </div>
                   <div className="h-8 w-px bg-orange-700"></div>
                   <div className="flex flex-col items-center">
                       <span className="text-[10px] text-gray-400 uppercase">Available</span>
                       <span className={`text-xl font-bold ${activePlayer.res.food < activePlayer.res.maxWorkers * 2 ? 'text-red-400' : 'text-green-400'}`}>{activePlayer.res.food}</span>
                   </div>
                   <div className="h-8 w-px bg-orange-700"></div>
                   <div className="flex gap-2">
                       <button 
                           onClick={resetFeed} 
                           className="bg-stone-700 hover:bg-stone-600 text-stone-200 font-bold py-1 px-3 rounded shadow text-xs uppercase"
                       >
                           ↺ Reset Actions
                       </button>
                       <button 
                           onClick={confirmFeedPhase} 
                           className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-1 px-4 rounded shadow text-xs uppercase"
                       >
                           Pay Food
                       </button>
                   </div>
               </div>
          )}
          
          <div className="flex items-center gap-4">
            {/* ACTION INTERACTION OVERLAY */}
            {activePlayer.tempMode && activePlayer.type === 'human' && (
                <div className="animate-fadeIn">
                    <div className="bg-stone-800/95 border-2 border-yellow-600 px-5 py-1.5 shadow-2xl rounded-[30px] flex items-center gap-3 backdrop-blur-sm">
                    
                    <div className="flex flex-col border-r border-stone-600 pr-4">
                        <span className="text-[9px] text-yellow-500 uppercase font-bold tracking-wider leading-none">Action</span>
                        <span className="text-sm font-bold text-white whitespace-nowrap">
                            {activePlayer.tempMode.mode === 'sow_bake_choice' ? 'Sow/Bake' : 
                            activePlayer.tempMode.mode === 'bake_immediate' ? 'Bake' :
                            activePlayer.tempMode.mode === 'plow_sow' ? 'Plow + Sow' :
                            activePlayer.tempMode.mode === 'simple' ? 'Confirm?' :
                            actionDetails?.name || activePlayer.tempMode.mode}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        {activePlayer.tempMode.mode === 'build_menu' && (
                            <div className="flex bg-stone-900 rounded-full p-0.5 gap-1">
                                <button 
                                    onClick={() => switchTool('room')}
                                    className={`px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 ${activePlayer.tempMode.currentTool === 'room' ? 'bg-blue-600 text-white' : 'text-stone-400 hover:text-white'}`}
                                >
                                    🏠 Room
                                </button>
                                <button 
                                    onClick={() => switchTool('stable')}
                                    className={`px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 ${activePlayer.tempMode.currentTool === 'stable' ? 'bg-orange-600 text-white' : 'text-stone-400 hover:text-white'}`}
                                >
                                    🏚️ Stable
                                </button>
                            </div>
                        )}

                        {activePlayer.tempMode.mode === 'plow_sow' && (
                            <div className="flex items-center gap-2">
                                <div className="flex bg-stone-900 rounded-full p-0.5 gap-1">
                                    <button 
                                        onClick={() => setSubAction('plow')}
                                        className={`px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 ${activePlayer.tempMode.subAction === 'plow' ? 'bg-green-700 text-white ring-1 ring-white' : 'text-stone-400 hover:text-white'}`}
                                    >
                                        🚜 Plow
                                    </button>
                                    <button 
                                        onClick={() => setSubAction('sow')}
                                        className={`px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 ${activePlayer.tempMode.subAction === 'sow' ? 'bg-yellow-700 text-white ring-1 ring-white' : 'text-stone-400 hover:text-white'}`}
                                    >
                                        🌱 Sow
                                    </button>
                                </div>
                                {activePlayer.tempMode.subAction === 'sow' && (
                                    <div className="flex bg-stone-900 rounded-full p-0.5 gap-1">
                                        <button 
                                            onClick={() => toggleSeed('grain')}
                                            className={`px-2 py-1 rounded-full text-[10px] font-bold ${activePlayer.tempMode.currentSeed === 'grain' ? 'bg-yellow-600 text-white' : 'text-stone-400'}`}
                                        >
                                            🌾
                                        </button>
                                        <button 
                                            onClick={() => toggleSeed('veg')}
                                            className={`px-2 py-1 rounded-full text-[10px] font-bold ${activePlayer.tempMode.currentSeed === 'veg' ? 'bg-orange-600 text-white' : 'text-stone-400'}`}
                                        >
                                            🥕
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {activePlayer.tempMode.mode === 'sow' && (
                            <div className="flex bg-stone-900 rounded-full p-0.5 gap-1">
                                <button 
                                    onClick={() => toggleSeed('grain')}
                                    className={`px-2 py-1 rounded-full text-[10px] font-bold ${activePlayer.tempMode.currentSeed === 'grain' ? 'bg-yellow-600 text-white' : 'text-stone-400'}`}
                                >
                                    🌾
                                </button>
                                <button 
                                    onClick={() => toggleSeed('veg')}
                                    className={`px-2 py-1 rounded-full text-[10px] font-bold ${activePlayer.tempMode.currentSeed === 'veg' ? 'bg-orange-600 text-white' : 'text-stone-400'}`}
                                >
                                    🥕
                                </button>
                            </div>
                        )}

                        {/* Unified Sow/Bake UI */}
                        {activePlayer.tempMode.mode === 'sow_bake_choice' && (
                            <div className="flex gap-4 items-center">
                                {/* Sow Controls */}
                                <div className="flex bg-stone-900 rounded-full p-0.5 gap-1 border border-stone-600/50">
                                    <button onClick={() => toggleSeed('grain')} className={`px-2 py-0.5 rounded-full text-[10px] ${activePlayer.tempMode.currentSeed === 'grain' ? 'bg-yellow-600 text-white' : 'text-stone-400'}`}>🌾 Grain</button>
                                    <button onClick={() => toggleSeed('veg')} className={`px-2 py-0.5 rounded-full text-[10px] ${activePlayer.tempMode.currentSeed === 'veg' ? 'bg-orange-600 text-white' : 'text-stone-400'}`}>🥕 Veg</button>
                                </div>
                                
                                <div className="w-px h-6 bg-stone-600"></div>

                                {/* Bake Controls */}
                                {hasBaker ? (
                                    <div className="flex flex-col gap-1 items-start">
                                        {activePlayer.majors.map(m => {
                                            if (!m.bakeRate && !m.specialBake) return null;
                                            const rateDisplay = m.specialBake 
                                                ? `1🌾→${m.specialBake.out}🍖`
                                                : `1🌾→${m.bakeRate}🍖`;
                                            const limitDisplay = m.specialBake?.limit ? `Max ${m.specialBake.limit}` : '';
                                            const count = activePlayer.tempMode?.bakeTargets?.[m.id] || 0;
                                            
                                            return (
                                                <div key={m.id} className="flex items-center gap-2 bg-stone-900/80 px-2 py-0.5 rounded-full border border-stone-600/50">
                                                    <span className="text-[10px] text-orange-200 font-bold">{m.name.substring(0, 10)}..</span>
                                                    <span className="text-[9px] text-gray-400">{rateDisplay} {limitDisplay}</span>
                                                    <div className="flex items-center ml-1">
                                                        <button onClick={() => adjustBake(m.id, -1)} className="w-4 h-4 bg-stone-700 hover:bg-stone-600 rounded-full flex items-center justify-center text-[10px] font-bold">-</button>
                                                        <span className="text-white font-bold text-[10px] w-5 text-center">{count}</span>
                                                        <button onClick={() => adjustBake(m.id, 1)} className="w-4 h-4 bg-stone-700 hover:bg-stone-600 rounded-full flex items-center justify-center text-[10px] font-bold">+</button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1 bg-stone-900/50 p-0.5 px-2 rounded-full border border-stone-700/50 grayscale opacity-50 cursor-not-allowed" title="You need an oven/fireplace major improvement to bake bread">
                                        <span className="text-[10px] text-gray-500 font-bold mr-1">Bake:</span>
                                        <span className="text-xs text-gray-600">Needs Oven</span>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* IMMEDIATE BAKE UI */}
                        {activePlayer.tempMode.mode === 'bake_immediate' && activePlayer.tempMode.bakeTargets && (
                            <div className="flex flex-col gap-1 items-center">
                                {Object.entries(activePlayer.tempMode.bakeTargets).map(([mId, count]) => {
                                    const m = activePlayer.majors.find(mj => mj.id === mId);
                                    if (!m) return null;
                                    const rateDisplay = m.specialBake 
                                        ? `1🌾→${m.specialBake.out}🍖`
                                        : `1🌾→${m.bakeRate}🍖`;
                                    const limitDisplay = m.specialBake?.limit ? `Max ${m.specialBake.limit}` : '';

                                    return (
                                        <div key={m.id} className="flex items-center gap-2 bg-stone-900/80 px-2 py-0.5 rounded-full border border-orange-500">
                                            <span className="text-[10px] text-orange-200 font-bold">{m.name}</span>
                                            <span className="text-[9px] text-gray-400">{rateDisplay} {limitDisplay}</span>
                                            <div className="flex items-center ml-1">
                                                <button onClick={() => adjustBake(m.id, -1)} className="w-4 h-4 bg-stone-700 hover:bg-stone-600 rounded-full flex items-center justify-center text-[10px] font-bold">-</button>
                                                <span className="text-white font-bold text-[10px] w-5 text-center">{count}</span>
                                                <button onClick={() => adjustBake(m.id, 1)} className="w-4 h-4 bg-stone-700 hover:bg-stone-600 rounded-full flex items-center justify-center text-[10px] font-bold">+</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {(activePlayer.tempMode.mode === 'major' || (activePlayer.tempMode.mode === 'reno_major' && activePlayer.houseType !== 'wood')) && (
                            <div className="absolute top-12 left-0 z-50 flex flex-col gap-1 max-h-48 overflow-y-auto w-48 border border-stone-600 rounded bg-stone-900 p-1 scrollbar-thin shadow-xl">
                                {gameState.majors.map(m => (
                                    <button 
                                        key={m.id} 
                                        onClick={() => selectMajor(m.id)}
                                        className={`text-left text-xs px-2 py-1 rounded flex justify-between items-center ${activePlayer.tempMode?.selectedMajorId === m.id ? 'bg-yellow-700 text-white' : 'hover:bg-stone-800 text-stone-300'}`}
                                    >
                                        <span>{m.name}</span>
                                        <span className="text-[9px] opacity-70">{m.score}VP</span>
                                    </button>
                                ))}
                                {gameState.majors.length === 0 && <span className="text-xs text-gray-500 italic p-1">No majors left</span>}
                            </div>
                        )}

                        {(activePlayer.tempMode.mode === 'reno_major' || activePlayer.tempMode.mode === 'reno_fence') && activePlayer.houseType !== 'stone' && (
                            <button 
                                onClick={renovate}
                                className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-full font-bold shadow text-[10px] leading-none"
                            >
                                Renovate
                            </button>
                        )}
                        
                        <div className="h-4 w-px bg-stone-600 mx-1"></div>

                        <button 
                            onClick={cancelMode} 
                            className="px-3 py-1 bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-full font-bold transition-colors text-[10px] uppercase tracking-wide"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={() => confirmModeAction(activePlayer.id)} 
                            className="px-4 py-1 bg-green-600 hover:bg-green-500 text-white rounded-full font-bold shadow-lg transform hover:scale-105 transition-all text-[10px] uppercase tracking-wide"
                        >
                            Confirm
                        </button>
                    </div>
                </div>
                </div>
            )}

            {/* MINIMALIST CONTROL TOOLBAR */}
            <div className="flex items-center gap-1 bg-stone-900/50 p-1 rounded-full border border-stone-700/50 backdrop-blur-sm">
                <button 
                    onClick={handleToggleMute} 
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'text-red-400 hover:bg-red-900/30' : 'text-green-400 hover:bg-green-900/30'}`}
                    title={isMuted ? 'Unmute' : 'Mute'}
                >
                    {isMuted ? '🔇' : '🔊'}
                </button>
                <div className="w-px h-4 bg-stone-700"></div>
                <button onClick={() => setShowMajorGallery(true)} className="w-8 h-8 rounded-full flex items-center justify-center text-orange-400 hover:bg-orange-900/30 hover:text-orange-300 transition-colors" title="Majors Gallery">
                    🃏
                </button>
                <button onClick={() => setShowScoring(true)} className="w-8 h-8 rounded-full flex items-center justify-center text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 transition-colors" title="Scoring Rules">
                    📊
                </button>
                <button onClick={() => setIsTestMode(true)} className="w-8 h-8 rounded-full flex items-center justify-center text-purple-400 hover:bg-purple-900/30 hover:text-purple-300 transition-colors" title="Test Panel">
                    🧪
                </button>
                <div className="w-px h-4 bg-stone-700"></div>
                <button onClick={startGame} className="w-8 h-8 rounded-full flex items-center justify-center text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors" title="Restart Game">
                    🔄
                </button>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN GRID LAYOUT: ACTIONS (Left 5 cols) | PLAYERS (Right 7 cols) */}
      <main className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: ACTIONS BOARD (Wider) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Section 1: Basic Actions */}
          <div className="bg-stone-800/50 p-3 rounded-xl border border-stone-700 shadow-inner">
            <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 border-b border-stone-700 pb-1">
                Base Actions
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {gameState.baseActions.map(act => (
                <ActionSlot 
                  key={act.id} 
                  action={act} 
                  occupiedBy={gameState.occupied[act.id] !== undefined ? players.find(p => p.id === gameState.occupied[act.id]) : undefined}
                  onClick={() => clickAction(act.id)}
                />
              ))}
            </div>
          </div>

          {/* Section 2: Round Actions (1-14) */}
          <div className="bg-stone-800/50 p-3 rounded-xl border border-stone-700 shadow-inner">
            <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 border-b border-stone-700 pb-1">
                Round Actions
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({length: 14}).map((_, i) => {
                  const roundNum = i + 1;
                  const card = gameState.roundCards[i]; 
                  const isRevealed = card !== undefined;
                  const futureRes = gameState.futureResources[roundNum];
                  
                  if (isRevealed) {
                       return (
                           <ActionSlot 
                              key={card.id} 
                              action={card} 
                              occupiedBy={gameState.occupied[card.id] !== undefined ? players.find(p => p.id === gameState.occupied[card.id]) : undefined}
                              onClick={() => clickAction(card.id)}
                              futureResources={futureRes}
                           />
                       );
                  } else {
                      return (
                           <ActionSlot 
                              key={`round-${roundNum}`}
                              action={{ id: `future-${roundNum}`, name: `Round ${roundNum}`, desc: `Stage ${getStage(roundNum)}`, type: 'special' }}
                              isFuture={true}
                              onClick={() => {}}
                              futureResources={futureRes}
                           />
                      );
                  }
              })}
            </div>
          </div>

          {/* Game Log */}
          <div ref={logRef} className="bg-stone-900 rounded-lg p-2 h-40 overflow-y-auto font-mono text-xs border border-stone-700 shadow-inset scrollbar-thin scrollbar-thumb-stone-600">
             {logs.length === 0 && <div className="text-gray-600 italic text-center mt-4">Game log is empty</div>}
             {logs.map(l => (
               <div key={l.id} className="mb-1 break-words" style={{color: l.color}}>
                 <span className="text-stone-500 mr-2">[{new Date(l.id).toLocaleTimeString([], {hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit'})}]</span>
                 {l.msg}
               </div>
             ))}
          </div>
        </div>

        {/* RIGHT COLUMN: PLAYERS (Narrower) */}
        <div className="lg:col-span-7 space-y-4">
           {players.map(p => (
             <PlayerPanel 
               key={p.id} 
               player={p} 
               isActive={activePlayer.id === p.id}
               isNextStart={gameState.nextStartPlayer === p.id}
               onFarmClick={(tileIdx) => handleFarmClick(p.id, tileIdx)}
               onFenceClick={p.id === humanPlayer?.id ? (tileIdx, side) => handleFenceClick(p.id, tileIdx, side) : undefined}
               onMajorClick={(m) => openCardDetail(m)}
               onConvertClick={() => toggleConversion()}
               onAdjustClick={p.type === 'human' ? toggleAnimalManager : undefined}
               isOverflowing={gameState.turnPhase === 'overflow' && gameState.overflowPlayer === p.id}
               onDiscard={p.type === 'human' ? discardAnimal : undefined}
               onCook={p.type === 'human' ? cookOverflow : undefined}
               onConfirmOverflow={p.type === 'human' ? confirmOverflowEndTurn : undefined}
               onResetOverflow={p.type === 'human' ? resetOverflow : undefined}
             />
           ))}
        </div>

      </main>

      {/* OVERLAYS & MODALS */}
      {showScoring && <ScoringTable onClose={() => setShowScoring(false)} />}
      {showMajorGallery && <MajorGallery availableMajors={gameState.majors} onClose={() => setShowMajorGallery(false)} />}
      <TestPanel isOpen={isTestMode} onClose={() => setIsTestMode(false)} gameState={gameState} players={players} debug={debug} />
      {gameState.gameOver && <GameOverModal players={players} onRestart={startGame} />}

      {isAdjustingAnimals && humanPlayer && (
          <AnimalManager 
              player={humanPlayer} 
              onClose={toggleAnimalManager} 
              onSave={(assignments) => saveAnimalAssignment(humanPlayer.id, assignments)} 
              onCook={cookFromManager}
              onDiscard={discardFromManager}
              pendingBreeding={humanPlayer.pendingBreeding || undefined}
              playSound={playSound}
          />
      )}

      {viewingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={closeCardDetail}>
           <div className="bg-orange-100 text-stone-900 p-6 rounded-lg max-w-sm w-full border-4 border-orange-800 shadow-2xl relative" onClick={e => e.stopPropagation()}>
               <button onClick={closeCardDetail} className="absolute top-2 right-2 text-stone-500 hover:text-stone-900 font-bold">✕</button>
               <h3 className="text-xl font-bold mb-2 border-b border-orange-300 pb-2">{viewingCard.name}</h3>
               
               {/* Card Image */}
               <div className="mb-4 rounded-lg overflow-hidden border-2 border-orange-300 shadow-md">
                   <img 
                        src={`/assets/majors/${viewingCard.id}.png`} 
                        alt={viewingCard.name}
                        className="w-full h-auto object-cover"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            // Show generic placeholder text if image fails
                            e.currentTarget.parentElement?.classList.add('bg-orange-200', 'flex', 'items-center', 'justify-center', 'h-40');
                            e.currentTarget.parentElement!.innerHTML = '<span class="text-orange-800 font-bold opacity-50">No Image</span>';
                        }}
                   />
               </div>

               <div className="space-y-2 text-sm">
                   <p><span className="font-bold">Cost:</span> {Object.entries(viewingCard.cost).map(([k,v]) => `${v} ${k}`).join(', ')}</p>
                   <p><span className="font-bold">Score:</span> {viewingCard.score} VP</p>
                   <p className="italic text-stone-700 bg-orange-200/50 p-2 rounded">{viewingCard.desc}</p>
                   {viewingCard.type === 'cook' && <p className="text-xs text-orange-800 mt-2">Allows cooking animals into food.</p>}
                   {viewingCard.type === 'bake' && <p className="text-xs text-orange-800 mt-2">Allows baking grain into food.</p>}
               </div>
           </div>
        </div>
      )}

      {/* NEW CONVERT UI MODAL */}
      {isConverting && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
             <div className="bg-stone-800 border-2 border-yellow-600 rounded-xl p-6 max-w-sm w-full shadow-2xl">
                 <h2 className="text-xl font-bold text-yellow-500 mb-2">Anytime Conversion</h2>
                 <div className="grid grid-cols-[1fr_80px_1fr] gap-2 mb-2 text-xs text-gray-400 border-b border-gray-700 pb-1">
                     <span>Resource</span>
                     <span className="text-center">Your Supply</span>
                     <span className="text-right">Convert</span>
                 </div>
                 
                 <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                     {/* Standard Resources */}
                     {['grain','veg','sheep','boar','cow'].map(res => {
                         // Skip veg here, will handle specifically below to split raw/cook
                         if (res === 'veg') return null;

                         const allowed = canConvert(res as any);
                         const count = activePlayer.animals[res as any] || activePlayer.res[res as any] || 0;
                         if (!allowed && count === 0) return null;

                         return (
                             <div key={res} className={`grid grid-cols-[1fr_80px_1fr] items-center bg-stone-900 p-2 rounded ${!allowed ? 'opacity-50' : ''}`}>
                                 <div className="flex flex-col">
                                     <span className="capitalize text-stone-300 font-bold">{res}</span>
                                     <span className="text-[9px] text-gray-500">Cook</span>
                                 </div>
                                 <div className="text-center font-mono text-white">{count}</div>
                                 <div className="flex items-center justify-end gap-2">
                                     <button disabled={!allowed} onClick={() => adjustConversion(res as any, -1)} className="w-6 h-6 bg-stone-700 rounded hover:bg-stone-600 disabled:opacity-30 text-white font-bold">-</button>
                                     <span className="w-4 text-center text-yellow-400 font-bold">{(activePlayer.conversionTemp as any)[res]}</span>
                                     <button disabled={!allowed} onClick={() => adjustConversion(res as any, 1)} className="w-6 h-6 bg-stone-700 rounded hover:bg-stone-600 disabled:opacity-30 text-white font-bold">+</button>
                                 </div>
                             </div>
                         );
                     })}

                     {/* Vegetables Split */}
                     {activePlayer.res.veg > 0 && (
                         <>
                             {/* Eat Raw */}
                             <div className="grid grid-cols-[1fr_80px_1fr] items-center bg-stone-900 p-2 rounded">
                                 <div className="flex flex-col">
                                     <span className="capitalize text-stone-300 font-bold">Veg (Raw)</span>
                                     <span className="text-[9px] text-gray-500">1 Food</span>
                                 </div>
                                 <div className="text-center font-mono text-white">{activePlayer.res.veg}</div>
                                 <div className="flex items-center justify-end gap-2">
                                     <button onClick={() => adjustConversion('vegRaw', -1)} className="w-6 h-6 bg-stone-700 rounded hover:bg-stone-600 text-white font-bold">-</button>
                                     <span className="w-4 text-center text-yellow-400 font-bold">{activePlayer.conversionTemp?.vegRaw || 0}</span>
                                     <button onClick={() => adjustConversion('vegRaw', 1)} className="w-6 h-6 bg-stone-700 rounded hover:bg-stone-600 text-white font-bold">+</button>
                                 </div>
                             </div>
                             {/* Cook */}
                             {canConvert('vegCook') && (
                                <div className="grid grid-cols-[1fr_80px_1fr] items-center bg-stone-900 p-2 rounded border border-orange-900/50">
                                    <div className="flex flex-col">
                                        <span className="capitalize text-stone-300 font-bold">Veg (Cook)</span>
                                        <span className="text-[9px] text-orange-400">{getMaxVegCookRate()} Food</span>
                                    </div>
                                    <div className="text-center font-mono text-white">{activePlayer.res.veg}</div>
                                    <div className="flex items-center justify-end gap-2">
                                        <button onClick={() => adjustConversion('vegCook', -1)} className="w-6 h-6 bg-stone-700 rounded hover:bg-stone-600 text-white font-bold">-</button>
                                        <span className="w-4 text-center text-yellow-400 font-bold">{activePlayer.conversionTemp?.vegCook || 0}</span>
                                        <button onClick={() => adjustConversion('vegCook', 1)} className="w-6 h-6 bg-stone-700 rounded hover:bg-stone-600 text-white font-bold">+</button>
                                    </div>
                                </div>
                             )}
                         </>
                     )}

                     {/* Workshops */}
                     {['reed','wood','clay'].map(res => {
                         const allowed = canConvert(res as any);
                         const count = activePlayer.res[res as any];
                         const used = (activePlayer.workshopsUsed as any)[res]; // Check usage
                         
                         if (!allowed && count === 0) return null;
                         if (!allowed) return null; // Only show if allowed (Feed phase)

                         const currentVal = (activePlayer.conversionTemp as any)[res];
                         const limitReached = currentVal >= 1 || used;

                         return (
                             <div key={res} className={`grid grid-cols-[1fr_80px_1fr] items-center bg-stone-900 p-2 rounded ${limitReached ? 'opacity-60' : ''}`}>
                                 <div className="flex flex-col">
                                     <span className="capitalize text-stone-300 font-bold">{res}</span>
                                     <span className="text-[9px] text-blue-400">Workshop (Max 1)</span>
                                 </div>
                                 <div className="text-center font-mono text-white">{count}</div>
                                 <div className="flex items-center justify-end gap-2">
                                     {used ? (
                                        <span className="text-xs font-bold text-red-400 bg-red-900/50 px-2 py-0.5 rounded">Used</span>
                                     ) : (
                                         <>
                                             <button onClick={() => adjustConversion(res as any, -1)} className="w-6 h-6 bg-stone-700 rounded hover:bg-stone-600 text-white font-bold">-</button>
                                             <span className="w-4 text-center text-yellow-400 font-bold">{currentVal}</span>
                                             <button disabled={limitReached} onClick={() => adjustConversion(res as any, 1)} className="w-6 h-6 bg-stone-700 rounded hover:bg-stone-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold">+</button>
                                         </>
                                     )}
                                 </div>
                             </div>
                         );
                     })}
                 </div>
                 <div className="mt-6 flex justify-end gap-3">
                     <button onClick={() => toggleConversion()} className="px-4 py-2 text-sm text-stone-400 hover:text-white">Cancel</button>
                     <button onClick={confirmConversion} className="px-6 py-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded shadow-lg">Convert</button>
                 </div>
             </div>
          </div>
      )}

    </div>
  );
};

export default App;
