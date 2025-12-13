import React, { useState, useEffect } from 'react';
import { Player, Action, ResourceType } from '../types';
import { BASE_ACTIONS, ROUND_CARDS_POOL } from '../constants';
import PlayerPanel from './PlayerPanel';

interface TestCase {
    id: string;
    name: string;
    actionId: string;
    type: 'auto' | 'interactive';
    setupResources?: Partial<Player['res']>;
    setupType?: string; 
    expectJson: string; 
    status: 'idle' | 'waiting' | 'pass' | 'fail';
    resultMsg?: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    // Decoupled from main game state
    gameState?: any; 
    players?: any;
    debug?: any;
}

const TEST_PLAYER_TEMPLATE: Player = {
    id: 99,
    name: "Test Agent",
    color: "#a855f7", 
    type: 'human',
    res: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, veg: 0, workers: 2, maxWorkers: 2 },
    animals: { sheep: 0, boar: 0, cow: 0 },
    newborns: { sheep: 0, boar: 0, cow: 0 },
    newbornCount: 0,
    farm: Array(15).fill(0).map((_, idx) => (idx === 5 || idx === 10) ? 1 : 0),
    farmCounts: Array(15).fill(0),
    farmContent: Array(15).fill(null),
    fences: new Set(),
    stablesCount: 0,
    houseType: 'wood',
    majors: [],
    hand: [],
    playedCards: [],
    begging: 0,
    tempMode: null,
    harvestTemp: null,
    pendingBreeding: null,
    assignedAnimals: {},
    workshopsUsed: { reed: false, wood: false, clay: false },
    firewoodCollectorTriggered: false,
    roundGains: { wood: 0, clay: 0, reed: 0, stone: 0 }
};

