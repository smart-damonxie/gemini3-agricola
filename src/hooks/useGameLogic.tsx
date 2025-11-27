
import { useState, useRef, useEffect, useCallback } from 'react';
import { Player, GameState, Action, LogEntry, MajorCard, HarvestConversion, ResourceType } from '../types';
import { BASE_ACTIONS, DB_MAJORS, HARVEST_ROUNDS, MAX_ROUNDS, ROUND_CARDS_POOL, LIMIT_STABLES } from '../constants';
import { calculateAllocation, hasNeighbor, validateFenceRules } from '../utils/gameLogic';
import { getAIAction, aiDiscardOverflow } from '../utils/aiStrategy';

const INITIAL_PLAYERS: Player[] = Array.from({ length: 4 }, (_, i) => ({
    id: i,
    name: i === 0 ? "You (Blue)" : `AI ${['Red', 'Green', 'Yellow'][i - 1]}`,
    color: i === 0 ? '#29b6f6' : ['#ef5350', '#66bb6a', '#ffee58'][i - 1],
    type: i === 0 ? 'human' : 'ai',
    res: { wood: 0, clay: 0, reed: 0, stone: 0, food: (i === 0 ? 2 : 3), grain: 0, veg: 0, workers: 2, maxWorkers: 2 },
    animals: { sheep: 0, boar: 0, cow: 0 },
    farm: Array(15).fill(0).map((_, idx) => (idx === 5 || idx === 10) ? 1 : 0),
    farmCounts: Array(15).fill(0),
    farmContent: Array(15).fill(null),
    fences: new Set(),
    stablesCount: 0,
    houseType: 'wood',
    majors: [],
    begging: 0,
    tempMode: null,
    harvestTemp: null,
    pendingBreeding: null,
    assignedAnimals: {} 
}));

