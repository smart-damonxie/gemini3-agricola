
import React, { useState, useEffect, useRef } from 'react';
import { GameState, Player, Action } from '../types';
import { BASE_ACTIONS, ROUND_CARDS_POOL } from '../constants';

interface TestCase {
    id: string;
    name: string;
    actionId: string;
    expectJson: string; // e.g. '{"res.wood": 3}'
    status: 'idle' | 'running' | 'pass' | 'fail';
    resultMsg?: string;
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
    const [activeTab, setActiveTab] = useState<'control' | 'cases'>('cases');
    const [testCases, setTestCases] = useState<TestCase[]>([]);
    const [runningTest, setRunningTest] = useState<{ id: string; snapshot: Player } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initialize Test Cases if empty
    useEffect(() => {
        if (testCases.length === 0) {
            const allActions = [...BASE_ACTIONS, ...ROUND_CARDS_POOL.sort((a,b) => (a.stage||0) - (b.stage||0))];
            const initialCases: TestCase[] = allActions.map(act => ({
                id: `test_${act.id}`,
                name: `Test ${act.name}`,
                actionId: act.id,
                expectJson: generateDefaultExpectation(act),
                status: 'idle'
            }));
            setTestCases(initialCases);
        }
    }, []);

    // Monitor for changes during a test run
    useEffect(() => {
        if (runningTest) {
            // Wait a tick for state to settle? Actually, since this effect runs ON change, 
            // we check if the relevant player has changed significantly or if we just want to verify immediately.
            // However, forceAction might be async in terms of React state propagation.
            // We'll perform verification here.
            
            const currentPlayerIdx = (gameState.startPlayer + gameState.turnIdx) % 4; // Note: turnIdx might have incremented
            // We need to find the player who performed the action. 
            // If turn advanced, the previous player is the one we want to check.
            // But forceAction updates turnIdx. 
            // Let's assume the snapshot has the correct ID.
            
            const pId = runningTest.snapshot.id;
            const currentPlayer = players.find(p => p.id === pId);
            
            if (currentPlayer && currentPlayer !== runningTest.snapshot) {
                verifyTest(runningTest.id, runningTest.snapshot, currentPlayer);
                setRunningTest(null);
            }
        }
    }, [players, gameState.turnIdx]); // triggers when players update or turn changes

