
import { useState, useRef, useEffect, useCallback } from 'react';
import { Player, GameState, Action, LogEntry, MajorCard, HarvestConversion } from '../types';
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
    harvestTemp: null
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
        harvestState: null,
        pendingAction: null,
        overflowQueue: []
    });
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [floatText, setFloatText] = useState<{ id: number, text: string, x: number, y: number }[]>([]);
    const [viewingCard, setViewingCard] = useState<MajorCard | null>(null);
    
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

        // Skip players with no workers
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
        
        // Strictly prevent re-entry for the same round
        if (roundLock.current >= gs.round) return;
        roundLock.current = gs.round;

        clearGameTimer();
        addLog(`=== End of Round ${gs.round} ===`, '#fff');

        // Reset Workers & Apply Well Bonus
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

        // Replenish Accumulators
        const allActions = [...BASE_ACTIONS, ...gs.roundCards];
        allActions.forEach(act => {
            if (act.acc) act.cur = (act.cur || 0) + act.acc;
        });
        
        // Clear Board
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

        // Log control
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
                // Pass turn if no moves found or error
                addLog(`${p.name} passed`, p.color);
                updatePlayer(p.id, pp => ({...pp, res: {...pp.res, workers: 0}}));
                updateGameState(prev => ({...prev, turnIdx: prev.turnIdx + 1}));
                scheduleNext(() => nextTurn(), 500);
            }
        } catch (e) {
            console.error("AI Crash Recovery", e);
            addLog(`AI ${p.name} stumbled. Skipping turn.`, "red");
            // Recover by skipping turn
            updatePlayer(p.id, pp => ({...pp, res: {...pp.res, workers: 0}}));
            updateGameState(prev => ({...prev, turnIdx: prev.turnIdx + 1}));
            scheduleNext(() => nextTurn(), 500);
        }
    };

    // --- Actions ---
    // Used specifically by AI to immediately commit action
    const handleAIActionEffect = (p: Player, act: Action) => {
        // Double-check occupation (Race condition safety)
        if (stateRef.current.gameState.occupied[act.id] !== undefined) {
             addLog(`${p.name} bumped into occupied slot ${act.name}.`, 'red');
             // Retry or Skip
             if (p.type === 'ai') {
                 // Skip to prevent loop
                 updatePlayer(p.id, pp => ({...pp, res: {...pp.res, workers: 0}}));
             }
             updateGameState(prev => ({...prev, turnIdx: prev.turnIdx + 1}));
             scheduleNext(() => nextTurn(), 500);
             return;
        }

        const newP = { ...p, res: {...p.res}, animals: {...p.animals} };

        // Apply Effects
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
            // Placeholder for complex actions taken by AI
            addLog(`${p.name} took ${act.name} (Simplified)`, p.color);
        }

        newP.res.workers--;
        
        // Commit State
        const newOccupied = { ...stateRef.current.gameState.occupied, [act.id]: p.id };
        updateGameState(prev => ({ ...prev, occupied: newOccupied }));
        
        const allPlayers = [...stateRef.current.players];
        allPlayers[p.id] = newP;
        setPlayers(allPlayers);
        stateRef.current.players = allPlayers;
        
        updateGameState(prev => ({ ...prev, turnIdx: prev.turnIdx + 1 }));
        
        scheduleNext(() => nextTurn(), 500);
    };

    // --- Harvest ---
    const performHarvest = () => {
        addLog(`🌾 --- Harvest Phase ---`, '#ff9800');
        updateGameState(prev => ({ ...prev, harvestPhase: true }));

        // 1. Field Phase
        const ps = stateRef.current.players.map(p => {
            const newP = { ...p, res: { ...p.res }, farmCounts: [...p.farmCounts], farmContent: [...p.farmContent] };
            for (let i = 0; i < 15; i++) {
                if (newP.farm[i] === 2 && newP.farmCounts[i] > 0) {
                    const type = newP.farmContent[i]!;
                    newP.res[type]++;
                    newP.farmCounts[i]--;
                    if (newP.farmCounts[i] === 0) newP.farmContent[i] = null;
                }
            }
            return newP;
        });
        setPlayers(ps);
        stateRef.current.players = ps;

        updateGameState(prev => ({
            ...prev,
            harvestState: {
                queue: Array.from({ length: 4 }, (_, i) => (prev.startPlayer + i) % 4),
                currentIdx: 0
            }
        }));
        
        scheduleNext(() => processHarvestTurn(), 100);
    };

    const processHarvestTurn = () => {
        try {
            const { harvestState } = stateRef.current.gameState;
            if (!harvestState || !harvestState.queue || harvestState.currentIdx >= harvestState.queue.length) {
                finishHarvestPhase();
                return;
            }
            
            const pIdx = harvestState.queue[harvestState.currentIdx];
            const p = stateRef.current.players[pIdx];

            if (!p) {
                finishHarvestPhase();
                return;
            }

            if (p.type === 'human') {
                // Wait for human input
                updatePlayer(p.id, pp => ({
                    ...pp,
                    harvestTemp: { grain: 0, veg: 0, sheep: 0, boar: 0, cow: 0 }
                }));
            } else {
                // Auto-feed for AI
                aiHarvestFeed(p);
            }

        } catch (e) {
            console.error("Harvest Error", e);
            addLog("Harvest processing error. Skipping phase.", "red");
            finishHarvestPhase();
        }
    };

    const aiHarvestFeed = (p: Player) => {
        const newP: Player = { ...p, res: { ...p.res }, animals: { ...p.animals }, begging: p.begging };
        const need = newP.res.maxWorkers * 2;
        let deficit = need - newP.res.food;

        // Convert Grain/Veg if needed
        if (deficit > 0 && newP.res.grain > 0) { 
            const take = Math.min(newP.res.grain, deficit); newP.res.grain-=take; newP.res.food+=take; deficit-=take; 
        }
        if (deficit > 0 && newP.res.veg > 0) { 
            const take = Math.min(newP.res.veg, deficit); newP.res.veg-=take; newP.res.food+=take; deficit-=take; 
        }

        const pay = Math.min(newP.res.food, need);
        newP.res.food -= pay;
        const begging = need - pay;
        if (begging > 0) newP.begging += begging;

        addLog(`${newP.name} fed workers (Begging: ${begging})`, newP.color);
        updatePlayer(p.id, () => newP);

        scheduleNext(() => advanceHarvestStep(), 600);
    };

    // Human Harvest Helpers
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
        const { harvestState } = stateRef.current.gameState;
        if (!harvestState) return;
        const pIdx = harvestState.queue[harvestState.currentIdx];
        const p = stateRef.current.players[pIdx];

        if (!p.harvestTemp) return;

        const t = p.harvestTemp;
        const cooker = p.majors.find(m => (m.type==='cook'||m.type==='bake') && m.cook);
        
        // Calculate Food Gain
        let gain = t.grain; // 1:1 for now
        gain += t.veg; // 1:1 for now
        
        if (cooker && cooker.cook) {
            gain += t.sheep * cooker.cook.sheep;
            gain += t.boar * cooker.cook.boar;
            gain += t.cow * cooker.cook.cow;
        }

        const newP = { ...p, res: { ...p.res }, animals: { ...p.animals } };
        
        // Deduct converted resources
        newP.res.grain -= t.grain; newP.res.veg -= t.veg;
        newP.animals.sheep -= t.sheep; newP.animals.boar -= t.boar; newP.animals.cow -= t.cow;
        newP.res.food += gain;

        // Feed logic
        const need = newP.res.maxWorkers * 2;
        const pay = Math.min(newP.res.food, need);
        newP.res.food -= pay;
        const begging = need - pay;
        if (begging > 0) newP.begging += begging;

        newP.harvestTemp = null; // Clear temp

        addLog(`${newP.name} converted +${gain} food & fed workers (Begging: ${begging})`, newP.color);
        updatePlayer(pIdx, () => newP);

        scheduleNext(() => advanceHarvestStep(), 200);
    };

    const advanceHarvestStep = () => {
         updateGameState(prev => ({
            ...prev,
            harvestState: { ...prev.harvestState!, currentIdx: prev.harvestState!.currentIdx + 1 }
        }));
        processHarvestTurn();
    };

    const finishHarvestPhase = () => {
        const ps = stateRef.current.players.map(p => ({...p}));
        
        ps.forEach(p => {
             // Breeding
             ['sheep', 'boar', 'cow'].forEach(type => {
                 // @ts-ignore
                if(p.animals[type] >= 2) {
                    // @ts-ignore
                    p.animals[type]++;
                    addLog(`${p.name} bred 1 ${type}`, p.color);
                }
            });

            // Overflow logic
            const alloc = calculateAllocation(p);
            if(alloc.overflow > 0) {
                const discarded = aiDiscardOverflow(p, alloc.overflow);
                p.animals.sheep -= discarded.sheep;
                p.animals.boar -= discarded.boar;
                p.animals.cow -= discarded.cow;
                addLog(`${p.name} overflow -${alloc.overflow} animals`, p.color);
            }
        });
        
        setPlayers(ps);
        stateRef.current.players = ps;
        
        // End Phase
        updateGameState(prev => ({ ...prev, harvestPhase: false, harvestState: null, overflowQueue: [] }));
        advanceRound();
    };

    // --- Anytime Food Conversion ---
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
        
        // Calculate Food Gain
        let gain = t.grain; // 1:1
        gain += t.veg; // 1:1
        
        if (cooker && cooker.cook) {
            gain += t.sheep * cooker.cook.sheep;
            gain += t.boar * cooker.cook.boar;
            gain += t.cow * cooker.cook.cow;
        }

        if (gain === 0) {
            // Nothing to convert
            updatePlayer(pIdx, pp => ({ ...pp, conversionTemp: null }));
            return;
        }

        const newP = { ...p, res: { ...p.res }, animals: { ...p.animals } };
        
        // Deduct converted resources
        newP.res.grain -= t.grain; newP.res.veg -= t.veg;
        newP.animals.sheep -= t.sheep; newP.animals.boar -= t.boar; newP.animals.cow -= t.cow;
        newP.res.food += gain;
        
        newP.conversionTemp = null; // Close Modal

        addLog(`${p.name} converted resources to +${gain} Food`, p.color);
        updatePlayer(pIdx, () => newP);
    };

    // --- Human Interaction ---
    const clickAction = (actId: string) => {
         const { startPlayer, turnIdx, occupied, roundCards } = stateRef.current.gameState;
         const pIdx = (startPlayer + turnIdx) % 4;
         const p = stateRef.current.players[pIdx];

         if (p.type !== 'human' || occupied[actId] !== undefined || p.res.workers <= 0) return;
         const act = BASE_ACTIONS.find(a => a.id === actId) || roundCards.find(a => a.id === actId);
         if (!act) return;

         // Validation for Grow Family (Stage 2)
         if (act.mode === 'grow') {
             const rooms = p.farm.filter(t => t === 1).length;
             if (p.res.maxWorkers >= rooms) {
                 addLog("Cannot grow: Needs more empty rooms (Rooms > Family)", "red");
                 return;
             }
         }
         
         // Validation for max workers (both Grow Family modes)
         if (act.mode === 'grow' || act.mode === 'grow_force') {
             if (p.res.maxWorkers >= 5) {
                 addLog("Max family size (5) reached", "red");
                 return;
             }
         }

         // Snapshot for Cancel (common for ALL actions now)
         const snapshotObj = { ...p, fences: Array.from(p.fences) };
         updateGameState(prev => ({
             ...prev,
             pendingAction: { pIdx: p.id, timer: null, snapshot: JSON.stringify(snapshotObj), flags: {} }
         }));

         if (act.type === 'res' || act.type === 'res_combo' || act.mode === 'meeting') {
             // Enter Simple Confirm Mode
             updatePlayer(p.id, pp => ({...pp, tempMode: { mode: 'simple', actId } }));
         } else {
             // Enter Complex Mode
             // Set default seed if sowing
             let defaultSeed: 'grain' | 'veg' | undefined;
             if (act.mode === 'sow' || act.mode === 'plow_sow') {
                 // Prefer available seeds
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

             const countType = (pl: any, t: number) => pl.farm.filter((x:number) => x===t).length;
             
             // Simple Mode Logic (Execute here)
             if (mode === 'simple' && act) {
                 // Apply Logic directly to P here before committing
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
                    if(act.acc) act.cur = 0; // Reset accumulator
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
             // Complex Validations & Executions
             else {
                 // Strict validation for Fence, Build, Plow: Content Check + Action Check
                 if (mode === 'build_menu') {
                     if (countType(p, 1) + countType(p, 5) <= countType(oldP, 1) + countType(oldP, 5)) {
                         isValid = false; errMsg = "Must build at least one room or stable!";
                     }
                     if (isValid && !validateFenceRules(p)) {
                         isValid = false; errMsg = "Cannot build Rooms/Fields inside existing fenced pastures!";
                     }
                 }
                 if (mode === 'plow' || mode === 'plow_sow') {
                     if (countType(p, 2) <= countType(oldP, 2)) {
                         isValid = false; errMsg = "Must plow at least one field!";
                     }
                     if (isValid && !validateFenceRules(p)) {
                         isValid = false; errMsg = "Cannot plow fields inside existing fenced pastures!";
                     }
                 }
                 if (mode === 'fence' || mode === 'reno_fence') {
                     if (p.fences.size <= oldP.fences.length) { 
                          if(mode === 'fence') { isValid = false; errMsg = "Must build at least one fence!"; }
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

                 // Major Purchase Execution
                 if (isValid && (mode === 'major' || (mode === 'reno_major' && p.tempMode.selectedMajorId))) {
                     if (mode === 'major' && !p.tempMode.selectedMajorId) {
                         isValid = false; errMsg = "Must buy a Major Improvement";
                     } else {
                         const mid = p.tempMode.selectedMajorId!;
                         const major = stateRef.current.gameState.majors.find(m => m.id === mid);
                         if (major) {
                             // Check resources again just in case (should be validated on select)
                             const cost = major.cost;
                             if (p.res.wood < (cost.wood||0) || p.res.clay < (cost.clay||0) || p.res.reed < (cost.reed||0) || p.res.stone < (cost.stone||0)) {
                                 isValid = false; errMsg = "Insufficient resources for Major";
                             } else {
                                 // Execute Purchase
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
                             // Should not happen if selectedId is valid
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
             }
         }

         const newOccupied = { ...stateRef.current.gameState.occupied, [p.tempMode.actId]: pId };
         updateGameState(prev => ({ ...prev, occupied: newOccupied, pendingAction: null }));
         updatePlayer(pId, pp => ({...pp, res: {...pp.res, workers: pp.res.workers - 1}, tempMode: null }));
         
         updateGameState(prev => ({ ...prev, turnIdx: prev.turnIdx + 1 }));
         
         scheduleNext(() => nextTurn(), 500);
    };

    // UI Helpers for complex actions
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

        // Ensure renovation is done before selection in reno_major mode
        if (p.tempMode?.mode === 'reno_major' && pendingAction) {
             const oldP = JSON.parse(pendingAction.snapshot);
             if (p.houseType === oldP.houseType) {
                 addLog("Must successfully renovate house before selecting a Major Improvement", "red");
                 return;
             }
        }

        // Toggle selection logic
        const newSelectedId = p.tempMode?.selectedMajorId === majorId ? undefined : majorId;

        // Optional: Pre-validate cost (for UI feedback, though actual check is in Confirm)
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
             
             // Simple Plow
             if (mode === 'plow') {
                 const pending = stateRef.current.gameState.pendingAction;
                 // Reset to snapshot (single selection logic)
                 if (pending && pending.pIdx === pId && pending.snapshot) {
                    const oldP = JSON.parse(pending.snapshot);
                    for(let i=0; i<15; i++) nf[i] = oldP.farm[i];
                 }

                 if (nf[tileIdx] === 0) {
                     nf[tileIdx] = 2;
                     return { ...pp, farm: nf };
                 }
             }

             // Sow & Plow/Sow
             if (mode === 'sow' || mode === 'plow_sow') {
                 const currentSeed = pp.tempMode?.currentSeed || 'grain';
                 const pending = stateRef.current.gameState.pendingAction;
                 let snap: Player | null = null;
                 if (pending && pending.snapshot) snap = JSON.parse(pending.snapshot);

                 // Plow Logic (in plow_sow)
                 if (mode === 'plow_sow') {
                     // Click Empty -> Plow (Max 1)
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
                     // Click New Field (Empty content) -> Unplow
                     if (nf[tileIdx] === 2 && pp.farmContent[tileIdx] === null) {
                         const wasField = snap ? snap.farm[tileIdx] === 2 : false;
                         if (!wasField) {
                             nf[tileIdx] = 0;
                             return { ...pp, farm: nf };
                         }
                     }
                 }

                 // Sow Logic
                 if (nf[tileIdx] === 2) {
                     const wasContent = snap ? snap.farmContent[tileIdx] : null;
                     
                     // Un-Sow: If currently has content but was empty in snapshot
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
                     // Sow: If empty
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

             // Build Room/Stable
             if (mode === 'build_menu') {
                 // Check if it's a stable we just built in this turn (type 5)
                 const pending = stateRef.current.gameState.pendingAction;
                 let wasStable = false;
                 if (pending && pending.snapshot) {
                     const snap = JSON.parse(pending.snapshot);
                     wasStable = snap.farm[tileIdx] === 5;
                 }

                 // Refund Stable Logic: If it is currently a stable, and it wasn't one before, we can remove it.
                 if (nf[tileIdx] === 5 && !wasStable && pp.tempMode?.currentTool === 'stable') {
                     nf[tileIdx] = 0; // Set back to empty
                     res.wood += 2; // Refund wood
                     return { ...pp, farm: nf, res };
                 }

                 if (nf[tileIdx] === 0) {
                     // Room Logic
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
                     // Stable Logic
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

                        // Enforce adjacency rule for 2nd+ stable
                        if (currentStables > 0 && !hasNeighbor(pp, tileIdx, 5)) {
                            addLog("Subsequent stables must neighbor an existing stable", "red");
                            return pp;
                        }

                        res.wood -= 2;
                        nf[tileIdx] = 5; // 5 is Stable
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
        
        const mode = p.tempMode.mode;
        if (mode !== 'fence' && mode !== 'reno_fence') return;

        // Normalize Key to ensure shared edges are toggled correctly
        let key = `${tileIdx}-${side}`;
        // Map right/bottom to neighbor's left/top to maintain canonical unique edges
        if (side === 'r') {
            if (tileIdx % 5 === 4) key = `${tileIdx}-r`; // Right edge of board
            else key = `${tileIdx + 1}-l`; // Left edge of neighbor
        } else if (side === 'b') {
            if (tileIdx >= 10) key = `${tileIdx}-b`; // Bottom edge of board
            else key = `${tileIdx + 5}-t`; // Top edge of neighbor
        }

        // Check against snapshot to prevent removing fences that were already there
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
                // Toggle OFF (Refund)
                newFences.delete(key);
                res.wood += 1;
            } else {
                // Toggle ON (Cost)
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
    
    // View detail
    const openCardDetail = (card: MajorCard) => setViewingCard(card);
    const closeCardDetail = () => setViewingCard(null);

    return {
        gameState, players, logs, floatText,
        clickAction, cancelMode, handleFarmClick, handleFenceClick, confirmModeAction,
        switchTool, toggleSeed, selectMajor, renovate,
        viewingCard, openCardDetail, closeCardDetail,
        adjustHarvest, resetHarvest, confirmHarvest,
        toggleConversion, adjustConversion, confirmConversion
    };
};
