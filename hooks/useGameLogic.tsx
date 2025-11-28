

import { useState, useRef, useEffect, useCallback } from 'react';
import { Player, GameState, Action, LogEntry, MajorCard, HarvestConversion, ResourceType } from '../types';
import { BASE_ACTIONS, DB_MAJORS, HARVEST_ROUNDS, MAX_ROUNDS, ROUND_CARDS_POOL, LIMIT_STABLES } from '../constants';
import { calculateAllocation, hasNeighbor, validateFenceRules, getFenceVertices } from '../utils/gameLogic';
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
        overflowQueue: [],
        gameOver: false,
        futureResources: {},
        turnPhase: 'action',
        overflowPlayer: null
    });
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [floatText, setFloatText] = useState<{ id: number, text: string, x: number, y: number }[]>([]);
    const [viewingCard, setViewingCard] = useState<MajorCard | null>(null);
    const [isAdjustingAnimals, setIsAdjustingAnimals] = useState(false);
    
    // Refs for mutable access in timeouts/loops
    const stateRef = useRef({ players: INITIAL_PLAYERS, gameState: gameState });
    
    const initRef = useRef(false);
    const roundLock = useRef(0);
    const loggedRoundRef = useRef(1);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const addLog = useCallback((msg: string, color: string = '#b0bec5') => {
        setLogs(prev => [{ id: Date.now() + Math.random(), msg, color }, ...prev].slice(80));
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

    // --- Init ---
    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        startGame();
        return () => clearGameTimer();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startGame = () => {
        const deck = setupDeck();
        const sp = Math.floor(Math.random() * 4);
        
        const initialGS: GameState = {
            round: 1,
            startPlayer: sp,
            nextStartPlayer: sp,
            turnIdx: 0,
            occupied: {},
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
            overflowPlayer: null
        };
        
        stateRef.current.players = INITIAL_PLAYERS;
        stateRef.current.gameState = initialGS;
        setPlayers(INITIAL_PLAYERS);
        setGameState(initialGS);
        setLogs([]);

        addLog("🎮 Game Started!", "white");
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
        
        if (gs.round >= MAX_ROUNDS) {
            updateGameState(prev => ({ ...prev, gameOver: true }));
            return;
        }

        const currentPs = stateRef.current.players;
        const newPlayers = currentPs.map(p => {
            let foodBonus = 0;
            if (p.majors.some(m => m.special === 'well')) foodBonus = 1;
            return {
                ...p,
                res: { ...p.res, workers: p.res.maxWorkers, food: p.res.food + foodBonus }
            };
        });
        stateRef.current.players = newPlayers;
        setPlayers(newPlayers);

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
        updatePlayer(p.id, () => newP);

        // Check overflow for Human Player
        if (p.type === 'human' && animalsGained) {
            const alloc = calculateAllocation(newP);
            if (alloc.overflow > 0) {
                // Pause turn, allow user to manage
                updateGameState(prev => ({ ...prev, turnPhase: 'overflow', overflowPlayer: p.id }));
                return; // DO NOT schedule next turn yet
            }
        }
        
        // AI Discard Logic or No Overflow
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

    // --- Overflow Management ---
    const discardAnimal = (type: 'sheep'|'boar'|'cow') => {
        const { overflowPlayer } = stateRef.current.gameState;
        if (overflowPlayer === null) return;
        
        updatePlayer(overflowPlayer, p => {
             const newP = { ...p, animals: { ...p.animals } };
             if (newP.animals[type] > 0) {
                 newP.animals[type]--;
             }
             return newP;
        });
    };

    const confirmOverflowEndTurn = () => {
        const { overflowPlayer } = stateRef.current.gameState;
        if (overflowPlayer === null) return;
        const p = stateRef.current.players[overflowPlayer];
        const alloc = calculateAllocation(p);
        
        if (alloc.overflow > 0) {
            addLog("Must discard excess animals before ending turn!", "red");
            return;
        }
        
        updateGameState(prev => ({ ...prev, turnPhase: 'action', overflowPlayer: null, turnIdx: prev.turnIdx + 1 }));
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
            updatePlayer(p.id, pp => ({...pp, harvestTemp: { grain: 0, veg: 0, sheep: 0, boar: 0, cow: 0 }}));
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

        const simP = { ...p, animals: { 
            sheep: p.animals.sheep + newborns.sheep,
            boar: p.animals.boar + newborns.boar,
            cow: p.animals.cow + newborns.cow
        }};

        if (p.type === 'human') {
            updatePlayer(p.id, pp => ({
                ...pp,
                pendingBreeding: newborns,
                harvestTemp: { grain: 0, veg: 0, sheep: 0, boar: 0, cow: 0 } 
            }));
            setIsAdjustingAnimals(true);
        } else {
             const alloc = calculateAllocation(simP);
             if (alloc.overflow > 0) {
                 const discarded = aiDiscardOverflow(simP, alloc.overflow);
                 simP.animals.sheep -= discarded.sheep; simP.animals.boar -= discarded.boar; simP.animals.cow -= discarded.cow;
             }
             updatePlayer(p.id, () => simP);
             setTimeout(() => advanceBreedStep(), 600);
        }
    };

    const advanceBreedStep = () => {
        if (!stateRef.current.gameState.harvestState) return; 
        updateGameState(prev => ({...prev, harvestState: { ...prev.harvestState!, currentIdx: prev.harvestState!.currentIdx + 1 }}));
        processBreedPhase();
    };

    const resolveBreeding = (p: Player) => {
        setIsAdjustingAnimals(false);
        if (!p.pendingBreeding) return;
        const newborns = p.pendingBreeding;
        const finalP = { ...p, animals: {
            sheep: p.animals.sheep + newborns.sheep,
            boar: p.animals.boar + newborns.boar,
            cow: p.animals.cow + newborns.cow
        }, pendingBreeding: null};
        updatePlayer(p.id, () => finalP);
        scheduleNext(() => advanceBreedStep(), 200);
    };

    // --- Actions ---
    const adjustHarvest = (key: keyof HarvestConversion, delta: number) => {
        const { harvestState } = stateRef.current.gameState;
        if (!harvestState) return;
        const pIdx = harvestState.queue[harvestState.currentIdx];
        updatePlayer(pIdx, p => {
             if (!p.harvestTemp) return p;
             const val = p.harvestTemp[key];
             const limit = key === 'grain' ? p.res.grain : key === 'veg' ? p.res.veg : p.animals[key];
             if (val + delta >= 0 && val + delta <= limit) return { ...p, harvestTemp: { ...p.harvestTemp, [key]: val + delta } };
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
         const t = p.harvestTemp;
         const cooker = p.majors.find(m => (m.type==='cook'||m.type==='bake') && m.cook);
         let gain = t.grain + t.veg;
         if (cooker && cooker.cook) { gain += t.sheep * cooker.cook.sheep + t.boar * cooker.cook.boar + t.cow * cooker.cook.cow; }
         const newP = { ...p, res: { ...p.res }, animals: { ...p.animals } };
         newP.res.grain -= t.grain; newP.res.veg -= t.veg; newP.animals.sheep -= t.sheep; newP.animals.boar -= t.boar; newP.animals.cow -= t.cow; newP.res.food += gain; newP.harvestTemp = null; 

         if (harvestSubPhase === 'feed') {
             const need = newP.res.maxWorkers * 2;
             const pay = Math.min(newP.res.food, need);
             newP.res.food -= pay;
             if (need - pay > 0) newP.begging += (need - pay);
             updatePlayer(pIdx, () => newP);
             scheduleNext(() => advanceFeedStep(), 200);
         } else if (harvestSubPhase === 'breed') {
             resolveBreeding(newP); 
         }
    };
    
    // Anytime conversion
    const toggleConversion = () => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        const p = stateRef.current.players[pIdx];
        if (p.conversionTemp) updatePlayer(pIdx, pp => ({ ...pp, conversionTemp: null }));
        else updatePlayer(pIdx, pp => ({ ...pp, conversionTemp: { grain: 0, veg: 0, sheep: 0, boar: 0, cow: 0 } }));
    };
    const adjustConversion = (key: keyof HarvestConversion, delta: number) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => {
             if (!p.conversionTemp) return p;
             const val = p.conversionTemp[key];
             const limit = key === 'grain' ? p.res.grain : key === 'veg' ? p.res.veg : p.animals[key];
             if (val + delta >= 0 && val + delta <= limit) return { ...p, conversionTemp: { ...p.conversionTemp, [key]: val + delta } };
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
        if (cooker && cooker.cook) gain += t.sheep * cooker.cook.sheep + t.boar * cooker.cook.boar + t.cow * cooker.cook.cow;
        const newP = { ...p, res: { ...p.res }, animals: { ...p.animals }, conversionTemp: null };
        newP.res.grain -= t.grain; newP.res.veg -= t.veg; newP.animals.sheep -= t.sheep; newP.animals.boar -= t.boar; newP.animals.cow -= t.cow; newP.res.food += gain;
        addLog(`${p.name} converted resources to +${gain} Food`, p.color);
        updatePlayer(pIdx, () => newP);
    };

    // Animal Manager
    const toggleAnimalManager = () => setIsAdjustingAnimals(prev => !prev);
    const saveAnimalAssignment = (assignments: { [key: number]: ResourceType[] }) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        let pIdx = (startPlayer + turnIdx) % 4;
        if (stateRef.current.gameState.turnPhase === 'overflow' && stateRef.current.gameState.overflowPlayer !== null) {
            pIdx = stateRef.current.gameState.overflowPlayer;
        }

        updatePlayer(pIdx, p => ({ ...p, assignedAnimals: assignments }));
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
    const setSubAction = (sub: 'sow' | 'bake' | 'both') => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => {
            if (!p.tempMode) return p;
            const bakeTemp = (sub === 'bake' || sub === 'both') ? { grain: 0 } : undefined;
            let defaultSeed: 'grain'|'veg'|undefined;
             if (sub === 'sow' || sub === 'both') {
                 if (p.res.grain > 0) defaultSeed = 'grain';
                 else if (p.res.veg > 0) defaultSeed = 'veg';
                 else defaultSeed = 'grain';
             }
            return { ...p, tempMode: { ...p.tempMode, subAction: sub, bakeTemp, currentSeed: defaultSeed, mode: (sub === 'bake') ? 'bake' : 'sow_bake_choice' } };
        });
    };

    const clickAction = (actId: string) => {
         const { startPlayer, turnIdx, occupied, roundCards } = stateRef.current.gameState;
         const pIdx = (startPlayer + turnIdx) % 4;
         const p = stateRef.current.players[pIdx];

         if (p.type !== 'human' && p.type !== 'ai') return;

         const act = BASE_ACTIONS.find(a => a.id === actId) || roundCards.find(a => a.id === actId);
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

         if (act.mode === 'sow') {
             const baker = p.majors.some(m => m.bakeRate || m.specialBake);
             if (baker) {
                 updatePlayer(p.id, pp => ({...pp, tempMode: { mode: 'sow_bake_choice', actId, subAction: 'sow' } }));
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
         const { majors } = stateRef.current.gameState;
         
         if (pending && pending.pIdx === pId) {
             const mode = p.tempMode.mode;
             let isValid = true;
             let errMsg = "";
             let finalP = { ...p };

             // MAJOR CARD LOGIC
             if (mode === 'major' || mode === 'reno_major') {
                 const mId = p.tempMode.selectedMajorId;
                 if (!mId) {
                     isValid = false; errMsg = "No Major Improvement selected.";
                 } else {
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
                             updateGameState(prev => ({ ...prev, majors: newMajors }));
                         }
                     }
                 }
             }

             if (mode === 'fence' || mode === 'reno_fence') {
                 if (!validateFenceRules(finalP)) {
                     isValid = false; errMsg = "Fences must form closed pastures!";
                 }
             }

             if (isValid) {
                 // === Handle Simple Resource Actions (previously missed for Human) ===
                 const act = BASE_ACTIONS.find(a => a.id === p.tempMode!.actId) || stateRef.current.gameState.roundCards.find(a => a.id === p.tempMode!.actId);
                 
                 if (mode === 'simple' && act) {
                     let animalsGained = false;
                     if (act.type === 'res') {
                        const amt = act.cur || act.amount || 0;
                        if (['sheep','boar','cow'].includes(act.res!)) {
                            // @ts-ignore
                            finalP.animals[act.res!] += amt;
                            animalsGained = true;
                            if(act.acc) act.cur = 0;
                        } else {
                            // @ts-ignore
                            finalP.res[act.res!] += amt;
                            if(act.acc) act.cur = 0;
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

                    // Check Overflow
                    if (animalsGained) {
                         const alloc = calculateAllocation(finalP);
                         if (alloc.overflow > 0) {
                             const newOccupied = { ...stateRef.current.gameState.occupied, [p.tempMode.actId]: pId };
                             updateGameState(prev => ({ ...prev, occupied: newOccupied, turnPhase: 'overflow', overflowPlayer: pId }));
                             updatePlayer(pId, () => ({ ...finalP, res: { ...finalP.res, workers: finalP.res.workers - 1 }, tempMode: null }));
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

        updatePlayer(pId, pp => {
             const nf = [...pp.farm];
             const res = {...pp.res};
             const counts = [...pp.farmCounts];
             const content = [...pp.farmContent];

             const isSowMode = mode === 'sow' || (mode === 'sow_bake_choice' && pp.tempMode?.subAction !== 'bake');
             const isPlowSow = mode === 'plow_sow';

             if (isPlowSow) {
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
             }

             if ((isSowMode || isPlowSow) && nf[tileIdx] === 2) {
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
                         if (res.wood >= 5 && res.reed >= 2) {
                             if (!hasNeighbor(pp, tileIdx, 1) && pp.farm.some(x=>x===1)) { return pp; }
                             res.wood -= 5; res.reed -= 2; nf[tileIdx] = 1;
                             return { ...pp, farm: nf, res };
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
             
             if (mode === 'plow' && nf[tileIdx] === 0) {
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
             
             return pp;
        });
    };

    const handleFenceClick = (pId: number, tileIdx: number, side: 't'|'b'|'l'|'r') => {
        const p = stateRef.current.players[pId];
        if (p.type !== 'human' || !p.tempMode) return;
        
        // GUARD: Ensure we are in fence mode
        if (p.tempMode.mode !== 'fence' && p.tempMode.mode !== 'reno_fence') return;
        
        if (p.tempMode.mode === 'reno_fence') {
            const pending = stateRef.current.gameState.pendingAction;
            if (pending) {
                const oldP = JSON.parse(pending.snapshot);
                if (p.houseType === oldP.houseType) {
                    addLog("Must Renovate First!", "red");
                    return;
                }
            }
        }
        
        let key = `${tileIdx}-${side}`;
        if (side === 'r') { if (tileIdx % 5 === 4) key = `${tileIdx}-r`; else key = `${tileIdx + 1}-l`; } 
        else if (side === 'b') { if (tileIdx >= 10) key = `${tileIdx}-b`; else key = `${tileIdx + 5}-t`; }
        
        updatePlayer(pId, pp => {
            const newFences = new Set(pp.fences);
            const res = { ...pp.res };
            if (newFences.has(key)) {
                newFences.delete(key); res.wood += 1;
            } else {
                if (res.wood < 1 || newFences.size >= 15) return pp;
                res.wood -= 1; newFences.add(key);
            }
            return { ...pp, fences: newFences, res };
        });
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
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, pp => ({ ...pp, tempMode: { ...pp.tempMode!, selectedMajorId: majorId } }));
    };
    const renovate = () => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const p = stateRef.current.players[(startPlayer + turnIdx) % 4];
        if (p.houseType === 'stone') return;
        const rooms = p.farm.filter(t => t === 1).length;
        let costType = p.houseType === 'wood' ? 'clay' : 'stone';
        // @ts-ignore
        if (p.res.reed < 1 || p.res[costType] < rooms) { addLog(`Need 1 Reed + ${rooms} ${costType}`, "red"); return; }
        updatePlayer(p.id, pp => ({ ...pp, res: { ...pp.res, reed: pp.res.reed - 1, [costType]: (pp.res as any)[costType] - rooms }, houseType: p.houseType === 'wood' ? 'clay' : 'stone' }));
        addLog(`${p.name} renovated`, p.color);
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
        startGame, setSubAction, adjustBake,
        discardAnimal, confirmOverflowEndTurn,
        debug: { setGameState: debugSetState, setPlayers: debugSetPlayers, forceAction: debugForceAction, stateRef }
    };
};
