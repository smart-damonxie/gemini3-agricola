
import { useState, useRef, useEffect, useCallback } from 'react';
import { Player, GameState, Action, LogEntry, MajorCard, HarvestConversion, ResourceType, Card } from '../types';
import { BASE_ACTIONS, DB_MAJORS, DB_OCCUPATIONS, DB_MINORS, HARVEST_ROUNDS, MAX_ROUNDS, ROUND_CARDS_POOL, LIMIT_STABLES, LIMIT_FENCES } from '../constants';
import { calculateAllocation, hasNeighbor, validateFenceRules, getFenceVertices } from '../utils/gameLogic';
import { getAIAction, aiDiscardOverflow } from '../utils/aiStrategy';
// replaced: import { playSound, preloadSounds } from '../utils/sound';
import { useGameAudio } from './useGameAudio';

const shuffle = <T,>(array: T[]): T[] => {
    return array.sort(() => Math.random() - 0.5);
};

const createInitialPlayers = (): Player[] => {
    const occupations = shuffle([...DB_OCCUPATIONS]);
    const minors = shuffle([...DB_MINORS]);
    
    return Array.from({ length: 4 }, (_, i) => {
        // Deal 3 of each
        const hand: Card[] = [];
        for (let k = 0; k < 3; k++) hand.push(occupations[i * 3 + k % occupations.length]); // Wrap if not enough logic, but we have 4*3=12 needed. Constants has 4.
        // To prevent crash if DB is small:
        const myOccs = DB_OCCUPATIONS.length >= 3 ? shuffle([...DB_OCCUPATIONS]).slice(0, 3) : [...DB_OCCUPATIONS];
        const myMinors = DB_MINORS.length >= 3 ? shuffle([...DB_MINORS]).slice(0, 3) : [...DB_MINORS];
        
        return {
            id: i,
            name: i === 0 ? "You (Blue)" : `AI ${['Red', 'Green', 'Yellow'][i - 1]}`,
            color: i === 0 ? '#29b6f6' : ['#ef5350', '#66bb6a', '#ffee58'][i - 1],
            type: i === 0 ? 'human' : 'ai',
            res: { wood: 0, clay: 0, reed: 0, stone: 0, food: (i === 0 ? 2 : 3), grain: 0, veg: 0, workers: 2, maxWorkers: 2 },
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
            hand: [...myOccs, ...myMinors],
            playedCards: [],
            begging: 0,
            tempMode: null,
            harvestTemp: null,
            pendingBreeding: null,
            assignedAnimals: {},
            workshopsUsed: { reed: false, wood: false, clay: false }
        };
    });
};

