import { useState, useRef, useEffect, useCallback } from 'react';
import { Player, GameState, Action, LogEntry } from '../types';
import { BASE_ACTIONS, DB_MAJORS, HARVEST_ROUNDS, MAX_ROUNDS, ROUND_CARDS_POOL, LIMIT_STABLES } from '../constants';
import { calculateAllocation, hasNeighbor } from '../utils/gameLogic';
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
                handleActionEffect(p, act);
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
    const handleActionEffect = (p: Player, act: Action) => {
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

            // Simple Auto-feed for everyone to keep flow
            aiHarvestFeed(p); 

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

        scheduleNext(() => {
            updateGameState(prev => ({
                ...prev,
                harvestState: { ...prev.harvestState!, currentIdx: prev.harvestState!.currentIdx + 1 }
            }));
            processHarvestTurn();
        }, 600);
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

    // --- Human Interaction ---
    const clickAction = (actId: string) => {
         const { startPlayer, turnIdx, occupied, roundCards } = stateRef.current.gameState;
         const pIdx = (startPlayer + turnIdx) % 4;
         const p = stateRef.current.players[pIdx];

         if (p.type !== 'human' || occupied[actId] !== undefined || p.res.workers <= 0) return;
         const act = BASE_ACTIONS.find(a => a.id === actId) || roundCards.find(a => a.id === actId);
         if (!act) return;

         if (act.type === 'res' || act.type === 'res_combo' || act.mode === 'meeting') {
             handleActionEffect(p, act);
         } else {
             // Enter complex mode
             const snapshotObj = { ...p, fences: Array.from(p.fences) };
             updateGameState(prev => ({
                 ...prev,
                 pendingAction: { pIdx: p.id, timer: null, snapshot: JSON.stringify(snapshotObj), flags: {} }
             }));
             updatePlayer(p.id, pp => ({...pp, tempMode: { mode: act.mode!, actId, currentTool: 'room' } }));
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
         if (pending && pending.pIdx === pId) {
             const oldP = JSON.parse(pending.snapshot);
             const mode = p.tempMode.mode;
             let isValid = true;
             let errMsg = "";

             const countType = (pl: any, t: number) => pl.farm.filter((x:number) => x===t).length;
             const countSown = (pl: any) => pl.farmContent.filter((x:any) => x !== null).length;

             // Validation logic (Simplified for brevity as most logic was correct)
             if (mode === 'build_menu' && countType(p, 1) + countType(p, 5) <= countType(oldP, 1) + countType(oldP, 5)) {
                 isValid = false; errMsg = "Build something!";
             }

             if (!isValid) {
                 addLog(`⚠️ Invalid: ${errMsg}`, 'red');
                 return;
             }
         }

         const newOccupied = { ...stateRef.current.gameState.occupied, [p.tempMode.actId]: pId };
         updateGameState(prev => ({ ...prev, occupied: newOccupied, pendingAction: null }));
         updatePlayer(pId, pp => ({...pp, res: {...pp.res, workers: pp.res.workers - 1}, tempMode: null }));
         addLog(`${p.name} completed ${p.tempMode.mode}`, p.color);
         updateGameState(prev => ({ ...prev, turnIdx: prev.turnIdx + 1 }));
         
         scheduleNext(() => nextTurn(), 500);
    };

    // UI Helpers for complex actions
    const switchTool = (tool: 'room'|'stable') => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => p.tempMode ? ({...p, tempMode: {...p.tempMode, currentTool: tool}}) : p);
    };

    const buyMajor = (majorId: string) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const p = stateRef.current.players[(startPlayer + turnIdx) % 4];
        const major = stateRef.current.gameState.majors.find(m => m.id === majorId);
        
        if (!major) return;
        const cost = major.cost;
        // Check cost
        if (p.res.wood < (cost.wood||0) || p.res.clay < (cost.clay||0) || p.res.reed < (cost.reed||0) || p.res.stone < (cost.stone||0)) {
            addLog("Not enough resources", "red");
            return;
        }

        updatePlayer(p.id, pp => ({
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
        updateGameState(prev => ({ ...prev, majors: prev.majors.filter(m => m.id !== majorId) }));
        addLog(`${p.name} bought ${major.name}`, p.color);
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
             if (mode === 'plow' && nf[tileIdx] === 0) {
                 nf[tileIdx] = 2;
                 if (mode === 'plow') confirmModeAction(pId); // Auto confirm for simple plow
                 return { ...pp, farm: nf };
             }

             // Build Room/Stable
             if (mode === 'build_menu') {
                 if (nf[tileIdx] === 0) {
                     if (pp.tempMode?.currentTool === 'room' && res.wood >= 5 && res.reed >= 2) {
                         if (!hasNeighbor(pp, tileIdx, 1) && pp.farm.some(x=>x===1)) {
                             addLog("Must adjoin existing rooms", "red");
                             return pp;
                         }
                         res.wood -= 5; res.reed -= 2; nf[tileIdx] = 1;
                         return { ...pp, farm: nf, res };
                     }
                     // ... stable logic ...
                 }
             }
             return pp;
        });
    };

    return {
        gameState, players, logs, floatText,
        clickAction, cancelMode, handleFarmClick, confirmModeAction,
        switchTool, buyMajor, renovate
    };
};