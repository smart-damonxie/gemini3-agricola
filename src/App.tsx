
import React, { useState } from 'react';
import { useGameLogic } from './hooks/useGameLogic';
import { BASE_ACTIONS } from './constants';
import ActionSlot from './components/ActionSlot';
import PlayerPanel from './components/PlayerPanel';
import ScoringTable from './components/ScoringTable';
import RoundTracker from './components/RoundTracker';
import TestPanel from './components/TestPanel';
import AnimalManager from './components/AnimalManager';
import { calculateAllocation } from './utils/gameLogic';

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
    debug
  } = useGameLogic();

  const [showMajorList, setShowMajorList] = useState(false);
  const [showScoring, setShowScoring] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);

  const activePlayer = players[(gameState.startPlayer + gameState.turnIdx) % 4];

  // Helper to find action name for simple mode
  const getActionDetails = (actId: string) => {
    return BASE_ACTIONS.find(a => a.id === actId) || gameState.roundCards.find(a => a.id === actId);
  };

  const isHumanHarvest = gameState.harvestPhase && activePlayer.type === 'human' && activePlayer.harvestTemp;
  const isConverting = activePlayer.type === 'human' && activePlayer.conversionTemp;
  const isHumanTurn = activePlayer.type === 'human' && !gameState.harvestPhase;
  const actionDetails = activePlayer.tempMode ? getActionDetails(activePlayer.tempMode.actId) : null;
  const humanPlayer = players.find(p => p.type === 'human');

  return (
    <div className="flex flex-col items-center p-2 max-w-[1600px] mx-auto pb-20">
      
      {/* Top Bar & Action Toolbar Area */}
      <div className="w-full max-w-6xl flex items-center gap-4 bg-black/40 p-3 rounded-lg mb-4 backdrop-blur-sm border border-white/10 relative z-50">
        
        {/* Round Tracker */}
        <RoundTracker currentRound={gameState.round} />

        {/* Scoring Rules Button */}
        <button 
            onClick={() => setShowScoring(true)}
            className="bg-stone-800 px-3 py-1.5 rounded-full font-bold shadow-lg border border-stone-600 text-yellow-500 hover:bg-stone-700 hover:text-yellow-400 transition-colors flex items-center gap-2 text-sm whitespace-nowrap"
        >
          📊 Rules
        </button>

        {/* Test Mode Toggle */}
        <button 
            onClick={() => setIsTestMode(true)}
            className="bg-red-900/40 px-3 py-1.5 rounded-full font-bold shadow-lg border border-red-800 text-red-400 hover:bg-red-800 hover:text-white transition-colors flex items-center gap-2 text-sm whitespace-nowrap"
        >
          🛠️ Test
        </button>

        {/* Action Toolbar - Now Oval and Top Left */}
        {isHumanTurn && activePlayer.tempMode && (
          <div className="flex-1 flex justify-start">
             <div className="relative flex items-center gap-3 bg-slate-800/95 px-4 py-1.5 rounded-full shadow-2xl border border-slate-500 animate-fadeIn text-sm">
                
                {/* Action Name */}
                <div className="font-bold text-sky-400 whitespace-nowrap border-r border-slate-600 pr-3">
                   {activePlayer.tempMode.mode === 'simple' ? actionDetails?.name : `Action: ${activePlayer.tempMode.mode}`}
                </div>

                {/* Controls Area */}
                <div className="flex items-center gap-2">
                    
                    {/* Build Tools */}
                    {activePlayer.tempMode.mode === 'build_menu' && (
                        <>
                            <button onClick={() => switchTool('room')} className={`px-2 py-0.5 rounded-full text-xs font-bold transition-colors ${activePlayer.tempMode.currentTool === 'room' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}>
                                🏠 Room
                            </button>
                            <button onClick={() => switchTool('stable')} className={`px-2 py-0.5 rounded-full text-xs font-bold transition-colors ${activePlayer.tempMode.currentTool === 'stable' ? 'bg-orange-600 text-white' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}>
                                🏚️ Stable
                            </button>
                        </>
                    )}

                    {/* Sowing Tools */}
                    {(activePlayer.tempMode.mode === 'sow' || activePlayer.tempMode.mode === 'plow_sow') && (
                        <>
                            <button onClick={() => toggleSeed('grain')} className={`px-2 py-0.5 rounded-full text-xs font-bold transition-colors ${activePlayer.tempMode.currentSeed === 'grain' ? 'bg-yellow-600 text-white' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}>
                                🌾 Grain ({activePlayer.res.grain})
                            </button>
                            <button onClick={() => toggleSeed('veg')} className={`px-2 py-0.5 rounded-full text-xs font-bold transition-colors ${activePlayer.tempMode.currentSeed === 'veg' ? 'bg-orange-600 text-white' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}>
                                🥕 Veg ({activePlayer.res.veg})
                            </button>
                        </>
                    )}

                    {/* Renovation */}
                    {(activePlayer.tempMode.mode === 'reno_major' || activePlayer.tempMode.mode === 'reno_fence') && (
                         <button onClick={renovate} className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-0.5 px-3 rounded-full shadow">
                             🔨 Renovate
                         </button>
                    )}

                    {/* Major Selection Dropdown Trigger */}
                    {(activePlayer.tempMode.mode === 'major' || activePlayer.tempMode.mode === 'reno_major') && (
                        <div className="relative">
                            <button 
                                onClick={() => setShowMajorList(!showMajorList)}
                                className={`px-3 py-0.5 rounded-full text-xs font-bold border flex items-center gap-1 ${activePlayer.tempMode.selectedMajorId ? 'bg-yellow-800 border-yellow-500 text-yellow-100' : 'bg-slate-700 border-slate-500 text-gray-300'}`}
                            >
                                {activePlayer.tempMode.selectedMajorId 
                                    ? `Selected: ${gameState.majors.find(m => m.id === activePlayer.tempMode?.selectedMajorId)?.name.substring(0, 8)}...` 
                                    : "Select Improvement ▾"}
                            </button>
                            
                            {/* Dropdown List */}
                            {showMajorList && (
                                <div className="absolute top-full left-0 mt-2 w-64 max-h-[300px] overflow-y-auto bg-slate-900 rounded-lg border border-slate-600 shadow-xl p-2 z-[60]">
                                    {gameState.majors.map(m => (
                                        <div 
                                            key={m.id}
                                            onClick={() => { selectMajor(m.id); setShowMajorList(false); }}
                                            className={`
                                                cursor-pointer p-2 mb-1 rounded text-xs border transition-colors
                                                ${activePlayer.tempMode?.selectedMajorId === m.id 
                                                    ? 'bg-yellow-900/60 border-yellow-500 text-yellow-100' 
                                                    : 'bg-slate-800 border-slate-700 text-gray-300 hover:bg-slate-700'}
                                            `}
                                        >
                                            <div className="font-bold">{m.name}</div>
                                            <div className="text-[10px] opacity-75">{JSON.stringify(m.cost).replace(/["{}]/g, '').replace(/:/g, '')}</div>
                                        </div>
                                    ))}
                                    {gameState.majors.length === 0 && <div className="text-gray-500 text-xs text-center p-2">No majors available</div>}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="w-px h-4 bg-slate-600 mx-1"></div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                    <button onClick={() => confirmModeAction(activePlayer.id)} className="bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-1 px-3 rounded-full shadow transition-transform active:scale-95">
                        Confirm
                    </button>
                    <button onClick={cancelMode} className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-1 px-3 rounded-full shadow transition-transform active:scale-95">
                        Cancel
                    </button>
                </div>

             </div>
          </div>
        )}

        {/* Turn Badge (Pushed to right) */}
        <div className="bg-stone-800 px-4 py-1.5 rounded-full font-bold shadow-lg border border-stone-600 flex items-center gap-2 ml-auto">
          Turn: <span style={{ color: activePlayer.color }}>{activePlayer.name}</span>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-wrap gap-4 justify-center w-full">
        
        {/* Left: Board */}
        <div className="w-[440px] flex flex-col gap-2 bg-board-bg p-3 rounded-lg shadow-2xl border-4 border-stone-900">
          
          <div className="text-xs text-stone-300 uppercase tracking-widest border-b border-stone-700 pb-1 mb-1 mt-2">
            Base Actions
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {BASE_ACTIONS.map(act => (
               <ActionSlot 
                  key={act.id} 
                  action={act} 
                  occupiedBy={gameState.occupied[act.id] !== undefined ? players[gameState.occupied[act.id]] : undefined}
                  onClick={() => clickAction(act.id)}
               />
            ))}
          </div>

          <div className="text-xs text-stone-300 uppercase tracking-widest border-b border-stone-700 pb-1 mb-1 mt-4">
            Round Actions
          </div>
          <div className="grid grid-cols-2 gap-1.5">
             {gameState.roundCards.map(act => (
               <ActionSlot 
                  key={act.id} 
                  action={act} 
                  occupiedBy={gameState.occupied[act.id] !== undefined ? players[gameState.occupied[act.id]] : undefined}
                  onClick={() => clickAction(act.id)}
               />
             ))}
          </div>

          <div className="text-xs text-stone-300 uppercase tracking-widest border-b border-stone-700 pb-1 mb-1 mt-4">
            Available Majors
          </div>
          <div className="grid grid-cols-2 gap-1.5">
              {gameState.majors.slice(0, 4).map(m => (
                  <div key={m.id} className="bg-orange-700 text-white p-2 rounded text-xs border border-orange-500 shadow opacity-80 cursor-help" onClick={() => openCardDetail(m)}>
                      {m.name} <br/>
                      <span className="text-[10px] opacity-75">
                          {JSON.stringify(m.cost).replace(/["{}]/g, '').replace(/:/g, '')}
                      </span>
                  </div>
              ))}
              {gameState.majors.length > 4 && <div className="text-xs text-center text-gray-400">+{gameState.majors.length - 4} more</div>}
          </div>

        </div>

        {/* Right: Players */}
        <div className="flex-1 flex flex-col gap-3 min-w-[500px]">
           {players.map(p => (
              <PlayerPanel 
                 key={p.id} 
                 player={p} 
                 isActive={activePlayer.id === p.id} 
                 isNextStart={gameState.nextStartPlayer === p.id}
                 onFarmClick={(tileIdx) => handleFarmClick(p.id, tileIdx)}
                 onFenceClick={(tile, side) => handleFenceClick(p.id, tile, side)}
                 onMajorClick={openCardDetail}
                 onConvertClick={p.type === 'human' ? toggleConversion : undefined}
                 onAdjustClick={p.type === 'human' ? toggleAnimalManager : undefined}
              />
           ))}
        </div>
      </div>

      {/* Log */}
      <div className="w-full max-w-6xl h-36 bg-log-bg mt-4 rounded border border-stone-700 p-2 overflow-y-auto font-mono text-xs text-gray-300 shadow-inner scrollbar-thin">
          {logs.map(log => (
              <div key={log.id} className="border-b border-stone-800 pb-0.5 mb-0.5 animate-fadeIn">
                  <span style={{ color: log.color }}>{log.msg}</span>
              </div>
          ))}
      </div>

      {/* Scoring Modal */}
      {showScoring && <ScoringTable onClose={() => setShowScoring(false)} />}

      {/* Animal Manager */}
      {isAdjustingAnimals && humanPlayer && (
        <AnimalManager 
            player={humanPlayer} 
            onClose={toggleAnimalManager} 
            onSave={saveAnimalAssignment} 
        />
      )}

      {/* Test Panel */}
      <TestPanel 
        isOpen={isTestMode} 
        onClose={() => setIsTestMode(false)}
        gameState={gameState}
        players={players}
        debug={debug}
      />

      {/* Harvest Human Interaction Modal */}
      {isHumanHarvest && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
             <div className="bg-slate-800 border-2 border-orange-500 p-6 rounded-lg max-w-lg w-full shadow-2xl relative text-white">
                 
                 {/* Title Dynamic based on Phase */}
                 <h2 className="text-2xl font-bold text-orange-400 mb-4 text-center">
                     {gameState.harvestSubPhase === 'feed' ? '🍲 Harvest: Feed Workers' : '👶 Harvest: Animal Breeding'}
                 </h2>
                 
                 {(() => {
                     const p = activePlayer;
                     const t = p.harvestTemp!;
                     const cooker = p.majors.find(m => (m.type==='cook'||m.type==='bake') && m.cook);
                     
                     // 1. Calculate Conversions
                     let gain = t.grain + t.veg;
                     if (cooker) {
                        gain += t.sheep * (cooker.cook?.sheep||0);
                        gain += t.boar * (cooker.cook?.boar||0);
                        gain += t.cow * (cooker.cook?.cow||0);
                     }

                     // 2. Display Logic based on Phase
                     const totalFood = p.res.food + gain;
                     const needed = p.res.maxWorkers * 2;
                     const balance = totalFood - needed;
                     const balanceColor = balance >= 0 ? 'text-green-400' : 'text-red-400';

                     return (
                        <div className="space-y-4">
                            {/* STATUS PANEL */}
                            {gameState.harvestSubPhase === 'feed' && (
                                <div className="bg-slate-900 p-3 rounded text-center border border-slate-700">
                                    <div className="text-sm text-gray-400">Required: <span className="text-white font-bold">{needed}</span></div>
                                    <div className="text-lg">
                                        Current Food: {p.res.food} <span className="text-green-400">+{gain}</span> = 
                                        <span className={`font-bold ml-1 ${balanceColor}`}>{totalFood}</span>
                                    </div>
                                    {balance < 0 && <div className="text-red-500 text-sm font-bold mt-1">⚠️ Will take {Math.abs(balance)} Begging Cards</div>}
                                </div>
                            )}

                            {gameState.harvestSubPhase === 'breed' && (() => {
                                // Simulate final animals to check capacity
                                const nb = p.pendingBreeding || { sheep: 0, boar: 0, cow: 0 };
                                const finalAnimals = {
                                    sheep: p.animals.sheep + nb.sheep - t.sheep,
                                    boar: p.animals.boar + nb.boar - t.boar,
                                    cow: p.animals.cow + nb.cow - t.cow
                                };
                                // Quick alloc check
                                const simP = { ...p, animals: finalAnimals };
                                const alloc = calculateAllocation(simP);
                                const isOverflow = alloc.overflow > 0;

                                return (
                                    <div className="bg-slate-900 p-3 rounded text-center border border-slate-700">
                                        <div className="text-sm text-gray-400 mb-1">Newborns:</div>
                                        <div className="flex justify-center gap-2 mb-2">
                                            {nb.sheep > 0 && <span className="text-blue-300">+{nb.sheep} 🐑</span>}
                                            {nb.boar > 0 && <span className="text-amber-600">+{nb.boar} 🐗</span>}
                                            {nb.cow > 0 && <span className="text-stone-400">+{nb.cow} 🐮</span>}
                                            {!nb.sheep && !nb.boar && !nb.cow && <span className="text-gray-500">None</span>}
                                        </div>
                                        <div className={`text-lg font-bold ${isOverflow ? 'text-red-400' : 'text-green-400'}`}>
                                            {isOverflow ? `⚠️ Overflow: -${alloc.overflow} animals will be discarded` : "✅ All animals fit!"}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            Tip: Cook existing animals to make room for newborns.
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* CONTROLS */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* Crops - Only relevant in Feed phase essentially, but allowed in Breed if user wants extra food */}
                                <div className="space-y-2 opacity-80 hover:opacity-100 transition-opacity">
                                    <h4 className="text-xs uppercase font-bold text-gray-500">Convert Crops (1:1)</h4>
                                    <div className="flex justify-between items-center bg-slate-700 p-2 rounded">
                                        <span>🌾 Grain ({p.res.grain})</span>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => adjustHarvest('grain', -1)} className="w-6 h-6 bg-slate-600 hover:bg-slate-500 rounded">-</button>
                                            <span className="w-4 text-center">{t.grain}</span>
                                            <button onClick={() => adjustHarvest('grain', 1)} className="w-6 h-6 bg-green-700 hover:bg-green-600 rounded">+</button>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center bg-slate-700 p-2 rounded">
                                        <span>🥕 Veg ({p.res.veg})</span>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => adjustHarvest('veg', -1)} className="w-6 h-6 bg-slate-600 hover:bg-slate-500 rounded">-</button>
                                            <span className="w-4 text-center">{t.veg}</span>
                                            <button onClick={() => adjustHarvest('veg', 1)} className="w-6 h-6 bg-green-700 hover:bg-green-600 rounded">+</button>
                                        </div>
                                    </div>
                                </div>

                                {/* Animals */}
                                <div className="space-y-2">
                                    <h4 className="text-xs uppercase font-bold text-gray-500">Cook Animals {cooker ? '' : '(No Fireplace)'}</h4>
                                    {['sheep', 'boar', 'cow'].map(type => {
                                        const rate = cooker?.cook?.[type as 'sheep'|'boar'|'cow'] || 0;
                                        return (
                                            <div key={type} className={`flex justify-between items-center bg-slate-700 p-2 rounded ${!cooker ? 'opacity-50' : ''}`}>
                                                <span className="capitalize">{type} ({p.animals[type as 'sheep']})</span>
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => cooker && adjustHarvest(type as any, -1)} 
                                                        disabled={!cooker}
                                                        className="w-6 h-6 bg-slate-600 hover:bg-slate-500 rounded disabled:cursor-not-allowed"
                                                    >-</button>
                                                    <span className="w-4 text-center">{t[type as 'sheep']}</span>
                                                    <button 
                                                        onClick={() => cooker && adjustHarvest(type as any, 1)} 
                                                        disabled={!cooker}
                                                        className="w-6 h-6 bg-red-700 hover:bg-red-600 rounded disabled:cursor-not-allowed"
                                                    >+</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex gap-4 mt-6 pt-4 border-t border-slate-600">
                                <button onClick={confirmHarvest} className="flex-1 bg-green-600 hover:bg-green-500 py-2 rounded font-bold shadow-lg">
                                    {gameState.harvestSubPhase === 'feed' ? 'Confirm Feeding' : 'Confirm Breeding & Discard Excess'}
                                </button>
                                <button onClick={resetHarvest} className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded font-bold shadow-lg">Reset</button>
                            </div>
                        </div>
                     );
                 })()}
             </div>
          </div>
      )}

      {/* Anytime Conversion Modal */}
      {isConverting && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm">
             <div className="bg-slate-800 border-2 border-yellow-500 p-6 rounded-lg max-w-lg w-full shadow-2xl relative text-white">
                 <button onClick={toggleConversion} className="absolute top-2 right-2 text-gray-400 hover:text-white">✕</button>
                 <h2 className="text-2xl font-bold text-yellow-400 mb-4 text-center">🍲 Anytime Food Conversion</h2>
                 
                 {(() => {
                     const p = activePlayer;
                     const t = p.conversionTemp!;
                     const cooker = p.majors.find(m => (m.type==='cook'||m.type==='bake') && m.cook);
                     
                     let gain = t.grain + t.veg;
                     if (cooker) {
                        gain += t.sheep * (cooker.cook?.sheep||0);
                        gain += t.boar * (cooker.cook?.boar||0);
                        gain += t.cow * (cooker.cook?.cow||0);
                     }

                     return (
                        <div className="space-y-4">
                            <div className="bg-slate-900 p-3 rounded text-center border border-slate-700">
                                <div className="text-lg">
                                    Gaining: <span className="text-green-400 font-bold">+{gain} Food</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Crops */}
                                <div className="space-y-2">
                                    <h4 className="text-xs uppercase font-bold text-gray-500">Convert Crops (1:1)</h4>
                                    <div className="flex justify-between items-center bg-slate-700 p-2 rounded">
                                        <span>🌾 Grain ({p.res.grain})</span>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => adjustConversion('grain', -1)} className="w-6 h-6 bg-slate-600 hover:bg-slate-500 rounded">-</button>
                                            <span className="w-4 text-center">{t.grain}</span>
                                            <button onClick={() => adjustConversion('grain', 1)} className="w-6 h-6 bg-green-700 hover:bg-green-600 rounded">+</button>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center bg-slate-700 p-2 rounded">
                                        <span>🥕 Veg ({p.res.veg})</span>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => adjustConversion('veg', -1)} className="w-6 h-6 bg-slate-600 hover:bg-slate-500 rounded">-</button>
                                            <span className="w-4 text-center">{t.veg}</span>
                                            <button onClick={() => adjustConversion('veg', 1)} className="w-6 h-6 bg-green-700 hover:bg-green-600 rounded">+</button>
                                        </div>
                                    </div>
                                </div>

                                {/* Animals */}
                                <div className="space-y-2">
                                    <h4 className="text-xs uppercase font-bold text-gray-500">Cook Animals {cooker ? '(Available)' : '(No Fireplace)'}</h4>
                                    {['sheep', 'boar', 'cow'].map(type => {
                                        return (
                                            <div key={type} className={`flex justify-between items-center bg-slate-700 p-2 rounded ${!cooker ? 'opacity-50' : ''}`}>
                                                <span className="capitalize">{type} ({p.animals[type as 'sheep']})</span>
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => cooker && adjustConversion(type as any, -1)} 
                                                        disabled={!cooker}
                                                        className="w-6 h-6 bg-slate-600 hover:bg-slate-500 rounded disabled:cursor-not-allowed"
                                                    >-</button>
                                                    <span className="w-4 text-center">{t[type as 'sheep']}</span>
                                                    <button 
                                                        onClick={() => cooker && adjustConversion(type as any, 1)} 
                                                        disabled={!cooker}
                                                        className="w-6 h-6 bg-red-700 hover:bg-red-600 rounded disabled:cursor-not-allowed"
                                                    >+</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex gap-4 mt-6 pt-4 border-t border-slate-600">
                                <button onClick={confirmConversion} className="flex-1 bg-green-600 hover:bg-green-500 py-2 rounded font-bold shadow-lg">Confirm Conversion</button>
                                <button onClick={toggleConversion} className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded font-bold shadow-lg">Cancel</button>
                            </div>
                        </div>
                     );
                 })()}
             </div>
          </div>
      )}

      {/* Harvest Overlay for AI phases */}
      {gameState.harvestPhase && !isHumanHarvest && (
          <div className="fixed top-20 right-10 bg-orange-900/90 text-white px-6 py-4 rounded-xl shadow-2xl border-2 border-orange-500 z-50 animate-pulse">
              <h3 className="text-xl font-bold">🌾 Harvest Phase</h3>
              <p>
                  {gameState.harvestSubPhase === 'field' ? 'Harvesting Crops...' :
                   gameState.harvestSubPhase === 'feed' ? `Feeding workers... ${activePlayer.name}` :
                   `Breeding animals... ${activePlayer.name}`}
              </p>
          </div>
      )}

      {/* Card Detail Modal */}
      {viewingCard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={closeCardDetail}>
            <div className="bg-orange-900 border-2 border-orange-500 p-6 rounded-lg max-w-sm w-full text-center shadow-2xl relative" onClick={e => e.stopPropagation()}>
                <button onClick={closeCardDetail} className="absolute top-2 right-2 text-orange-300 hover:text-white">✕</button>
                <h3 className="text-xl font-bold text-orange-200 mb-2">{viewingCard.name}</h3>
                <div className="flex justify-center gap-4 text-sm mb-4">
                    <span className="bg-orange-800 px-2 py-1 rounded border border-orange-600">
                        Score: {viewingCard.score}
                    </span>
                    <span className="bg-orange-800 px-2 py-1 rounded border border-orange-600">
                        Cost: {JSON.stringify(viewingCard.cost).replace(/["{}]/g, '').replace(/:/g, ' ')}
                    </span>
                </div>
                <p className="text-orange-100 text-sm leading-relaxed border-t border-orange-700 pt-3">
                    {viewingCard.desc}
                </p>
                {viewingCard.special && (
                    <div className="mt-3 text-xs text-orange-300 font-mono">
                        Special: {viewingCard.special}
                    </div>
                )}
            </div>
        </div>
      )}

    </div>
  );
};

export default App;