export const useGameLogic = () => {
    // Integrate Audio Hook
    const { playSound, toggleMute, isMuted } = useGameAudio();

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
        overflowSnapshot: null,
        feedSnapshot: null
    });
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [floatText, setFloatText] = useState<{ id: number, text: string, x: number, y: number }[]>([]);
    const [viewingCard, setViewingCard] = useState<Card | null>(null);
    const [isAdjustingAnimals, setIsAdjustingAnimals] = useState(false);
    const [isViewingHand, setIsViewingHand] = useState(false);
    
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

    // Helper to update card statistics safely
    const updateCardStat = (card: Card, resource: string, amount: number): Card => {
        const currentStats = card.statTracker || {};
        const currentVal = currentStats[resource] || 0;
        return {
            ...card,
            statTracker: {
                ...currentStats,
                [resource]: currentVal + amount
            }
        };
    };

    // ACTION HANDLER
    const clickAction = (actId: string) => {
        const { gameState: gs, players: ps } = stateRef.current;
        
        if (gs.gameOver || gs.harvestPhase || gs.turnPhase === 'overflow') return;
        
        const pIdx = (gs.startPlayer + gs.turnIdx) % 4;
        const p = ps[pIdx];

        if (gs.occupied[actId] !== undefined) {
             addLog("Action occupied!", "red");
             playSound('error');
             return;
        }

        const act = gs.baseActions.find(a => a.id === actId) || gs.roundCards.find(a => a.id === actId);
        if (!act) return;

        if (p.res.workers <= 0) {
             addLog("No workers left!", "red");
             playSound('error');
             return;
        }

        // Init Mode
        let mode = 'simple';
        if (act.type === 'special' && act.mode) {
            mode = act.mode;
        }

        // Intercept Meeting to force optional card play mode
        if (mode === 'meeting') {
            mode = 'play_minor_optional';
        }

        const tempMode: any = {
            mode,
            actId,
            selectedCardId: (mode === 'play_occupation' || mode === 'play_minor_optional') ? undefined : null
        };

        if (mode === 'build_menu') tempMode.currentTool = 'room';
        else if (mode === 'plow_sow') tempMode.subAction = 'plow';
        else if (mode === 'sow' || mode === 'sow_bake_choice') tempMode.currentSeed = 'grain';

        // Snapshot
        const snapshotObj = { ...p, fences: Array.from(p.fences) };

        updateGameState(prev => ({
            ...prev,
            pendingAction: { pIdx, timer: null, snapshot: JSON.stringify(snapshotObj), flags: {} }
        }));

        updatePlayer(pIdx, pp => ({
            ...pp,
            tempMode
        }));

        playSound('click');
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
        // preloadSounds(); // Handled by hook
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
            overflowSnapshot: null,
            feedSnapshot: null
        };
        
        stateRef.current.players = newPlayers;
        stateRef.current.gameState = initialGS;
        setPlayers(newPlayers);
        setGameState(initialGS);
        
        // Atomic log reset + initial message
        setLogs([{ id: Date.now(), msg: "🎮 Game Started!", color: "white" }]);
        playSound('fanfare');
        
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
            playSound('fanfare');
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
        const newPs = stateRef.current.players.map(p => ({
            ...p,
            newborns: { sheep: 0, boar: 0, cow: 0 },
            newbornCount: 0, // Reset newborn counter for feeding
            workshopsUsed: { reed: false, wood: false, clay: false }
        }));
        stateRef.current.players = newPs;
        setPlayers(newPs);

        // --- Well Logic & Private Forest Logic ---
        const wellBeneficiaries = gs.wellRewards[nextRound] || [];
        wellBeneficiaries.forEach(pId => {
            updatePlayer(pId, p => ({...p, res: {...p.res, food: p.res.food + 1}}));
            const pName = stateRef.current.players[pId].name;
            addLog(`${pName} got 1 food from Well`, '#29b6f6');
            if(stateRef.current.players[pId].type === 'human') playSound('food');
        });

        // Private Forest / Round Start Effects
        stateRef.current.players.forEach(p => {
             // We need to iterate over a copy or handle updates carefully
             const played = p.playedCards;
             let playedUpdated = false;
             
             const updatedPlayedCards = played.map(c => {
                 if (c.effect?.type === 'round_start') {
                     if (c.effect.bonus) {
                         const amt = c.effect.amount || 1;
                         // Update player resources inside map (a bit tricky with side effects, better to do after)
                         // But we need to update the stat tracker on the card
                         
                         // We'll update the player resource separately
                         updatePlayer(p.id, pp => ({
                             ...pp,
                             // @ts-ignore
                             res: { ...pp.res, [c.effect!.bonus!]: pp.res[c.effect!.bonus!] + amt }
                         }));
                         
                         addLog(`${p.name} got ${amt} ${c.effect.bonus} from ${c.name}`, p.color);
                         if (p.type === 'human') playSound(c.effect.bonus as any);
                         
                         playedUpdated = true;
                         return updateCardStat(c, c.effect.bonus, amt);
                     }
                 }
                 return c;
             });
             
             if (playedUpdated) {
                 updatePlayer(p.id, pp => ({ ...pp, playedCards: updatedPlayedCards }));
             }
        });
        
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
            playSound('pop');
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

        // Start modifying player
        let newP = { ...p, res: {...p.res}, animals: {...p.animals}, playedCards: [...p.playedCards] };
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
                
                // PASSIVE BONUS CHECK (Occupations/Minors)
                newP.playedCards = newP.playedCards.map(c => {
                    if (c.effect?.type === 'passive_res' && c.effect.trigger === act.res) {
                         const bonus = c.effect.amount || 1;
                         // @ts-ignore
                         newP.res[act.res!] += bonus;
                         
                         // AI Stat Tracking
                         return updateCardStat(c, act.res!, bonus);
                    }
                    if (c.effect?.type === 'passive_action' && c.effect.trigger === act.res && c.effect.bonus) {
                         const bonus = c.effect.amount || 1;
                         // @ts-ignore
                         newP.res[c.effect.bonus] += bonus;
                         return updateCardStat(c, c.effect.bonus, bonus);
                    }
                    return c;
                });

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
            // Passive check for Meeting (e.g. Tutor)
            newP.playedCards = newP.playedCards.map(c => {
                 if (c.effect?.type === 'passive_action' && c.effect.trigger === 'meeting' && c.effect.bonus) {
                     const bonus = c.effect.amount || 1;
                     // @ts-ignore
                     newP.res[c.effect.bonus] += bonus;
                     return updateCardStat(c, c.effect.bonus, bonus);
                 }
                 return c;
            });

            addLog(`${p.name} took Start Player`, p.color);
        } else if (act.mode === 'grow' || act.mode === 'grow_force') {
             if (newP.res.maxWorkers < 5) {
                 newP.res.maxWorkers += 1;
                 newP.newbornCount += 1; // Increment newborn count for AI
                 addLog(`${p.name} grew family to ${newP.res.maxWorkers}`, p.color);
             }
        } else if (act.mode === 'play_occupation') {
             // Simple AI: Play random occupation if affordable
             const occCount = p.playedCards.filter(c => c.type === 'occupation').length;
             let cost = 1;
             if (act.id === 'act_occupation2' && occCount >= 2) cost = 2;
             if (act.id === 'act_occupation1') cost = 1;

             const affordable = p.hand.filter(c => c.type === 'occupation' && newP.res.food >= cost);
             
             if (affordable.length > 0) {
                 let card = affordable[0];
                 newP.res.food -= cost;
                 newP.hand = newP.hand.filter(c => c.id !== card.id);
                 
                 // Apply Immediate
                 if (card.effect?.type === 'immediate' && card.effect.bonus) {
                     const amt = card.effect.amount || 1;
                     // @ts-ignore
                     newP.res[card.effect.bonus] += amt;
                     card = updateCardStat(card, card.effect.bonus, amt);
                 }
                 
                 newP.playedCards = [...newP.playedCards, card];
                 addLog(`${p.name} played occupation ${card.name} (Cost: ${cost})`, p.color);
             } else {
                 addLog(`${p.name} learnt nothing (no affordable occupation)`, p.color);
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
        playSound('error');
    };

    const resetOverflow = () => {
        const { overflowPlayer, overflowSnapshot } = stateRef.current.gameState;
        if (overflowPlayer === null || !overflowSnapshot) return;
        
        const oldP = JSON.parse(overflowSnapshot);
        oldP.fences = new Set(oldP.fences);
        
        updatePlayer(overflowPlayer, () => oldP);
        addLog("⏪ Reset actions for this phase", "white");
        playSound('click');
    };

    const discardAnimal = (type: 'sheep'|'boar'|'cow') => {
        const { overflowPlayer } = stateRef.current.gameState;
        if (overflowPlayer === null) return;
        
        updatePlayer(overflowPlayer, p => {
             const newP = { ...p, animals: { ...p.animals }, newborns: { ...p.newborns } };
             if (newP.animals[type] > 0) {
                 newP.animals[type]--;
                 if (newP.animals[type] < newP.newborns[type]) {
                     newP.newborns[type] = newP.animals[type];
                 }
             }
             return newP;
        });
        playSound('click');
    };

    const discardFromManager = (type: 'sheep'|'boar'|'cow', isNewborn: boolean, assignments: { [key: number]: ResourceType[] }) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        let pIdx = (startPlayer + turnIdx) % 4;
        
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
                assignedAnimals: assignments 
            };
            
            newP.animals[type]--;
            if (isNewborn && newP.newborns[type] > 0) {
                newP.newborns[type]--;
            } else if (!isNewborn) {
                if (newP.animals[type] < newP.newborns[type]) {
                    // Logic clamp if mixed
                }
            }
            if (newP.newborns[type] > newP.animals[type]) newP.newborns[type] = newP.animals[type];
            
            return newP;
        });
        addLog(`${p.name} discarded a ${isNewborn ? 'newborn' : 'adult'} ${type}`, p.color);
        playSound('click');
    };

    const cookOverflow = (type: 'sheep'|'boar'|'cow') => {
        const { overflowPlayer } = stateRef.current.gameState;
        if (overflowPlayer === null) return;
        const p = stateRef.current.players[overflowPlayer];
        
        let bestRate = 0;
        // Check Majors AND Played Cards
        [...p.majors, ...p.playedCards].forEach(m => {
            if (m.cook && m.cook[type]) {
                if (m.cook[type] > bestRate) bestRate = m.cook[type];
            }
        });

        if (bestRate === 0) {
            addLog("No cooking appliance!", "red");
            playSound('error');
            return;
        }

        const availableToCook = p.animals[type] - p.newborns[type];
        if (availableToCook <= 0) {
            addLog("Cannot cook newborn animals!", "red");
            playSound('error');
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
        playSound('cook');
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
        // Check Majors AND Played Cards
        [...p.majors, ...p.playedCards].forEach(m => {
            if (m.cook && m.cook[type]) {
                if (m.cook[type] > bestRate) bestRate = m.cook[type];
            }
        });

        if (bestRate === 0) {
            addLog("No cooking appliance!", "red");
            playSound('error');
            return;
        }

        const availableToCook = p.animals[type] - p.newborns[type];
        if (availableToCook <= 0) {
             addLog("Cannot cook newborn animals!", "red");
             playSound('error');
             return;
        }

        updatePlayer(pIdx, pp => ({
            ...pp,
            animals: { ...pp.animals, [type]: pp.animals[type] - 1 },
            res: { ...pp.res, food: pp.res.food + bestRate },
            assignedAnimals: assignments 
        }));
        addLog(`${p.name} cooked ${type} for ${bestRate} food`, p.color);
        playSound('cook');
    };

    const confirmOverflowEndTurn = () => {
        const { overflowPlayer, harvestPhase } = stateRef.current.gameState;
        if (overflowPlayer === null) return;
        const p = stateRef.current.players[overflowPlayer];
        const alloc = calculateAllocation(p);
        
        if (alloc.overflow > 0) {
            addLog("Must discard excess animals before ending turn!", "red");
            playSound('error');
            return;
        }
        
        updateGameState(prev => ({ 
            ...prev, 
            turnPhase: 'action', 
            overflowPlayer: null, 
            overflowSnapshot: null 
        }));

        playSound('click');

        if (harvestPhase) {
            scheduleNext(() => advanceBreedStep(), 500);
        } else {
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
        playSound('harvest');
        
        // Harvest Card Effects
        stateRef.current.players.forEach(p => {
             // We use updater to safely mutate stats
             updatePlayer(p.id, pp => {
                 let newPlayed = [...pp.playedCards];
                 let bonusGained = false;
                 
                 newPlayed = newPlayed.map(c => {
                     if (c.effect?.type === 'harvest') {
                         if (c.effect.bonus) {
                             const amt = c.effect.amount || 1;
                             // @ts-ignore
                             pp.res[c.effect.bonus!] += amt;
                             // Update stat tracker
                             bonusGained = true;
                             addLog(`${pp.name} got ${amt} ${c.effect.bonus} from ${c.name}`, pp.color);
                             return updateCardStat(c, c.effect.bonus, amt);
                         }
                     }
                     return c;
                 });
                 
                 return bonusGained ? { ...pp, playedCards: newPlayed, res: {...pp.res} } : pp;
             });
        });
        
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
            // Take snapshot for Undo
             const snapshotObj = { ...p, fences: Array.from(p.fences) };
             updateGameState(prev => ({ ...prev, feedSnapshot: JSON.stringify(snapshotObj) }));
        } else {
            aiHarvestFeed(p);
        }
    };

    const resetFeed = () => {
         const { harvestState, feedSnapshot } = stateRef.current.gameState;
         if (!harvestState || !feedSnapshot) return;
         
         const pIdx = harvestState.queue[harvestState.currentIdx];
         const oldP = JSON.parse(feedSnapshot);
         oldP.fences = new Set(oldP.fences);
         // Reset conversionTemp explicitly if snapshot doesn't cover it cleanly or to be safe
         oldP.conversionTemp = null;
         
         updatePlayer(pIdx, () => oldP);
         addLog("⏪ Reset feed actions", "white");
         playSound('click');
    };

    const confirmFeedPhase = () => {
         if (!stateRef.current.gameState.harvestState) return;
         const pIdx = stateRef.current.gameState.harvestState.queue[stateRef.current.gameState.harvestState.currentIdx];
         const p = stateRef.current.players[pIdx];

         // Optimized Formula: Adults eat 2, Newborns eat 1
         const need = (p.res.maxWorkers - p.newbornCount) * 2 + p.newbornCount * 1;
         
         const pay = Math.min(p.res.food, need);
         const begging = Math.max(0, need - pay);

         updatePlayer(pIdx, pp => ({
             ...pp,
             res: { ...pp.res, food: pp.res.food - pay },
             begging: pp.begging + begging
         }));
         
         updateGameState(prev => ({ ...prev, feedSnapshot: null }));

         if (begging > 0) {
             addLog(`${p.name} took ${begging} begging cards`, 'red');
             playSound('error');
         } else {
             addLog(`${p.name} fed family (${need} food)`, 'green');
             playSound('food');
         }

         scheduleNext(() => advanceFeedStep(), 200);
    };

    const advanceFeedStep = () => {
        if (!stateRef.current.gameState.harvestState) return; 
        updateGameState(prev => ({...prev, harvestState: { ...prev.harvestState!, currentIdx: prev.harvestState!.currentIdx + 1 }}));
        processFeedPhase();
    };

    const aiHarvestFeed = (p: Player) => {
        const newP: Player = { ...p, res: { ...p.res }, animals: { ...p.animals }, begging: p.begging };
        const need = (newP.res.maxWorkers - newP.newbornCount) * 2 + newP.newbornCount * 1;
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
        
        // Find ALL cooking appliances (Majors + Minors)
        const cookers = [...newP.majors, ...newP.playedCards].filter(m => (m.cook));
        const bestCooker = cookers.length > 0 ? cookers.reduce((prev, current) => (prev.cook?.sheep || 0) > (current.cook?.sheep || 0) ? prev : current) : null;

        if (deficit > 0 && bestCooker && bestCooker.cook) {
             ['sheep', 'boar', 'cow'].forEach(t => {
                 const type = t as 'sheep'|'boar'|'cow';
                 // @ts-ignore
                 let count = newP.animals[type];
                 let available = Math.max(0, count - 2);
                 const rate = bestCooker.cook![type];
                 while (deficit > 0 && available > 0) {
                     // @ts-ignore
                     newP.animals[type]--; available--; newP.res.food += rate; deficit -= rate;
                 }
                 if (deficit > 0) {
                     // @ts-ignore
                     count = newP.animals[type]; 
                     while (deficit > 0 && count > 0) {
                         // @ts-ignore
                         newP.animals[type]--; count--; newP.res.food += rate; deficit -= rate;
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

        if (p.type === 'human' && hasNewborns) {
             // Play animal sound for the first breed
             if (newborns.sheep) playSound('sheep');
             else if (newborns.boar) playSound('boar');
             else if (newborns.cow) playSound('cow');
        }

        updatePlayer(p.id, () => simP);

        if (p.type === 'human') {
            startOverflow(p.id);
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

    // --- Actions ---
    const adjustHarvest = (key: keyof HarvestConversion, delta: number) => {};
    const resetHarvest = () => {};
    const confirmHarvest = () => {};
    
    // Anytime conversion
    const toggleConversion = () => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        let pIdx = (startPlayer + turnIdx) % 4;
        if (stateRef.current.gameState.harvestState) {
            pIdx = stateRef.current.gameState.harvestState.queue[stateRef.current.gameState.harvestState.currentIdx];
        } else if (stateRef.current.gameState.turnPhase === 'overflow' && stateRef.current.gameState.overflowPlayer !== null) {
            pIdx = stateRef.current.gameState.overflowPlayer;
        }

        const p = stateRef.current.players[pIdx];
        if (p.conversionTemp) updatePlayer(pIdx, pp => ({ ...pp, conversionTemp: null }));
        else updatePlayer(pIdx, pp => ({ ...pp, conversionTemp: { grain: 0, veg: 0, vegRaw: 0, vegCook: 0, sheep: 0, boar: 0, cow: 0, reed: 0, wood: 0, clay: 0 } }));
        playSound('click');
    };
    
    const adjustConversion = (key: keyof HarvestConversion, delta: number) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        let pIdx = (startPlayer + turnIdx) % 4;
        if (stateRef.current.gameState.harvestState) {
            pIdx = stateRef.current.gameState.harvestState.queue[stateRef.current.gameState.harvestState.currentIdx];
        } else if (stateRef.current.gameState.turnPhase === 'overflow' && stateRef.current.gameState.overflowPlayer !== null) {
            pIdx = stateRef.current.gameState.overflowPlayer;
        }
        
        const isFeedPhase = stateRef.current.gameState.harvestSubPhase === 'feed';

        updatePlayer(pIdx, p => {
             if (!p.conversionTemp) return p;
             const val = p.conversionTemp[key] || 0;
             let limit = 0;
             
             if (key === 'grain') limit = p.res.grain;
             else if (key === 'vegRaw' || key === 'vegCook') {
                 // Shared limit for vegetables
                 const currentTotalVeg = (p.conversionTemp.vegRaw || 0) + (p.conversionTemp.vegCook || 0);
                 if (delta > 0 && currentTotalVeg >= p.res.veg) return p;
                 limit = 999; // Handled by shared check above
                 if (delta < 0 && val <= 0) return p;
             }
             else if (key === 'reed') {
                 limit = p.res.reed;
                 if (!isFeedPhase && delta > 0) return p;
                 
                 const isUsed = p.workshopsUsed.reed;
                 if (isUsed && delta > 0) return p;

                 if (delta > 0 && val >= 1) return p; // Workshop limit 1
             }
             else if (key === 'wood') {
                 limit = p.res.wood;
                 if (!isFeedPhase && delta > 0) return p;

                 const isUsed = p.workshopsUsed.wood;
                 if (isUsed && delta > 0) return p;

                 if (delta > 0 && val >= 1) return p; // Workshop limit 1
             }
             else if (key === 'clay') {
                 limit = p.res.clay;
                 if (!isFeedPhase && delta > 0) return p;

                 const isUsed = p.workshopsUsed.clay;
                 if (isUsed && delta > 0) return p;

                 if (delta > 0 && val >= 1) return p; // Workshop limit 1
             }
             else limit = p.animals[key as 'sheep'|'boar'|'cow'];

             const newVal = val + delta;
             if (newVal >= 0 && (limit === 999 || newVal <= limit)) {
                 return { ...p, conversionTemp: { ...p.conversionTemp, [key]: newVal } };
             }
             return p;
        });
        playSound('click');
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
        
        let gain = t.grain; 
        gain += (t.vegRaw || 0);

        let maxVegCookRate = 0;
        // Check Majors AND Played Cards
        [...p.majors, ...p.playedCards].forEach(m => {
            if (m.cook && m.cook.veg > maxVegCookRate) maxVegCookRate = m.cook.veg;
        });
        if (t.vegCook && t.vegCook > 0) {
            gain += t.vegCook * (maxVegCookRate > 0 ? maxVegCookRate : 1);
        }
        
        let maxSheepRate = 0; let maxBoarRate = 0; let maxCowRate = 0;
        [...p.majors, ...p.playedCards].forEach(m => {
            if (m.cook) {
                if (m.cook.sheep > maxSheepRate) maxSheepRate = m.cook.sheep;
                if (m.cook.boar > maxBoarRate) maxBoarRate = m.cook.boar;
                if (m.cook.cow > maxCowRate) maxCowRate = m.cook.cow;
            }
        });

        gain += t.sheep * maxSheepRate;
        gain += t.boar * maxBoarRate;
        gain += t.cow * maxCowRate;

        // Workshop conversions
        const newP = { ...p, res: { ...p.res }, animals: { ...p.animals }, conversionTemp: null, workshopsUsed: { ...p.workshopsUsed } };

        const basket = p.majors.find(m => m.id === 'm6');
        if (basket && basket.convert && basket.convert.food) {
             gain += t.reed * basket.convert.food;
             if (t.reed > 0) newP.workshopsUsed.reed = true;
        }
        const joinery = p.majors.find(m => m.id === 'm7');
        if (joinery && joinery.convert && joinery.convert.food) {
             gain += t.wood * joinery.convert.food;
             if (t.wood > 0) newP.workshopsUsed.wood = true;
        }
        const pottery = p.majors.find(m => m.id === 'm8');
        if (pottery && pottery.convert && pottery.convert.food) {
             gain += t.clay * pottery.convert.food;
             if (t.clay > 0) newP.workshopsUsed.clay = true;
        }

        newP.res.grain -= t.grain; 
        
        const vegTotal = (t.vegRaw || 0) + (t.vegCook || 0);
        newP.res.veg -= vegTotal;
        
        newP.res.reed -= t.reed;
        newP.res.wood -= t.wood; 
        newP.res.clay -= t.clay;
        newP.animals.sheep -= t.sheep; newP.animals.boar -= t.boar; newP.animals.cow -= t.cow; 
        newP.res.food += gain;
        
        addLog(`${p.name} converted resources to +${gain} Food`, p.color);
        updatePlayer(pIdx, () => newP);
        playSound('food');
    };
    
    // Animal Manager
    const toggleAnimalManager = () => {
        setIsAdjustingAnimals(prev => !prev);
        playSound('click');
    };
    const saveAnimalAssignment = (targetPId: number, assignments: { [key: number]: ResourceType[] }) => {
        updatePlayer(targetPId, p => ({ ...p, assignedAnimals: assignments }));
        setIsAdjustingAnimals(false);
        playSound('click');
    };

    // Baking
    const adjustBake = (majorId: string, delta: number) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => {
            if (!p.tempMode || !p.tempMode.bakeTargets) return p;
            
            const currentTotalBake = Object.values(p.tempMode.bakeTargets).reduce((a, b) => a + b, 0);
            const currentMajorBake = p.tempMode.bakeTargets[majorId] || 0;
            const newVal = currentMajorBake + delta;
            
            // Check limits
            const card = p.majors.find(m => m.id === majorId);
            if (!card) return p;

            if (card.specialBake && card.specialBake.limit) {
                if (newVal > card.specialBake.limit) return p;
            }

            if (delta > 0 && currentTotalBake >= p.res.grain) return p;
            
            if (newVal >= 0) {
                 return { 
                     ...p, 
                     tempMode: { 
                         ...p.tempMode, 
                         bakeTargets: { ...p.tempMode.bakeTargets, [majorId]: newVal } 
                     }
                 };
            }
            return p;
        });
        playSound('click');
    };
    
    // NEW: Select Card for Play (Pending Confirmation)
    const selectCardForPlay = (cardId: string) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        const p = stateRef.current.players[pIdx];
        
        // Don't commit yet, just update state to show "Confirm" UI on main screen
        updatePlayer(pIdx, pp => ({
            ...pp,
            tempMode: { 
                ...pp.tempMode!, 
                selectedCardId: cardId 
            }
        }));
        playSound('click');
    };

    // NEW: Pass Playing Card (For Meeting)
    const passCardPlay = () => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        
        updatePlayer(pIdx, pp => ({
            ...pp,
            tempMode: { 
                ...pp.tempMode!, 
                selectedCardId: null // explicitly null means "I chose not to play a card"
            }
        }));
        playSound('click');
    }

    const cancelMode = () => {
         const { pendingAction } = stateRef.current.gameState;
         if (pendingAction) {
             const oldP = JSON.parse(pendingAction.snapshot);
             oldP.fences = new Set(oldP.fences);
             oldP.tempMode = null;
             updatePlayer(pendingAction.pIdx, () => oldP);
             updateGameState(prev => ({...prev, pendingAction: null}));
             playSound('click');
         }
    };

    const confirmModeAction = (pId: number) => {
         const p = stateRef.current.players[pId];
         if (!p.tempMode) return;
         
         const pending = stateRef.current.gameState.pendingAction;
         const { majors, baseActions } = stateRef.current.gameState;
         
         // --- OCCUPATION / CARD PLAY LOGIC (NEW) ---
         if (p.tempMode.mode === 'play_occupation' || p.tempMode.mode === 'play_minor_optional') {
             const cardId = p.tempMode.selectedCardId;
             const isMeeting = p.tempMode.mode === 'play_minor_optional';

             if (!cardId && !isMeeting) {
                 // Occupation action MUST pick a card or cancel
                 addLog("Must select a card or cancel.", "red");
                 playSound('error');
                 return;
             }
             
             let finalP = { ...p };
             let cost = 0;
             let playedCard: Card | undefined;

             if (cardId) {
                 let card = p.hand.find(c => c.id === cardId);
                 if (!card) { addLog("Card not found", "red"); return; }
                 
                 // Logic for dynamic cost
                 let effectiveCost = { ...card.cost };
                 if (p.tempMode.mode === 'play_occupation') {
                    if (p.tempMode.actId === 'act_occupation2') {
                        const occCount = p.playedCards.filter(c => c.type === 'occupation').length;
                        cost = occCount < 2 ? 1 : 2;
                    } else if (p.tempMode.actId === 'act_occupation1') {
                        cost = 1;
                    }
                    effectiveCost = { food: cost };
                 }

                 // Check Cost
                 let canAfford = true;
                 Object.entries(effectiveCost).forEach(([k, v]) => {
                     // @ts-ignore
                     if (p.res[k] < v) canAfford = false;
                 });

                 if (!canAfford) {
                     addLog(`Cannot afford ${card.name}`, 'red');
                     playSound('error');
                     return;
                 }

                 // Pay Cost
                 const newRes = { ...finalP.res };
                 Object.entries(effectiveCost).forEach(([k, v]) => {
                     // @ts-ignore
                     newRes[k] -= v;
                 });
                 finalP.res = newRes;

                 // Move Card
                 finalP.hand = finalP.hand.filter(c => c.id !== cardId);
                 
                 // Immediate Effect & Stat Tracking
                 if (card.effect?.type === 'immediate') {
                    if (card.effect.bonus) {
                        const amt = card.effect.amount || 1;
                        // @ts-ignore
                        finalP.res[card.effect.bonus] = (finalP.res[card.effect.bonus] || 0) + amt;
                        // Update tracking
                        card = updateCardStat(card, card.effect.bonus, amt);
                    }
                 }
                 
                 playedCard = card;
                 finalP.playedCards = [...finalP.playedCards, card];
                 
                 addLog(`${p.name} played ${card.name}`, p.color);
                 playSound('success');
             } else {
                 addLog(`${p.name} played no card`, p.color);
             }

             // Handle Meeting Effect (Becoming Start Player)
             if (isMeeting) {
                 updateGameState(prev => ({ ...prev, nextStartPlayer: pId }));
                 addLog(`${p.name} took Start Player`, p.color);

                 // Passive check for Meeting (e.g. Tutor)
                 finalP.playedCards = finalP.playedCards.map(c => {
                     if (c.effect?.type === 'passive_action' && c.effect.trigger === 'meeting' && c.effect.bonus) {
                         const bonus = c.effect.amount || 1;
                         // @ts-ignore
                         finalP.res[c.effect.bonus] += bonus;
                         // Update stat tracker
                         return updateCardStat(c, c.effect.bonus, bonus);
                     }
                     return c;
                 });
             }

             // End Action
             const newOccupied = { ...stateRef.current.gameState.occupied, [p.tempMode.actId]: pId };
             updatePlayer(pId, () => ({ ...finalP, res: { ...finalP.res, workers: finalP.res.workers - 1 }, tempMode: null }));
             updateGameState(prev => ({ ...prev, occupied: newOccupied, pendingAction: null, turnIdx: prev.turnIdx + 1 }));
             scheduleNext(() => nextTurn(), 500);
             return;
         }

         if (p.tempMode.mode === 'bake_immediate') {
             // ... existing logic ...
             if (p.tempMode.bakeTargets) {
                 let totalCost = 0;
                 let totalGain = 0;
                 let inputsMsg: string[] = [];

                 Object.entries(p.tempMode.bakeTargets).forEach(([mId, count]) => {
                     if (count > 0) {
                         const card = p.majors.find(m => m.id === mId);
                         if (card) {
                             let gain = 0;
                             if (card.specialBake) {
                                 gain = (count / card.specialBake.in) * card.specialBake.out;
                             } else if (card.bakeRate) {
                                 gain = count * card.bakeRate;
                             }
                             totalCost += count;
                             totalGain += gain;
                             inputsMsg.push(`${card.name}: ${count}g->${gain}f`);
                         }
                     }
                 });

                 if (totalCost > p.res.grain) {
                     addLog("Not enough grain!", "red");
                     playSound('error');
                     return;
                 }
                 
                 if (totalCost > 0) {
                     const finalP = { ...p, res: { ...p.res, grain: p.res.grain - totalCost, food: p.res.food + totalGain }, tempMode: null };
                     addLog(`${p.name} baked: ${inputsMsg.join(', ')}`, p.color);
                     updatePlayer(pId, () => finalP);
                     playSound('cook');
                 } else {
                     updatePlayer(pId, () => ({ ...p, tempMode: null }));
                 }
                 updateGameState(prev => ({ ...prev, turnIdx: prev.turnIdx + 1 }));
                 scheduleNext(() => nextTurn(), 500);
                 return;
             }
         }

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
                  if (!renoDone) { isValid = false; errMsg = "Must Renovate first!"; }
             }
             else if (mode === 'reno_fence') {
                  const renoDone = finalP.houseType !== snapP.houseType;
                  if (!renoDone) { isValid = false; errMsg = "Must Renovate first!"; }
             }
             else if (mode === 'plow_sow') {
                 const plowDone = finalP.farm.filter((x:number) => x===2).length > snapP.farm.filter((x:any)=>x===2).length;
                 if (!plowDone) { isValid = false; errMsg = "Must Plow first!"; }
             }
             else if (mode === 'sow_bake_choice') {
                 const countCrops = (pp: any) => pp.farmContent.filter((x:any) => x).length;
                 const sowDone = countCrops(finalP) > countCrops(snapP);
                 
                 let totalBakeCost = 0;
                 let totalBakeGain = 0;
                 
                 if (p.tempMode.bakeTargets) {
                     Object.entries(p.tempMode.bakeTargets).forEach(([mId, count]) => {
                         if (count > 0) {
                             const card = p.majors.find(m => m.id === mId);
                             if (card) {
                                 let gain = 0;
                                 if (card.specialBake) {
                                     gain = (count / card.specialBake.in) * card.specialBake.out;
                                 } else if (card.bakeRate) {
                                     gain = count * card.bakeRate;
                                 }
                                 totalBakeCost += count;
                                 totalBakeGain += gain;
                             }
                         }
                     });
                 }
                 
                 const bakeDone = totalBakeCost > 0;
                 if (!sowDone && !bakeDone) {
                     isValid = false; errMsg = "Must Sow or Bake!";
                 }
                 
                 if (isValid && bakeDone) {
                     if (totalBakeCost > finalP.res.grain) {
                         isValid = false; errMsg = "Not enough grain!";
                     } else {
                         finalP.res.grain -= totalBakeCost;
                         finalP.res.food += totalBakeGain;
                         addLog(`${p.name} baked ${totalBakeCost} grain -> ${totalBakeGain} food`, p.color);
                         playSound('cook');
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
                         // --- FIREPLACE UPGRADE LOGIC ---
                         const isFireplace = mId === 'm3' || mId === 'm4';
                         const hearth = finalP.majors.find(m => m.id === 'm1' || m.id === 'm2');
                         const isUpgrade = isFireplace && hearth && p.tempMode.subAction === 'upgrade';

                         if (isUpgrade) {
                             // Perform Swap
                             finalP.majors = finalP.majors.filter(m => m.id !== hearth.id); // Remove Hearth
                             finalP.majors.push(card); // Add Fireplace
                             addLog(`${p.name} upgraded ${hearth.name} to ${card.name}`, p.color);
                             playSound('build');

                             // Update Game State: Remove Fireplace from pool, Add Hearth to pool
                             const newMajors = majors.filter(m => m.id !== mId);
                             newMajors.push(hearth); // Return hearth
                             updateGameState(prev => ({ ...prev, majors: newMajors }));

                             // Trigger Bake Immediate if applicable (Fireplaces allow baking)
                             if (card.type === 'major' && card.bakeRate && finalP.res.grain > 0) {
                                 const newOccupied = { ...stateRef.current.gameState.occupied, [p.tempMode.actId]: pId };
                                 updateGameState(prev => ({ ...prev, occupied: newOccupied, pendingAction: null }));
                                 
                                 const bakeTargets: {[key: string]: number} = {};
                                 finalP.majors.forEach(m => {
                                     if (m.bakeRate || m.specialBake) {
                                         bakeTargets[m.id] = 0;
                                     }
                                 });
                                 
                                 updatePlayer(pId, () => ({
                                     ...finalP,
                                     res: { ...finalP.res, workers: finalP.res.workers - 1 },
                                     tempMode: { 
                                         mode: 'bake_immediate', 
                                         actId: p.tempMode!.actId, 
                                         selectedMajorId: mId,
                                         bakeTargets
                                     }
                                 }));
                                 return;
                             }
                             // End turn for upgrade path
                             const newOccupied = { ...stateRef.current.gameState.occupied, [p.tempMode.actId]: pId };
                             updatePlayer(pId, () => ({ ...finalP, res: { ...finalP.res, workers: finalP.res.workers - 1 }, tempMode: null }));
                             updateGameState(prev => ({ ...prev, occupied: newOccupied, pendingAction: null, turnIdx: prev.turnIdx + 1 }));
                             scheduleNext(() => nextTurn(), 500);
                             return;
                         }

                         // --- STANDARD PURCHASE LOGIC ---
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
                             playSound('build');
                             
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

                             if (card.type === 'major' && card.bakeRate && finalP.res.grain > 0) {
                                if (p.type === 'human') {
                                    const newOccupied = { ...stateRef.current.gameState.occupied, [p.tempMode.actId]: pId };
                                    updateGameState(prev => ({ ...prev, occupied: newOccupied, pendingAction: null }));
                                    
                                    const bakeTargets: {[key: string]: number} = {};
                                    finalP.majors.forEach(m => {
                                        if (m.bakeRate || m.specialBake) {
                                            bakeTargets[m.id] = 0;
                                        }
                                    });
                                    
                                    updatePlayer(pId, () => ({
                                        ...finalP,
                                        res: { ...finalP.res, workers: finalP.res.workers - 1 },
                                        tempMode: { 
                                            mode: 'bake_immediate', 
                                            actId: p.tempMode!.actId, 
                                            selectedMajorId: mId,
                                            bakeTargets
                                        }
                                    }));
                                    return; 
                                } else {
                                    const { in: inAmt, out: outAmt } = card.specialBake || { in: 1, out: 1 };
                                    const limit = card.specialBake?.limit || 999;
                                    const maxPossible = Math.min(Math.floor(finalP.res.grain / inAmt), limit);
                                    
                                    const batches = maxPossible;
                                    
                                    if (batches > 0) {
                                        const cost = batches * inAmt;
                                        const gain = batches * outAmt;
                                        finalP.res.grain -= cost;
                                        finalP.res.food += gain;
                                        addLog(`${p.name} baked ${cost} grain -> ${gain} food`, p.color);
                                        playSound('cook');
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
                            playSound(act.res as any);
                        } else {
                            // @ts-ignore
                            finalP.res[act.res!] += amt;
                            
                            // Passive effects trigger here too for simple actions
                            finalP.playedCards = finalP.playedCards.map(c => {
                                let updatedC = c;
                                let triggered = false;
                                if (c.effect?.type === 'passive_res' && c.effect.trigger === act.res) {
                                    const bonus = c.effect.amount || 1;
                                    // @ts-ignore
                                    finalP.res[act.res!] += bonus;
                                    updatedC = updateCardStat(updatedC, act.res!, bonus);
                                    triggered = true;
                                }
                                if (c.effect?.type === 'passive_action' && c.effect.trigger === act.res && c.effect.bonus) {
                                    const bonus = c.effect.amount || 1;
                                    // @ts-ignore
                                    finalP.res[c.effect.bonus] += bonus;
                                    updatedC = updateCardStat(updatedC, c.effect.bonus, bonus);
                                    triggered = true;
                                }
                                return updatedC;
                            });

                            resetActionAccumulation(act.id);
                            if (act.res === 'wood') playSound('wood');
                            else if (act.res === 'clay') playSound('clay');
                            else if (act.res === 'stone') playSound('stone');
                            else if (act.res === 'reed') playSound('reed');
                            else if (act.res === 'food') playSound('food');
                            else if (act.res === 'grain') playSound('grain');
                            else if (act.res === 'veg') playSound('vegetables');
                            else playSound('click');
                        }
                        addLog(`${p.name} took ${act.name}`, p.color);
                    } else if (act.type === 'res_combo') {
                        if (act.id === 'act_market') {
                            finalP.res.reed += 1; finalP.res.stone += 1; finalP.res.food += 1;
                            addLog(`${p.name} took Resource Market`, p.color);
                            playSound('gain');
                        }
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
                 playSound('error');
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
                                 playSound('error');
                                 return pp;
                             }
                             if (snap.farm.some((x:any)=>x===2) && !hasNeighbor({ ...pp, farm: snap.farm }, tileIdx, 2)) {
                                 addLog("New fields must be adjacent", "red");
                                 playSound('error');
                                 return pp;
                             }
                         }
                         nf[tileIdx] = 2;
                         playSound('plow');
                         return { ...pp, farm: nf };
                     } else if (nf[tileIdx] === 2 && !content[tileIdx]) {
                         // Undo plow
                         const pending = stateRef.current.gameState.pendingAction;
                         if (pending && pending.snapshot) {
                             const snap = JSON.parse(pending.snapshot);
                             if (snap.farm[tileIdx] === 0) {
                                 nf[tileIdx] = 0;
                                 playSound('click');
                                 return { ...pp, farm: nf };
                             }
                         }
                     }
                 }
                 else if (subAction === 'sow') {
                     const pending = stateRef.current.gameState.pendingAction;
                     if (pending && pending.snapshot) {
                         const snap = JSON.parse(pending.snapshot);
                         const oldFields = snap.farm.filter((x:any)=>x===2).length;
                         const currentFields = nf.filter(x=>x===2).length;
                         if (currentFields <= oldFields) {
                             addLog("Must Plow a new field before Sowing!", "red");
                             playSound('error');
                             return pp;
                         }
                     }

                     if (nf[tileIdx] === 2) {
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
                                     playSound('click');
                                     return { ...pp, res, farmContent: content, farmCounts: counts };
                                 }
                             }
                             addLog("Field already occupied", "red");
                             playSound('error');
                             return pp;
                        }

                        if (res[seed] > 0) {
                            res[seed]--;
                            content[tileIdx] = seed;
                            counts[tileIdx] = seed === 'grain' ? 3 : 2;
                            playSound('plant');
                            return { ...pp, res, farmContent: content, farmCounts: counts };
                        } else {
                            addLog(`No ${seed} available`, "red");
                            playSound('error');
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
                             playSound('click');
                             return { ...pp, res, farmContent: content, farmCounts: counts };
                         }
                     }
                     addLog("Field already occupied", "red");
                     playSound('error');
                     return pp;
                 }

                 if (res[seed] > 0) {
                     res[seed]--;
                     content[tileIdx] = seed;
                     counts[tileIdx] = seed === 'grain' ? 3 : 2;
                     playSound('plant');
                     return { ...pp, res, farmContent: content, farmCounts: counts };
                 } else {
                     addLog(`No ${seed} available`, "red");
                     playSound('error');
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
                             if (!hasNeighbor(pp, tileIdx, 1) && pp.farm.some(x=>x===1)) { playSound('error'); return pp; }
                             res[costRes] -= 5; res.reed -= 2; nf[tileIdx] = 1;
                             playSound('build');
                             return { ...pp, farm: nf, res };
                         } else {
                             addLog(`Need 5 ${costRes} and 2 reed`, 'red');
                             playSound('error');
                         }
                     }
                     else if (pp.tempMode?.currentTool === 'stable') {
                        const currentStables = nf.filter(x => x === 5).length;
                        if (currentStables >= LIMIT_STABLES) return pp;
                        if (res.wood < 2) { playSound('error'); return pp; }
                        if (currentStables > 0 && !hasNeighbor(pp, tileIdx, 5)) { playSound('error'); return pp; }
                        res.wood -= 2; nf[tileIdx] = 5; 
                        playSound('build');
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
                             playSound('error');
                             return pp;
                         }
                         if (snap.farm.some((x:any)=>x===2) && !hasNeighbor({ ...pp, farm: snap.farm }, tileIdx, 2)) {
                             addLog("New fields must be adjacent", "red");
                             playSound('error');
                             return pp;
                         }
                     }
                     nf[tileIdx] = 2; 
                     playSound('plow');
                     return { ...pp, farm: nf };
                 } 
                 else if (nf[tileIdx] === 2) {
                     const pending = stateRef.current.gameState.pendingAction;
                     if (pending && pending.snapshot) {
                         const snap = JSON.parse(pending.snapshot);
                         if (snap.farm[tileIdx] === 0) {
                             nf[tileIdx] = 0;
                             playSound('click');
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
             // Normalize fence keys
             let targetIdx = tileIdx;
             let targetSide = side;

             if (side === 'r' && tileIdx % 5 !== 4) {
                 targetIdx = tileIdx + 1;
                 targetSide = 'l';
             }
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
                 playSound('fence');
             } else {
                 if (res.wood > 0 && newFences.size < LIMIT_FENCES) {
                     newFences.add(key);
                     res.wood--;
                     playSound('fence');
                 } else {
                     playSound('error');
                 }
             }
             return { ...pp, fences: newFences, res };
        });
    };

    const switchTool = (tool: 'room' | 'stable') => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => ({...p, tempMode: { ...p.tempMode!, currentTool: tool }}));
        playSound('click');
    };

    const toggleSeed = (seed: 'grain' | 'veg') => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => ({...p, tempMode: { ...p.tempMode!, currentSeed: seed }}));
        playSound('click');
    };
    
    const setSubAction = (sub: 'plow'|'sow'|'upgrade') => {
         const { startPlayer, turnIdx } = stateRef.current.gameState;
         const pIdx = (startPlayer + turnIdx) % 4;
         updatePlayer(pIdx, p => ({...p, tempMode: { ...p.tempMode!, subAction: sub }}));
         playSound('click');
    };
    
    const selectMajor = (majorId: string) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => ({...p, tempMode: { ...p.tempMode!, selectedMajorId: majorId }}));
        playSound('click');
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
                    playSound('build');
                    return { ...p, res, houseType: 'clay' };
                }
            } else if (p.houseType === 'clay') {
                if (res.stone >= rooms && res.reed >= 1) {
                    res.stone -= rooms; res.reed -= 1;
                    playSound('build');
                    return { ...p, res, houseType: 'stone' };
                }
            }
            addLog("Not enough resources to renovate", "red");
            playSound('error');
            return p;
        });
    };
    
    const openCardDetail = (card: Card) => {
        setViewingCard(card);
        playSound('click');
    };

    const closeCardDetail = () => {
        setViewingCard(null);
        playSound('click');
    };
    
    const toggleHandView = () => {
        setIsViewingHand(prev => !prev);
        playSound('click');
    };

    return {
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
        confirmFeedPhase,
        resetFeed,
        playCard: selectCardForPlay, // Renamed export to match intended use, but kept hook return consistent
        passCardPlay,
        selectCardForPlay,
        toggleHandView,
        isViewingHand,
        debug,
        playSound,
        toggleMute,
        isMuted
    };
};