const TestPanel: React.FC<Props> = ({ isOpen, onClose }) => {
    const [testCases, setTestCases] = useState<TestCase[]>([]);
    
    // FIX 1: Initialize with Set correctly. JSON.parse converts Set to {}, so we fix it immediately.
    const [localPlayer, setLocalPlayer] = useState<Player>(() => {
        const p = JSON.parse(JSON.stringify(TEST_PLAYER_TEMPLATE));
        p.fences = new Set();
        return p;
    });

    const [activeTestId, setActiveTestId] = useState<string | null>(null);
    const [tempSnapshot, setTempSnapshot] = useState<Player | null>(null);
    
    const [interactionMode, setInteractionMode] = useState<{
        mode: string;
        subTool?: 'room'|'stable';
        subSeed?: 'grain'|'veg';
    } | null>(null);

    useEffect(() => {
        if (testCases.length === 0) {
            const cases: TestCase[] = [];

            BASE_ACTIONS.forEach(act => {
                let type: TestCase['type'] = 'auto';
                let setupType = undefined;
                let setupRes = undefined;
                let expect = generateDefaultExpectation(act);

                if (act.mode === 'plow') {
                    type = 'interactive';
                    setupType = 'plow_interactive';
                    expect = '{"farm.fields": 1}';
                } else if (act.mode === 'build_menu') {
                    type = 'interactive';
                    setupType = 'build_interactive';
                    setupRes = { wood: 70, reed: 30 };
                    expect = '{"farm.rooms": 1}'; 
                }

                cases.push({
                    id: `base_${act.id}`,
                    name: act.name,
                    actionId: act.id,
                    type,
                    setupType,
                    setupResources: setupRes,
                    expectJson: expect,
                    status: 'idle'
                });
            });

            const sortedRounds = [...ROUND_CARDS_POOL].sort((a,b) => (a.stage||0) - (b.stage||0));
            sortedRounds.forEach(act => {
                let type: TestCase['type'] = 'auto';
                let setupType = undefined;
                let setupRes = undefined;
                let expect = generateDefaultExpectation(act);

                if (act.mode === 'plow_sow') {
                    type = 'interactive';
                    setupType = 'plow_sow_interactive';
                    setupRes = { grain: 20, veg: 20 };
                    expect = '{"farm.fields": 1, "farm.crops": 1}';
                }
                
                cases.push({
                    id: `round_${act.id}`,
                    name: `R${act.stage}: ${act.name}`,
                    actionId: act.id,
                    type,
                    setupType,
                    setupResources: setupRes,
                    expectJson: expect,
                    status: 'idle'
                });
            });

            setTestCases(cases);
        }
    }, []);

    // FIX 2: Removed the crashing useEffect that tried `new Set(prev.fences)` on `{}`.
    // Initialization logic handles it now.

    function generateDefaultExpectation(act: Action): string {
        const deltas: any = {};
        if (act.type === 'res') {
            if (['sheep','boar','cow'].includes(act.res!)) deltas[`animals.${act.res}`] = act.acc || act.amount || 1;
            else deltas[`res.${act.res}`] = act.acc || act.amount || 1;
        } else if (act.type === 'res_combo') {
            deltas['res.reed'] = 1; deltas['res.stone'] = 1; deltas['res.food'] = 1;
        }
        return JSON.stringify(deltas).replace(/"/g, '');
    }

    const runTest = (tc: TestCase) => {
        const freshPlayer = JSON.parse(JSON.stringify(TEST_PLAYER_TEMPLATE));
        freshPlayer.fences = new Set(); // Reset fences to Set

        if (tc.setupResources) {
            Object.entries(tc.setupResources).forEach(([k, v]) => {
                // @ts-ignore
                freshPlayer.res[k] = v;
            });
        }

        // Clone for snapshot, ensure fences is Set (though empty)
        const snapshot = JSON.parse(JSON.stringify(freshPlayer));
        snapshot.fences = new Set();

        setLocalPlayer(freshPlayer);
        setTempSnapshot(snapshot); 
        setActiveTestId(tc.id);
        
        updateTestCase(tc.id, { status: 'waiting', resultMsg: 'Running...' });

        if (tc.type === 'auto') {
            setTimeout(() => {
                const afterPlayer = applyAutoAction(freshPlayer, tc.actionId);
                setLocalPlayer(afterPlayer);
                verify(tc, freshPlayer, afterPlayer);
            }, 100);
        } else {
            if (tc.setupType === 'plow_interactive') {
                setInteractionMode({ mode: 'plow' });
            } else if (tc.setupType === 'build_interactive') {
                setInteractionMode({ mode: 'build', subTool: 'room' });
            } else if (tc.setupType === 'plow_sow_interactive') {
                setInteractionMode({ mode: 'plow_sow', subSeed: 'grain' });
            }
            updateTestCase(tc.id, { status: 'waiting', resultMsg: 'Waiting for user interaction...' });
        }
    };

    const applyAutoAction = (p: Player, actId: string): Player => {
        const newP = JSON.parse(JSON.stringify(p));
        // Restore Set safely
        newP.fences = p.fences instanceof Set ? new Set(p.fences) : new Set();
        
        const act = [...BASE_ACTIONS, ...ROUND_CARDS_POOL].find(a => a.id === actId);
        if (!act) return newP;

        if (act.type === 'res') {
            const amt = act.acc || act.amount || 0;
            if(['sheep','boar','cow'].includes(act.res!)) {
                // @ts-ignore
                newP.animals[act.res!] += amt;
            } else {
                // @ts-ignore
                newP.res[act.res!] += amt;
            }
        } else if (act.type === 'res_combo') {
            newP.res.reed++; newP.res.stone++; newP.res.food++;
        }
        
        return newP;
    };

    const handleFarmClick = (tileIdx: number) => {
        if (!interactionMode || !activeTestId) return;
        
        setLocalPlayer(prev => {
            const p = JSON.parse(JSON.stringify(prev));
            // FIX 3: Safe restore of Set
            // If prev.fences is Set, Array.from works.
            // If prev.fences is {} (from JSON parse of prev state somewhere?), Array.from({}) -> [].
            // This is safer than new Set(obj).
            p.fences = new Set(Array.from(prev.fences instanceof Set ? prev.fences : []));
            
            if (interactionMode.mode === 'plow') {
                if (p.farm[tileIdx] === 0) p.farm[tileIdx] = 2;
            }
            else if (interactionMode.mode === 'build') {
                if (p.farm[tileIdx] === 0) {
                    if (interactionMode.subTool === 'room') {
                        if (p.res.wood >= 5 && p.res.reed >= 2) {
                            p.farm[tileIdx] = 1;
                            p.res.wood -= 5; p.res.reed -= 2;
                        }
                    } else if (interactionMode.subTool === 'stable') {
                        if (p.res.wood >= 2) {
                            p.farm[tileIdx] = 5;
                            p.res.wood -= 2;
                            p.stablesCount++;
                        }
                    }
                }
            }
            else if (interactionMode.mode === 'plow_sow') {
                if (p.farm[tileIdx] === 0) {
                    p.farm[tileIdx] = 2; 
                } else if (p.farm[tileIdx] === 2 && !p.farmContent[tileIdx]) {
                    const seed = interactionMode.subSeed || 'grain';
                    if (p.res[seed] > 0) {
                        p.res[seed]--;
                        p.farmContent[tileIdx] = seed;
                        p.farmCounts[tileIdx] = seed === 'grain' ? 3 : 2;
                    }
                }
            }

            return p;
        });
    };

    const finishInteractiveTest = () => {
        if (!activeTestId || !tempSnapshot) return;
        const tc = testCases.find(t => t.id === activeTestId);
        if (!tc) return;

        verify(tc, tempSnapshot, localPlayer);
        
        // Cleanup resources
        setLocalPlayer(prev => ({
            ...prev,
            res: { ...prev.res, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, veg: 0 }
        }));
        
        setInteractionMode(null);
        setActiveTestId(null);
        setTempSnapshot(null);
    };

    const verify = (tc: TestCase, before: any, after: any) => {
        try {
            let jsonStr = tc.expectJson.replace(/(\w+(\.\w+)*):/g, '"$1":');
            if (!jsonStr.startsWith('{')) jsonStr = '{' + jsonStr + '}';
            const expected = JSON.parse(jsonStr);
            const errors: string[] = [];

            Object.keys(expected).forEach(key => {
                const expDelta = expected[key];
                const v1 = getValue(before, key);
                const v2 = getValue(after, key);
                const actualDelta = v2 - v1;

                if (actualDelta !== expDelta) {
                    errors.push(`${key}: exp +${expDelta}, got ${actualDelta}`);
                }
            });

            if (errors.length === 0) {
                updateTestCase(tc.id, { status: 'pass', resultMsg: 'OK' });
            } else {
                updateTestCase(tc.id, { status: 'fail', resultMsg: errors.join(', ') });
            }
        } catch (e) {
            console.error(e);
            updateTestCase(tc.id, { status: 'fail', resultMsg: 'JSON Error' });
        }
    };

    const getValue = (p: Player, path: string): number => {
        if (path === 'farm.fields') return p.farm.filter(x => x === 2).length;
        if (path === 'farm.rooms') return p.farm.filter(x => x === 1).length;
        if (path === 'farm.crops') return p.farmContent.filter(x => x !== null).length;
        const parts = path.split('.');
        // @ts-ignore
        return parts.reduce((obj, key) => obj?.[key], p) || 0;
    };

    const updateTestCase = (id: string, partial: Partial<TestCase>) => {
        setTestCases(prev => prev.map(t => t.id === id ? { ...t, ...partial } : t));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] bg-black/95 flex text-sm font-sans text-gray-200">
            {/* Sidebar */}
            <div className="w-1/3 border-r border-gray-700 flex flex-col bg-gray-900">
                <div className="p-4 border-b border-gray-700 bg-gray-800 flex justify-between items-center">
                    <h2 className="font-bold text-lg text-purple-400">🧪 Unit Tests</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">Close</button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {testCases.map(tc => (
                        <div key={tc.id} className={`p-3 border-b border-gray-800 flex flex-col gap-1 hover:bg-gray-800/50 ${activeTestId === tc.id ? 'bg-purple-900/20 border-l-4 border-l-purple-500' : ''}`}>
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-gray-300">{tc.name}</span>
                                {tc.status === 'pass' && <span className="text-green-400 font-bold">PASS</span>}
                                {tc.status === 'fail' && <span className="text-red-400 font-bold">FAIL</span>}
                                {tc.status === 'waiting' && <span className="text-yellow-400 animate-pulse">RUNNING</span>}
                                {tc.status === 'idle' && <button onClick={() => runTest(tc)} className="bg-gray-700 px-2 py-0.5 rounded text-xs hover:bg-gray-600">Run</button>}
                            </div>
                            <div className="text-xs text-gray-500 flex gap-2">
                                <span>Expect: {tc.expectJson}</span>
                            </div>
                            {tc.resultMsg && <div className={`text-xs ${tc.status === 'fail' ? 'text-red-300' : 'text-gray-400'}`}>{tc.resultMsg}</div>}
                        </div>
                    ))}
                </div>
            </div>

            {/* Main */}
            <div className="flex-1 p-8 bg-stone-900 flex flex-col items-center overflow-y-auto">
                <h1 className="text-2xl font-bold mb-6 text-stone-400">Test Environment</h1>
                
                {interactionMode && (
                    <div className="bg-purple-900/40 border border-purple-500 p-4 rounded-lg mb-6 w-full max-w-2xl shadow-lg animate-fadeIn">
                        <div className="flex justify-between items-center">
                            <div>
                                <div className="text-purple-300 font-bold text-lg mb-1">
                                    Interactive Test: {interactionMode.mode.toUpperCase()}
                                </div>
                                <div className="text-purple-200/70 text-xs">
                                    Click on the farm below to simulate player actions.
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {interactionMode.mode === 'build' && (
                                    <>
                                        <button onClick={() => setInteractionMode({...interactionMode, subTool:'room'})} className={`px-3 py-1 rounded text-xs border ${interactionMode.subTool==='room'?'bg-blue-600 border-blue-400':'border-gray-500'}`}>Room</button>
                                        <button onClick={() => setInteractionMode({...interactionMode, subTool:'stable'})} className={`px-3 py-1 rounded text-xs border ${interactionMode.subTool==='stable'?'bg-orange-600 border-orange-400':'border-gray-500'}`}>Stable</button>
                                    </>
                                )}
                                {interactionMode.mode === 'plow_sow' && (
                                    <>
                                        <button onClick={() => setInteractionMode({...interactionMode, subSeed:'grain'})} className={`px-3 py-1 rounded text-xs border ${interactionMode.subSeed==='grain'?'bg-yellow-600 border-yellow-400':'border-gray-500'}`}>Grain</button>
                                        <button onClick={() => setInteractionMode({...interactionMode, subSeed:'veg'})} className={`px-3 py-1 rounded text-xs border ${interactionMode.subSeed==='veg'?'bg-orange-600 border-orange-400':'border-gray-500'}`}>Veg</button>
                                    </>
                                )}
                                <button onClick={finishInteractiveTest} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold shadow ml-4">
                                    Verify Result
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="scale-110 origin-top">
                    <PlayerPanel 
                        player={localPlayer} 
                        isActive={true} 
                        isNextStart={false} 
                        onFarmClick={handleFarmClick}
                    />
                </div>

                <div className="mt-8 text-gray-500 text-xs max-w-lg text-center">
                    This is an isolated test instance. Actions taken here do not affect the main game.
                    Resources are injected automatically when a test case starts and reset after verification.
                </div>
            </div>
        </div>
    );
};

export default TestPanel;