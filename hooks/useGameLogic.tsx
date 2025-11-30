
import { useState, useRef, useEffect, useCallback } from 'react';
import { Player, GameState, Action, LogEntry, MajorCard, HarvestConversion, ResourceType } from '../types';
import { BASE_ACTIONS, DB_MAJORS, HARVEST_ROUNDS, MAX_ROUNDS, ROUND_CARDS_POOL, LIMIT_STABLES, LIMIT_FENCES } from '../constants';
import { calculateAllocation, hasNeighbor, validateFenceRules, getFenceVertices } from '../utils/gameLogic';
import { getAIAction, aiDiscardOverflow } from '../utils/aiStrategy';

const createInitialPlayers = (): Player[] => Array.from({ length: 4 }, (_, i) => ({
    id: i,
    name: i === 0 ? "You (Blue)" : `AI ${['Red', 'Green', 'Yellow'][i - 1]}`,
    color: i === 0 ? '#29b6f6' : ['#ef5350', '#66bb6a', '#ffee58'][i - 1],
    type: i === 0 ? 'human' : 'ai',
    res: { wood: 0, clay: 0, reed: 0, stone: 0, food: (i === 0 ? 2 : 3), grain: 0, veg: 0, workers: 2, maxWorkers: 2 },
    animals: { sheep: 0, boar: 0, cow: 0 },
    newborns: { sheep: 0, boar: 0, cow: 0 },
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
    const [players, setPlayers] = useState<Player[]>(createInitialPlayers());
    const [gameState, setGameState] = useState<GameState>({
        round: 1,
        startPlayer: 0,
        nextStartPlayer: 0,
        turnIdx: 0,
        occupied: {},
        baseActions: JSON.parse(JSON.stringify(BASE_ACTIONS)), // Deep Copy Initial State
        roundCards: [],
        deck: [],
        majors: [...DB_MAJORS],
        harvestPhase: false,
        harvestSubPhase: null,
        harvestState: null,
        pendingAction: null,
        overflowQueue: [],
        gameOver: false,
        futureResources: {},
        turnPhase: 'action',
        overflowPlayer: null,
        wellRewards: {},
        overflowSnapshot: null
    });
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [floatText, setFloatText] = useState<{ id: number, text: string, x: number, y: number }[]>([]);
    const [viewingCard, setViewingCard] = useState<MajorCard | null>(null);
    const [isAdjustingAnimals, setIsAdjustingAnimals] = useState(false);
    
    // Refs for mutable access in timeouts/loops
    const stateRef = useRef({ players: createInitialPlayers(), gameState: gameState });
    
    const initRef = useRef(false);
    const roundLock = useRef(0);
    const loggedRoundRef = useRef(1);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const addLog = useCallback((msg: string, color: string = '#b0bec5') => {
        // FIX: slice(0, 300) instead of slice(300) to KEEP items
        setLogs(prev => [{ id: Date.now() + Math.random(), msg, color }, ...prev].slice(0, 300));
    }, []);

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

    // --- CRITICAL STATE MANAGERS ---
    const updatePlayer = (id: number, updater: (p: Player) => Player) => {
        const currentPlayers = stateRef.current.players;
        const newPlayers = currentPlayers.map(p => p.id === id ? updater({ ...p }) : p);
        stateRef.current.players = newPlayers;
        setPlayers(newPlayers);
    };

    const updateGameState = (updater: (g: GameState) => GameState) => {
        const currentGS = stateRef.current.gameState;
        const newGS = updater({ ...currentGS });
        stateRef.current.gameState = newGS;
        setGameState(newGS);
    };

    // DEBUG HELPERS
    const debugSetState = (newGs: GameState) => {
        stateRef.current.gameState = newGs;
        setGameState(newGs);
    };
    const debugSetPlayers = (newPs: Player[]) => {
        stateRef.current.players = newPs;
        setPlayers(newPs);
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
    
    const debug = {
        setState: debugSetState,
        setPlayers: debugSetPlayers,
        forceAction: debugForceAction
    };

    // --- Init ---
    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        startGame();
        return () => clearGameTimer();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startGame = () => {
        clearGameTimer();
        const deck = setupDeck();
        const sp = Math.floor(Math.random() * 4);
        const newPlayers = createInitialPlayers();
        
        const initialGS: GameState = {
            round: 1,
            startPlayer: sp,
            nextStartPlayer: sp,
            turnIdx: 0,
            occupied: {},
            baseActions: JSON.parse(JSON.stringify(BASE_ACTIONS)), // Deep clone to reset actions!
            roundCards: deck.length > 0 ? [deck.shift()!] : [],
            deck,
            majors: [...DB_MAJORS],
            harvestPhase: false,
            harvestSubPhase: null,
            harvestState: null,
            pendingAction: null,
            overflowQueue: [],
            gameOver: false,
            futureResources: {},
            turnPhase: 'action',
            overflowPlayer: null,
            wellRewards: {},
            overflowSnapshot: null
        };
        
        stateRef.current.players = newPlayers;
        stateRef.current.gameState = initialGS;
        setPlayers(newPlayers);
        setGameState(initialGS);
        
        // Atomic log reset + initial message
        setLogs([{ id: Date.now(), msg: "🎮 Game Started!", color: "white" }]);
        
        // Reset refs
        roundLock.current = 0;
        loggedRoundRef.current = 1;

        scheduleNext(() => nextTurn(), 500);
    };

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
        if (gs.harvestPhase || gs.gameOver) return;
        if (gs.turnPhase === 'overflow') return; // Pause for overflow handling

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
            const newTurnIdx = gs.turnIdx;
            
            pIdx = (gs.startPlayer + newTurnIdx) % 4;
            p = ps[pIdx];
            loopGuard++;
            if(loopGuard > 10) { 
                updateGameState(prev => ({ ...prev, turnIdx: newTurnIdx }));
                endRound(); 
                return; 
            }
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
        
        const currentPs = stateRef.current.players;
        const newPlayers = currentPs.map(p => {
            return {
                ...p,
                res: { ...p.res, workers: p.res.maxWorkers }
            };
        });
        stateRef.current.players = newPlayers;
        setPlayers(newPlayers);

        // Accumulate Resources
        const newBaseActions = gs.baseActions.map(act => {
             if (act.acc) {
                 return { ...act, cur: (act.cur || 0) + act.acc };
             }
             return act;
        });
        
        const newRoundCards = gs.roundCards.map(act => {
            if (act.acc) {
                return { ...act, cur: (act.cur || 0) + act.acc };
            }
            return act;
        });
        
        updateGameState(prev => ({ 
            ...prev, 
            occupied: {}, 
            baseActions: newBaseActions,
            roundCards: newRoundCards 
        }));

        if (HARVEST_ROUNDS.includes(gs.round)) {
            performHarvest();
        } else {
            if (gs.round >= MAX_ROUNDS) {
                // Should not happen as 14 is a harvest round, but safe guard
                updateGameState(prev => ({ ...prev, gameOver: true }));
            } else {
                advanceRound();
            }
        }
    };

    const advanceRound = () => {
        const { gameState: gs } = stateRef.current;
        
        if (gs.round >= MAX_ROUNDS) {
            updateGameState(prev => ({ ...prev, gameOver: true }));
            addLog("🏁 Game Over!", "yellow");
            return;
        }

        const newDeck = [...gs.deck];
        const newRoundCards = [...gs.roundCards];
        
        let unlockedName = "";
        if (newDeck.length > 0) {
            const card = newDeck.shift()!;
            newRoundCards.push(card);
            unlockedName = card.name;
        }

        const nextRound = gs.round + 1;

        // --- Newborns Mature ---
        // Clear newborn status as they become adults
        const newPs = stateRef.current.players.map(p => ({
            ...p,
            newborns: { sheep: 0, boar: 0, cow: 0 } 
        }));
        stateRef.current.players = newPs;
        setPlayers(newPs);

        // --- Well Logic ---
        if (gs.wellRewards[nextRound]) {
            const beneficiaries = gs.wellRewards[nextRound];
            beneficiaries.forEach(pId => {
                updatePlayer(pId, p => ({...p, res: {...p.res, food: p.res.food + 1}}));
                const pName = stateRef.current.players[pId].name;
                addLog(`${pName} got 1 food from Well`, '#29b6f6');
            });
        }
        
        const newFutureRes = { ...gs.futureResources };
        if (newFutureRes[nextRound]) {
            delete newFutureRes[nextRound];
        }

        updateGameState(prev => ({
            ...prev,
            round: nextRound,
            deck: newDeck,
            roundCards: newRoundCards,
            startPlayer: prev.nextStartPlayer,
            turnIdx: 0,
            futureResources: newFutureRes
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
        let animalsGained = false;

        if (act.type === 'res') {
            const amt = act.cur || act.amount || 0;
            if (['sheep','boar','cow'].includes(act.res!)) {
                // @ts-ignore
                newP.animals[act.res!] += amt;
                animalsGained = true;
                resetActionAccumulation(act.id);
            } else {
                // @ts-ignore
                newP.res[act.res!] += amt;
                resetActionAccumulation(act.id);
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
        updatePlayer(p.id, () => newP);

        if (p.type === 'human' && animalsGained) {
            const alloc = calculateAllocation(newP);
            if (alloc.overflow > 0) {
                startOverflow(p.id);
                return; 
            }
        }
        
        if (p.type === 'ai' && animalsGained) {
            const alloc = calculateAllocation(newP);
            if (alloc.overflow > 0) {
                const discarded = aiDiscardOverflow(newP, alloc.overflow);
                newP.animals.sheep -= discarded.sheep;
                newP.animals.boar -= discarded.boar;
                newP.animals.cow -= discarded.cow;
                addLog(`${p.name} discarded overflow animals`, p.color);
                updatePlayer(p.id, () => newP);
            }
        }

        updateGameState(prev => ({ ...prev, turnIdx: prev.turnIdx + 1 }));
        scheduleNext(() => nextTurn(), 500);
    };

    const resetActionAccumulation = (actId: string) => {
        updateGameState(prev => ({
            ...prev,
            baseActions: prev.baseActions.map(a => a.id === actId && a.acc ? { ...a, cur: 0 } : a),
            roundCards: prev.roundCards.map(a => a.id === actId && a.acc ? { ...a, cur: 0 } : a)
        }));
    };

    // --- Overflow Management ---
    const startOverflow = (pId: number) => {
        const p = stateRef.current.players[pId];
        const snapshotObj = { ...p, fences: Array.from(p.fences) };
        updateGameState(prev => ({ 
            ...prev, 
            turnPhase: 'overflow', 
            overflowPlayer: pId,
            overflowSnapshot: JSON.stringify(snapshotObj)
        }));
    };

    const resetOverflow = () => {
        const { overflowPlayer, overflowSnapshot } = stateRef.current.gameState;
        if (overflowPlayer === null || !overflowSnapshot) return;
        
        const oldP = JSON.parse(overflowSnapshot);
        oldP.fences = new Set(oldP.fences);
        
        updatePlayer(overflowPlayer, () => oldP);
        addLog("⏪ Reset actions for this phase", "white");
    };

    const discardAnimal = (type: 'sheep'|'boar'|'cow') => {
        const { overflowPlayer } = stateRef.current.gameState;
        if (overflowPlayer === null) return;
        
        updatePlayer(overflowPlayer, p => {
             const newP = { ...p, animals: { ...p.animals }, newborns: { ...p.newborns } };
             if (newP.animals[type] > 0) {
                 newP.animals[type]--;
                 // If total animals drop below newborns count, strictly speaking we lost a newborn?
                 // But logic-wise, we just ensure newborns doesn't exceed total.
                 if (newP.animals[type] < newP.newborns[type]) {
                     newP.newborns[type] = newP.animals[type];
                 }
             }
             return newP;
        });
    };

    const discardFromManager = (type: 'sheep'|'boar'|'cow', isNewborn: boolean, assignments: { [key: number]: ResourceType[] }) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        let pIdx = (startPlayer + turnIdx) % 4;
        
        // Handle overflow/breed phase correct player context
        if (stateRef.current.gameState.turnPhase === 'overflow' && stateRef.current.gameState.overflowPlayer !== null) {
            pIdx = stateRef.current.gameState.overflowPlayer;
        } else if (stateRef.current.gameState.harvestSubPhase === 'breed') {
            const { harvestState } = stateRef.current.gameState;
            if (harvestState) pIdx = harvestState.queue[harvestState.currentIdx];
        }
        
        const p = stateRef.current.players[pIdx];

        if (p.animals[type] <= 0) return;

        updatePlayer(pIdx, pp => {
            const newP = { 
                ...pp, 
                animals: { ...pp.animals }, 
                newborns: { ...pp.newborns },
                assignedAnimals: assignments // Persist current assignments
            };
            
            newP.animals[type]--;
            if (isNewborn && newP.newborns[type] > 0) {
                newP.newborns[type]--;
            } else if (!isNewborn) {
                // If discarding adult, ensure we don't accidentally dip into newborns count
                if (newP.animals[type] < newP.newborns[type]) {
                    // Logic issue if this happens, but clamp it
                    // Actually, if we discard an adult, we just reduce total. 
                    // Since newborns <= total, if new total < newborns, we must have discarded a newborn implicitly?
                    // But here we explicitly distinguish. 
                    // If user clicks "Discard Adult", we decrement total.
                }
            }
            // Safety clamp
            if (newP.newborns[type] > newP.animals[type]) newP.newborns[type] = newP.animals[type];
            
            return newP;
        });
        addLog(`${p.name} discarded a ${isNewborn ? 'newborn' : 'adult'} ${type}`, p.color);
    };

    const cookOverflow = (type: 'sheep'|'boar'|'cow') => {
        const { overflowPlayer } = stateRef.current.gameState;
        if (overflowPlayer === null) return;
        const p = stateRef.current.players[overflowPlayer];
        
        // Find best cook rate
        let bestRate = 0;
        p.majors.forEach(m => {
            if (m.cook && m.cook[type]) {
                if (m.cook[type] > bestRate) bestRate = m.cook[type];
            }
        });

        if (bestRate === 0) {
            addLog("No cooking appliance!", "red");
            return;
        }

        // NEWBORN PROTECTION
        const availableToCook = p.animals[type] - p.newborns[type];
        if (availableToCook <= 0) {
            addLog("Cannot cook newborn animals!", "red");
            return;
        }

        updatePlayer(overflowPlayer, pp => {
             const newP = { ...pp, animals: { ...pp.animals }, res: { ...pp.res } };
             if (newP.animals[type] > 0) {
                 newP.animals[type]--;
                 newP.res.food += bestRate;
             }
             return newP;
        });
        addLog(`${p.name} cooked overflow ${type} for ${bestRate} food`, p.color);
    };

    const cookFromManager = (type: 'sheep'|'boar'|'cow', assignments: { [key: number]: ResourceType[] }) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        let pIdx = (startPlayer + turnIdx) % 4;
        
        if (stateRef.current.gameState.turnPhase === 'overflow' && stateRef.current.gameState.overflowPlayer !== null) {
            pIdx = stateRef.current.gameState.overflowPlayer;
        } else if (stateRef.current.gameState.harvestSubPhase === 'breed') {
            const { harvestState } = stateRef.current.gameState;
            if (harvestState) pIdx = harvestState.queue[harvestState.currentIdx];
        }
        
        const p = stateRef.current.players[pIdx];

        let bestRate = 0;
        p.majors.forEach(m => {
            if (m.cook && m.cook[type]) {
                if (m.cook[type] > bestRate) bestRate = m.cook[type];
            }
        });

        if (bestRate === 0) {
            addLog("No cooking appliance!", "red");
            return;
        }

        // NEWBORN PROTECTION - Strict check
        const availableToCook = p.animals[type] - p.newborns[type];
        if (availableToCook <= 0) {
             addLog("Cannot cook newborn animals!", "red");
             return;
        }

        updatePlayer(pIdx, pp => ({
            ...pp,
            animals: { ...pp.animals, [type]: pp.animals[type] - 1 },
            res: { ...pp.res, food: pp.res.food + bestRate },
            assignedAnimals: assignments // Persist current assignments
        }));
        addLog(`${p.name} cooked ${type} for ${bestRate} food`, p.color);
    };

    const confirmOverflowEndTurn = () => {
        const { overflowPlayer, harvestPhase } = stateRef.current.gameState;
        if (overflowPlayer === null) return;
        const p = stateRef.current.players[overflowPlayer];
        const alloc = calculateAllocation(p);
        
        if (alloc.overflow > 0) {
            addLog("Must discard excess animals before ending turn!", "red");
            return;
        }
        
        updateGameState(prev => ({ 
            ...prev, 
            turnPhase: 'action', 
            overflowPlayer: null, 
            overflowSnapshot: null 
        }));

        if (harvestPhase) {
            // If in harvest phase, we resume the breeding/feeding loop
            scheduleNext(() => advanceBreedStep(), 500);
        } else {
            // If in normal turn, we advance to next player
            updateGameState(prev => ({ ...prev, turnIdx: prev.turnIdx + 1 }));
            scheduleNext(() => nextTurn(), 500);
        }
    };

    // ================= HARVEST LOGIC =================
    const performHarvest = () => {
        addLog(`🌾 --- HARVEST BEGINS ---`, '#ff9800');
        updateGameState(prev => ({ 
            ...prev, 
            harvestPhase: true, 
            harvestSubPhase: 'field' 
        }));
        
        scheduleNext(() => processFieldPhase(), 500);
    };

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
        stateRef.current.players = ps;
        setPlayers(ps);
        updateGameState(prev => ({...prev, harvestSubPhase: 'feed', harvestState: {queue: Array.from({ length: 4 }, (_, i) => (prev.startPlayer + i) % 4), currentIdx: 0}}));
        scheduleNext(() => processFeedPhase(), 1000);
    };

    const processFeedPhase = () => {
        if (!stateRef.current.gameState.harvestState) return;
        const { harvestState } = stateRef.current.gameState;
        if (harvestState.currentIdx >= harvestState.queue.length) {
            updateGameState(prev => ({...prev, harvestSubPhase: 'breed', harvestState: {queue: Array.from({ length: 4 }, (_, i) => (prev.startPlayer + i) % 4), currentIdx: 0}}));
            scheduleNext(() => processBreedPhase(), 500);
            return;
        }
        const pIdx = harvestState.queue[harvestState.currentIdx];
        const p = stateRef.current.players[pIdx];
        if (p.type === 'human') {
            updatePlayer(p.id, pp => ({...pp, harvestTemp: { grain: 0, veg: 0, sheep: 0, boar: 0, cow: 0, reed: 0, wood: 0, clay: 0 }}));
        } else {
            aiHarvestFeed(p);
        }
    };

    const advanceFeedStep = () => {
        if (!stateRef.current.gameState.harvestState) return; 
        updateGameState(prev => ({...prev, harvestState: { ...prev.harvestState!, currentIdx: prev.harvestState!.currentIdx + 1 }}));
        processFeedPhase();
    };

    const aiHarvestFeed = (p: Player) => {
        const newP: Player = { ...p, res: { ...p.res }, animals: { ...p.animals }, begging: p.begging };
        const need = newP.res.maxWorkers * 2;
        let deficit = need - newP.res.food;
        const keepSeeds = deficit > 0 ? 0 : 1; 
        if (deficit > 0 && newP.res.grain > keepSeeds) { 
            const available = newP.res.grain - keepSeeds;
            const take = Math.min(available, deficit); 
            newP.res.grain -= take; newP.res.food += take; deficit -= take; 
        }
        if (deficit > 0 && newP.res.veg > keepSeeds) { 
            const available = newP.res.veg - keepSeeds;
            const take = Math.min(available, deficit); 
            newP.res.veg -= take; newP.res.food += take; deficit -= take; 
        }
        const cooker = newP.majors.find(m => (m.type==='cook'||m.type==='bake') && m.cook);
        if (deficit > 0 && cooker) {
             ['sheep', 'boar', 'cow'].forEach(t => {
                 const type = t as 'sheep'|'boar'|'cow';
                 // @ts-ignore
                 let count = newP.animals[type];
                 let available = Math.max(0, count - 2);
                 while (deficit > 0 && available > 0) {
                     // @ts-ignore
                     newP.animals[type]--; available--; newP.res.food += cooker.cook[type]; deficit -= cooker.cook[type];
                 }
                 if (deficit > 0) {
                     // @ts-ignore
                     count = newP.animals[type]; 
                     while (deficit > 0 && count > 0) {
                         // @ts-ignore
                         newP.animals[type]--; count--; newP.res.food += cooker.cook[type]; deficit -= cooker.cook[type];
                     }
                 }
             });
        }
        if (deficit > 0) {
             if (newP.res.grain > 0) { const take = Math.min(newP.res.grain, deficit); newP.res.grain -= take; newP.res.food += take; deficit -= take; }
             if (newP.res.veg > 0) { const take = Math.min(newP.res.veg, deficit); newP.res.veg -= take; newP.res.food += take; deficit -= take; }
        }
        const pay = Math.min(newP.res.food, need);
        newP.res.food -= pay;
        if (need - pay > 0) newP.begging += (need - pay);
        updatePlayer(p.id, () => newP);
        setTimeout(() => advanceFeedStep(), 600);
    };

    const processBreedPhase = () => {
        if (!stateRef.current.gameState.harvestState) return;
        const { harvestState } = stateRef.current.gameState;
        if (harvestState.currentIdx >= harvestState.queue.length) {
            updateGameState(prev => ({ ...prev, harvestPhase: false, harvestSubPhase: null, harvestState: null }));
            advanceRound();
            return;
        }
        const pIdx = harvestState.queue[harvestState.currentIdx];
        const p = stateRef.current.players[pIdx];
        const newborns = { sheep: 0, boar: 0, cow: 0 };
        if (p.animals.sheep >= 2) newborns.sheep = 1;
        if (p.animals.boar >= 2) newborns.boar = 1;
        if (p.animals.cow >= 2) newborns.cow = 1;
        const hasNewborns = newborns.sheep + newborns.boar + newborns.cow > 0;

        if (!hasNewborns) {
            scheduleNext(() => advanceBreedStep(), 100);
            return;
        }

        // Add newborns immediately to player state
        const simP = { 
            ...p, 
            animals: { 
                sheep: p.animals.sheep + newborns.sheep,
                boar: p.animals.boar + newborns.boar,
                cow: p.animals.cow + newborns.cow
            },
            newborns: {
                sheep: p.newborns.sheep + newborns.sheep,
                boar: p.newborns.boar + newborns.boar,
                cow: p.newborns.cow + newborns.cow
            }
        };

        updatePlayer(p.id, () => simP);

        if (p.type === 'human') {
            // Trigger interactive overflow logic (reusing standard overflow UI)
            startOverflow(p.id);
            // Don't advance step here; confirmOverflowEndTurn will do it
        } else {
             const alloc = calculateAllocation(simP);
             if (alloc.overflow > 0) {
                 const discarded = aiDiscardOverflow(simP, alloc.overflow);
                 simP.animals.sheep -= discarded.sheep; simP.animals.boar -= discarded.boar; simP.animals.cow -= discarded.cow;
                 updatePlayer(p.id, () => simP);
             }
             setTimeout(() => advanceBreedStep(), 600);
        }
    };

    const advanceBreedStep = () => {
        if (!stateRef.current.gameState.harvestState) return; 
        updateGameState(prev => ({...prev, harvestState: { ...prev.harvestState!, currentIdx: prev.harvestState!.currentIdx + 1 }}));
        processBreedPhase();
    };

    const resolveBreeding = (p: Player) => {
        // Legacy: kept for compatibility if needed, but logic moved to processBreedPhase direct update
    };

    // --- Actions ---
    const adjustHarvest = (key: keyof HarvestConversion, delta: number) => {
        const { harvestState } = stateRef.current.gameState;
        if (!harvestState) return;
        const pIdx = harvestState.queue[harvestState.currentIdx];
        updatePlayer(pIdx, p => {
             if (!p.harvestTemp) return p;
             const val = p.harvestTemp[key];
             let limit = 0;
             if (key === 'grain') limit = p.res.grain;
             else if (key === 'veg') limit = p.res.veg;
             else if (key === 'reed') limit = p.res.reed;
             else if (key === 'wood') limit = p.res.wood;
             else if (key === 'clay') limit = p.res.clay;
             else limit = p.animals[key];

             let newVal = val + delta;
             if ((key === 'reed' || key === 'wood' || key === 'clay') && newVal > 1) newVal = 1;
             
             if (newVal >= 0 && newVal <= limit) return { ...p, harvestTemp: { ...p.harvestTemp, [key]: newVal } };
             return p;
        });
    };
    const resetHarvest = () => {
        const { harvestState } = stateRef.current.gameState;
        if (!harvestState) return;
        const pIdx = harvestState.queue[harvestState.currentIdx];
        updatePlayer(pIdx, p => ({ ...p, harvestTemp: { grain: 0, veg: 0, sheep: 0, boar: 0, cow: 0, reed: 0, wood: 0, clay: 0 } }));
    };
    const confirmHarvest = () => {
         const { harvestState, harvestSubPhase } = stateRef.current.gameState;
         if (!harvestState) return;
         const pIdx = harvestState.queue[harvestState.currentIdx];
         const p = stateRef.current.players[pIdx];
         if (!p.harvestTemp) return;
         const t = p.harvestTemp;
         
         let gain = t.grain + t.veg;

         let maxSheepRate = 0;
         let maxBoarRate = 0;
         let maxCowRate = 0;

         p.majors.forEach(m => {
             if (m.cook) {
                 if (m.cook.sheep > maxSheepRate) maxSheepRate = m.cook.sheep;
                 if (m.cook.boar > maxBoarRate) maxBoarRate = m.cook.boar;
                 if (m.cook.cow > maxCowRate) maxCowRate = m.cook.cow;
             }
         });

         gain += t.sheep * maxSheepRate;
         gain += t.boar * maxBoarRate;
         gain += t.cow * maxCowRate;

         const basket = p.majors.find(m => m.id === 'm6');
         if (basket && basket.convert && basket.convert.food) {
             gain += t.reed * basket.convert.food;
         }
         const joinery = p.majors.find(m => m.id === 'm7');
         if (joinery && joinery.convert && joinery.convert.food) {
             gain += t.wood * joinery.convert.food;
         }
         const pottery = p.majors.find(m => m.id === 'm8');
         if (pottery && pottery.convert && pottery.convert.food) {
             gain += t.clay * pottery.convert.food;
         }

         const newP = { ...p, res: { ...p.res }, animals: { ...p.animals } };
         newP.res.grain -= t.grain; newP.res.veg -= t.veg; newP.res.reed -= t.reed;
         newP.res.wood -= t.wood; newP.res.clay -= t.clay;
         newP.animals.sheep -= t.sheep; newP.animals.boar -= t.boar; newP.animals.cow -= t.cow; 
         newP.res.food += gain; 
         newP.harvestTemp = null; 

         if (harvestSubPhase === 'feed') {
             const need = newP.res.maxWorkers * 2;
             const pay = Math.min(newP.res.food, need);
             newP.res.food -= pay;
             if (need - pay > 0) newP.begging += (need - pay);
             updatePlayer(pIdx, () => newP);
             scheduleNext(() => advanceFeedStep(), 200);
         } else if (harvestSubPhase === 'breed') {
             // resolveBreeding(newP); // No longer needed
         }
    };
    
    // Anytime conversion
    const toggleConversion = () => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        // In harvest phase, active player is different
        let pIdx = (startPlayer + turnIdx) % 4;
        if (stateRef.current.gameState.harvestState) {
            pIdx = stateRef.current.gameState.harvestState.queue[stateRef.current.gameState.harvestState.currentIdx];
        } else if (stateRef.current.gameState.turnPhase === 'overflow' && stateRef.current.gameState.overflowPlayer !== null) {
            pIdx = stateRef.current.gameState.overflowPlayer;
        }

        const p = stateRef.current.players[pIdx];
        if (p.conversionTemp) updatePlayer(pIdx, pp => ({ ...pp, conversionTemp: null }));
        else updatePlayer(pIdx, pp => ({ ...pp, conversionTemp: { grain: 0, veg: 0, sheep: 0, boar: 0, cow: 0, reed: 0, wood: 0, clay: 0 } }));
    };
    const adjustConversion = (key: keyof HarvestConversion, delta: number) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        let pIdx = (startPlayer + turnIdx) % 4;
        if (stateRef.current.gameState.harvestState) {
            pIdx = stateRef.current.gameState.harvestState.queue[stateRef.current.gameState.harvestState.currentIdx];
        } else if (stateRef.current.gameState.turnPhase === 'overflow' && stateRef.current.gameState.overflowPlayer !== null) {
            pIdx = stateRef.current.gameState.overflowPlayer;
        }

        updatePlayer(pIdx, p => {
             if (!p.conversionTemp) return p;
             const val = p.conversionTemp[key];
             let limit = 0;
             if (key === 'grain') limit = p.res.grain;
             else if (key === 'veg') limit = p.res.veg;
             else if (key === 'reed') limit = p.res.reed;
             else if (key === 'wood') limit = p.res.wood;
             else if (key === 'clay') limit = p.res.clay;
             else limit = p.animals[key];
             if (val + delta >= 0 && val + delta <= limit) return { ...p, conversionTemp: { ...p.conversionTemp, [key]: val + delta } };
             return p;
        });
    };
    const confirmConversion = () => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        let pIdx = (startPlayer + turnIdx) % 4;
        if (stateRef.current.gameState.harvestState) {
            pIdx = stateRef.current.gameState.harvestState.queue[stateRef.current.gameState.harvestState.currentIdx];
        } else if (stateRef.current.gameState.turnPhase === 'overflow' && stateRef.current.gameState.overflowPlayer !== null) {
            pIdx = stateRef.current.gameState.overflowPlayer;
        }

        const p = stateRef.current.players[pIdx];
        if (!p.conversionTemp) return;
        const t = p.conversionTemp;
        
        let gain = t.grain + t.veg;
        
        let maxSheepRate = 0; let maxBoarRate = 0; let maxCowRate = 0;
        p.majors.forEach(m => {
            if (m.cook) {
                if (m.cook.sheep > maxSheepRate) maxSheepRate = m.cook.sheep;
                if (m.cook.boar > maxBoarRate) maxBoarRate = m.cook.boar;
                if (m.cook.cow > maxCowRate) maxCowRate = m.cook.cow;
            }
        });

        gain += t.sheep * maxSheepRate;
        gain += t.boar * maxBoarRate;
        gain += t.cow * maxCowRate;

        const basket = p.majors.find(m => m.id === 'm6');
        if (basket && basket.convert && basket.convert.food) {
             gain += t.reed * basket.convert.food;
        }

        const newP = { ...p, res: { ...p.res }, animals: { ...p.animals }, conversionTemp: null };
        newP.res.grain -= t.grain; newP.res.veg -= t.veg; newP.res.reed -= t.reed;
        newP.res.wood -= t.wood; newP.res.clay -= t.clay;
        newP.animals.sheep -= t.sheep; newP.animals.boar -= t.boar; newP.animals.cow -= t.cow; newP.res.food += gain;
        addLog(`${p.name} converted resources to +${gain} Food`, p.color);
        updatePlayer(pIdx, () => newP);
    };

    // Animal Manager
    const toggleAnimalManager = () => setIsAdjustingAnimals(prev => !prev);
    const saveAnimalAssignment = (targetPId: number, assignments: { [key: number]: ResourceType[] }) => {
        updatePlayer(targetPId, p => ({ ...p, assignedAnimals: assignments }));
        setIsAdjustingAnimals(false);
    };

    // Baking
    const adjustBake = (delta: number) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => {
            if (!p.tempMode || !p.tempMode.bakeTemp) return p;
            const current = p.tempMode.bakeTemp.grain;
            const newVal = current + delta;
            if (newVal >= 0 && newVal <= p.res.grain) return { ...p, tempMode: { ...p.tempMode, bakeTemp: { grain: newVal } }};
            return p;
        });
    };
    
    const clickAction = (actId: string) => {
         const { startPlayer, turnIdx, occupied, roundCards, baseActions } = stateRef.current.gameState;
         const pIdx = (startPlayer + turnIdx) % 4;
         const p = stateRef.current.players[pIdx];

         if (p.type !== 'human' && p.type !== 'ai') return;

         // Use baseActions from state
         const act = baseActions.find(a => a.id === actId) || roundCards.find(a => a.id === actId);
         if (!act) return;

         if (act.mode === 'grow') {
             const rooms = p.farm.filter(t => t === 1).length;
             if (p.res.maxWorkers >= rooms) { addLog("Cannot grow: Needs more empty rooms (Rooms > Family)", "red"); return; }
         }
         if (act.mode === 'grow' || act.mode === 'grow_force') {
             if (p.res.maxWorkers >= 5) { addLog("Max family size (5) reached", "red"); return; }
         }

         const snapshotObj = { ...p, fences: Array.from(p.fences) };
         updateGameState(prev => ({ ...prev, pendingAction: { pIdx: p.id, timer: null, snapshot: JSON.stringify(snapshotObj), flags: {} } }));

         if (act.mode === 'grow' || act.mode === 'grow_force') {
             // Tentatively increase workers so the validation logic passes.
             // If canceled, snapshot restores original state.
             updatePlayer(p.id, pp => ({
                 ...pp,
                 res: { ...pp.res, maxWorkers: pp.res.maxWorkers + 1 },
                 tempMode: { mode: act.mode!, actId }
             }));
             return;
         }

         if (act.mode === 'sow') {
             if (act.id === 'r_sow') {
                let defaultSeed: 'grain' | 'veg' | undefined;
                if (p.res.grain > 0) defaultSeed = 'grain';
                else if (p.res.veg > 0) defaultSeed = 'veg';
                else defaultSeed = 'grain';
                updatePlayer(p.id, pp => ({...pp, tempMode: { mode: 'sow_bake_choice', actId, bakeTemp: { grain: 0 }, currentSeed: defaultSeed } }));
                return;
             }
         }

         if (act.type === 'res' || act.type === 'res_combo' || act.mode === 'meeting') {
             updatePlayer(p.id, pp => ({...pp, tempMode: { mode: 'simple', actId } }));
         } else {
             let defaultSeed: 'grain' | 'veg' | undefined;
             if (act.mode === 'sow' || act.mode === 'plow_sow') {
                 if (p.res.grain > 0) defaultSeed = 'grain';
                 else if (p.res.veg > 0) defaultSeed = 'veg';
                 else defaultSeed = 'grain';
             }
             
             let subAction: any = undefined;
             if (act.mode === 'plow_sow') {
                 subAction = 'plow'; // Default to Plow first
             }

             updatePlayer(p.id, pp => ({...pp, tempMode: { mode: act.mode!, actId, currentTool: 'room', currentSeed: defaultSeed, subAction } }));
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

         if (p.tempMode.mode === 'bake_immediate') {
             const mId = p.tempMode.selectedMajorId;
             const card = p.majors.find(m => m.id === mId);
             
             if (card && card.specialBake && p.tempMode.bakeTemp) {
                 const grain = p.tempMode.bakeTemp.grain;
                 const { in: inAmt, out: outAmt } = card.specialBake;
                 if (grain > p.res.grain) {
                     addLog("Not enough grain", "red");
                     return;
                 }
                 const batches = Math.floor(grain / inAmt);
                 const cost = batches * inAmt;
                 const gain = batches * outAmt;
                 
                 if (cost > 0) {
                     const finalP = { ...p, res: { ...p.res, grain: p.res.grain - cost, food: p.res.food + gain }, tempMode: null };
                     addLog(`${p.name} baked ${cost} grain -> ${gain} food`, p.color);
                     updatePlayer(pId, () => finalP);
                 } else {
                     updatePlayer(pId, () => ({ ...p, tempMode: null }));
                 }
                 updateGameState(prev => ({ ...prev, turnIdx: prev.turnIdx + 1 }));
                 scheduleNext(() => nextTurn(), 500);
                 return;
             }
             updatePlayer(pId, () => ({ ...p, tempMode: null }));
             updateGameState(prev => ({ ...prev, turnIdx: prev.turnIdx + 1 }));
             scheduleNext(() => nextTurn(), 500);
             return;
         }
         
         const pending = stateRef.current.gameState.pendingAction;
         const { majors, baseActions } = stateRef.current.gameState;
         
         if (pending && pending.pIdx === pId) {
             const mode = p.tempMode.mode;
             let isValid = true;
             let errMsg = "";
             let finalP = { ...p };
             
             const snapP = JSON.parse(pending.snapshot);
             snapP.fences = new Set(snapP.fences);
             
             if (mode === 'plow') {
                 const oldFields = snapP.farm.filter((x: number) => x === 2).length;
                 const newFields = finalP.farm.filter((x: number) => x === 2).length;
                 if (newFields <= oldFields) { isValid = false; errMsg = "Must plow a field to occupy this action!"; }
             }
             else if (mode === 'build_menu') {
                 const oldBuildings = snapP.farm.filter((x: number) => x === 1 || x === 5).length;
                 const newBuildings = finalP.farm.filter((x: number) => x === 1 || x === 5).length;
                 if (newBuildings <= oldBuildings) { isValid = false; errMsg = "Must build a room or stable!"; }
             }
             else if (mode === 'sow') {
                 const countCrops = (pp: any) => pp.farmContent.filter((x:any) => x).length;
                 if (countCrops(finalP) <= countCrops(snapP)) { isValid = false; errMsg = "Must sow at least one field!"; }
             }
             else if (mode === 'fence') {
                 if (finalP.fences.size <= snapP.fences.size) { isValid = false; errMsg = "Must build fences!"; }
             }
             else if (mode === 'major') {
                 if (!p.tempMode.selectedMajorId) { isValid = false; errMsg = "Must select a Major Improvement!"; }
             }
             else if (mode === 'grow' || mode === 'grow_force') {
                 if (finalP.res.maxWorkers <= snapP.res.maxWorkers) { isValid = false; errMsg = "Must grow family!"; }
             }
             else if (mode === 'reno_major') {
                  const renoDone = finalP.houseType !== snapP.houseType;
                  const majorDone = p.tempMode.selectedMajorId;
                  if (!renoDone && !majorDone) { isValid = false; errMsg = "Must Renovate or build Improvement!"; }
             }
             else if (mode === 'reno_fence') {
                  const renoDone = finalP.houseType !== snapP.houseType;
                  const fenceDone = finalP.fences.size > snapP.fences.size;
                  if (!renoDone && !fenceDone) { isValid = false; errMsg = "Must Renovate or build Fences!"; }
             }
             else if (mode === 'plow_sow') {
                 const plowDone = finalP.farm.filter((x:number) => x===2).length > snapP.farm.filter((x:any)=>x===2).length;
                 // It is strictly required to PLOW. Sow is optional but only if Plowed.
                 if (!plowDone) { isValid = false; errMsg = "Must Plow first!"; }
             }
             else if (mode === 'sow_bake_choice') {
                 const countCrops = (pp: any) => pp.farmContent.filter((x:any) => x).length;
                 const sowDone = countCrops(finalP) > countCrops(snapP);
                 const bakeAmt = p.tempMode.bakeTemp?.grain || 0;
                 if (!sowDone && bakeAmt <= 0) {
                     isValid = false; errMsg = "Must Sow or Bake!";
                 }
                 if (isValid && bakeAmt > 0) {
                     if (bakeAmt > finalP.res.grain) {
                         isValid = false; errMsg = "Not enough grain!";
                     } else {
                         let bestRate = 0; 
                         finalP.majors.forEach(m => {
                             if (m.specialBake && m.specialBake.in === 1) {
                                 const rate = m.specialBake.out / m.specialBake.in;
                                 if (rate > bestRate) bestRate = rate;
                             } else if (m.bakeRate) {
                                  if (m.bakeRate > bestRate) bestRate = m.bakeRate;
                             }
                         });
                         if (bestRate === 0) {
                             isValid = false; errMsg = "No oven/fireplace to bake!";
                         } else {
                            const foodGain = bakeAmt * bestRate;
                            finalP.res.grain -= bakeAmt;
                            finalP.res.food += foodGain;
                            addLog(`${p.name} baked ${bakeAmt} grain -> ${foodGain} food`, p.color);
                         }
                     }
                 }
             }

             if (isValid && (mode === 'major' || mode === 'reno_major')) {
                 const mId = p.tempMode.selectedMajorId;
                 if (mId) {
                     const card = majors.find(m => m.id === mId);
                     if (!card) {
                         isValid = false; errMsg = "Card not found/already taken.";
                     } else {
                         let canAfford = true;
                         const res = { ...finalP.res };
                         for(const [resType, amt] of Object.entries(card.cost)) {
                             // @ts-ignore
                             if (res[resType] < amt) canAfford = false;
                         }

                         if (!canAfford) {
                             isValid = false; errMsg = `Cannot afford ${card.name}`;
                         } else {
                             for(const [resType, amt] of Object.entries(card.cost)) {
                                 // @ts-ignore
                                 res[resType] -= amt;
                             }
                             finalP.res = res;
                             finalP.majors = [...finalP.majors, card];
                             addLog(`${p.name} built ${card.name}`, p.color);
                             const newMajors = majors.filter(m => m.id !== mId);
                             
                             if (card.special === 'well') {
                                const startR = stateRef.current.gameState.round + 1;
                                const newWellRewards = { ...stateRef.current.gameState.wellRewards };
                                const newFutureRes = { ...stateRef.current.gameState.futureResources };

                                for(let r = startR; r < startR + 5; r++) {
                                    if (r <= MAX_ROUNDS) {
                                        if (!newWellRewards[r]) newWellRewards[r] = [];
                                        newWellRewards[r].push(pId);
                                        if (!newFutureRes[r]) newFutureRes[r] = [];
                                        newFutureRes[r] = [...newFutureRes[r], 'food'];
                                    }
                                }
                                updateGameState(prev => ({...prev, wellRewards: newWellRewards, futureResources: newFutureRes}));
                             }

                             updateGameState(prev => ({ ...prev, majors: newMajors }));

                             if (card.type === 'bake' && finalP.res.grain > 0) {
                                if (p.type === 'human') {
                                    const newOccupied = { ...stateRef.current.gameState.occupied, [p.tempMode.actId]: pId };
                                    updateGameState(prev => ({ ...prev, occupied: newOccupied, pendingAction: null }));
                                    updatePlayer(pId, () => ({
                                        ...finalP,
                                        res: { ...finalP.res, workers: finalP.res.workers - 1 },
                                        tempMode: { 
                                            mode: 'bake_immediate', 
                                            actId: p.tempMode!.actId, 
                                            selectedMajorId: mId,
                                            bakeTemp: { grain: 0 }
                                        }
                                    }));
                                    return; 
                                } else {
                                    const { in: inAmt, out: outAmt } = card.specialBake || { in: 1, out: 1 };
                                    const batches = Math.floor(finalP.res.grain / inAmt);
                                    if (batches > 0) {
                                        const cost = batches * inAmt;
                                        const gain = batches * outAmt;
                                        finalP.res.grain -= cost;
                                        finalP.res.food += gain;
                                        addLog(`${p.name} baked ${cost} grain -> ${gain} food`, p.color);
                                    }
                                }
                             }
                         }
                     }
                 }
             }

             if (isValid && (mode === 'fence' || mode === 'reno_fence')) {
                 if (!validateFenceRules(finalP)) {
                     isValid = false; errMsg = "Fences must form closed pastures!";
                 }
             }

             if (isValid) {
                 const act = baseActions.find(a => a.id === p.tempMode!.actId) || stateRef.current.gameState.roundCards.find(a => a.id === p.tempMode!.actId);
                 
                 if (mode === 'simple' && act) {
                     let animalsGained = false;
                     if (act.type === 'res') {
                        const amt = act.cur || act.amount || 0;
                        if (['sheep','boar','cow'].includes(act.res!)) {
                            // @ts-ignore
                            finalP.animals[act.res!] += amt;
                            animalsGained = true;
                            resetActionAccumulation(act.id);
                        } else {
                            // @ts-ignore
                            finalP.res[act.res!] += amt;
                            resetActionAccumulation(act.id);
                        }
                        addLog(`${p.name} took ${act.name}`, p.color);
                    } else if (act.type === 'res_combo') {
                        if (act.id === 'act_market') {
                            finalP.res.reed += 1; finalP.res.stone += 1; finalP.res.food += 1;
                            addLog(`${p.name} took Resource Market`, p.color);
                        }
                    } else if (act.mode === 'meeting') {
                        updateGameState(prev => ({...prev, nextStartPlayer: pId}));
                        addLog(`${p.name} took Start Player`, p.color);
                    }

                    if (animalsGained) {
                         const alloc = calculateAllocation(finalP);
                         if (alloc.overflow > 0) {
                             const newOccupied = { ...stateRef.current.gameState.occupied, [p.tempMode.actId]: pId };
                             updateGameState(prev => ({ ...prev, occupied: newOccupied }));
                             updatePlayer(pId, () => ({ ...finalP, res: { ...finalP.res, workers: finalP.res.workers - 1 }, tempMode: null }));
                             startOverflow(pId);
                             return; 
                         }
                    }
                 }

                 const newOccupied = { ...stateRef.current.gameState.occupied, [p.tempMode.actId]: pId };
                 
                 updatePlayer(pId, () => ({ ...finalP, res: { ...finalP.res, workers: finalP.res.workers - 1 }, tempMode: null }));
                 updateGameState(prev => ({ ...prev, occupied: newOccupied, pendingAction: null, turnIdx: prev.turnIdx + 1 }));
                 scheduleNext(() => nextTurn(), 500);
             } else {
                 addLog(`⚠️ Invalid: ${errMsg}`, 'red');
             }
         }
    };

    const handleFarmClick = (pId: number, tileIdx: number) => {
        const p = stateRef.current.players[pId];
        if (p.type !== 'human' || !p.tempMode) return;
        const mode = p.tempMode.mode;
        const subAction = p.tempMode.subAction;

        updatePlayer(pId, pp => {
             const nf = [...pp.farm];
             const res = {...pp.res};
             const counts = [...pp.farmCounts];
             const content = [...pp.farmContent];

             const isSowMode = mode === 'sow' || mode === 'sow_bake_choice';
             const isPlowSow = mode === 'plow_sow';

             if (isPlowSow) {
                 if (subAction === 'plow') {
                     // Plow logic
                     if (nf[tileIdx] === 0) {
                         const pending = stateRef.current.gameState.pendingAction;
                         if (pending && pending.snapshot) {
                             const snap = JSON.parse(pending.snapshot);
                             if (nf.filter(x => x===2).length > snap.farm.filter((x:any)=>x===2).length) {
                                 addLog("Can only plow 1 field", "red");
                                 return pp;
                             }
                             if (snap.farm.some((x:any)=>x===2) && !hasNeighbor({ ...pp, farm: snap.farm }, tileIdx, 2)) {
                                 addLog("New fields must be adjacent", "red");
                                 return pp;
                             }
                         }
                         nf[tileIdx] = 2;
                         return { ...pp, farm: nf };
                     } else if (nf[tileIdx] === 2 && !content[tileIdx]) {
                         // Undo plow
                         const pending = stateRef.current.gameState.pendingAction;
                         if (pending && pending.snapshot) {
                             const snap = JSON.parse(pending.snapshot);
                             if (snap.farm[tileIdx] === 0) {
                                 nf[tileIdx] = 0;
                                 return { ...pp, farm: nf };
                             }
                         }
                     }
                 }
                 else if (subAction === 'sow') {
                     // Check if user has plowed at least one field (comparing to snapshot)
                     const pending = stateRef.current.gameState.pendingAction;
                     if (pending && pending.snapshot) {
                         const snap = JSON.parse(pending.snapshot);
                         const oldFields = snap.farm.filter((x:any)=>x===2).length;
                         const currentFields = nf.filter(x=>x===2).length;
                         if (currentFields <= oldFields) {
                             addLog("Must Plow a new field before Sowing!", "red");
                             return pp;
                         }
                     }

                     // Sow Logic (same as normal sow)
                     if (nf[tileIdx] === 2) {
                        const seed = pp.tempMode?.currentSeed || 'grain';
                        if (content[tileIdx]) {
                            // Check if newly placed to undo?
                            const pending = stateRef.current.gameState.pendingAction;
                             if (pending && pending.snapshot) {
                                 const snap = JSON.parse(pending.snapshot);
                                 if (!snap.farmContent[tileIdx]) {
                                     const type = content[tileIdx] as 'grain' | 'veg';
                                     res[type]++;
                                     content[tileIdx] = null;
                                     counts[tileIdx] = 0;
                                     return { ...pp, res, farmContent: content, farmCounts: counts };
                                 }
                             }
                             addLog("Field already occupied", "red");
                             return pp;
                        }

                        if (res[seed] > 0) {
                            res[seed]--;
                            content[tileIdx] = seed;
                            counts[tileIdx] = seed === 'grain' ? 3 : 2;
                            return { ...pp, res, farmContent: content, farmCounts: counts };
                        } else {
                            addLog(`No ${seed} available`, "red");
                        }
                     }
                 }
                 return pp;
             }

             if (isSowMode && nf[tileIdx] === 2) {
                 const seed = pp.tempMode?.currentSeed || 'grain';
                 
                 if (content[tileIdx]) {
                     const pending = stateRef.current.gameState.pendingAction;
                     if (pending && pending.snapshot) {
                         const snap = JSON.parse(pending.snapshot);
                         if (!snap.farmContent[tileIdx]) {
                             const type = content[tileIdx] as 'grain' | 'veg';
                             res[type]++;
                             content[tileIdx] = null;
                             counts[tileIdx] = 0;
                             return { ...pp, res, farmContent: content, farmCounts: counts };
                         }
                     }
                     addLog("Field already occupied", "red");
                     return pp;
                 }

                 if (res[seed] > 0) {
                     res[seed]--;
                     content[tileIdx] = seed;
                     counts[tileIdx] = seed === 'grain' ? 3 : 2;
                     return { ...pp, res, farmContent: content, farmCounts: counts };
                 } else {
                     addLog(`No ${seed} available`, "red");
                 }
             }

             if (mode === 'build_menu') {
                  if (nf[tileIdx] === 0) {
                     if (pp.tempMode?.currentTool === 'room') {
                         // Determine cost based on current house type
                         let costRes: 'wood' | 'clay' | 'stone' = 'wood';
                         if (pp.houseType === 'clay') costRes = 'clay';
                         if (pp.houseType === 'stone') costRes = 'stone';

                         if (res[costRes] >= 5 && res.reed >= 2) {
                             if (!hasNeighbor(pp, tileIdx, 1) && pp.farm.some(x=>x===1)) { return pp; }
                             res[costRes] -= 5; res.reed -= 2; nf[tileIdx] = 1;
                             return { ...pp, farm: nf, res };
                         } else {
                             addLog(`Need 5 ${costRes} and 2 reed`, 'red');
                         }
                     }
                     else if (pp.tempMode?.currentTool === 'stable') {
                        const currentStables = nf.filter(x => x === 5).length;
                        if (currentStables >= LIMIT_STABLES) return pp;
                        if (res.wood < 2) return pp;
                        if (currentStables > 0 && !hasNeighbor(pp, tileIdx, 5)) return pp;
                        res.wood -= 2; nf[tileIdx] = 5; 
                        return { ...pp, farm: nf, res };
                     }
                 }
             }
             
             if (mode === 'plow') {
                 if (nf[tileIdx] === 0) {
                     const pending = stateRef.current.gameState.pendingAction;
                     if (pending && pending.snapshot) {
                         const snap = JSON.parse(pending.snapshot);
                         if (nf.filter(x => x===2).length > snap.farm.filter((x:any)=>x===2).length) {
                             addLog("Can only plow 1 field", "red");
                             return pp;
                         }
                         if (snap.farm.some((x:any)=>x===2) && !hasNeighbor({ ...pp, farm: snap.farm }, tileIdx, 2)) {
                             addLog("New fields must be adjacent", "red");
                             return pp;
                         }
                     }
                     nf[tileIdx] = 2; 
                     return { ...pp, farm: nf };
                 } 
                 else if (nf[tileIdx] === 2) {
                     const pending = stateRef.current.gameState.pendingAction;
                     if (pending && pending.snapshot) {
                         const snap = JSON.parse(pending.snapshot);
                         if (snap.farm[tileIdx] === 0) {
                             nf[tileIdx] = 0;
                             return { ...pp, farm: nf };
                         }
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

        updatePlayer(pId, pp => {
             // Normalize fence keys to prevent duplicate/ambiguous fences at shared borders
             let targetIdx = tileIdx;
             let targetSide = side;

             // Normalize Right -> Left of next tile (unless last column)
             if (side === 'r' && tileIdx % 5 !== 4) {
                 targetIdx = tileIdx + 1;
                 targetSide = 'l';
             }
             // Normalize Bottom -> Top of below tile (unless last row)
             if (side === 'b' && tileIdx < 10) {
                 targetIdx = tileIdx + 5;
                 targetSide = 't';
             }

             const key = `${targetIdx}-${targetSide}`;
             const newFences = new Set(pp.fences);
             const res = { ...pp.res };

             if (newFences.has(key)) {
                 newFences.delete(key);
                 res.wood++;
             } else {
                 if (res.wood > 0 && newFences.size < LIMIT_FENCES) {
                     newFences.add(key);
                     res.wood--;
                 }
             }
             return { ...pp, fences: newFences, res };
        });
    };

    const switchTool = (tool: 'room' | 'stable') => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => ({...p, tempMode: { ...p.tempMode!, currentTool: tool }}));
    };

    const toggleSeed = (seed: 'grain' | 'veg') => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => ({...p, tempMode: { ...p.tempMode!, currentSeed: seed }}));
    };
    
    const setSubAction = (sub: 'plow'|'sow') => {
         const { startPlayer, turnIdx } = stateRef.current.gameState;
         const pIdx = (startPlayer + turnIdx) % 4;
         updatePlayer(pIdx, p => ({...p, tempMode: { ...p.tempMode!, subAction: sub }}));
    };
    
    const selectMajor = (majorId: string) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => ({...p, tempMode: { ...p.tempMode!, selectedMajorId: majorId }}));
    };

    const renovate = () => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => {
            const res = { ...p.res };
            const rooms = p.farm.filter(x => x===1).length;
            if (p.houseType === 'wood') {
                if (res.clay >= rooms && res.reed >= 1) {
                    res.clay -= rooms; res.reed -= 1;
                    return { ...p, res, houseType: 'clay' };
                }
            } else if (p.houseType === 'clay') {
                if (res.stone >= rooms && res.reed >= 1) {
                    res.stone -= rooms; res.reed -= 1;
                    return { ...p, res, houseType: 'stone' };
                }
            }
            addLog("Not enough resources to renovate", "red");
            return p;
        });
    };

    const openCardDetail = (card: MajorCard) => setViewingCard(card);
    const closeCardDetail = () => setViewingCard(null);

    return {
        gameState,
        players,
        logs,
        floatText,
        clickAction,
        cancelMode,
        confirmModeAction,
        handleFarmClick,
        handleFenceClick,
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
        debug,
    };
};
