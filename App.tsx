import React from 'react';
import { useGameLogic } from './hooks/useGameLogic';
import { BASE_ACTIONS } from './constants';
import ActionSlot from './components/ActionSlot';
import PlayerPanel from './components/PlayerPanel';

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
    buyMajor,
    renovate
  } = useGameLogic();

  const activePlayer = players[(gameState.startPlayer + gameState.turnIdx) % 4];

  // Helper to find action name for simple mode
  const getActionDetails = (actId: string) => {
    return BASE_ACTIONS.find(a => a.id === actId) || gameState.roundCards.find(a => a.id === actId);
  };

  return (
    <div className="flex flex-col items-center p-2 max-w-[1600px] mx-auto pb-20">
      
      {/* Top Bar */}
      <div className="w-full max-w-6xl flex justify-between items-center bg-black/40 p-3 rounded-lg mb-4 backdrop-blur-sm border border-white/10">
        <div className="bg-stone-800 px-4 py-1.5 rounded-full font-bold shadow-lg border border-stone-600">
          Round {gameState.round}
        </div>
        <div className="bg-stone-800 px-4 py-1.5 rounded-full font-bold shadow-lg border border-stone-600 flex items-center gap-2">
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
                  <div key={m.id} className="bg-orange-700 text-white p-2 rounded text-xs border border-orange-500 shadow opacity-80">
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

      {/* Action Toolbar */}
      {activePlayer.type === 'human' && activePlayer.tempMode && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 p-4 rounded-lg shadow-2xl border border-slate-600 flex flex-col gap-3 items-center z-50 animate-bounce-in min-w-[300px]">
              
              {activePlayer.tempMode.mode === 'simple' && (
                  <div className="text-white mb-2 text-center">
                     {(() => {
                         const act = getActionDetails(activePlayer.tempMode!.actId);
                         return (
                             <>
                               <div className="font-bold text-lg mb-1">{act?.name}</div>
                               <div className="text-sm text-gray-400">{act?.desc}</div>
                             </>
                         );
                     })()}
                  </div>
              )}
              
              {activePlayer.tempMode.mode !== 'simple' && (
                <div className="flex items-center gap-2">
                    <span className="font-bold text-sky-400">Action: {activePlayer.tempMode.mode}</span>
                </div>
              )}

              {/* Build Menu Tools */}
              {activePlayer.tempMode.mode === 'build_menu' && (
                  <div className="flex gap-2 bg-slate-700 p-1 rounded">
                      <button 
                         onClick={() => switchTool('room')}
                         className={`px-3 py-1 rounded text-sm font-bold ${activePlayer.tempMode.currentTool === 'room' ? 'bg-blue-600 text-white' : 'bg-slate-600 text-gray-400 hover:bg-slate-500'}`}
                      >
                         🏠 Build Room
                      </button>
                      <button 
                         onClick={() => switchTool('stable')}
                         className={`px-3 py-1 rounded text-sm font-bold ${activePlayer.tempMode.currentTool === 'stable' ? 'bg-orange-600 text-white' : 'bg-slate-600 text-gray-400 hover:bg-slate-500'}`}
                      >
                         🏚️ Build Stable
                      </button>
                  </div>
              )}

              {/* Sowing Tools */}
              {(activePlayer.tempMode.mode === 'sow' || activePlayer.tempMode.mode === 'plow_sow') && (
                  <div className="flex gap-2 bg-slate-700 p-1 rounded items-center">
                      <span className="text-xs text-gray-400 mr-1">Select Seed:</span>
                      <button 
                         onClick={() => toggleSeed('grain')}
                         className={`px-3 py-1 rounded text-sm font-bold ${activePlayer.tempMode.currentSeed === 'grain' ? 'bg-yellow-600 text-white' : 'bg-slate-600 text-gray-400 hover:bg-slate-500'}`}
                      >
                         🌾 Grain ({activePlayer.res.grain})
                      </button>
                      <button 
                         onClick={() => toggleSeed('veg')}
                         className={`px-3 py-1 rounded text-sm font-bold ${activePlayer.tempMode.currentSeed === 'veg' ? 'bg-orange-600 text-white' : 'bg-slate-600 text-gray-400 hover:bg-slate-500'}`}
                      >
                         🥕 Veg ({activePlayer.res.veg})
                      </button>
                  </div>
              )}

              {/* Renovation Button */}
              {(activePlayer.tempMode.mode === 'reno_major' || activePlayer.tempMode.mode === 'reno_fence') && (
                  <button 
                     onClick={renovate}
                     className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-1 px-4 rounded shadow w-full text-sm"
                  >
                     🔨 Renovate House (1 Reed + Material)
                  </button>
              )}

              {/* Major Selection Area */}
              {(activePlayer.tempMode.mode === 'major' || activePlayer.tempMode.mode === 'reno_major') && (
                  <div className="flex flex-col gap-1 w-full max-h-[200px] overflow-y-auto bg-slate-900 p-2 rounded border border-slate-700">
                      <span className="text-xs text-gray-400 font-bold uppercase">Buy Improvement:</span>
                      {gameState.majors.map(m => (
                          <button 
                             key={m.id}
                             onClick={() => buyMajor(m.id)}
                             className="text-left text-xs bg-orange-900/50 hover:bg-orange-800 p-2 rounded border border-orange-700 flex justify-between group"
                          >
                             <span className="font-bold text-orange-200">{m.name}</span>
                             <span className="text-gray-400 group-hover:text-white">
                                {JSON.stringify(m.cost).replace(/["{}]/g, '').replace(/:/g, '')}
                             </span>
                          </button>
                      ))}
                      {gameState.majors.length === 0 && <span className="text-xs text-gray-500 italic">No majors available</span>}
                  </div>
              )}

              <div className="flex gap-4 mt-2">
                <button 
                    onClick={() => confirmModeAction(activePlayer.id)}
                    className="bg-green-600 hover:bg-green-500 text-white font-bold py-1 px-6 rounded shadow"
                >
                    Confirm & End Turn
                </button>
                <button 
                    onClick={cancelMode}
                    className="bg-red-600 hover:bg-red-500 text-white font-bold py-1 px-4 rounded shadow"
                >
                    Cancel
                </button>
              </div>
          </div>
      )}

      {/* Harvest Overlay */}
      {gameState.harvestPhase && (
          <div className="fixed top-20 right-10 bg-orange-900/90 text-white px-6 py-4 rounded-xl shadow-2xl border-2 border-orange-500 z-50 animate-pulse">
              <h3 className="text-xl font-bold">🌾 Harvest Phase</h3>
              <p>Feeding workers...</p>
          </div>
      )}
    </div>
  );
};

export default App;