    const generateDefaultExpectation = (act: Action): string => {
        const deltas: any = {};
        if (act.type === 'res') {
            if (act.res) deltas[`res.${act.res}`] = act.acc || act.amount || 1;
            // Handle animals which are on a different root key
            if (['sheep','boar','cow'].includes(act.res || '')) {
                 deltas[`animals.${act.res}`] = act.acc || act.amount || 1;
                 delete deltas[`res.${act.res}`];
            }
        }
        else if (act.type === 'res_combo') {
            if (act.id === 'act_market') {
                deltas['res.reed'] = 1; deltas['res.stone'] = 1; deltas['res.food'] = 1;
            }
        }
        else if (act.mode === 'plow') deltas['farm.fields'] = 1;
        else if (act.mode === 'sow') deltas['farm.crops'] = 1;
        else if (act.mode === 'build_menu') deltas['farm.rooms'] = 1;
        else if (act.mode === 'fence') deltas['farm.fences'] = 4;
        
        // Return simplified JSON for editing
        return JSON.stringify(deltas).replace(/"/g, ''); 
    };

    const getNestedVal = (obj: any, path: string): number => {
        if (path === 'farm.fields') return obj.farm.filter((x:number) => x === 2).length;
        if (path === 'farm.rooms') return obj.farm.filter((x:number) => x === 1).length;
        if (path === 'farm.stables') return obj.farm.filter((x:number) => x === 5).length;
        if (path === 'farm.crops') return obj.farmCounts.reduce((a:number,b:number) => a+b, 0);
        if (path === 'farm.fences') return obj.fences.size || obj.fences.length || 0;

        return path.split('.').reduce((o, i) => (o ? o[i] : undefined), obj) || 0;
    };

    const verifyTest = (testId: string, before: Player, after: Player) => {
        const testCase = testCases.find(t => t.id === testId);
        if (!testCase) return;

        try {
            // Relaxed JSON parsing (add quotes back if missing to make it valid JSON)
            let jsonStr = testCase.expectJson.replace(/(\w+(\.\w+)*):/g, '"$1":'); 
            if(!jsonStr.startsWith('{')) jsonStr = '{' + jsonStr + '}';
            
            const expected = JSON.parse(jsonStr);
            const errors: string[] = [];

            Object.keys(expected).forEach(key => {
                const expVal = expected[key];
                const beforeVal = getNestedVal(before, key);
                const afterVal = getNestedVal(after, key);
                const actualDelta = afterVal - beforeVal;
                
                // Allow ">= 3" logic if we are testing accumulators? 
                // For now exact match on delta or simple heuristic
                if (actualDelta !== expVal) {
                    // Special case for accumulators: actual delta should be >= base amount
                    // But here we want strict tests.
                    errors.push(`${key}: expected +${expVal}, got ${actualDelta > 0 ? '+' : ''}${actualDelta}`);
                }
            });

            if (errors.length === 0) {
                updateTestCase(testId, { status: 'pass', resultMsg: 'All expectations met.' });
            } else {
                updateTestCase(testId, { status: 'fail', resultMsg: errors.join('; ') });
            }
        } catch (e) {
            updateTestCase(testId, { status: 'fail', resultMsg: 'Invalid JSON expectation format' });
        }
    };

    const runTest = (testId: string) => {
        const testCase = testCases.find(t => t.id === testId);
        if (!testCase) return;

        // Reset Status
        updateTestCase(testId, { status: 'running', resultMsg: 'Running...' });

        // Snapshot
        const pIdx = (gameState.startPlayer + gameState.turnIdx) % 4;
        const p = players[pIdx];
        
        // Prepare Runner
        setRunningTest({ id: testId, snapshot: JSON.parse(JSON.stringify(p)) }); // Deep clone snapshot

        // Execute
        debug.forceAction(testCase.actionId);
    };

    const updateTestCase = (id: string, updates: Partial<TestCase>) => {
        setTestCases(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target?.result as string;
            if (!text) return;
            const lines = text.split('\n');
            const newCases: TestCase[] = [];
            // Skip header
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                // Simple CSV parse (assumes no commas in descriptions for now)
                const parts = line.split(',');
                if (parts.length >= 4) {
                    newCases.push({
                        id: parts[0],
                        name: parts[1],
                        actionId: parts[2],
                        expectJson: parts.slice(3).join(','), // Rejoin remaining commas in json
                        status: 'idle'
                    });
                }
            }
            if (newCases.length > 0) {
                setTestCases(newCases);
                alert(`Imported ${newCases.length} test cases.`);
            }
        };
        reader.readAsText(file);
    };