export const useGameLogic = () => {
    const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS);
    const [gameState, setGameState] = useState<GameState>({
        round: 1,
        startPlayer: 0,
        nextStartPlayer: 0,
        turnIdx: 0,
        occupied: {},
        roundCards: [],
        deck: [],
        majors: [...DB_MAJORS],
        harvestPhase: false,
        harvestSubPhase: null,
        harvestState: null,
        pendingAction: null,
        overflowQueue: []
    });
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [floatText, setFloatText] = useState<{ id: number, text: string, x: number, y: number }[]>([]);
    const [viewingCard, setViewingCard] = useState<MajorCard | null>(null);
    const [isAdjustingAnimals, setIsAdjustingAnimals] = useState(false);
    
    // Refs for mutable access in timeouts/loops
    const stateRef = useRef({ players: INITIAL_PLAYERS, gameState: gameState });
    
    // Concurrency / Loop Controls
    const initRef = useRef(false);
    const roundLock = useRef(0); // Prevents duplicate endRound calls
    const loggedRoundRef = useRef(1); // Prevents duplicate "Round Unlocked" logs
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync Ref with State
    useEffect(() => {
        stateRef.current.players = players;
        stateRef.current.gameState = gameState;
    }, [players, gameState]);

    const addLog = useCallback((msg: string, color: string = '#b0bec5') => {
        setLogs(prev => [{ id: Date.now() + Math.random(), msg, color }, ...prev].slice(0, 80));
    }, []);

    // Timer Utility
    const scheduleNext = useCallback((fn: () => void, delay: number) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            fn();
        }, delay);
    }, []);

    const clearGameTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    // State Updaters
    const updatePlayer = (id: number, updater: (p: Player) => Player) => {
        const newPlayers = stateRef.current.players.map(p => p.id === id ? updater({ ...p }) : p);
        setPlayers(newPlayers);
        stateRef.current.players = newPlayers;
    };

    const updateGameState = (updater: (g: GameState) => GameState) => {
        const newState = updater({ ...stateRef.current.gameState });
        setGameState(newState);
        stateRef.current.gameState = newState;
    };

    // DEBUG HELPERS
    const debugSetState = (newGs: GameState) => {
        setGameState(newGs);
        stateRef.current.gameState = newGs;
    };
    const debugSetPlayers = (newPs: Player[]) => {
        setPlayers(newPs);
        stateRef.current.players = newPs;
    };
    const debugForceAction = (actId: string) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        
        if (stateRef.current.players[pIdx].res.workers <= 0) {
            updatePlayer(pIdx, p => ({...p, res: {...p.res, workers: 1}}));
        }
        if (stateRef.current.gameState.occupied[actId] !== undefined) {
             const newOcc = { ...stateRef.current.gameState.occupied };
             delete newOcc[actId];
             updateGameState(prev => ({...prev, occupied: newOcc}));
        }
        clickAction(actId);
    };

    // --- Init ---
    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;

        const deck = setupDeck();
        const sp = Math.floor(Math.random() * 4);
        const newGs: GameState = {
            ...gameState,
            deck,
            startPlayer: sp,
            nextStartPlayer: sp,
            roundCards: deck.length > 0 ? [deck.shift()!] : []
        };
        setGameState(newGs);
        stateRef.current.gameState = newGs;
        addLog("🎮 Game Started!", "white");
        
        scheduleNext(() => nextTurn(), 500);

        return () => clearGameTimer();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function setupDeck() {
        const stages: {[key:number]: Action[]} = {1:[], 2:[], 3:[], 4:[], 5:[], 6:[]};
        ROUND_CARDS_POOL.forEach(c => stages[c.stage!].push({...c}));
        let deck: Action[] = [];
        for(let i=1; i<=6; i++) {
            if(stages[i].length > 0) deck = deck.concat(stages[i].sort(() => Math.random() - 0.5));
        }
        return deck;
    }

    // --- Game Loop ---
    const nextTurn = () => {
        const { gameState: gs, players: ps } = stateRef.current;
        if (gs.harvestPhase) return;

        const allWorkersUsed = ps.every(p => p.res.workers <= 0);
        if (allWorkersUsed) {
            endRound();
            return;
        }

        let pIdx = (gs.startPlayer + gs.turnIdx) % 4;
        let p = ps[pIdx];
        let loopGuard = 0;

        while (p.res.workers <= 0) {
            gs.turnIdx++;
            pIdx = (gs.startPlayer + gs.turnIdx) % 4;
            p = ps[pIdx];
            loopGuard++;
            if(loopGuard > 10) { endRound(); return; }
        }
        
        updateGameState(prev => ({ ...prev, turnIdx: gs.turnIdx }));

        if (p.type === 'ai') {
            scheduleNext(() => aiPlay(p), 800);
        }
    };

    const endRound = () => {
        const { gameState: gs, players: ps } = stateRef.current;
        
        if (roundLock.current >= gs.round) return;
        roundLock.current = gs.round;

        clearGameTimer();
        addLog(`=== End of Round ${gs.round} ===`, '#fff');

        const newPlayers = ps.map(p => {
            let foodBonus = 0;
            if (p.majors.some(m => m.special === 'well')) foodBonus = 1;
            return {
                ...p,
                res: { ...p.res, workers: p.res.maxWorkers, food: p.res.food + foodBonus }
            };
        });
        setPlayers(newPlayers);
        stateRef.current.players = newPlayers;

        const allActions = [...BASE_ACTIONS, ...gs.roundCards];
        allActions.forEach(act => {
            if (act.acc) act.cur = (act.cur || 0) + act.acc;
        });
        
        updateGameState(prev => ({ ...prev, occupied: {} }));

        if (HARVEST_ROUNDS.includes(gs.round)) {
            performHarvest();
        } else {
            advanceRound();
        }
    };

    const advanceRound = () => {
        const { gameState: gs } = stateRef.current;
        if (gs.round >= MAX_ROUNDS) return;

        const newDeck = [...gs.deck];
        const newRoundCards = [...gs.roundCards];
        
        let unlockedName = "";
        if (newDeck.length > 0) {
            const card = newDeck.shift()!;
            newRoundCards.push(card);
            unlockedName = card.name;
        }

        const nextRound = gs.round + 1;
        
        updateGameState(prev => ({
            ...prev,
            round: nextRound,
            deck: newDeck,
            roundCards: newRoundCards,
            startPlayer: prev.nextStartPlayer,
            turnIdx: 0
        }));

        if (unlockedName && loggedRoundRef.current < nextRound) {
            addLog(`🆕 Round ${nextRound}: [${unlockedName}] unlocked`, 'white');
            loggedRoundRef.current = nextRound;
        }
        addLog(`>>> Round ${nextRound} Start`, '#4fc3f7');
        
        scheduleNext(() => nextTurn(), 1000);
    };

    // --- AI ---
    const aiPlay = (p: Player) => {
        try {
            const { gameState: gs } = stateRef.current;
            const act = getAIAction(gs, p);

            if (act) {
                handleAIActionEffect(p, act);
            } else {
                addLog(`${p.name} passed`, p.color);
                updatePlayer(p.id, pp => ({...pp, res: {...pp.res, workers: 0}}));
                updateGameState(prev => ({...prev, turnIdx: prev.turnIdx + 1}));
                scheduleNext(() => nextTurn(), 500);
            }
        } catch (e) {
            console.error("AI Crash Recovery", e);
            addLog(`AI ${p.name} stumbled. Skipping turn.`, "red");
            updatePlayer(p.id, pp => ({...pp, res: {...pp.res, workers: 0}}));
            updateGameState(prev => ({...prev, turnIdx: prev.turnIdx + 1}));
            scheduleNext(() => nextTurn(), 500);
        }
    };

    // --- Actions ---
    const handleAIActionEffect = (p: Player, act: Action) => {
        if (stateRef.current.gameState.occupied[act.id] !== undefined) {
             addLog(`${p.name} bumped into occupied slot ${act.name}.`, 'red');
             if (p.type === 'ai') {
                 updatePlayer(p.id, pp => ({...pp, res: {...pp.res, workers: 0}}));
             }
             updateGameState(prev => ({...prev, turnIdx: prev.turnIdx + 1}));
             scheduleNext(() => nextTurn(), 500);
             return;
        }

        const newP = { ...p, res: {...p.res}, animals: {...p.animals} };

        if (act.type === 'res') {
            const amt = act.cur || act.amount || 0;
            if (['sheep','boar','cow'].includes(act.res!)) {
                // @ts-ignore
                newP.animals[act.res!] += amt;
                if(act.acc) act.cur = 0;
            } else {
                // @ts-ignore
                newP.res[act.res!] += amt;
                if(act.acc) act.cur = 0;
            }
            addLog(`${p.name} took ${act.name}`, p.color);
        } else if (act.type === 'res_combo') {
            if (act.id === 'act_market') {
                newP.res.reed += 1; newP.res.stone += 1; newP.res.food += 1;
                addLog(`${p.name} took Resource Market`, p.color);
            }
        } else if (act.mode === 'meeting') {
            updateGameState(prev => ({...prev, nextStartPlayer: p.id}));
            addLog(`${p.name} took Start Player`, p.color);
        } else if (act.mode === 'grow' || act.mode === 'grow_force') {
             if (newP.res.maxWorkers < 5) {
                 newP.res.maxWorkers += 1;
                 addLog(`${p.name} grew family to ${newP.res.maxWorkers}`, p.color);
             }
        } else {
            addLog(`${p.name} took ${act.name} (Simplified)`, p.color);
        }

        newP.res.workers--;
        
        const newOccupied = { ...stateRef.current.gameState.occupied, [act.id]: p.id };
        updateGameState(prev => ({ ...prev, occupied: newOccupied }));
        
        const allPlayers = [...stateRef.current.players];
        allPlayers[p.id] = newP;
        setPlayers(allPlayers);
        stateRef.current.players = allPlayers;
        
        updateGameState(prev => ({ ...prev, turnIdx: prev.turnIdx + 1 }));
        
        scheduleNext(() => nextTurn(), 500);
    };

    // ================= HARVEST LOGIC =================

    const performHarvest = () => {
        addLog(`🌾 --- HARVEST BEGINS ---`, '#ff9800');
        updateGameState(prev => ({ 
            ...prev, 
            harvestPhase: true, 
            harvestSubPhase: 'field' 
        }));
        
        // Step 1: Field Phase (Automatic for everyone)
        scheduleNext(() => processFieldPhase(), 500);
    };

    // --- Phase 1: Field Harvest ---
    const processFieldPhase = () => {
        const ps = stateRef.current.players.map(p => {
            const newP = { ...p, res: { ...p.res }, farmCounts: [...p.farmCounts], farmContent: [...p.farmContent] };
            let harvested = 0;
            for (let i = 0; i < 15; i++) {
                if (newP.farm[i] === 2 && newP.farmCounts[i] > 0) {
                    const type = newP.farmContent[i]!;
                    newP.res[type]++;
                    newP.farmCounts[i]--;
                    if (newP.farmCounts[i] === 0) newP.farmContent[i] = null;
                    harvested++;
                }
            }
            if (harvested > 0) {
                addLog(`${p.name} harvested crops from ${harvested} fields`, p.color);
            }
            return newP;
        });
        setPlayers(ps);
        stateRef.current.players = ps;

        addLog("🌾 Field Harvest Complete. Proceeding to Feeding...", '#ccc');
        
        // Move to Phase 2: Feed
        updateGameState(prev => ({
            ...prev,
            harvestSubPhase: 'feed',
            harvestState: {
                queue: Array.from({ length: 4 }, (_, i) => (prev.startPlayer + i) % 4),
                currentIdx: 0
            }
        }));
        scheduleNext(() => processFeedPhase(), 1000);
    };

    // --- Phase 2: Feeding ---
    const processFeedPhase = () => {
        const { harvestState } = stateRef.current.gameState;
        if (!harvestState || harvestState.currentIdx >= harvestState.queue.length) {
            // Feeding Done -> Move to Breeding
            addLog("🍲 Feeding Complete. Proceeding to Breeding...", '#ccc');
            updateGameState(prev => ({
                ...prev,
                harvestSubPhase: 'breed',
                harvestState: {
                    queue: Array.from({ length: 4 }, (_, i) => (prev.startPlayer + i) % 4),
                    currentIdx: 0
                }
            }));
            scheduleNext(() => processBreedPhase(), 500);
            return;
        }

        const pIdx = harvestState.queue[harvestState.currentIdx];
        const p = stateRef.current.players[pIdx];

        if (p.type === 'human') {
            // Init temp for human
            updatePlayer(p.id, pp => ({
                ...pp,
                harvestTemp: { grain: 0, veg: 0, sheep: 0, boar: 0, cow: 0 }
            }));
            // Wait for human to click Confirm in UI
        } else {
            // AI Auto Feed
            aiHarvestFeed(p);
        }
    };

    const aiHarvestFeed = (p: Player) => {
        const newP: Player = { ...p, res: { ...p.res }, animals: { ...p.animals }, begging: p.begging };
        const need = newP.res.maxWorkers * 2;
        let deficit = need - newP.res.food;

        // Simple AI Strategy: Use crops first
        if (deficit > 0 && newP.res.grain > 0) { 
            const take = Math.min(newP.res.grain, deficit); newP.res.grain-=take; newP.res.food+=take; deficit-=take; 
        }
        if (deficit > 0 && newP.res.veg > 0) { 
            const take = Math.min(newP.res.veg, deficit); newP.res.veg-=take; newP.res.food+=take; deficit-=take; 
        }
        
        // Animals
        const cooker = newP.majors.find(m => (m.type==='cook'||m.type==='bake') && m.cook);
        if (deficit > 0 && cooker) {
             ['sheep', 'boar', 'cow'].forEach(t => {
                 // @ts-ignore
                 while (deficit > 0 && newP.animals[t] > 0) { 
                     // @ts-ignore
                     newP.animals[t]--;
                     // @ts-ignore
                     newP.res.food += cooker.cook[t];
                     // @ts-ignore
                     deficit -= cooker.cook[t];
                 }
             });
        }

        const pay = Math.min(newP.res.food, need);
        newP.res.food -= pay;
        const begging = need - pay;
        if (begging > 0) newP.begging += begging;

        addLog(`${newP.name} fed workers (Begging: ${begging})`, newP.color);
        updatePlayer(p.id, () => newP);

        scheduleNext(() => {
            updateGameState(prev => ({
                ...prev,
                harvestState: { ...prev.harvestState!, currentIdx: prev.harvestState!.currentIdx + 1 }
            }));
            processFeedPhase();
        }, 600);
    };

    // Shared Harvest Adjustment (Used for Feed & Breed conversion)
    const adjustHarvest = (key: keyof HarvestConversion, delta: number) => {
        const { harvestState } = stateRef.current.gameState;
        if (!harvestState) return;
        const pIdx = harvestState.queue[harvestState.currentIdx];
        updatePlayer(pIdx, p => {
             if (!p.harvestTemp) return p;
             const val = p.harvestTemp[key];
             const limit = key === 'grain' ? p.res.grain : key === 'veg' ? p.res.veg : p.animals[key];
             
             if (val + delta >= 0 && val + delta <= limit) {
                 return { ...p, harvestTemp: { ...p.harvestTemp, [key]: val + delta } };
             }
             return p;
        });
    };

    const resetHarvest = () => {
        const { harvestState } = stateRef.current.gameState;
        if (!harvestState) return;
        const pIdx = harvestState.queue[harvestState.currentIdx];
        updatePlayer(pIdx, p => ({ ...p, harvestTemp: { grain: 0, veg: 0, sheep: 0, boar: 0, cow: 0 } }));
    };

    const confirmHarvest = () => {
        const { harvestState, harvestSubPhase } = stateRef.current.gameState;
        if (!harvestState) return;
        const pIdx = harvestState.queue[harvestState.currentIdx];
        const p = stateRef.current.players[pIdx];

        if (!p.harvestTemp) return;

        // Perform Conversion
        const t = p.harvestTemp;
        const cooker = p.majors.find(m => (m.type==='cook'||m.type==='bake') && m.cook);
        
        let gain = t.grain; 
        gain += t.veg;
        if (cooker && cooker.cook) {
            gain += t.sheep * cooker.cook.sheep;
            gain += t.boar * cooker.cook.boar;
            gain += t.cow * cooker.cook.cow;
        }

        const newP = { ...p, res: { ...p.res }, animals: { ...p.animals } };
        newP.res.grain -= t.grain; newP.res.veg -= t.veg;
        newP.animals.sheep -= t.sheep; newP.animals.boar -= t.boar; newP.animals.cow -= t.cow;
        newP.res.food += gain;
        
        newP.harvestTemp = null; // Clear temp

        // If Phase 2: Feed & Next
        if (harvestSubPhase === 'feed') {
            const need = newP.res.maxWorkers * 2;
            const pay = Math.min(newP.res.food, need);
            newP.res.food -= pay;
            const begging = need - pay;
            if (begging > 0) newP.begging += begging;
            addLog(`${newP.name} fed workers (Converted +${gain} food)`, newP.color);
            
            updatePlayer(pIdx, () => newP);
            scheduleNext(() => {
                updateGameState(prev => ({
                    ...prev,
                    harvestState: { ...prev.harvestState!, currentIdx: prev.harvestState!.currentIdx + 1 }
                }));
                processFeedPhase();
            }, 200);
        }
        // If Phase 3: Breed - This is "Confirm Discard/Changes"
        else if (harvestSubPhase === 'breed') {
            addLog(`${newP.name} converted animals to food (+${gain}) to make room`, newP.color);
            // Now resolve the breeding (add newborn if fits, discard if not)
            resolveBreeding(newP); 
        }
    };

    // --- Phase 3: Breeding ---
    const processBreedPhase = () => {
        const { harvestState } = stateRef.current.gameState;
        if (!harvestState || harvestState.currentIdx >= harvestState.queue.length) {
            // Harvest Done
            addLog("👶 Breeding Complete. Harvest End.", '#fff');
            updateGameState(prev => ({ ...prev, harvestPhase: false, harvestSubPhase: null, harvestState: null }));
            advanceRound();
            return;
        }

        const pIdx = harvestState.queue[harvestState.currentIdx];
        const p = stateRef.current.players[pIdx];

        // 1. Calculate Newborns
        const newborns = { sheep: 0, boar: 0, cow: 0 };
        if (p.animals.sheep >= 2) newborns.sheep = 1;
        if (p.animals.boar >= 2) newborns.boar = 1;
        if (p.animals.cow >= 2) newborns.cow = 1;
        
        const hasNewborns = newborns.sheep + newborns.boar + newborns.cow > 0;

        if (!hasNewborns) {
            // Skip
            updateGameState(prev => ({
                ...prev,
                harvestState: { ...prev.harvestState!, currentIdx: prev.harvestState!.currentIdx + 1 }
            }));
            processBreedPhase();
            return;
        }

        // 2. Check Capacity (Simulate)
        const simP = { ...p, animals: { 
            sheep: p.animals.sheep + newborns.sheep,
            boar: p.animals.boar + newborns.boar,
            cow: p.animals.cow + newborns.cow
        }};
        const simAlloc = calculateAllocation(simP);
        const willOverflow = simAlloc.overflow > 0;

        if (p.type === 'human') {
            updatePlayer(p.id, pp => ({
                ...pp,
                pendingBreeding: newborns,
                harvestTemp: { grain: 0, veg: 0, sheep: 0, boar: 0, cow: 0 } // Init conversion tool
            }));
        } else {
            // AI Logic
            if (willOverflow) {
                // AI Discards Overflow
                const discarded = aiDiscardOverflow(simP, simAlloc.overflow);
                simP.animals.sheep -= discarded.sheep;
                simP.animals.boar -= discarded.boar;
                simP.animals.cow -= discarded.cow;
                
                addLog(`${p.name} bred animals but overflowed -${simAlloc.overflow}`, p.color);
                updatePlayer(p.id, () => simP);
            } else {
                ['sheep', 'boar', 'cow'].forEach(t => {
                    // @ts-ignore
                    if (newborns[t]) addLog(`${p.name} bred 1 ${t}`, p.color);
                });
                updatePlayer(p.id, () => simP);
            }
            scheduleNext(() => {
                updateGameState(prev => ({
                    ...prev,
                    harvestState: { ...prev.harvestState!, currentIdx: prev.harvestState!.currentIdx + 1 }
                }));
                processBreedPhase();
            }, 600);
        }
    };

    const resolveBreeding = (p: Player) => {
        if (!p.pendingBreeding) return;
        const newborns = p.pendingBreeding;
        
        // Add newborns to the Player (who might have just reduced population via conversion)
        const finalP = { ...p, animals: {
            sheep: p.animals.sheep + newborns.sheep,
            boar: p.animals.boar + newborns.boar,
            cow: p.animals.cow + newborns.cow
        }};

        // Check Overflow
        const alloc = calculateAllocation(finalP);
        if (alloc.overflow > 0) {
            // Discard Overflow (Auto discard newborns/excess)
            const discarded = aiDiscardOverflow(finalP, alloc.overflow);
            finalP.animals.sheep -= discarded.sheep;
            finalP.animals.boar -= discarded.boar;
            finalP.animals.cow -= discarded.cow;
            addLog(`${p.name} processed breeding (Discarded ${alloc.overflow} overflow)`, p.color);
        } else {
            ['sheep', 'boar', 'cow'].forEach(t => {
                // @ts-ignore
                if (newborns[t]) addLog(`${p.name} bred 1 ${t}`, p.color);
            });
        }

        finalP.pendingBreeding = null;
        updatePlayer(p.id, () => finalP);

        // Next
        const { harvestState } = stateRef.current.gameState;
        scheduleNext(() => {
            updateGameState(prev => ({
                ...prev,
                harvestState: { ...prev.harvestState!, currentIdx: harvestState!.currentIdx + 1 }
            }));
            processBreedPhase();
        }, 200);
    };

    // --- Anytime Conversion ---
    const toggleConversion = () => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        const p = stateRef.current.players[pIdx];

        if (p.conversionTemp) {
            updatePlayer(pIdx, pp => ({ ...pp, conversionTemp: null }));
        } else {
            updatePlayer(pIdx, pp => ({ ...pp, conversionTemp: { grain: 0, veg: 0, sheep: 0, boar: 0, cow: 0 } }));
        }
    };

    const adjustConversion = (key: keyof HarvestConversion, delta: number) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => {
             if (!p.conversionTemp) return p;
             const val = p.conversionTemp[key];
             const limit = key === 'grain' ? p.res.grain : key === 'veg' ? p.res.veg : p.animals[key];
             
             if (val + delta >= 0 && val + delta <= limit) {
                 return { ...p, conversionTemp: { ...p.conversionTemp, [key]: val + delta } };
             }
             return p;
        });
    };

    const confirmConversion = () => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        const p = stateRef.current.players[pIdx];

        if (!p.conversionTemp) return;

        const t = p.conversionTemp;
        const cooker = p.majors.find(m => (m.type==='cook'||m.type==='bake') && m.cook);
        
        let gain = t.grain + t.veg; 
        if (cooker && cooker.cook) {
            gain += t.sheep * cooker.cook.sheep;
            gain += t.boar * cooker.cook.boar;
            gain += t.cow * cooker.cook.cow;
        }

        if (gain === 0) {
            updatePlayer(pIdx, pp => ({ ...pp, conversionTemp: null }));
            return;
        }

        const newP = { ...p, res: { ...p.res }, animals: { ...p.animals } };
        newP.res.grain -= t.grain; newP.res.veg -= t.veg;
        newP.animals.sheep -= t.sheep; newP.animals.boar -= t.boar; newP.animals.cow -= t.cow;
        newP.res.food += gain;
        newP.conversionTemp = null; 

        addLog(`${p.name} converted resources to +${gain} Food`, p.color);
        updatePlayer(pIdx, () => newP);
    };

    // --- Animal Management ---
    const toggleAnimalManager = () => setIsAdjustingAnimals(prev => !prev);
    
    const saveAnimalAssignment = (assignments: { [key: number]: ResourceType[] }) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => ({ ...p, assignedAnimals: assignments }));
        setIsAdjustingAnimals(false);
        addLog("Updated animal placement strategy", "green");
    };

    // --- Human Interaction ---
    const clickAction = (actId: string) => {
         const { startPlayer, turnIdx, occupied, roundCards } = stateRef.current.gameState;
         const pIdx = (startPlayer + turnIdx) % 4;
         const p = stateRef.current.players[pIdx];

         if (p.type !== 'human' && p.type !== 'ai') return;

         const act = BASE_ACTIONS.find(a => a.id === actId) || roundCards.find(a => a.id === actId);
         if (!act) return;

         if (act.mode === 'grow') {
             const rooms = p.farm.filter(t => t === 1).length;
             if (p.res.maxWorkers >= rooms) {
                 addLog("Cannot grow: Needs more empty rooms (Rooms > Family)", "red");
                 return;
             }
         }
         
         if (act.mode === 'grow' || act.mode === 'grow_force') {
             if (p.res.maxWorkers >= 5) {
                 addLog("Max family size (5) reached", "red");
                 return;
             }
         }

         const snapshotObj = { ...p, fences: Array.from(p.fences) };
         updateGameState(prev => ({
             ...prev,
             pendingAction: { pIdx: p.id, timer: null, snapshot: JSON.stringify(snapshotObj), flags: {} }
         }));

         if (act.type === 'res' || act.type === 'res_combo' || act.mode === 'meeting') {
             updatePlayer(p.id, pp => ({...pp, tempMode: { mode: 'simple', actId } }));
         } else {
             let defaultSeed: 'grain' | 'veg' | undefined;
             if (act.mode === 'sow' || act.mode === 'plow_sow') {
                 if (p.res.grain > 0) defaultSeed = 'grain';
                 else if (p.res.veg > 0) defaultSeed = 'veg';
                 else defaultSeed = 'grain';
             }

             updatePlayer(p.id, pp => ({...pp, tempMode: { mode: act.mode!, actId, currentTool: 'room', currentSeed: defaultSeed } }));
         }
    };

    const cancelMode = () => {
         const { pendingAction } = stateRef.current.gameState;
         if (pendingAction) {
             const oldP = JSON.parse(pendingAction.snapshot);
             oldP.fences = new Set(oldP.fences);
             oldP.tempMode = null;
             updatePlayer(pendingAction.pIdx, () => oldP);
             updateGameState(prev => ({...prev, pendingAction: null}));
         }
    };

    const confirmModeAction = (pId: number) => {
         const p = stateRef.current.players[pId];
         if (!p.tempMode) return;
         
         const pending = stateRef.current.gameState.pendingAction;
         const { roundCards } = stateRef.current.gameState;
         const actId = p.tempMode.actId;
         const act = BASE_ACTIONS.find(a => a.id === actId) || roundCards.find(a => a.id === actId);
         
         if (pending && pending.pIdx === pId) {
             const oldP = JSON.parse(pending.snapshot);
             const mode = p.tempMode.mode;
             let isValid = true;
             let errMsg = "";
             
             let farmStructureChanged = false;

             const countType = (pl: any, t: number) => pl.farm.filter((x:number) => x===t).length;
             
             if (mode === 'simple' && act) {
                 const newP = { ...p, res: {...p.res}, animals: {...p.animals} };
                 if (act.type === 'res') {
                    const amt = act.cur || act.amount || 0;
                    if (['sheep','boar','cow'].includes(act.res!)) {
                        // @ts-ignore
                        newP.animals[act.res!] += amt;
                    } else {
                        // @ts-ignore
                        newP.res[act.res!] += amt;
                    }
                    if(act.acc) act.cur = 0; 
                 } else if (act.type === 'res_combo') {
                    if (act.id === 'act_market') {
                        newP.res.reed += 1; newP.res.stone += 1; newP.res.food += 1;
                    }
                 } else if (act.mode === 'meeting') {
                     updateGameState(prev => ({...prev, nextStartPlayer: p.id}));
                     addLog(`${p.name} took Start Player`, p.color);
                 }
                 addLog(`${p.name} took ${act.name}`, p.color);
                 updatePlayer(pId, () => newP);
             } 
             else {
                 if (mode === 'build_menu') {
                     if (countType(p, 1) + countType(p, 5) <= countType(oldP, 1) + countType(oldP, 5)) {
                         isValid = false; errMsg = "Must build at least one room or stable!";
                     } else {
                         farmStructureChanged = true;
                     }
                     if (isValid && !validateFenceRules(p)) {
                         isValid = false; errMsg = "Cannot build Rooms/Fields inside existing fenced pastures!";
                     }
                 }
                 if (mode === 'plow' || mode === 'plow_sow') {
                     if (countType(p, 2) <= countType(oldP, 2)) {
                         isValid = false; errMsg = "Must plow at least one field!";
                     } else {
                        farmStructureChanged = true;
                     }
                     if (isValid && !validateFenceRules(p)) {
                         isValid = false; errMsg = "Cannot plow fields inside existing fenced pastures!";
                     }
                 }
                 if (mode === 'fence' || mode === 'reno_fence') {
                     if (p.fences.size <= oldP.fences.length) { 
                          if(mode === 'fence') { isValid = false; errMsg = "Must build at least one fence!"; }
                     } else {
                         farmStructureChanged = true;
                     }
                     if (isValid && !validateFenceRules(p)) {
                         isValid = false; 
                         errMsg = "Fences must form closed loops and only enclose Empty/Stables!";
                     }
                 }
                 if (mode === 'sow') {
                     let sowedCount = 0;
                     for(let i=0; i<15; i++) {
                         if (p.farmContent[i] && !oldP.farmContent[i]) sowedCount++;
                     }
                     if (sowedCount === 0) { isValid = false; errMsg = "Must sow at least one crop!"; }
                 }

                 if (mode === 'reno_major' && p.houseType === oldP.houseType) {
                     isValid = false; errMsg = "Must successfully renovate house first!";
                 }

                 if (isValid && (mode === 'major' || (mode === 'reno_major' && p.tempMode.selectedMajorId))) {
                     if (mode === 'major' && !p.tempMode.selectedMajorId) {
                         isValid = false; errMsg = "Must buy a Major Improvement";
                     } else {
                         const mid = p.tempMode.selectedMajorId!;
                         const major = stateRef.current.gameState.majors.find(m => m.id === mid);
                         if (major) {
                             const cost = major.cost;
                             if (p.res.wood < (cost.wood||0) || p.res.clay < (cost.clay||0) || p.res.reed < (cost.reed||0) || p.res.stone < (cost.stone||0)) {
                                 isValid = false; errMsg = "Insufficient resources for Major";
                             } else {
                                 updatePlayer(pId, pp => ({
                                     ...pp,
                                     res: {
                                         ...pp.res,
                                         wood: pp.res.wood - (cost.wood||0),
                                         clay: pp.res.clay - (cost.clay||0),
                                         reed: pp.res.reed - (cost.reed||0),
                                         stone: pp.res.stone - (cost.stone||0),
                                     },
                                     majors: [...pp.majors, major]
                                 }));
                                 updateGameState(prev => ({ ...prev, majors: prev.majors.filter(m => m.id !== mid) }));
                                 addLog(`${p.name} bought ${major.name}`, p.color);
                             }
                         } else {
                             isValid = false; errMsg = "Selected card not found";
                         }
                     }
                 }

                 if (mode === 'grow' || mode === 'grow_force') {
                     if (p.res.maxWorkers >= 5) {
                         isValid = false; errMsg = "Max family size is 5";
                     } else {
                         updatePlayer(pId, pp => ({
                             ...pp,
                             res: { ...pp.res, maxWorkers: pp.res.maxWorkers + 1 }
                         }));
                         addLog(`${p.name} grew family to ${p.res.maxWorkers + 1}`, p.color);
                     }
                 }

                 if (!isValid) {
                     addLog(`⚠️ Invalid: ${errMsg}`, 'red');
                     return;
                 }
                 if (mode !== 'grow' && mode !== 'grow_force' && mode !== 'major') {
                     addLog(`${p.name} completed ${p.tempMode.mode}`, p.color);
                 }
                 
                 if (farmStructureChanged) {
                     updatePlayer(pId, pp => ({ ...pp, assignedAnimals: {} }));
                 }
             }
         }

         const newOccupied = { ...stateRef.current.gameState.occupied, [p.tempMode.actId]: pId };
         updateGameState(prev => ({ ...prev, occupied: newOccupied, pendingAction: null }));
         updatePlayer(pId, pp => ({...pp, res: {...pp.res, workers: pp.res.workers - 1}, tempMode: null }));
         
         updateGameState(prev => ({ ...prev, turnIdx: prev.turnIdx + 1 }));
         
         scheduleNext(() => nextTurn(), 500);
    };

    const switchTool = (tool: 'room'|'stable') => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => p.tempMode ? ({...p, tempMode: {...p.tempMode, currentTool: tool}}) : p);
    };

    const toggleSeed = (seed: 'grain' | 'veg') => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => p.tempMode ? ({...p, tempMode: {...p.tempMode!, currentSeed: seed}}) : p);
    };

    const selectMajor = (majorId: string) => {
        const { startPlayer, turnIdx, pendingAction } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        const p = stateRef.current.players[pIdx];

        if (p.tempMode?.mode === 'reno_major' && pendingAction) {
             const oldP = JSON.parse(pendingAction.snapshot);
             if (p.houseType === oldP.houseType) {
                 addLog("Must successfully renovate house before selecting a Major Improvement", "red");
                 return;
             }
        }

        const newSelectedId = p.tempMode?.selectedMajorId === majorId ? undefined : majorId;

        if (newSelectedId) {
            const major = stateRef.current.gameState.majors.find(m => m.id === newSelectedId);
            if (major) {
                const cost = major.cost;
                if (p.res.wood < (cost.wood||0) || p.res.clay < (cost.clay||0) || p.res.reed < (cost.reed||0) || p.res.stone < (cost.stone||0)) {
                    addLog("Not enough resources to select this card", "red");
                    return;
                }
            }
        }
        
        updatePlayer(pIdx, pp => ({
            ...pp,
            tempMode: { ...pp.tempMode!, selectedMajorId: newSelectedId }
        }));
    };

    const renovate = () => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const p = stateRef.current.players[(startPlayer + turnIdx) % 4];
        if (p.houseType === 'stone') return;

        const rooms = p.farm.filter(t => t === 1).length;
        let costType = p.houseType === 'wood' ? 'clay' : 'stone';
        // @ts-ignore
        if (p.res.reed < 1 || p.res[costType] < rooms) {
             addLog(`Need 1 Reed + ${rooms} ${costType}`, "red");
             return;
        }

        updatePlayer(p.id, pp => ({
            ...pp,
            res: { ...pp.res, reed: pp.res.reed - 1, [costType]: (pp.res as any)[costType] - rooms },
            houseType: p.houseType === 'wood' ? 'clay' : 'stone'
        }));
        addLog(`${p.name} renovated`, p.color);
    };

    const handleFarmClick = (pId: number, tileIdx: number) => {
        const p = stateRef.current.players[pId];
        if (p.type !== 'human' || !p.tempMode) return;
        
        const mode = p.tempMode.mode;
        
        updatePlayer(pId, pp => {
             const nf = [...pp.farm];
             const res = {...pp.res};
             
             if (mode === 'plow') {
                 const pending = stateRef.current.gameState.pendingAction;
                 if (pending && pending.pIdx === pId && pending.snapshot) {
                    const oldP = JSON.parse(pending.snapshot);
                    for(let i=0; i<15; i++) nf[i] = oldP.farm[i];
                 }

                 if (nf[tileIdx] === 0) {
                     nf[tileIdx] = 2;
                     return { ...pp, farm: nf };
                 }
             }

             if (mode === 'sow' || mode === 'plow_sow') {
                 const currentSeed = pp.tempMode?.currentSeed || 'grain';
                 const pending = stateRef.current.gameState.pendingAction;
                 let snap: Player | null = null;
                 if (pending && pending.snapshot) snap = JSON.parse(pending.snapshot);

                 if (mode === 'plow_sow') {
                     if (nf[tileIdx] === 0) {
                         const initialFields = snap ? snap.farm.filter(x => x===2).length : 0;
                         const currentFields = nf.filter(x => x===2).length;
                         if (currentFields > initialFields) {
                             addLog("Can only plow 1 field in this action", "red");
                             return pp;
                         }
                         nf[tileIdx] = 2;
                         return { ...pp, farm: nf };
                     }
                     if (nf[tileIdx] === 2 && pp.farmContent[tileIdx] === null) {
                         const wasField = snap ? snap.farm[tileIdx] === 2 : false;
                         if (!wasField) {
                             nf[tileIdx] = 0;
                             return { ...pp, farm: nf };
                         }
                     }
                 }

                 if (nf[tileIdx] === 2) {
                     const wasContent = snap ? snap.farmContent[tileIdx] : null;
                     
                     if (pp.farmContent[tileIdx]) {
                         if (wasContent === null) {
                             const type = pp.farmContent[tileIdx] as 'grain' | 'veg';
                             res[type]++;
                             const newContent = [...pp.farmContent];
                             newContent[tileIdx] = null;
                             const newCounts = [...pp.farmCounts];
                             newCounts[tileIdx] = 0;
                             return { ...pp, res, farmContent: newContent, farmCounts: newCounts };
                         } else {
                             addLog("Cannot remove crops planted in previous turns", "red");
                             return pp;
                         }
                     }
                     else {
                         if (res[currentSeed] > 0) {
                             res[currentSeed]--;
                             const newContent = [...pp.farmContent];
                             newContent[tileIdx] = currentSeed;
                             const newCounts = [...pp.farmCounts];
                             newCounts[tileIdx] = currentSeed === 'grain' ? 3 : 2;
                             return { ...pp, res, farmContent: newContent, farmCounts: newCounts };
                         } else {
                             addLog(`No ${currentSeed} available to sow`, "red");
                             return pp;
                         }
                     }
                 }
             }

             if (mode === 'build_menu') {
                 const pending = stateRef.current.gameState.pendingAction;
                 let wasStable = false;
                 if (pending && pending.snapshot) {
                     const snap = JSON.parse(pending.snapshot);
                     wasStable = snap.farm[tileIdx] === 5;
                 }

                 if (nf[tileIdx] === 5 && !wasStable && pp.tempMode?.currentTool === 'stable') {
                     nf[tileIdx] = 0; 
                     res.wood += 2; 
                     return { ...pp, farm: nf, res };
                 }

                 if (nf[tileIdx] === 0) {
                     if (pp.tempMode?.currentTool === 'room') {
                         if (res.wood >= 5 && res.reed >= 2) {
                             if (!hasNeighbor(pp, tileIdx, 1) && pp.farm.some(x=>x===1)) {
                                 addLog("Must adjoin existing rooms", "red");
                                 return pp;
                             }
                             res.wood -= 5; res.reed -= 2; nf[tileIdx] = 1;
                             return { ...pp, farm: nf, res };
                         } else {
                             addLog("Need 5 Wood + 2 Reed", "red");
                             return pp;
                         }
                     }
                     else if (pp.tempMode?.currentTool === 'stable') {
                        const currentStables = nf.filter(x => x === 5).length;
                        if (currentStables >= LIMIT_STABLES) {
                            addLog("Max stables reached (4)", "red");
                            return pp;
                        }
                        if (res.wood < 2) {
                            addLog("Need 2 Wood for Stable", "red");
                            return pp;
                        }

                        if (currentStables > 0 && !hasNeighbor(pp, tileIdx, 5)) {
                            addLog("Subsequent stables must neighbor an existing stable", "red");
                            return pp;
                        }

                        res.wood -= 2;
                        nf[tileIdx] = 5; 
                        return { ...pp, farm: nf, res };
                     }
                 }
             }
             return pp;
        });
    };

    const handleFenceClick = (pId: number, tileIdx: number, side: 't'|'b'|'l'|'r') => {
        const p = stateRef.current.players[pId];
        if (p.type !== 'human' || !p.tempMode) return;
        if (p.tempMode.mode !== 'fence' && p.tempMode.mode !== 'reno_fence') return;

        let key = `${tileIdx}-${side}`;
        if (side === 'r') {
            if (tileIdx % 5 === 4) key = `${tileIdx}-r`; 
            else key = `${tileIdx + 1}-l`; 
        } else if (side === 'b') {
            if (tileIdx >= 10) key = `${tileIdx}-b`; 
            else key = `${tileIdx + 5}-t`; 
        }

        const pending = stateRef.current.gameState.pendingAction;
        let originalFences = new Set<string>();
        if (pending && pending.snapshot) {
             const snap = JSON.parse(pending.snapshot);
             originalFences = new Set(snap.fences);
        }

        if (originalFences.has(key)) {
            addLog("Cannot remove existing fences", "red");
            return;
        }

        updatePlayer(pId, pp => {
            const newFences = new Set(pp.fences);
            const res = { ...pp.res };

            if (newFences.has(key)) {
                newFences.delete(key);
                res.wood += 1;
            } else {
                if (res.wood < 1) {
                     addLog("Need 1 Wood per fence", "red");
                     return pp;
                }
                if (newFences.size >= 15) {
                    addLog("Max 15 fences limit", "red");
                    return pp;
                }
                res.wood -= 1;
                newFences.add(key);
            }
            return { ...pp, fences: newFences, res };
        });
    };
    
    const openCardDetail = (card: MajorCard) => setViewingCard(card);
    const closeCardDetail = () => setViewingCard(null);

    return {
        gameState, players, logs, floatText,
        clickAction, cancelMode, handleFarmClick, handleFenceClick, confirmModeAction,
        switchTool, toggleSeed, selectMajor, renovate,
        viewingCard, openCardDetail, closeCardDetail,
        adjustHarvest, resetHarvest, confirmHarvest,
        toggleConversion, adjustConversion, confirmConversion,
        isAdjustingAnimals, toggleAnimalManager, saveAnimalAssignment,
        debug: {
            setGameState: debugSetState,
            setPlayers: debugSetPlayers,
            forceAction: debugForceAction,
            stateRef
        }
    };
};
