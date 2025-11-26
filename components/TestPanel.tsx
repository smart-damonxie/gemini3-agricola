
import React, { useState } from 'react';
import { GameState, Player, Action } from '../types';
import { BASE_ACTIONS, ROUND_CARDS_POOL } from '../constants';

interface TestCase {
    id: number;
    name: string;
    description: string;
    actionId: string;
    status: 'idle' | 'pass' | 'fail';
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    gameState: GameState;
    players: Player[];
    debug: {
        setGameState: (gs: GameState) => void;
        setPlayers: (ps: Player[]) => void;
        forceAction: (actId: string) => void;
        stateRef: React.MutableRefObject<any>;
    };
}

const TestPanel: React.FC<Props> = ({ isOpen, onClose, gameState, players, debug }) => {
    const [activeTab, setActiveTab] = useState<'control' | 'actions' | 'cases' | 'minors' | 'occs'>('control');
    const [testCases, setTestCases] = useState<TestCase[]>([
        { id: 1, name: "Basic Wood", description: "Take 3 Wood", actionId: 'act_forest_3', status: 'idle' },
        { id: 2, name: "Plow Field", description: "Plow a field manually", actionId: 'act_plow', status: 'idle' },
    ]);
    const [newCaseName, setNewCaseName] = useState("");
    
    if (!isOpen) return null;

    const currentPlayer = players[(gameState.startPlayer + gameState.turnIdx) % 4];

    // --- Helpers ---
    const resetGame = () => {
        window.location.reload(); // Simplest full reset
    };

    const jumpRound = (r: number) => {
        const newDeck = [...gameState.deck];
        const newRoundCards = [...gameState.roundCards];
        // Simplified Logic: Just unlock cards up to that round
        ROUND_CARDS_POOL.forEach(c => {
            if (c.stage && c.stage <= Math.ceil(r/2.5) && !newRoundCards.find(rc=>rc.id===c.id)) {
                 newRoundCards.push(c);
            }
        });
        debug.setGameState({ ...gameState, round: r, roundCards: newRoundCards });
    };

    const giveResources = (type: string, amt: number) => {
        const ps = [...players];
        const pIdx = (gameState.startPlayer + gameState.turnIdx) % 4;
        // @ts-ignore
        if (['sheep','boar','cow'].includes(type)) ps[pIdx].animals[type] += amt;
        // @ts-ignore
        else ps[pIdx].res[type] += amt;
        debug.setPlayers(ps);
    };

    const runActionShortcut = (actId: string) => {
        debug.forceAction(actId);
    };

    const addTestCase = () => {
        if(!newCaseName) return;
        setTestCases([...testCases, {
            id: Date.now(),
            name: newCaseName,
            description: "Custom Test Case",
            actionId: 'act_forest_3', // Default
            status: 'idle'
        }]);
        setNewCaseName("");
    };
    
    const deleteTestCase = (id: number) => {
        setTestCases(testCases.filter(t => t.id !== id));
    };

    const updateTestCase = (id: number, field: keyof TestCase, val: string) => {
        setTestCases(testCases.map(t => t.id === id ? { ...t, [field]: val } : t));
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-10 font-mono text-sm">
            <div className="bg-slate-900 w-full h-full max-w-7xl border-2 border-red-500 rounded-lg shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-red-900/50 p-4 border-b border-red-500 flex justify-between items-center">
                    <h1 className="text-xl font-bold text-red-200 uppercase tracking-widest">🛠️ Test Engineering Console</h1>
                    <button onClick={onClose} className="bg-red-600 hover:bg-red-500 text-white px-4 py-1 rounded font-bold">EXIT TEST MODE</button>
                </div>

                {/* Tabs */}
                <div className="flex bg-slate-800 border-b border-slate-700">
                    {['control', 'actions', 'cases', 'minors', 'occs'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-6 py-3 uppercase font-bold transition-colors ${activeTab === tab ? 'bg-slate-700 text-white border-b-2 border-red-400' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-900 text-gray-300">
                    
                    {/* CONTROL TAB */}
                    {activeTab === 'control' && (
                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <h3 className="text-lg text-white font-bold border-b border-slate-700 pb-2">State Manipulation</h3>
                                <div className="flex gap-2 items-center">
                                    <button onClick={resetGame} className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded">Reboot Game</button>
                                </div>
                                <div className="flex gap-2 items-center">
                                    <span>Jump to Round:</span>
                                    {[1, 4, 7, 10, 14].map(r => (
                                        <button key={r} onClick={() => jumpRound(r)} className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded">{r}</button>
                                    ))}
                                </div>
                                <div className="bg-slate-800 p-4 rounded border border-slate-700">
                                    <div className="mb-2 font-bold text-white">Current Player: {currentPlayer.name} ({currentPlayer.color})</div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {['wood','clay','reed','stone','food','grain','veg','sheep','boar','cow'].map(r => (
                                            <button key={r} onClick={() => giveResources(r, 5)} className="bg-slate-700 hover:bg-green-700 px-2 py-1 rounded text-xs capitalize">
                                                +5 {r}
                                            </button>
                                        ))}
                                        <button onClick={() => {
                                            const ps = [...players];
                                            ps[(gameState.startPlayer + gameState.turnIdx) % 4].res.workers = 5;
                                            debug.setPlayers(ps);
                                        }} className="bg-blue-700 hover:bg-blue-600 px-2 py-1 rounded text-xs col-span-2">Refill Workers</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ACTIONS TAB */}
                    {activeTab === 'actions' && (
                        <div>
                            <h3 className="text-lg text-white font-bold border-b border-slate-700 pb-2 mb-4">Action Shortcuts (Click to Force Execute)</h3>
                            
                            <div className="mb-6">
                                <h4 className="text-sm font-bold text-gray-500 uppercase mb-2">Base Actions</h4>
                                <div className="grid grid-cols-4 gap-2">
                                    {BASE_ACTIONS.map(act => (
                                        <button 
                                            key={act.id} 
                                            onClick={() => runActionShortcut(act.id)}
                                            className="bg-slate-800 hover:bg-slate-700 border border-slate-600 p-2 text-left rounded text-xs flex flex-col group"
                                        >
                                            <span className="font-bold text-blue-300 group-hover:text-blue-200">{act.name}</span>
                                            <span className="text-gray-500 text-[10px]">{act.id}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h4 className="text-sm font-bold text-gray-500 uppercase mb-2">Round Actions (All 14)</h4>
                                <div className="grid grid-cols-4 gap-2">
                                    {ROUND_CARDS_POOL.map(act => (
                                        <button 
                                            key={act.id} 
                                            onClick={() => runActionShortcut(act.id)}
                                            className="bg-slate-800 hover:bg-slate-700 border border-slate-600 p-2 text-left rounded text-xs flex flex-col group"
                                        >
                                            <span className="font-bold text-yellow-300 group-hover:text-yellow-200">Stage {act.stage}: {act.name}</span>
                                            <span className="text-gray-500 text-[10px]">{act.id}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* CASES TAB */}
                    {activeTab === 'cases' && (
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg text-white font-bold">Test Cases</h3>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={newCaseName} 
                                        onChange={(e) => setNewCaseName(e.target.value)} 
                                        placeholder="New Test Case Name"
                                        className="bg-slate-800 border border-slate-600 px-3 py-1 rounded text-white"
                                    />
                                    <button onClick={addTestCase} className="bg-green-700 hover:bg-green-600 text-white px-4 py-1 rounded font-bold">+</button>
                                </div>
                            </div>
                            
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-800 text-gray-400 uppercase text-xs">
                                            <th className="p-3 border-b border-slate-700">ID</th>
                                            <th className="p-3 border-b border-slate-700">Name</th>
                                            <th className="p-3 border-b border-slate-700">Target Action ID</th>
                                            <th className="p-3 border-b border-slate-700">Description / Expectation</th>
                                            <th className="p-3 border-b border-slate-700">Status</th>
                                            <th className="p-3 border-b border-slate-700 w-24">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {testCases.map(tc => (
                                            <tr key={tc.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                                                <td className="p-3 text-gray-500">{tc.id}</td>
                                                <td className="p-3">
                                                    <input 
                                                        value={tc.name} 
                                                        onChange={(e) => updateTestCase(tc.id, 'name', e.target.value)}
                                                        className="bg-transparent border-none text-white w-full focus:outline-none focus:bg-slate-700 rounded px-1"
                                                    />
                                                </td>
                                                <td className="p-3 font-mono text-xs text-blue-400">
                                                    <input 
                                                        value={tc.actionId} 
                                                        onChange={(e) => updateTestCase(tc.id, 'actionId', e.target.value)}
                                                        className="bg-transparent border-none w-full focus:outline-none focus:bg-slate-700 rounded px-1"
                                                    />
                                                </td>
                                                <td className="p-3">
                                                    <input 
                                                        value={tc.description} 
                                                        onChange={(e) => updateTestCase(tc.id, 'description', e.target.value)}
                                                        className="bg-transparent border-none text-gray-400 w-full focus:outline-none focus:bg-slate-700 rounded px-1"
                                                    />
                                                </td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                        tc.status === 'pass' ? 'bg-green-900 text-green-300' : 
                                                        tc.status === 'fail' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-400'
                                                    }`}>
                                                        {tc.status.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="p-3 flex gap-2">
                                                    <button onClick={() => runActionShortcut(tc.actionId)} className="text-blue-400 hover:text-white" title="Run Action">▶️</button>
                                                    <button onClick={() => deleteTestCase(tc.id)} className="text-red-400 hover:text-white" title="Delete">🗑️</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* PLACEHOLDERS */}
                    {(activeTab === 'minors' || activeTab === 'occs') && (
                        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-700 rounded-lg">
                            <h3 className="text-2xl font-bold text-slate-600 mb-2">
                                {activeTab === 'minors' ? 'Minor Improvements' : 'Occupations'}
                            </h3>
                            <p className="text-slate-500">Interface Reserved for Future Implementation</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TestPanel;