    const handleExportCSV = () => {
        const header = "ID,Name,ActionID,Expectations (JSON)\n";
        const rows = testCases.map(t => `${t.id},${t.name},${t.actionId},"${t.expectJson.replace(/"/g, '""')}"`).join('\n');
        const blob = new Blob([header + rows], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'agricola_test_cases.csv';
        a.click();
    };

    // --- Control Logic ---
    const resetGame = () => window.location.reload();
    
    const jumpRound = (targetRound: number) => {
        let currentRoundCards = [...gameState.roundCards];
        let currentDeck = [...gameState.deck];
        const currentCount = currentRoundCards.length;
        
        if (targetRound === currentCount) {
             debug.setGameState({ ...gameState, round: targetRound });
             return;
        }

        // Fix: Ensure we consider base actions separate from round cards.
        // Round 1 has 0 round cards revealed initially? No, usually 1 if initialized.
        // Assuming roundCards contains ONLY revealed round cards (plus potentially any persistent ones? No, just the list).
        // ROUND_CARDS_POOL has 'stage'.
        
        // Simplified Logic: Rebuild from scratch based on round
        // 1. Gather all round cards back into a pool
        const all = [...currentRoundCards, ...currentDeck].filter(c => c.stage); // Only round cards
        const allSorted = all.sort((a,b) => (a.stage||0) - (b.stage||0)); // Rough sort
        
        // 2. Distribute
        const newRevealed: Action[] = [];
        const newDeck: Action[] = [];
        
        // We simply take the first N cards where N = targetRound
        // Note: This naive shuffle might mess up card order. 
        // Better: Try to preserve existing order if possible?
        // Prompt requirement: "Correctly hide/show".
        
        if (targetRound < currentCount) {
             // Moving back: Pop from roundCards, Unshift to Deck
             const diff = currentCount - targetRound;
             const moving = currentRoundCards.splice(currentCount - diff, diff);
             currentDeck = [...moving, ...currentDeck];
        } else {
             // Moving fwd: Shift from Deck, Push to roundCards
             const diff = targetRound - currentCount;
             const moving = currentDeck.splice(0, diff);
             currentRoundCards = [...currentRoundCards, ...moving];
        }

        debug.setGameState({ 
            ...gameState, 
            round: targetRound, 
            roundCards: currentRoundCards,
            deck: currentDeck
        });
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 font-mono text-sm">
            <div className="bg-slate-900 w-full h-full max-w-7xl border-2 border-indigo-500 rounded-lg shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-indigo-900/50 p-4 border-b border-indigo-500 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <h1 className="text-xl font-bold text-indigo-200 uppercase tracking-widest">🛠️ Test Console</h1>
                        <div className="flex bg-slate-800 rounded p-1">
                             <button onClick={() => setActiveTab('control')} className={`px-4 py-1 rounded transition-colors ${activeTab === 'control' ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}>Control</button>
                             <button onClick={() => setActiveTab('cases')} className={`px-4 py-1 rounded transition-colors ${activeTab === 'cases' ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}>Test Cases</button>
                        </div>
                    </div>
                    <button onClick={onClose} className="bg-red-600 hover:bg-red-500 text-white px-4 py-1 rounded font-bold">EXIT TEST MODE</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-900 text-gray-300">
                    
                    {/* --- CONTROL TAB --- */}
                    {activeTab === 'control' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <h3 className="text-white font-bold border-b border-slate-700 pb-2">Game State</h3>
                                    <div className="flex gap-2 items-center">
                                        <button onClick={resetGame} className="bg-red-700 hover:bg-red-600 text-white px-3 py-1 rounded text-xs">Reboot</button>
                                        <span className="text-gray-500">|</span>
                                        <span>Round Jump:</span>
                                        {[1, 4, 7, 10, 14].map(r => (
                                            <button key={r} onClick={() => jumpRound(r)} className={`px-3 py-1 rounded text-xs border ${gameState.round === r ? 'bg-yellow-600 border-yellow-500 text-white' : 'bg-slate-700 border-slate-600 hover:bg-slate-600'}`}>{r}</button>
                                        ))}
                                    </div>
                                    <div className="bg-slate-800 p-4 rounded border border-slate-700">
                                        <div className="mb-2 font-bold text-white text-xs uppercase">Inject Resources (Current Player)</div>
                                        <div className="grid grid-cols-5 gap-2">
                                            {['wood','clay','reed','stone','food','grain','veg','sheep','boar','cow'].map(r => (
                                                <button key={r} onClick={() => giveResources(r, 5)} className="bg-slate-700 hover:bg-green-700 border border-slate-600 px-2 py-1 rounded text-[10px] capitalize transition-colors">
                                                    +5 {r}
                                                </button>
                                            ))}
                                        </div>
                                        <button onClick={() => {
                                            const ps = [...players];
                                            ps[(gameState.startPlayer + gameState.turnIdx) % 4].res.workers = 5;
                                            debug.setPlayers(ps);
                                        }} className="mt-2 w-full bg-blue-700 hover:bg-blue-600 px-2 py-1 rounded text-xs">Refill Workers</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- CASES TAB --- */}
                    {activeTab === 'cases' && (
                        <div className="space-y-4">
                            {/* Toolbar */}
                            <div className="flex justify-between items-center bg-slate-800 p-3 rounded border border-slate-700">
                                <div className="flex gap-2">
                                    <button onClick={handleExportCSV} className="bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1 rounded text-xs flex items-center gap-1">
                                        ⬇️ Export CSV
                                    </button>
                                    <label className="bg-blue-700 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs cursor-pointer flex items-center gap-1">
                                        ⬆️ Import CSV
                                        <input type="file" ref={fileInputRef} onChange={handleImportCSV} className="hidden" accept=".csv" />
                                    </label>
                                </div>
                                <div className="text-xs text-gray-500">
                                    Total Cases: {testCases.length} | Passed: {testCases.filter(t => t.status === 'pass').length}
                                </div>
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto border border-slate-700 rounded">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-800 text-gray-400 uppercase text-[10px] tracking-wider">
                                            <th className="p-3 border-b border-slate-700 w-20">Status</th>
                                            <th className="p-3 border-b border-slate-700 w-32">ID</th>
                                            <th className="p-3 border-b border-slate-700">Name</th>
                                            <th className="p-3 border-b border-slate-700 w-32">Action ID</th>
                                            <th className="p-3 border-b border-slate-700">Expected Delta (JSON)</th>
                                            <th className="p-3 border-b border-slate-700">Result / Actual</th>
                                            <th className="p-3 border-b border-slate-700 w-24 text-right">Run</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-xs">
                                        {testCases.map(tc => {
                                            const isPass = tc.status === 'pass';
                                            const isFail = tc.status === 'fail';
                                            return (
                                                <tr key={tc.id} className={`border-b border-slate-800 transition-colors ${isPass ? 'bg-green-900/10' : isFail ? 'bg-red-900/10' : 'hover:bg-slate-800/50'}`}>
                                                    <td className="p-3">
                                                        {tc.status === 'running' && <span className="animate-spin inline-block">⏳</span>}
                                                        {tc.status === 'pass' && <span className="text-green-400 font-bold">✅ PASS</span>}
                                                        {tc.status === 'fail' && <span className="text-red-400 font-bold">❌ FAIL</span>}
                                                        {tc.status === 'idle' && <span className="text-gray-600">⚪ IDLE</span>}
                                                    </td>
                                                    <td className="p-3 text-gray-500 font-mono">{tc.id}</td>
                                                    <td className="p-3 font-bold text-gray-300">
                                                        <input 
                                                            value={tc.name} 
                                                            onChange={e => updateTestCase(tc.id, { name: e.target.value })} 
                                                            className="bg-transparent border-none w-full focus:bg-slate-800 focus:outline-none rounded px-1"
                                                        />
                                                    </td>
                                                    <td className="p-3 text-blue-400 font-mono">{tc.actionId}</td>
                                                    <td className="p-3 font-mono text-yellow-500">
                                                        <input 
                                                            value={tc.expectJson} 
                                                            onChange={e => updateTestCase(tc.id, { expectJson: e.target.value })} 
                                                            className="bg-transparent border-none w-full focus:bg-slate-800 focus:outline-none rounded px-1"
                                                        />
                                                    </td>
                                                    <td className="p-3 text-gray-400">
                                                        {tc.resultMsg || '-'}
                                                    </td>
                                                    <td className="p-3 text-right flex justify-end gap-2">
                                                        <button 
                                                            onClick={() => runTest(tc.id)}
                                                            className="bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded shadow"
                                                            title="Run Single Test"
                                                        >
                                                            ▶️
                                                        </button>
                                                        <button 
                                                            onClick={() => {
                                                                if(confirm('Delete test case?')) setTestCases(prev => prev.filter(t => t.id !== tc.id));
                                                            }}
                                                            className="text-red-500 hover:text-red-400 px-1"
                                                            title="Delete"
                                                        >
                                                            ✕
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex justify-between items-center bg-slate-800 p-2 rounded text-xs text-gray-500">
                                <button onClick={() => setTestCases([...testCases, { id: `test_${Date.now()}`, name: 'New Case', actionId: 'act_forest_3', expectJson: 'res.wood:3', status: 'idle' }])} className="text-blue-400 hover:underline">+ Add Case</button>
                                <div>Tip: Ensure you have workers before running tests. Use "Control > Refill Workers" if needed.</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TestPanel;
