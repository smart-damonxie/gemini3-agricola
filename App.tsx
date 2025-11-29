
import React, { useState } from 'react';
import { useGameLogic } from './hooks/useGameLogic';
import { BASE_ACTIONS, MAX_ROUNDS } from './constants';
import ActionSlot from './components/ActionSlot';
import PlayerPanel from './components/PlayerPanel';
import ScoringTable from './components/ScoringTable';
import RoundTracker from './components/RoundTracker';
import TestPanel from './components/TestPanel';
import AnimalManager from './components/AnimalManager';
import { calculateAllocation } from './utils/gameLogic';
import { Player } from './types';

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
    confirmOverflowEndTurn,
    debug
  } = useGameLogic();

  const [showMajorList, setShowMajorList] = useState(false);
  const [showScoring, setShowScoring] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);

  let activePlayer = players[(gameState.startPlayer + gameState.turnIdx) % 4];
  if (gameState.harvestPhase && gameState.harvestState) {
      activePlayer = players[gameState.harvestState.queue[gameState.harvestState.currentIdx]];
  }
  if (gameState.turnPhase === 'overflow' && gameState.overflowPlayer !== null) {
      activePlayer = players[gameState.overflowPlayer];
  }

  const getActionDetails = (actId: string) => {
    return BASE_ACTIONS.find(a => a.id === actId) || gameState.roundCards.find(a => a.id === actId);
  };

  const isHumanHarvest = gameState.harvestPhase && activePlayer.type === 'human' && activePlayer.harvestTemp;
  const isConverting = activePlayer.type === 'human' && activePlayer.conversionTemp;
  const isHumanTurn = activePlayer.type === 'human' && !gameState.harvestPhase;
  const actionDetails = activePlayer.tempMode ? getActionDetails(activePlayer.tempMode.actId) : null;
  const humanPlayer = players.find(p => p.type === 'human');
  const bakeMajorCard = activePlayer.tempMode?.mode === 'bake_immediate' 
      ? activePlayer.majors.find(m => m.id === activePlayer.tempMode!.selectedMajorId) 
      : null;

  const getStage = (r: number) => {
      if (r <= 4) return 1;
      if (r <= 7) return 2;
      if (r <= 9) return 3;
      if (r <= 11) return 4;
      if (r <= 13) return 5;
      return 6;
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-200 font-sans selection:bg-yellow-500/30 overflow-x-hidden">
      
      {/* HEADER */}
      <header className="bg-stone-800 border-b border-stone-700 p-3 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-yellow-500 tracking-tight">Agricola Lite</h1>
            <RoundTracker currentRound={gameState.round} />
          </div>
          
          {/* ACTION INTERACTION OVERLAY - MOVED TO HEADER */}
          {activePlayer.tempMode && activePlayer.type === 'human' && (
             <div className="flex-1 mx-4 flex justify-center animate-fadeIn">
                <div className="bg-stone-800/95 border-2 border-yellow-600 px-6 py-2 shadow-2xl rounded-full flex items-center gap-4 backdrop-blur-sm">
                  
                  <div className="flex flex-col border-r border-stone-600 pr-4">
                      <span className="text-[9px] text-yellow-500 uppercase font-bold tracking-wider leading-none">Action</span>
                      <span className="text-sm font-bold text-white whitespace-nowrap">
                          {activePlayer.tempMode.mode === 'sow_bake_choice' ? 'Sow/Bake' : 
                           activePlayer.tempMode.mode === 'bake_immediate' ? 'Bake' :
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

                      {(activePlayer.tempMode.mode === 'sow' || activePlayer.tempMode.mode === 'plow_sow') && (
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

                      {/* Unified Sow/Bake UI - Shows BOTH controls if player has oven */}
                      {activePlayer.tempMode.mode === 'sow_bake_choice' && (
                          <div className="flex gap-4 items-center">
                              {/* Sow Controls */}
                              <div className="flex bg-stone-900 rounded-full p-0.5 gap-1 border border-stone-600/50">
                                   <button onClick={() => toggleSeed('grain')} className={`px-2 py-0.5 rounded-full text-[10px] ${activePlayer.tempMode.currentSeed === 'grain' ? 'bg-yellow-600 text-white' : 'text-stone-400'}`}>🌾 Grain</button>
                                   <button onClick={() => toggleSeed('veg')} className={`px-2 py-0.5 rounded-full text-[10px] ${activePlayer.tempMode.currentSeed === 'veg' ? 'bg-orange-600 text-white' : 'text-stone-400'}`}>🥕 Veg</button>
                              </div>
                              
                              <div className="w-px h-6 bg-stone-600"></div>

                              {/* Bake Controls */}
                              <div className="flex items-center gap-1 bg-stone-900 p-0.5 px-2 rounded-full border border-stone-600/50">
                                  <span className="text-[10px] text-orange-400 font-bold mr-1">Bake:</span>
                                  <button onClick={() => adjustBake(-1)} className="w-4 h-4 bg-stone-700 hover:bg-stone-600 rounded-full flex items-center justify-center text-[10px]">-</button>
                                  <span className="text-white font-bold text-[10px] w-4 text-center">{activePlayer.tempMode.bakeTemp?.grain || 0}</span>
                                  <button onClick={() => adjustBake(1)} className="w-4 h-4 bg-stone-700 hover:bg-stone-600 rounded-full flex items-center justify-center text-[10px]">+</button>
                              </div>
                          </div>
                      )}
                      
                      {/* IMMEDIATE BAKE UI */}
                      {activePlayer.tempMode.mode === 'bake_immediate' && (
                           <div className="flex items-center gap-2 bg-stone-900 p-0.5 px-2 rounded-full">
                              <span className="text-[10px] font-bold text-orange-300">Grain:</span>
                              <button onClick={() => adjustBake(-1)} className="w-4 h-4 bg-stone-700 hover:bg-stone-600 rounded-full flex items-center justify-center font-bold text-[10px]">-</button>
                              <span className="text-sm font-bold text-white w-4 text-center">{activePlayer.tempMode.bakeTemp?.grain || 0}</span>
                              <button onClick={() => adjustBake(1)} className="w-4 h-4 bg-stone-700 hover:bg-stone-600 rounded-full flex items-center justify-center font-bold text-[10px]">+</button>
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

                      {(activePlayer.tempMode.mode === 'reno_major' || activePlayer.tempMode.mode === 'reno_fence') && activePlayer.houseType === 'wood' && (
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

          <div className="flex items-center gap-2">
            <button onClick={() => setShowScoring(true)} className="px-3 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs border border-stone-600 transition-colors">
              📊 Scoring
            </button>
            <button onClick={() => setIsTestMode(true)} className="px-3 py-1 bg-purple-900/50 hover:bg-purple-800/50 text-purple-300 rounded text-xs border border-purple-800 transition-colors">
              🧪 Test
            </button>
            <button onClick={startGame} className="px-3 py-1 bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded text-xs border border-red-800 transition-colors">
              Restart
            </button>
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
              {BASE_ACTIONS.map(act => (
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
          <div className="bg-stone-900 rounded-lg p-2 h-40 overflow-y-auto font-mono text-xs border border-stone-700 shadow-inset scrollbar-thin scrollbar-thumb-stone-600">
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
               onConfirmOverflow={p.type === 'human' ? confirmOverflowEndTurn : undefined}
             />
           ))}
        </div>

      </main>

      {/* OVERLAYS & MODALS */}
      {showScoring && <ScoringTable onClose={() => setShowScoring(false)} />}
      <TestPanel isOpen={isTestMode} onClose={() => setIsTestMode(false)} gameState={gameState} players={players} debug={debug} />

      {isAdjustingAnimals && humanPlayer && (
          <AnimalManager 
              player={humanPlayer} 
              onClose={toggleAnimalManager} 
              onSave={saveAnimalAssignment} 
          />
      )}

      {viewingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={closeCardDetail}>
           <div className="bg-orange-100 text-stone-900 p-6 rounded-lg max-w-sm w-full border-4 border-orange-800 shadow-2xl relative" onClick={e => e.stopPropagation()}>
               <button onClick={closeCardDetail} className="absolute top-2 right-2 text-stone-500 hover:text-stone-900 font-bold">✕</button>
               <h3 className="text-xl font-bold mb-2 border-b border-orange-300 pb-2">{viewingCard.name}</h3>
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

      {isHumanHarvest && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur">
             <div className="bg-stone-800 border-2 border-orange-500 rounded-xl p-6 max-w-lg w-full shadow-2xl">
                 <h2 className="text-2xl font-bold text-orange-400 mb-2">
                     {gameState.harvestSubPhase === 'feed' ? '🍲 Feed Your Family' : '👶 Manage Animals'}
                 </h2>
                 {gameState.harvestSubPhase === 'feed' && (
                     <div className="space-y-4">
                         <div className="p-3 bg-stone-900 rounded text-center">
                             <div className="text-sm text-gray-400">Required Food</div>
                             <div className="text-3xl font-bold text-white">{activePlayer.res.maxWorkers * 2}</div>
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                             <div className="text-center"><div className="text-sm text-gray-400">Available</div><div className="text-xl font-bold text-yellow-500">{activePlayer.res.food}</div></div>
                             <div className="text-center"><div className="text-sm text-gray-400">Potential Gain</div><div className="text-xl font-bold text-green-500">+{ (activePlayer.harvestTemp?.grain||0) + (activePlayer.harvestTemp?.veg||0) + (activePlayer.harvestTemp?.sheep||0)*2 + (activePlayer.harvestTemp?.boar||0)*2 + (activePlayer.harvestTemp?.cow||0)*3 }</div></div>
                         </div>
                         <div className="space-y-2">
                             <div className="text-sm font-bold text-gray-300">Convert Resources:</div>
                             {['grain','veg','sheep','boar','cow'].map(res => {
                                 const resKey = res as 'grain'|'veg'|'sheep'|'boar'|'cow';
                                 const owned = resKey === 'grain' ? activePlayer.res.grain : resKey === 'veg' ? activePlayer.res.veg : activePlayer.animals[resKey as 'sheep'|'boar'|'cow'];
                                 return (
                                     <div key={res} className="flex justify-between items-center bg-stone-900 p-2 rounded">
                                         <div className="flex flex-col">
                                            <span className="capitalize text-stone-300 w-20 font-bold">{res}</span>
                                            <span className="text-[10px] text-stone-500">You have: {owned}</span>
                                         </div>
                                         <div className="flex items-center gap-3">
                                             <button onClick={() => adjustHarvest(resKey, -1)} className="w-6 h-6 bg-stone-700 rounded hover:bg-stone-600">-</button>
                                             <span className="w-8 text-center font-bold">{(activePlayer.harvestTemp as any)[res]}</span>
                                             <button onClick={() => adjustHarvest(resKey, 1)} className="w-6 h-6 bg-stone-700 rounded hover:bg-stone-600">+</button>
                                         </div>
                                     </div>
                                 );
                             })}
                         </div>
                     </div>
                 )}
                 {gameState.harvestSubPhase === 'breed' && (
                     <div className="space-y-4">
                         <p className="text-stone-300 text-sm">Convert excess animals to food.</p>
                         <div className="space-y-2">
                             {['sheep','boar','cow'].map(res => (
                                 <div key={res} className="flex justify-between items-center bg-stone-900 p-2 rounded">
                                     <span className="capitalize text-stone-300 w-20">{res}</span>
                                     <div className="flex items-center gap-3">
                                         <button onClick={() => adjustHarvest(res as any, -1)} className="w-6 h-6 bg-stone-700 rounded hover:bg-stone-600">-</button>
                                         <span className="w-8 text-center font-bold">{(activePlayer.harvestTemp as any)[res]}</span>
                                         <button onClick={() => adjustHarvest(res as any, 1)} className="w-6 h-6 bg-stone-700 rounded hover:bg-stone-600">+</button>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     </div>
                 )}
                 <div className="mt-6 flex justify-end gap-3">
                     <button onClick={resetHarvest} className="px-4 py-2 text-sm text-stone-400 hover:text-white">Reset</button>
                     <button onClick={confirmHarvest} className="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded shadow-lg">Confirm & Eat</button>
                 </div>
             </div>
        </div>
      )}

      {isConverting && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
             <div className="bg-stone-800 border-2 border-yellow-600 rounded-xl p-6 max-w-sm w-full shadow-2xl">
                 <h2 className="text-xl font-bold text-yellow-500 mb-4">Anytime Conversion</h2>
                 <div className="space-y-2">
                     {['grain','veg','sheep','boar','cow'].map(res => (
                         <div key={res} className="flex justify-between items-center bg-stone-900 p-2 rounded">
                             <span className="capitalize text-stone-300 w-16">{res}</span>
                             <div className="flex items-center gap-3">
                                 <button onClick={() => adjustConversion(res as any, -1)} className="w-6 h-6 bg-stone-700 rounded hover:bg-stone-600">-</button>
                                 <span className="w-6 text-center font-bold">{(activePlayer.conversionTemp as any)[res]}</span>
                                 <button onClick={() => adjustConversion(res as any, 1)} className="w-6 h-6 bg-stone-700 rounded hover:bg-stone-600">+</button>
                             </div>
                         </div>
                     ))}
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
