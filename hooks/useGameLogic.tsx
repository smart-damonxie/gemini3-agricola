

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

const createInitialPlayers = (mode: 'single' | 'multi' = 'single'): Player[] => {
    const occupations = shuffle([...DB_OCCUPATIONS]);
    const minors = shuffle([...DB_MINORS]);
    
    return Array.from({ length: 4 }, (_, i) => {
        const occStart = i * 3;
        const occEnd = occStart + 3;
        const myOccs = occupations.slice(occStart, occEnd);

        const minStart = i * 3;
        const minEnd = minStart + 3;
        const myMinors = minors.slice(minStart, minEnd);

        const isHuman = mode === 'multi' ? true : (i === 0);
        const name = mode === 'multi' ? `Player ${i + 1}` : (i === 0 ? "You (Blue)" : `AI ${['Red', 'Green', 'Yellow'][i - 1]}`);
        const color = i === 0 ? '#29b6f6' : ['#ef5350', '#66bb6a', '#ffee58'][i - 1];

        return {
            id: i,
            name: name,
            color: color,
            type: isHuman ? 'human' : 'ai',
            res: { wood: 0, clay: 0, reed: 0, stone: 0, food: 2, grain: 0, veg: 0, workers: 2, maxWorkers: 2 },
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
            workshopsUsed: { reed: false, wood: false, clay: false },
            firewoodCollectorTriggered: false,
            roundGains: { wood: 0, clay: 0, reed: 0, stone: 0 }
        };
    });
};

export const useGameLogic = () => {
    // Integrate Audio Hook
    const { playSound, toggleMute, isMuted } = useGameAudio();

    const [players, setPlayers] = useState<Player[]>(createInitialPlayers('single'));
    const [gameState, setGameState] = useState<GameState>({
        round: 1,
        startPlayer: 0,
        nextStartPlayer: 0,
        turnIdx: 0,
        occupied: {},
        baseActions: JSON.parse(JSON.stringify(BASE_ACTIONS)),
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
    const [gamePhase, setGamePhase] = useState<'setup' | 'playing' | 'gameover'>('setup');

    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [viewingCardState, setViewingCardState] = useState<{ card: Card, owner: Player } | null>(null);
    const [isAdjustingAnimals, setIsAdjustingAnimals] = useState(false);
    const [isViewingHand, setIsViewingHand] = useState(false);
    
    const stateRef = useRef({ players: createInitialPlayers('single'), gameState: gameState });
    
    const roundLock = useRef(0);
    const loggedRoundRef = useRef(1);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const addLog = useCallback((msg: string, color: string = '#b0bec5') => {
        setLogs(prev => [{ id: Date.now() + Math.random(), msg, color }, ...prev].slice(300));
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

    const clickAction = (actId: string) => {
        const { gameState: gs, players: ps } = stateRef.current;
        
        if (gs.gameOver || gs.harvestPhase || gs.turnPhase === 'overflow') return;
        
        if (gs.pendingAction) {
             addLog("Please confirm current action first", "red");
             playSound('error');
             return;
        }
        
        const pIdx = (gs.startPlayer + gs.turnIdx) % 4;
        const p = ps[pIdx];

        // REST CORNER (minor_xiuqijiao): Override occupied check for grow actions
        const isRestCornerUser = p.playedCards.some(c => c.id === 'minor_xiuqijiao');
        if (gs.occupied[actId] !== undefined) {
             const act = gs.roundCards.find(a => a.id === actId);
             if (isRestCornerUser && (act?.mode === 'grow' || act?.mode === 'grow_force')) {
                 // Allow
             } else {
                 addLog("Action occupied!", "red");
                 playSound('error');
                 return;
             }
        }

        const act = gs.baseActions.find(a => a.id === actId) || gs.roundCards.find(a => a.id === actId);
        if (!act) return;

        if (p.res.workers <= 0) {
             addLog("No workers left!", "red");
             playSound('error');
             return;
        }

        let mode = 'simple';
        if (act.type === 'special' && act.mode) {
            mode = act.mode;
        }

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

        const snapshotObj = { ...p, fences: Array.from(p.fences) };
        const flags: any = { actId };
        if (act.acc || act.cur !== undefined) {
            flags.restoreCur = act.cur !== undefined ? act.cur : 0;
        }

        updateGameState(prev => ({
            ...prev,
            pendingAction: { pIdx, timer: null, snapshot: JSON.stringify(snapshotObj), flags }
        }));

        updatePlayer(pIdx, pp => ({
            ...pp,
            tempMode
        }));

        if (p.type === 'human' && mode === 'simple') {
            const newOccupied = { ...gs.occupied, [actId]: pIdx };
            updateGameState(prev => ({ ...prev, occupied: newOccupied }));
        }

        playSound('click');
        executeActionLogic(p, act, mode, tempMode);
    };

    const passCardToNextPlayer = (card: Card, fromPId: number) => {
        const nextPId = (fromPId + 1) % 4;
        updatePlayer(nextPId, p => ({ ...p, hand: [...p.hand, card] }));
        addLog(`${card.name} passed to Player ${nextPId + 1}`, '#fff');
    };

    const executeActionLogic = (p: Player, act: Action, mode: string, initialTempMode?: any) => {
        let newP = { ...p, res: {...p.res}, animals: {...p.animals}, playedCards: [...p.playedCards], roundGains: {...p.roundGains} };
        
        if (initialTempMode) {
            newP.tempMode = initialTempMode;
        }

        let animalsGained = false;
        let needsResetAccumulation = false;
        let shouldPauseForConfirmation = false;

        if (act.type === 'res') {
            const amt = act.cur || act.amount || 0;
            if (['sheep','boar','cow'].includes(act.res!)) {
                if (p.type === 'human' && act.acc && newP.playedCards.some(c => c.id === 'o_dongwujiaoyiyuan') && newP.res.food >= 1) {
                    // @ts-ignore
                    newP.animals[act.res!] += amt;
                    newP.tempMode = { mode: 'choice_animal_dealer', actId: act.id };
                    shouldPauseForConfirmation = true;
                    animalsGained = true;
                } else {
                    // @ts-ignore
                    newP.animals[act.res!] += amt;
                    
                    if (p.type === 'ai' && act.acc) {
                        const trader = newP.playedCards.find(c => c.id === 'o_dongwujiaoyiyuan');
                        if (trader && newP.res.food >= 1) {
                            newP.res.food--;
                            // @ts-ignore
                            newP.animals[act.res!] += 1;
                            newP.playedCards = newP.playedCards.map(c => c.id === trader.id ? updateCardStat(c, act.res!, 1) : c);
                            addLog(`${p.name} bought extra ${act.res} (Animal Dealer)`, p.color);
                        }
                    }
                    animalsGained = true;
                }
                
                // MILK JUG (minor_niunaiguan) - Global Effect
                if (act.res === 'cow' && (act.acc || act.id.includes('market'))) {
                    stateRef.current.players.forEach(op => {
                        const jug = op.playedCards.find(c => c.id === 'minor_niunaiguan');
                        if (jug) {
                            if (op.id === p.id) {
                                newP.res.food += 3;
                                addLog(`${p.name} +3 Food (Milk Jug)`, p.color);
                            } else {
                                updatePlayer(op.id, pp => ({ ...pp, res: { ...pp.res, food: pp.res.food + 1 } }));
                                addLog(`${op.name} +1 Food (Milk Jug)`, op.color);
                            }
                        }
                    });
                }

                needsResetAccumulation = true;
            } else {
                // @ts-ignore
                newP.res[act.res!] += amt;
                
                // Track Gains for Clay Pipe
                if (['wood', 'clay', 'reed', 'stone'].includes(act.res!)) {
                    // @ts-ignore
                    newP.roundGains[act.res!] += amt;
                }

                // Passive Bonuses
                newP.playedCards = newP.playedCards.map(c => {
                    if (c.effect?.type === 'passive_res' && c.effect.trigger === act.res) {
                         const bonus = c.effect.amount || 1;
                         // @ts-ignore
                         newP.res[act.res!] += bonus;
                         // @ts-ignore
                         if (['wood','clay','reed','stone'].includes(act.res!)) newP.roundGains[act.res!] += bonus;
                         return updateCardStat(c, act.res!, bonus);
                    }
                    if (c.effect?.type === 'passive_action' && c.effect.trigger === act.res && c.effect.bonus) {
                         const bonus = c.effect.amount || 1;
                         // @ts-ignore
                         newP.res[c.effect.bonus] += bonus;
                         // @ts-ignore
                         if (['wood','clay','reed','stone'].includes(c.effect.bonus)) newP.roundGains[c.effect.bonus] += bonus;
                         return updateCardStat(c, c.effect.bonus, bonus);
                    }
                    if (c.id === 'o_jijiegong' && act.id === 'act_labor') {
                        newP.res.grain += 1;
                        addLog(`${p.name} got +1 Grain (Seasonal Worker)`, p.color);
                        return updateCardStat(c, 'grain', 1);
                    }
                    // STONE TONGS (minor_jiashiqian)
                    if (c.id === 'minor_jiashiqian' && act.res === 'stone' && act.acc) {
                        newP.res.stone += 1;
                        newP.roundGains.stone += 1;
                        addLog(`${p.name} +1 Stone (Stone Tongs)`, p.color);
                    }
                    return c;
                });
                
                if (act.id === 'act_travel' && newP.playedCards.some(c => c.id === 'o_moshushi')) {
                    newP.res.wood += 1; newP.roundGains.wood += 1;
                    newP.res.grain += 1;
                    newP.playedCards = newP.playedCards.map(c => c.id === 'o_moshushi' ? updateCardStat(updateCardStat(c, 'wood', 1), 'grain', 1) : c);
                    addLog(`${p.name} got +1 Wood/Grain (Magician)`, p.color);
                }

                if (act.id === 'act_fish' && newP.playedCards.some(c => c.id === 'minor_dumuzhou')) {
                    newP.res.food += 1;
                    newP.res.reed += 1; newP.roundGains.reed += 1;
                    newP.playedCards = newP.playedCards.map(c => c.id === 'minor_dumuzhou' ? updateCardStat(updateCardStat(c, 'food', 1), 'reed', 1) : c);
                    addLog(`${p.name} got +1 Food/Reed (Canoe)`, p.color);
                }

                if (act.id === 'act_grain' && newP.playedCards.some(c => c.id === 'minor_guwuchan')) {
                    newP.res.grain += 1;
                    newP.playedCards = newP.playedCards.map(c => c.id === 'minor_guwuchan' ? updateCardStat(c, 'grain', 1) : c);
                    addLog(`${p.name} got +1 Grain (Grain Shovel)`, p.color);
                }

                // BAMBOO BASKET (minor_zhukuang) - Wood Action -> Choice
                if (act.res === 'wood' && act.acc && newP.playedCards.some(c => c.id === 'minor_zhukuang')) {
                    newP.tempMode = { mode: 'choice_zhukuang', actId: act.id };
                    shouldPauseForConfirmation = true;
                }

                if (p.type === 'human' && act.res === 'wood' && act.acc && newP.playedCards.some(c => c.id === 'o_caiguren') && newP.res.wood >= 1) {
                     newP.tempMode = { mode: 'choice_caiguren', actId: act.id };
                     shouldPauseForConfirmation = true;
                } 
                else if (p.type === 'ai' && act.res === 'wood' && act.acc && newP.res.wood >= 1) {
                    const caiguren = newP.playedCards.find(c => c.id === 'o_caiguren');
                    if (caiguren) {
                        newP.res.wood -= 1;
                        newP.res.food += 2;
                        newP.playedCards = newP.playedCards.map(c => c.id === caiguren.id ? updateCardStat(c, 'food', 2) : c);
                        addLog(`${p.name} used Purchaser`, p.color);
                    }
                }
                
                if (['act_forest_3', 'act_reed1', 'act_clay_pit'].includes(act.id)) {
                     const geo = newP.playedCards.find(c => c.id === 'o_dizhixuejia');
                     if (geo) {
                         newP.res.clay += 1; newP.roundGains.clay += 1;
                         newP.playedCards = newP.playedCards.map(c => c.id === geo.id ? updateCardStat(c, 'clay', 1) : c);
                         addLog(`${p.name} found 1 Clay (Geologist)`, p.color);
                     }
                }

                if (['act_grain'].includes(act.id)) {
                    if (newP.playedCards.some(c => c.id === 'o_chaihuoshiqugong')) {
                        newP.firewoodCollectorTriggered = true;
                    }
                }

                if (act.id === 'act_labor') {
                    if (newP.playedCards.some(c => c.id === 'o_gengzhongbangshou')) {
                        newP.tempMode = { mode: 'choice_plow_helper', actId: act.id };
                        shouldPauseForConfirmation = true; 
                        addLog(`${p.name} can choose to plow a field (Plow Helper)`, p.color);
                    }
                    if (newP.playedCards.some(c => c.id === 'o_diannong') && p.type === 'human') {
                         newP.tempMode = { mode: 'choice_tenant', actId: act.id };
                         shouldPauseForConfirmation = true;
                    }
                }

                needsResetAccumulation = true;
            }
            if(mode === 'simple') addLog(`${p.name} took ${act.name}`, p.color);
        } else if (act.type === 'res_combo') {
            if (act.id === 'act_market') {
                newP.res.reed += 1; newP.roundGains.reed += 1;
                newP.res.stone += 1; newP.roundGains.stone += 1;
                newP.res.food += 1;
                if (p.type === 'human' && newP.playedCards.some(c => c.id === 'o_cangkukanshouyuan')) {
                    newP.tempMode = { mode: 'choice_keeper', actId: act.id };
                    shouldPauseForConfirmation = true;
                }
                else if (p.type === 'ai') {
                    const keeper = newP.playedCards.find(c => c.id === 'o_cangkukanshouyuan');
                    if (keeper) {
                        newP.res.clay += 1; newP.roundGains.clay += 1;
                        newP.playedCards = newP.playedCards.map(c => c.id === keeper.id ? updateCardStat(c, 'clay', 1) : c);
                        addLog(`${p.name} got +1 Clay (Storehouse Keeper)`, p.color);
                    }
                }
                addLog(`${p.name} took Resource Market`, p.color);
            }
        } 
        // act_labor check removed from here, moved into type==='res' block

        // SLIDE PLOW (minor_huashili)
        if ((act.id === 'act_plow' || act.mode === 'plow_sow') && p.type === 'human') {
            const plow = newP.playedCards.find(c => c.id === 'minor_huashili');
            if (plow && (plow.statTracker?.fields || 0) > 0) {
                newP.tempMode = { mode: 'choice_huashili', actId: act.id };
                shouldPauseForConfirmation = true;
            }
        }

        if ((act.id === 'act_plow' || act.mode === 'plow_sow') && newP.playedCards.some(c => c.id === 'minor_daguban')) {
             if (newP.tempMode) {
                 newP.tempMode = { ...newP.tempMode, bakeEnabled: true };
             }
        }

        newP.res.workers--;
        const newOccupied = { ...stateRef.current.gameState.occupied, [act.id]: p.id };
        updateGameState(prev => ({ ...prev, occupied: newOccupied }));
        updatePlayer(p.id, () => newP);

        if (needsResetAccumulation) {
            resetActionAccumulation(act.id);
            // Caiguren restoration (AI)
            if (p.type === 'ai' && act.res === 'wood' && act.acc) {
                 if (p.playedCards.some(c => c.id === 'o_caiguren') && p.res.wood >= 1) {
                      updateGameState(prev => ({
                           ...prev,
                           baseActions: prev.baseActions.map(a => a.id === act.id ? { ...a, cur: 1 } : a),
                           roundCards: prev.roundCards.map(a => a.id === act.id ? { ...a, cur: 1 } : a)
                      }));
                 }
            }
        }

        if (p.type === 'human') {
            if (animalsGained && !shouldPauseForConfirmation) {
                 const alloc = calculateAllocation(newP);
                 if (alloc.overflow > 0) {
                     startOverflow(p.id);
                     return; 
                 }
            }

            if (!shouldPauseForConfirmation && mode === 'simple') {
                updatePlayer(p.id, pp => ({ ...pp, tempMode: { mode: 'turn_confirmation', actId: act.id } }));
            }
        } else {
             if (animalsGained) {
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
        }
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
        return () => clearGameTimer();
    }, [clearGameTimer]);

    const startGame = (mode: 'single' | 'multi') => {
        clearGameTimer();
        const deck = setupDeck();
        const sp = Math.floor(Math.random() * 4);
        
        const newPlayers = createInitialPlayers(mode).map(p => ({
            ...p,
            res: {
                ...p.res,
                food: p.id === sp ? 2 : 3
            }
        }));
        
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
        setGamePhase('playing');
        
        const modeText = mode === 'multi' ? "4 Players (Hotseat)" : "1 Player vs 3 AI";
        setLogs([{ id: Date.now(), msg: `🎮 Game Started! Mode: ${modeText}`, color: "white" }]);
        addLog(`Start Player: ${newPlayers[sp].name}`, newPlayers[sp].color);
        playSound('fanfare');
        
        roundLock.current = 0;
        loggedRoundRef.current = 1;

        scheduleNext(() => nextTurn(), 500);
    };

    const resetGame = useCallback(() => {
        clearGameTimer();
        roundLock.current = 0;
        loggedRoundRef.current = 1;
        
        const initialPs = createInitialPlayers('single');
        setPlayers(initialPs);
        stateRef.current.players = initialPs;

        const initialGS: GameState = {
            round: 1,
            startPlayer: 0,
            nextStartPlayer: 0,
            turnIdx: 0,
            occupied: {},
            baseActions: JSON.parse(JSON.stringify(BASE_ACTIONS)),
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
        };
        setGameState(initialGS);
        stateRef.current.gameState = initialGS;
        
        setLogs([]);
        setGamePhase('setup');
        setViewingCardState(null);
        setIsAdjustingAnimals(false);
        setIsViewingHand(false);
        playSound('click');
    }, [clearGameTimer, playSound]);

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
        if (gs.turnPhase === 'overflow') return; 

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
            let newRes = { ...p.res, workers: p.res.maxWorkers };
            let newPlayed = [...p.playedCards];

            if (p.firewoodCollectorTriggered) {
                 const card = newPlayed.find(c => c.id === 'o_chaihuoshiqugong');
                 if (card) {
                     newRes.wood += 1;
                     newPlayed = newPlayed.map(c => c.id === card.id ? updateCardStat(c, 'wood', 1) : c);
                     addLog(`${p.name} collected 1 Wood (Firewood Collector)`, p.color);
                 }
            }

            // CLAY PIPE (minor_taotuyandou)
            const pipe = p.playedCards.find(c => c.id === 'minor_taotuyandou');
            if (pipe) {
                const totalBuiltRes = p.roundGains.wood + p.roundGains.clay + p.roundGains.reed + p.roundGains.stone;
                if (totalBuiltRes >= 7) {
                    newRes.food += 2;
                    addLog(`${p.name} +2 Food (Clay Pipe)`, p.color);
                }
            }

            return {
                ...p,
                res: newRes,
                playedCards: newPlayed,
                firewoodCollectorTriggered: false,
                roundGains: { wood: 0, clay: 0, reed: 0, stone: 0 } 
            };
        });
        stateRef.current.players = newPlayers;
        setPlayers(newPlayers);

        const newBaseActions = gs.baseActions.map(act => {
             if (act.acc) return { ...act, cur: (act.cur || 0) + act.acc };
             return act;
        });
        
        const newRoundCards = gs.roundCards.map(act => {
            if (act.acc) return { ...act, cur: (act.cur || 0) + act.acc };
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
                setGamePhase('gameover');
            } else {
                advanceRound();
            }
        }
    };

    const advanceRound = () => {
        const { gameState: gs } = stateRef.current;
        if (gs.round >= MAX_ROUNDS) {
            updateGameState(prev => ({ ...prev, gameOver: true }));
            setGamePhase('gameover');
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
        const newPs = stateRef.current.players.map(p => ({
            ...p,
            newborns: { sheep: 0, boar: 0, cow: 0 },
            newbornCount: 0, 
            workshopsUsed: { reed: false, wood: false, clay: false }
        }));
        stateRef.current.players = newPs;
        setPlayers(newPs);

        const wellBeneficiaries = gs.wellRewards[nextRound] || [];
        wellBeneficiaries.forEach(pId => {
            updatePlayer(pId, p => ({...p, res: {...p.res, food: p.res.food + 1}}));
            addLog(`${stateRef.current.players[pId].name} got 1 food from Well`, '#29b6f6');
            if(stateRef.current.players[pId].type === 'human') playSound('food');
        });

        // Future Resources (e.g. from Large Greenhouse)
        const futureRes = gs.futureResources[nextRound];
        if (futureRes && futureRes.length > 0) {
             futureRes.forEach(item => {
                  stateRef.current.players.forEach(p => {
                       // Greenhouse
                       if (p.playedCards.some(c => c.id === 'minor_daxingwenshi') && item === 'veg') {
                            updatePlayer(p.id, pp => ({ ...pp, res: { ...pp.res, veg: pp.res.veg + 1 } }));
                            addLog(`${p.name} harvested 1 Vegetable (Greenhouse)`, p.color);
                       }
                       // HANDCART (minor_shoutuili)
                       if (p.playedCards.some(c => c.id === 'minor_shoutuili') && item === 'field') {
                           updatePlayer(p.id, pp => {
                               const freeIdx = pp.farm.indexOf(0);
                               if (freeIdx !== -1) {
                                   const newFarm = [...pp.farm];
                                   newFarm[freeIdx] = 2;
                                   addLog(`${p.name} plowed 1 field (Handcart)`, p.color);
                                   return { ...pp, farm: newFarm };
                               }
                               return pp;
                           });
                       }
                       // POND HUT (minor_tangbianxiaowu)
                       if (p.playedCards.some(c => c.id === 'minor_tangbianxiaowu') && item === 'food') {
                           updatePlayer(p.id, pp => ({ ...pp, res: { ...pp.res, food: pp.res.food + 1 } }));
                           addLog(`${p.name} +1 Food (Pond Hut)`, p.color);
                       }
                  });
             });
        }

        // Groom (o_mafu) active check skipped for simplicity or could be added here
        // Private Forest / Round Start Effects
        stateRef.current.players.forEach(p => {
             const played = p.playedCards;
             let playedUpdated = false;
             const updatedPlayedCards = played.map(c => {
                 if (c.effect?.type === 'round_start') {
                     if (c.effect.bonus) {
                         const amt = c.effect.amount || 1;
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
        if (newFutureRes[nextRound]) delete newFutureRes[nextRound];

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

    // AI Logic (truncated for brevity, see original if updates needed)
    const aiPlay = (p: Player) => {
        try {
            const { gameState: gs } = stateRef.current;
            const act = getAIAction(gs, p);
            if (act) clickAction(act.id); // Re-use clickAction which now has executeActionLogic
            else {
                addLog(`${p.name} passed`, p.color);
                updatePlayer(p.id, pp => ({...pp, res: {...pp.res, workers: 0}}));
                updateGameState(prev => ({...prev, turnIdx: prev.turnIdx + 1}));
                scheduleNext(() => nextTurn(), 500);
            }
        } catch (e) {
            console.error("AI Crash Recovery", e);
            updatePlayer(p.id, pp => ({...pp, res: {...pp.res, workers: 0}}));
            updateGameState(prev => ({...prev, turnIdx: prev.turnIdx + 1}));
            scheduleNext(() => nextTurn(), 500);
        }
    };

    const resetActionAccumulation = (actId: string) => {
        updateGameState(prev => ({
            ...prev,
            baseActions: prev.baseActions.map(a => a.id === actId && a.acc ? { ...a, cur: 0 } : a),
            roundCards: prev.roundCards.map(a => a.id === actId && a.acc ? { ...a, cur: 0 } : a)
        }));
    };

    // --- Overflow / Undo ---
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

    const resetOverflowManagement = () => {
        const { overflowPlayer, overflowSnapshot } = stateRef.current.gameState;
        if (overflowPlayer === null || !overflowSnapshot) return;
        const oldP = JSON.parse(overflowSnapshot);
        oldP.fences = new Set(oldP.fences);
        updatePlayer(overflowPlayer, () => oldP);
        addLog("⏪ Reset overflow management", "white");
        playSound('click');
    };

    const fullUndoAction = () => {
        const { pendingAction, overflowPlayer } = stateRef.current.gameState;
        const pIdx = overflowPlayer !== null ? overflowPlayer : pendingAction?.pIdx;
        
        if (pIdx === undefined || pIdx === null || !pendingAction) return;

        const oldP = JSON.parse(pendingAction.snapshot);
        oldP.fences = new Set(oldP.fences);
        
        updatePlayer(pIdx, () => oldP);

        const actId = pendingAction.flags?.actId;
        const restoreCur = pendingAction.flags?.restoreCur;

        updateGameState(prev => {
            const newOccupied = { ...prev.occupied };
            if (actId) delete newOccupied[actId];
            const newBase = prev.baseActions.map(a => a.id === actId && restoreCur !== undefined ? { ...a, cur: restoreCur } : a);
            const newRound = prev.roundCards.map(a => a.id === actId && restoreCur !== undefined ? { ...a, cur: restoreCur } : a);
            return {
                ...prev,
                occupied: newOccupied,
                baseActions: newBase,
                roundCards: newRound,
                turnPhase: 'action',
                overflowPlayer: null,
                overflowSnapshot: null,
                pendingAction: null
            };
        });
        
        addLog("↺ Undo Action", "white");
        playSound('click');
    };
    
    // ... (Discard/Cook Logic - unchanged) ...
    const discardAnimal = (type: 'sheep'|'boar'|'cow') => {
        const { overflowPlayer } = stateRef.current.gameState;
        if (overflowPlayer === null) return;
        updatePlayer(overflowPlayer, p => {
             const newP = { ...p, animals: { ...p.animals }, newborns: { ...p.newborns } };
             if (newP.animals[type] > 0) {
                 newP.animals[type]--;
                 if (newP.animals[type] < newP.newborns[type]) newP.newborns[type] = newP.animals[type];
             }
             return newP;
        });
        playSound('click');
    };
    const cookOverflow = (type: 'sheep'|'boar'|'cow') => {
        const { overflowPlayer } = stateRef.current.gameState;
        if (overflowPlayer === null) return;
        const p = stateRef.current.players[overflowPlayer];
        let bestRate = 0; let bestCooker: Card | null = null;
        [...p.majors, ...p.playedCards].forEach(m => {
            if (m.cook && m.cook[type]) {
                if (m.cook[type] > bestRate) { bestRate = m.cook[type]; bestCooker = m; }
            }
        });
        if (bestRate === 0) { addLog("No cooking appliance!", "red"); playSound('error'); return; }
        const availableToCook = p.animals[type] - p.newborns[type];
        if (availableToCook <= 0) { addLog("Cannot cook newborn animals!", "red"); playSound('error'); return; }
        updatePlayer(overflowPlayer, pp => {
             const newP = { ...pp, animals: { ...pp.animals }, res: { ...pp.res } };
             newP.animals[type]--;
             newP.res.food += bestRate;
             // Update stat not strictly required for overflow cook logic display, but good for tracking
             return newP;
        });
        addLog(`${p.name} cooked overflow ${type}`, p.color);
        playSound('cook');
    };
    
    const cookFromManager = (type: 'sheep'|'boar'|'cow', assignments: { [key: number]: ResourceType[] }) => {
        const pId = stateRef.current.gameState.startPlayer; // Context-aware in real app, simplified for Lite
        // Actually AnimalManager passes this up to App, which calls this hook.
        // We need to know WHICH player. In lite, usually active player.
        const { turnPhase, overflowPlayer, startPlayer, turnIdx } = stateRef.current.gameState;
        let pIdx = (startPlayer + turnIdx) % 4;
        if (turnPhase === 'overflow' && overflowPlayer !== null) pIdx = overflowPlayer;
        
        const p = stateRef.current.players[pIdx];
        
        let bestRate = 0;
        [...p.majors, ...p.playedCards].forEach(m => {
            if (m.cook && m.cook[type] > bestRate) bestRate = m.cook[type];
        });
        
        if (bestRate === 0) { playSound('error'); return; }
        if (p.animals[type] - p.newborns[type] <= 0) { playSound('error'); return; }

        updatePlayer(pIdx, pp => {
            const newAnimals = {...pp.animals};
            newAnimals[type]--;
            return {
                ...pp,
                animals: newAnimals,
                res: { ...pp.res, food: pp.res.food + bestRate },
                assignedAnimals: assignments // Save state implicitly to avoid desync
            };
        });
        playSound('cook');
    };

    const discardFromManager = (type: 'sheep'|'boar'|'cow', isNewborn: boolean, assignments: { [key: number]: ResourceType[] }) => {
        const { turnPhase, overflowPlayer, startPlayer, turnIdx } = stateRef.current.gameState;
        let pIdx = (startPlayer + turnIdx) % 4;
        if (turnPhase === 'overflow' && overflowPlayer !== null) pIdx = overflowPlayer;

        updatePlayer(pIdx, pp => {
            const newAnimals = {...pp.animals};
            const newNewborns = {...pp.newborns};
            
            if (newAnimals[type] > 0) {
                newAnimals[type]--;
                if (isNewborn) newNewborns[type] = Math.max(0, newNewborns[type] - 1);
                else {
                    // Try to reduce adult count, but ensure newborns <= total
                    if (newAnimals[type] < newNewborns[type]) newNewborns[type] = newAnimals[type];
                }
            }
            return { ...pp, animals: newAnimals, newborns: newNewborns, assignedAnimals: assignments };
        });
        playSound('click');
    };

    const confirmOverflowEndTurn = () => {
        const { overflowPlayer, harvestPhase } = stateRef.current.gameState;
        if (overflowPlayer === null) return;
        const p = stateRef.current.players[overflowPlayer];
        const alloc = calculateAllocation(p);
        if (alloc.overflow > 0) { addLog("Must discard excess animals!", "red"); playSound('error'); return; }
        
        updateGameState(prev => ({ ...prev, turnPhase: 'action', overflowPlayer: null, overflowSnapshot: null, pendingAction: null }));
        playSound('click');
        if (harvestPhase) scheduleNext(() => advanceBreedStep(), 500);
        else {
            updateGameState(prev => ({ ...prev, turnIdx: prev.turnIdx + 1 }));
            scheduleNext(() => nextTurn(), 500);
        }
    };

    // ================= HARVEST =================
    const performHarvest = () => {
        addLog(`🌾 --- HARVEST BEGINS ---`, '#ff9800');
        updateGameState(prev => ({ ...prev, harvestPhase: true, harvestSubPhase: 'field' }));
        playSound('harvest');
        
        stateRef.current.players.forEach(p => {
             updatePlayer(p.id, pp => {
                 let newPlayed = [...pp.playedCards];
                 let bonusGained = false;
                 
                 // Grain Seller (o_gemaigong) Logic: +1 grain per field
                 const grainSeller = pp.playedCards.find(c => c.id === 'o_gemaigong');
                 if (grainSeller) {
                     let extraGrain = 0;
                     for(let i=0; i<15; i++) {
                         if (pp.farm[i]===2 && pp.farmContent[i] === 'grain' && pp.farmCounts[i] > 0) {
                             extraGrain++;
                         }
                     }
                     if (extraGrain > 0) {
                         pp.res.grain += extraGrain;
                         bonusGained = true;
                         addLog(`${pp.name} got ${extraGrain} extra Grain (Grain Seller)`, pp.color);
                         newPlayed = newPlayed.map(c => c.id === 'o_gemaigong' ? updateCardStat(c, 'grain', extraGrain) : c);
                     }
                 }

                 newPlayed = newPlayed.map(c => {
                     if (c.effect?.type === 'harvest' && c.effect.bonus) {
                             const amt = c.effect.amount || 1;
                             // @ts-ignore
                             pp.res[c.effect.bonus!] += amt;
                             bonusGained = true;
                             addLog(`${pp.name} got ${amt} ${c.effect.bonus} from ${c.name}`, pp.color);
                             return updateCardStat(c, c.effect.bonus, amt);
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
            if (harvested > 0) addLog(`${p.name} harvested crops`, p.color);
            return newP;
        });
        stateRef.current.players = ps;
        setPlayers(ps);
        updateGameState(prev => ({...prev, harvestSubPhase: 'feed', harvestState: {queue: Array.from({ length: 4 }, (_, i) => (prev.startPlayer + i) % 4), currentIdx: 0}}));
        scheduleNext(() => processFeedPhase(), 1000);
    };
    
    // ... Feed Phase, Breed Phase (unchanged) ...
    const processFeedPhase = () => {
        if (!stateRef.current.gameState.harvestState) return;
        const pIdx = stateRef.current.gameState.harvestState.queue[stateRef.current.gameState.harvestState.currentIdx];
        const p = stateRef.current.players[pIdx];
        if (p.type === 'human') {
             const snapshotObj = { ...p, fences: Array.from(p.fences) };
             updateGameState(prev => ({ ...prev, feedSnapshot: JSON.stringify(snapshotObj) }));
        } else {
            // AI Feed
            const need = (p.res.maxWorkers - p.newbornCount) * 2 + p.newbornCount * 1;
            const pay = Math.min(p.res.food, need);
            const begging = Math.max(0, need - pay);
            updatePlayer(p.id, pp => ({ ...pp, res: { ...pp.res, food: pp.res.food - pay }, begging: pp.begging + begging }));
            if (begging > 0) addLog(`${p.name} took ${begging} begging cards`, 'red');
            else addLog(`${p.name} fed family`, p.color);
            scheduleNext(() => advanceFeedStep(), 500);
        }
    };

    const confirmFeedPhase = () => {
         if (!stateRef.current.gameState.harvestState) return;
         const pIdx = stateRef.current.gameState.harvestState.queue[stateRef.current.gameState.harvestState.currentIdx];
         const p = stateRef.current.players[pIdx];
         const need = (p.res.maxWorkers - p.newbornCount) * 2 + p.newbornCount * 1;
         const pay = Math.min(p.res.food, need);
         const begging = Math.max(0, need - pay);
         updatePlayer(pIdx, pp => ({ ...pp, res: { ...pp.res, food: pp.res.food - pay }, begging: pp.begging + begging }));
         updateGameState(prev => ({ ...prev, feedSnapshot: null }));
         if (begging > 0) { addLog(`${p.name} took ${begging} begging cards`, 'red'); playSound('error'); } 
         else { addLog(`${p.name} fed family`, 'green'); playSound('food'); }
         scheduleNext(() => advanceFeedStep(), 200);
    };

    const resetFeed = () => {
        const { harvestState, feedSnapshot } = stateRef.current.gameState;
        if (!harvestState || !feedSnapshot) return;
        const pIdx = harvestState.queue[harvestState.currentIdx];
        const oldP = JSON.parse(feedSnapshot);
        oldP.fences = new Set(oldP.fences);
        updatePlayer(pIdx, () => oldP);
        addLog("Feed phase actions reset", "white");
    };

    const advanceFeedStep = () => {
        if (!stateRef.current.gameState.harvestState) return; 
        if (stateRef.current.gameState.harvestState.currentIdx + 1 >= stateRef.current.gameState.harvestState.queue.length) {
             updateGameState(prev => ({...prev, harvestSubPhase: 'breed', harvestState: {queue: Array.from({ length: 4 }, (_, i) => (prev.startPlayer + i) % 4), currentIdx: 0}}));
             scheduleNext(() => processBreedPhase(), 500);
        } else {
             updateGameState(prev => ({...prev, harvestState: { ...prev.harvestState!, currentIdx: prev.harvestState!.currentIdx + 1 }}));
             processFeedPhase();
        }
    };

    const processBreedPhase = () => {
         if (!stateRef.current.gameState.harvestState) return;
         const { harvestState } = stateRef.current.gameState;
         
         const pIdx = harvestState.queue[harvestState.currentIdx];
         const p = stateRef.current.players[pIdx];
         
         const breed = { sheep: 0, boar: 0, cow: 0 };
         if (p.animals.sheep >= 2) breed.sheep = 1;
         if (p.animals.boar >= 2) breed.boar = 1;
         if (p.animals.cow >= 2) breed.cow = 1;
         
         if (breed.sheep > 0 || breed.boar > 0 || breed.cow > 0) {
             updatePlayer(pIdx, pp => ({
                 ...pp,
                 animals: { 
                     sheep: pp.animals.sheep + breed.sheep,
                     boar: pp.animals.boar + breed.boar,
                     cow: pp.animals.cow + breed.cow
                 },
                 // Temporarily mark pending breeding for management if human
                 pendingBreeding: p.type === 'human' ? breed : null
             }));
             
             if (p.type === 'human') {
                 // Check if they fit. If not, trigger overflow.
                 // Need to recalculate allocation with new animals.
                 // We do this by updating player above, then checking overflow.
                 const tempP = { ...p, animals: { 
                     sheep: p.animals.sheep + breed.sheep,
                     boar: p.animals.boar + breed.boar,
                     cow: p.animals.cow + breed.cow
                 }};
                 const alloc = calculateAllocation(tempP);
                 if (alloc.overflow > 0) {
                     startOverflow(pIdx);
                     return; // Wait for overflow resolution
                 } else {
                     addLog(`${p.name} bred animals`, p.color);
                     playSound('baby');
                 }
             } else {
                 // AI - auto discard overflow if needed
                 const tempP = { ...p, animals: { 
                     sheep: p.animals.sheep + breed.sheep,
                     boar: p.animals.boar + breed.boar,
                     cow: p.animals.cow + breed.cow
                 }};
                 const alloc = calculateAllocation(tempP);
                 if (alloc.overflow > 0) {
                     const discarded = aiDiscardOverflow(tempP, alloc.overflow);
                     // Apply discard logic
                     updatePlayer(pIdx, pp => ({
                         ...pp,
                         animals: {
                             sheep: tempP.animals.sheep - discarded.sheep,
                             boar: tempP.animals.boar - discarded.boar,
                             cow: tempP.animals.cow - discarded.cow
                         }
                     }));
                 }
                 addLog(`${p.name} bred animals`, p.color);
             }
         }

         scheduleNext(() => advanceBreedStep(), 500);
    };

    const advanceBreedStep = () => {
        if (!stateRef.current.gameState.harvestState) return; 
        
        if (stateRef.current.gameState.harvestState.currentIdx + 1 >= stateRef.current.gameState.harvestState.queue.length) {
             // End Harvest
             updateGameState(prev => ({ ...prev, harvestPhase: false, harvestSubPhase: null, harvestState: null }));
             addLog("Harvest Complete", "green");
             playSound('success');
             if (stateRef.current.gameState.round >= MAX_ROUNDS) {
                 updateGameState(prev => ({ ...prev, gameOver: true }));
                 setGamePhase('gameover');
             } else {
                 advanceRound();
             }
        } else {
             updateGameState(prev => ({...prev, harvestState: { ...prev.harvestState!, currentIdx: prev.harvestState!.currentIdx + 1 }}));
             processBreedPhase();
        }
    };

    const cancelMode = () => fullUndoAction();

    const resolveCardChoice = (choice: string) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        const p = stateRef.current.players[pIdx];
        if (!p.tempMode) return;

        let finalP = { ...p };
        let actId = p.tempMode.actId;
        
        // Existing choices
        if (p.tempMode.mode === 'choice_caiguren') {
             if (choice === 'yes') {
                const caiguren = finalP.playedCards.find(c => c.id === 'o_caiguren');
                finalP.res.wood -= 1; finalP.res.food += 2;
                updateGameState(prev => ({ ...prev, baseActions: prev.baseActions.map(a => a.id === actId ? { ...a, cur: 1 } : a), roundCards: prev.roundCards.map(a => a.id === actId ? { ...a, cur: 1 } : a) }));
             }
        }
        else if (p.tempMode.mode === 'choice_animal_dealer') {
             if (choice === 'yes') {
                 finalP.res.food -= 1;
                 const act = stateRef.current.gameState.baseActions.find(a => a.id === actId) || stateRef.current.gameState.roundCards.find(a => a.id === actId);
                 if (act && act.res) { 
                     // @ts-ignore
                     finalP.animals[act.res] += 1; 
                 }
             }
        }
        else if (p.tempMode.mode === 'choice_keeper') {
             if (choice === 'clay') finalP.res.clay += 1;
             else if (choice === 'grain') finalP.res.grain += 1;
        }
        else if (p.tempMode.mode === 'choice_tenant') {
             if (choice === 'build') {
                updatePlayer(pIdx, () => ({ ...finalP, tempMode: { mode: 'tenant_build_room', actId: actId } }));
                return; 
             } else if (choice === 'renovate') {
                 updatePlayer(pIdx, () => ({ ...finalP, tempMode: { mode: 'tenant_renovate', actId: actId } }));
                 return;
             }
        }
        else if (p.tempMode.mode === 'choice_plow_helper') {
             if (choice === 'yes') { 
                 // Explicitly set actionLimit to 1 for this specific plow action
                 updatePlayer(pIdx, () => ({ ...finalP, tempMode: { mode: 'plow', actId: actId, actionLimit: 1 } })); 
                 return; 
             }
        }
        
        // NEW CHOICES
        else if (p.tempMode.mode === 'choice_huashili') {
            if (choice === 'yes') {
                const plowCard = finalP.playedCards.find(c => c.id === 'minor_huashili');
                if (plowCard && (plowCard.statTracker?.fields || 0) > 0) {
                    finalP.playedCards = finalP.playedCards.map(c => c.id === 'minor_huashili' ? updateCardStat(c, 'fields', -1) : c);
                    // Trigger Plow Mode (already in Plow action, so just need to enable 2nd plow?)
                    // Current action is plow. It allows 1 field. We want +1.
                    // Simplest way: directly add a field if possible
                    const freeIdx = finalP.farm.indexOf(0);
                    if (freeIdx !== -1) {
                        const newFarm = [...finalP.farm];
                        newFarm[freeIdx] = 2;
                        finalP.farm = newFarm;
                        addLog(`${p.name} plowed extra field (Slide Plow)`, p.color);
                    } else {
                        addLog("No space to plow extra field", "red");
                    }
                }
            }
        }
        else if (p.tempMode.mode === 'choice_zhukuang') {
            if (choice === 'yes') {
                // "Convert 2 Wood -> 3 Food. Return Wood to slot"
                if (finalP.res.wood >= 2) {
                    finalP.res.wood -= 2;
                    finalP.res.food += 3;
                    // Return to slot
                    updateGameState(prev => ({
                        ...prev,
                        baseActions: prev.baseActions.map(a => a.id === actId ? { ...a, cur: (a.cur||0) + 2 } : a),
                        roundCards: prev.roundCards.map(a => a.id === actId ? { ...a, cur: (a.cur||0) + 2 } : a)
                    }));
                    addLog(`${p.name} converted 2 Wood to 3 Food (Bamboo Basket)`, p.color);
                }
            }
        }

        const alloc = calculateAllocation(finalP);
        if (alloc.overflow > 0) { updatePlayer(pIdx, () => ({ ...finalP, tempMode: null })); startOverflow(pIdx); return; }

        updatePlayer(pIdx, () => ({ ...finalP, tempMode: { mode: 'turn_confirmation', actId } }));
    };

    const confirmModeAction = (pId: number) => {
         const p = stateRef.current.players[pId];
         if (!p.tempMode) return;
         
         if (p.tempMode.mode === 'turn_confirmation') {
             updateGameState(prev => ({ ...prev, pendingAction: null, turnIdx: prev.turnIdx + 1 }));
             updatePlayer(pId, () => ({ ...p, tempMode: null }));
             scheduleNext(() => nextTurn(), 500);
             return;
         }

         const pending = stateRef.current.gameState.pendingAction;
         let isValid = true;
         let errMsg = "";
         let finalP = { ...p };
         
         if (p.tempMode.mode === 'plow' || (p.tempMode.mode === 'plow_sow' && p.tempMode.subAction === 'plow')) {
             if (pending && pending.snapshot) {
                 const snapP = JSON.parse(pending.snapshot);
                 const oldFields = snapP.farm.filter((t:number) => t === 2).length;
                 const newFields = finalP.farm.filter(t => t === 2).length;
                 if (newFields <= oldFields) { errMsg = "You must plow at least one field"; isValid = false; }
             }
         }

         if (p.tempMode.mode === 'play_occupation' || p.tempMode.mode === 'play_minor_optional') {
             const cardId = p.tempMode.selectedCardId;
             if (p.tempMode.mode === 'play_minor_optional' && cardId === null) {
                 updateGameState(prev => ({ ...prev, nextStartPlayer: pId })); 
                 const newOccupied = { ...stateRef.current.gameState.occupied, [p.tempMode.actId]: pId };
                 updateGameState(prev => ({ ...prev, occupied: newOccupied }));
                 updatePlayer(pId, () => ({ ...finalP, tempMode: { mode: 'turn_confirmation', actId: p.tempMode!.actId } }));
                 return;
             }

             if (!cardId) { addLog("Select card or pass", "red"); return; }
             let card = p.hand.find(c => c.id === cardId);
             
             if (card) {
                let foodCost = 0;
                let resCost = { ...card.cost };

                if (p.tempMode.mode === 'play_occupation') {
                    if (p.tempMode.actId === 'act_occupation1') foodCost = 1;
                    else if (p.tempMode.actId === 'act_occupation2') {
                        const occCount = finalP.playedCards.filter(c => c.type === 'occupation').length;
                        foodCost = occCount < 2 ? 1 : 2;
                    } else { foodCost = card.cost.food || 0; }
                    resCost = { food: foodCost }; 
                }

                // Check affordability
                // SAWMILL (minor_jumuchang) Effect: -1 Wood cost for Majors
                if (card.type === 'major' && finalP.playedCards.some(c => c.id === 'minor_jumuchang')) {
                    if (resCost.wood && resCost.wood > 0) resCost.wood -= 1;
                }

                let canAfford = true;
                if (finalP.res.food < (resCost.food || 0)) canAfford = false;
                if (finalP.res.wood < (resCost.wood || 0)) canAfford = false;
                if (finalP.res.clay < (resCost.clay || 0)) canAfford = false;
                if (finalP.res.reed < (resCost.reed || 0)) canAfford = false;
                if (finalP.res.stone < (resCost.stone || 0)) canAfford = false;
                if (finalP.res.grain < (resCost.grain || 0)) canAfford = false; // For Stall
                if (finalP.animals.sheep < (resCost.sheep || 0)) canAfford = false; // For Cattle Market

                if (!canAfford) { addLog("Not enough resources", "red"); playSound('error'); return; }

                // VALIDATE NEW CONDITIONS
                if (card.condition) {
                    const playedOccs = finalP.playedCards.filter(c => c.type === 'occupation').length;
                    if (card.condition.minOccupations && playedOccs < card.condition.minOccupations) { addLog(`Need >= ${card.condition.minOccupations} occs`, "red"); return; }
                    if (card.condition.maxOccupations !== undefined && playedOccs > card.condition.maxOccupations) { addLog(`Need <= ${card.condition.maxOccupations} occs`, "red"); return; }
                    if (card.condition.exactOccupations !== undefined && playedOccs !== card.condition.exactOccupations) { addLog(`Need exactly ${card.condition.exactOccupations} occs`, "red"); return; }
                    
                    if (card.condition.fullFarm && finalP.farm.filter(t => t === 0).length > 0) { addLog("Full farm required", "red"); return; }
                    
                    if (card.condition.minSheep && finalP.animals.sheep < card.condition.minSheep) { addLog(`Need >= ${card.condition.minSheep} Sheep`, "red"); return; }
                    
                    const grainFields = finalP.farm.filter((t, i) => t === 2 && finalP.farmContent[i] === 'grain').length;
                    if (card.condition.minGrainFields && grainFields < card.condition.minGrainFields) { addLog(`Need >= ${card.condition.minGrainFields} Grain Fields`, "red"); return; }
                }

                // Deduct
                finalP.res.food -= (resCost.food || 0);
                finalP.res.wood -= (resCost.wood || 0);
                finalP.res.clay -= (resCost.clay || 0);
                finalP.res.reed -= (resCost.reed || 0);
                finalP.res.stone -= (resCost.stone || 0);
                finalP.res.grain -= (resCost.grain || 0);
                finalP.animals.sheep -= (resCost.sheep || 0);

                finalP.hand = finalP.hand.filter(c => c.id !== cardId);
                
                // Utility Room (minor_zawufang) - +1 Food on card play
                if (finalP.playedCards.some(c => c.id === 'minor_zawufang') || card.id === 'minor_zawufang') {
                    finalP.res.food += 1;
                    addLog(`${p.name} +1 Food (Utility Room)`, p.color);
                }

                // SPECIAL CARD EFFECTS
                let isPassCard = false;

                // STALL (minor_huotan)
                if (card.id === 'minor_huotan') {
                    finalP.res.veg += 1;
                    addLog(`${p.name} +1 Veg (Stall)`, p.color);
                    isPassCard = true;
                }
                // TURNIP FIELD (minor_lunken) - Updated to be interactive
                else if (card.id === 'minor_lunken') {
                    const newOccupied = { ...stateRef.current.gameState.occupied, [p.tempMode.actId]: pId };
                    updateGameState(prev => ({ ...prev, occupied: newOccupied }));
                    
                    updatePlayer(pId, () => ({ 
                        ...finalP, 
                        tempMode: { 
                            mode: 'place_lunken_field', 
                            actId: p.tempMode.actId,
                            cardToPass: card
                        } 
                    }));
                    addLog(`${p.name} played Turnip Field - Select position`, p.color);
                    return; // Exit here to wait for user interaction
                }
                // MINI PASTURE (minor_miniquandi)
                else if (card.id === 'minor_miniquandi') {
                    const freeIdx = finalP.farm.indexOf(0);
                    if (freeIdx !== -1) {
                        finalP.fences.add(`${freeIdx}-t`);
                        finalP.fences.add(`${freeIdx}-b`);
                        finalP.fences.add(`${freeIdx}-l`);
                        finalP.fences.add(`${freeIdx}-r`);
                        addLog(`${p.name} fenced a mini pasture`, p.color);
                    }
                    isPassCard = true;
                }
                // CLAY PATH (minor_niantuluji)
                else if (card.id === 'minor_niantuluji') {
                    const bonus = Math.floor(finalP.res.clay / 2);
                    if (bonus > 0) {
                        finalP.res.clay += bonus;
                        addLog(`${p.name} +${bonus} Clay (Clay Path)`, p.color);
                    }
                    isPassCard = true;
                }
                // CATTLE MARKET (minor_youchushichang)
                else if (card.id === 'minor_youchushichang') {
                    finalP.animals.cow += 1;
                    addLog(`${p.name} +1 Cow (Cattle Market)`, p.color);
                    isPassCard = true;
                }
                // HANDCART (minor_shoutuili) - Future
                else if (card.id === 'minor_shoutuili') {
                    const r = stateRef.current.gameState.round + 5;
                    if (r <= MAX_ROUNDS) {
                        const future = { ...stateRef.current.gameState.futureResources };
                        if (!future[r]) future[r] = [];
                        future[r].push('field');
                        updateGameState(prev => ({ ...prev, futureResources: future }));
                        addLog(`${p.name} scheduled field for Round ${r}`, p.color);
                    }
                }
                // POND HUT (minor_tangbianxiaowu) - Future
                else if (card.id === 'minor_tangbianxiaowu') {
                    const currentRound = stateRef.current.gameState.round;
                    const future = { ...stateRef.current.gameState.futureResources };
                    [1, 2, 3].forEach(offset => {
                        const r = currentRound + offset;
                        if (r <= MAX_ROUNDS) {
                            if (!future[r]) future[r] = [];
                            future[r].push('food');
                        }
                    });
                    updateGameState(prev => ({ ...prev, futureResources: future }));
                    addLog(`${p.name} scheduled food for next 3 rounds`, p.color);
                }
                // SLIDE PLOW (minor_huashili) - Init Fields
                else if (card.id === 'minor_huashili') {
                    card = updateCardStat(card, 'fields', 2);
                }
                // ADVISOR (o_guwen)
                else if (card.id === 'o_guwen') {
                    const playerCount = stateRef.current.players.length;
                    if (playerCount === 1) {
                        finalP.res.grain += 2;
                        addLog(`${p.name} +2 Grain (Advisor)`, p.color);
                    } else if (playerCount === 2) {
                        finalP.res.clay += 3;
                        addLog(`${p.name} +3 Clay (Advisor)`, p.color);
                    } else if (playerCount === 3) {
                        finalP.res.reed += 2;
                        addLog(`${p.name} +2 Reed (Advisor)`, p.color);
                    } else {
                        finalP.animals.sheep += 2;
                        addLog(`${p.name} +2 Sheep (Advisor)`, p.color);
                    }
                }
                // GENERIC IMMEDIATE EFFECT
                else if (card.effect?.type === 'immediate' && card.effect.bonus && card.effect.amount) {
                    const amt = card.effect.amount;
                    if (['sheep','boar','cow'].includes(card.effect.bonus)) {
                        // @ts-ignore
                        finalP.animals[card.effect.bonus] += amt;
                    } else {
                        // @ts-ignore
                        finalP.res[card.effect.bonus] += amt;
                    }
                    addLog(`${p.name} +${amt} ${card.effect.bonus} (${card.name})`, p.color);
                }

                // Regular play or Pass
                if (isPassCard) {
                    passCardToNextPlayer(card, p.id);
                } else {
                    finalP.playedCards = [...finalP.playedCards, card];
                    addLog(`${p.name} played ${card.name}`, p.color);
                }
             }
             
             if (p.tempMode.actId === 'act_meeting') updateGameState(prev => ({ ...prev, nextStartPlayer: pId }));

             // Check overflow
             const alloc = calculateAllocation(finalP);
             if (alloc.overflow > 0) { updatePlayer(pId, () => ({ ...finalP, tempMode: null })); startOverflow(pId); return; }

             const newOccupied = { ...stateRef.current.gameState.occupied, [p.tempMode.actId]: pId };
             updateGameState(prev => ({ ...prev, occupied: newOccupied }));
             updatePlayer(pId, () => ({ ...finalP, tempMode: { mode: 'turn_confirmation', actId: p.tempMode!.actId } }));
             return;
         }

         if (isValid) {
              const snapP = JSON.parse(pending.snapshot);
              // Furrier Check ...
              const builtClayRoom = finalP.houseType === 'clay' && finalP.farm.filter(x => x === 1).length > snapP.farm.filter((x:any)=>x === 1).length;
              const renovatedToStone = finalP.houseType === 'stone' && snapP.houseType !== 'stone';
              if ((builtClayRoom || renovatedToStone) && finalP.playedCards.some(c => c.id === 'o_maopifanggong')) {
                   finalP.res.food += 3;
                   finalP.playedCards = finalP.playedCards.map(c => c.id === 'o_maopifanggong' ? updateCardStat(c, 'food', 3) : c);
              }

              const newOccupied = { ...stateRef.current.gameState.occupied, [p.tempMode.actId]: pId };
              updateGameState(prev => ({ ...prev, occupied: newOccupied }));
              updatePlayer(pId, () => ({ ...finalP, tempMode: { mode: 'turn_confirmation', actId: p.tempMode!.actId } }));
         } else {
             addLog(`⚠️ ${errMsg}`, 'red');
             playSound('error');
         }
    };

    function hasFenceChanged(oldP: any, newP: any) {
        return oldP.fences.length !== newP.fences.size;
    }

    const handleFenceClick = (pId: number, tileIdx: number, side: 't'|'b'|'l'|'r') => {
        const p = stateRef.current.players[pId];
        if (!p.tempMode || (p.tempMode.mode !== 'fence' && p.tempMode.mode !== 'reno_fence')) return;
        
        const key = `${tileIdx}-${side}`;
        if (p.fences.has(key)) return;
        if (p.fences.size >= LIMIT_FENCES) { addLog("Max fences reached", "red"); return; }
        
        const hasRammer = p.playedCards.some(c => c.id === 'minor_hangshiniantu');
        const costRes = hasRammer ? 'clay' : 'wood';
        
        // @ts-ignore
        if (p.res[costRes] < 1) { addLog(`Need 1 ${hasRammer ? 'Clay' : 'Wood'}`, "red"); return; }

        updatePlayer(pId, pp => {
            const newFences = new Set(pp.fences);
            newFences.add(key);
            
            // Check Shepherd's Staff immediately? No, wait for confirmation?
            // Actually, usually benefits apply on confirmation.
            // But immediate feedback is good.
            // Let's apply cost now.
            // @ts-ignore
            const newRes = { ...pp.res, [costRes]: pp.res[costRes] - 1 };
            
            // If Shepherd's Staff (minor_muyangzhang) - check if this fence completed a big pasture?
            // Hard to calc incrementally.
            // We'll leave it for now or implement if requested precisely.
            
            return { ...pp, fences: newFences, res: newRes };
        });
        playSound('fence');
    };

    // ... (renovate, handleFarmClick, etc. with minor updates for Carpenter) ...
    const handleFarmClick = (pId: number, tileIdx: number) => {
        const p = stateRef.current.players[pId];
        if (!p.tempMode) return;
        const { mode, subAction, currentTool, currentSeed } = p.tempMode;

        // ... (plow/sow logic) ...
        if (mode === 'plow' || (mode === 'plow_sow' && subAction === 'plow')) {
             const pending = stateRef.current.gameState.pendingAction;
             
             if (p.farm[tileIdx] === 0) {
                 if (pending && pending.snapshot) {
                     const snapP = JSON.parse(pending.snapshot);
                     const startFields = snapP.farm.filter((x: number) => x === 2).length;
                     const currentFields = p.farm.filter((x: number) => x === 2).length;
                     
                     // Default limit is 1 for standard actions, unless override provided
                     // This allows cards to specify higher limits if needed,
                     // but ensures Plow Helper (with actionLimit: 1) is restricted.
                     let limit = 1;
                     if (p.tempMode.actionLimit !== undefined) {
                         limit = p.tempMode.actionLimit;
                     }
                     
                     if ((currentFields - startFields) >= limit) {
                         addLog(`Limit: ${limit} field(s) per action`, "red");
                         playSound('error');
                         return;
                     }
                 }
                 
                 updatePlayer(pId, pp => {
                     const newFarm = [...pp.farm];
                     newFarm[tileIdx] = 2; // Field
                     return { ...pp, farm: newFarm };
                 });
                 playSound('plow');
             } else if (p.farm[tileIdx] === 2) {
                 // Allow undoing within the same action
                 if (pending && pending.snapshot) {
                     const snapP = JSON.parse(pending.snapshot);
                     if (snapP.farm[tileIdx] === 0) {
                         updatePlayer(pId, pp => {
                             const newFarm = [...pp.farm];
                             newFarm[tileIdx] = 0; 
                             return { ...pp, farm: newFarm };
                         });
                         playSound('click');
                     }
                 }
             }
        }
        else if (mode === 'sow' || mode === 'sow_bake_choice' || (mode === 'plow_sow' && subAction === 'sow')) {
             // ... sow logic
             if (p.farm[tileIdx] === 2 && !p.farmContent[tileIdx]) {
                const seed = p.tempMode.currentSeed || 'grain';
                // @ts-ignore
                if (p.res[seed] > 0) {
                     updatePlayer(pId, pp => {
                         const newRes = {...pp.res};
                         // @ts-ignore
                         newRes[seed]--;
                         const newContent = [...pp.farmContent];
                         newContent[tileIdx] = seed;
                         const newCounts = [...pp.farmCounts];
                         newCounts[tileIdx] = seed === 'grain' ? 3 : 2;
                         return { ...pp, res: newRes, farmContent: newContent, farmCounts: newCounts };
                     });
                     playSound('plant');
                }
            }
        }
        else if (mode === 'build_menu' || mode === 'tenant_build_room') {
            if (p.farm[tileIdx] === 0) {
                 if (currentTool === 'stable' && mode !== 'tenant_build_room') {
                     // ... stable logic
                     if (p.res.wood < 2) return;
                     updatePlayer(pId, pp => ({ ...pp, res: { ...pp.res, wood: pp.res.wood - 2 }, farm: pp.farm.map((t, i) => i === tileIdx ? 5 : t), stablesCount: pp.stablesCount + 1 }));
                     playSound('build');
                 } else { // Room
                     if (!hasNeighbor(p, tileIdx, 1)) { addLog("Must build adjacent", "red"); return; }
                     let wCost = 5, rCost = 2, sCost = 0, cCost = 0;
                     
                     // CARPENTER'S PARLOR (minor_mujiangdian)
                     if (p.houseType === 'wood' && p.playedCards.some(c => c.id === 'minor_mujiangdian')) {
                         wCost = 2; rCost = 2;
                     }

                     if (p.houseType === 'clay') { wCost = 0; cCost = 5; }
                     if (p.houseType === 'stone') { wCost = 0; sCost = 5; }
                     
                     if (p.res.wood >= wCost && p.res.clay >= cCost && p.res.stone >= sCost && p.res.reed >= rCost) {
                         updatePlayer(pId, pp => ({
                             ...pp,
                             res: { ...pp.res, wood: pp.res.wood - wCost, clay: pp.res.clay - cCost, stone: pp.res.stone - sCost, reed: pp.res.reed - rCost },
                             farm: pp.farm.map((t, i) => i === tileIdx ? 1 : t),
                             // If tenant, switch to confirmation immediately as only 1 room is allowed
                             tempMode: mode === 'tenant_build_room' ? { mode: 'turn_confirmation', actId: pp.tempMode!.actId } : pp.tempMode
                         }));
                         playSound('build');
                     } else { addLog("Not enough resources", "red"); playSound('error'); }
                 }
            }
        }
        // TURNIP FIELD (minor_lunken) placement logic
        else if (mode === 'place_lunken_field') {
            if (p.farm[tileIdx] === 0) {
                 const fields = p.farm.filter(t => t === 2).length;
                 if (fields > 0 && !hasNeighbor(p, tileIdx, 2)) {
                     addLog("Must be adjacent to existing fields", "red");
                     playSound('error');
                     return;
                 }
                 
                 updatePlayer(pId, pp => {
                     const newFarm = [...pp.farm];
                     newFarm[tileIdx] = 2;
                     // Transition to confirmation, and ensure we keep the actId for confirmation
                     return { 
                         ...pp, 
                         farm: newFarm,
                         tempMode: { mode: 'turn_confirmation', actId: pp.tempMode!.actId }
                     };
                 });
                 playSound('plow');
                 addLog(`${p.name} plowed 1 field (Turnip Field)`, p.color);
                 
                 if (p.tempMode.cardToPass) {
                     passCardToNextPlayer(p.tempMode.cardToPass, pId);
                 }
            }
        }
    };

    const renovate = () => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => {
            if (p.houseType === 'stone') return p;
            
            const architect = p.playedCards.find(c => c.id === 'o_jianzhufuyuanshi');
            
            let target = p.houseType === 'wood' ? 'clay' : 'stone';
            let costRes = p.houseType === 'wood' ? 'clay' : 'stone';
            
            if (architect && p.houseType === 'wood') {
                target = 'stone';
                costRes = 'stone'; 
            }

            const rooms = p.farm.filter(x => x === 1).length;
            const costAmt = rooms; 
            const reedCost = 1;
            
            // @ts-ignore
            if (p.res[costRes] >= costAmt && p.res.reed >= reedCost) {
                let newStables = p.stablesCount;
                let newFarm = [...p.farm];
                if (p.playedCards.some(c => c.id === 'minor_caikuangchui') && p.stablesCount < LIMIT_STABLES) {
                    const freeIdx = newFarm.indexOf(0);
                    if (freeIdx !== -1) {
                        newFarm[freeIdx] = 5;
                        newStables++;
                    }
                }

                return {
                    ...p,
                    houseType: target as 'clay' | 'stone',
                    // @ts-ignore
                    res: { ...p.res, [costRes]: p.res[costRes] - costAmt, reed: p.res.reed - reedCost },
                    stablesCount: newStables,
                    farm: newFarm,
                    tempMode: p.tempMode?.mode === 'tenant_renovate' ? { mode: 'turn_confirmation', actId: p.tempMode.actId } : p.tempMode
                };
            } else {
                addLog(`Need ${costAmt} ${costRes} and ${reedCost} reed`, 'red');
                playSound('error');
                return p;
            }
        });
        playSound('build');
    };

    const toggleConversion = () => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => {
             if (p.conversionTemp) return { ...p, conversionTemp: null };
             return { ...p, conversionTemp: { grain: 0, veg: 0, vegRaw: 0, vegCook: 0, sheep: 0, boar: 0, cow: 0, wood: 0, clay: 0, reed: 0 } };
        });
    };

    const adjustConversion = (res: any, delta: number) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => {
            if (!p.conversionTemp) return p;
            // @ts-ignore
            const newVal = (p.conversionTemp[res] || 0) + delta;
            if (newVal < 0) return p;
            
            if (delta > 0) {
                 if (res === 'vegRaw' || res === 'vegCook') {
                     const totalVegUsed = (p.conversionTemp.vegRaw || 0) + (p.conversionTemp.vegCook || 0);
                     if (totalVegUsed + 1 > p.res.veg) return p;
                 } else if (['sheep','boar','cow'].includes(res)) {
                     // @ts-ignore
                     if ((p.conversionTemp[res] || 0) + 1 > p.animals[res]) return p;
                 } else {
                     // @ts-ignore
                     if ((p.conversionTemp[res] || 0) + 1 > p.res[res]) return p;
                 }
            }
            
            return { ...p, conversionTemp: { ...p.conversionTemp, [res]: newVal } };
        });
        playSound('click');
    };

    const confirmConversion = () => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => {
            if (!p.conversionTemp) return p;
            const changes = { ...p.conversionTemp };
            const newRes = { ...p.res };
            const newAni = { ...p.animals };
            let foodGain = 0;

            if (changes.grain) { newRes.grain -= changes.grain; foodGain += changes.grain; } 
            if (changes.vegRaw) { newRes.veg -= changes.vegRaw; foodGain += changes.vegRaw * 1; }
            if (changes.vegCook) { 
                let maxRate = 0;
                 [...p.majors, ...p.playedCards].forEach(m => {
                    if (m.cook && m.cook.veg > maxRate) maxRate = m.cook.veg;
                });
                newRes.veg -= changes.vegCook; 
                foodGain += changes.vegCook * maxRate; 
            }
            
            ['sheep','boar','cow'].forEach(t => {
                // @ts-ignore
                const count = changes[t];
                if (count > 0) {
                    let rate = 0;
                    [...p.majors, ...p.playedCards].forEach(m => {
                        // @ts-ignore
                        if (m.cook && m.cook[t] > rate) rate = m.cook[t];
                    });
                    // @ts-ignore
                    newAni[t] -= count;
                    foodGain += count * rate;
                }
            });

            if (changes.wood) { newRes.wood -= changes.wood; foodGain += changes.wood * 2; }
            if (changes.clay) { newRes.clay -= changes.clay; foodGain += changes.clay * 2; }
            if (changes.reed) { newRes.reed -= changes.reed; foodGain += changes.reed * 3; }

            newRes.food += foodGain;
            return { ...p, res: newRes, animals: newAni, conversionTemp: null };
        });
        playSound('cook');
    };

    const toggleAnimalManager = () => {
        setIsAdjustingAnimals(prev => !prev);
    };

    const saveAnimalAssignment = (pId: number, assignments: { [key: number]: ResourceType[] }) => {
        updatePlayer(pId, p => ({ ...p, assignedAnimals: assignments }));
        setIsAdjustingAnimals(false);
        addLog(`Farm arrangement updated`, '#fff');
        playSound('click');
    };

    const adjustBake = (majorId: string, delta: number) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => {
            if (!p.tempMode) return p;
            const current = p.tempMode.bakeTargets || {};
            const val = current[majorId] || 0;
            const newVal = val + delta;
            if (newVal < 0) return p;
            
            const m = p.majors.find(mj => mj.id === majorId);
            if (!m) return p;
            if (m.specialBake?.limit && newVal > m.specialBake.limit) return p;
            
            const totalUsed = Object.values(current).reduce((a,b) => a+b, 0) + delta;
            if (totalUsed > p.res.grain) return p;

            return {
                 ...p,
                 tempMode: {
                     ...p.tempMode,
                     bakeTargets: { ...current, [majorId]: newVal }
                 }
            };
        });
        playSound('click');
    };

    const selectCardForPlay = (cardId: string) => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => ({
            ...p,
            tempMode: { ...p.tempMode!, selectedCardId: cardId }
        }));
    };

    const passCardPlay = () => {
        const { startPlayer, turnIdx } = stateRef.current.gameState;
        const pIdx = (startPlayer + turnIdx) % 4;
        updatePlayer(pIdx, p => ({
            ...p,
            tempMode: { ...p.tempMode!, selectedCardId: null }
        }));
    };

    const selectMajor = (id: string) => {
        const pIdx = (stateRef.current.gameState.startPlayer + stateRef.current.gameState.turnIdx) % 4;
        updatePlayer(pIdx, p => ({...p, tempMode: {...p.tempMode!, selectedMajorId: id, selectedCardId: undefined}}));
    };

    const switchTool = (t: 'room'|'stable') => updatePlayer((stateRef.current.gameState.startPlayer + stateRef.current.gameState.turnIdx) % 4, p => ({...p, tempMode: {...p.tempMode!, currentTool: t}}));
    const toggleSeed = (s: 'grain'|'veg') => updatePlayer((stateRef.current.gameState.startPlayer + stateRef.current.gameState.turnIdx) % 4, p => ({...p, tempMode: {...p.tempMode!, currentSeed: s}}));
    const setSubAction = (s: string|undefined) => updatePlayer((stateRef.current.gameState.startPlayer + stateRef.current.gameState.turnIdx) % 4, p => ({...p, tempMode: {...p.tempMode!, subAction: s as any}}));
    const openCardDetail = (card: Card, owner: Player) => setViewingCardState({card, owner});
    const closeCardDetail = () => setViewingCardState(null);
    const adjustHarvest = () => {};
    const resetHarvest = () => {};
    const confirmHarvest = () => {};

    return {
        gameState: stateRef.current.gameState,
        gamePhase,
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
        viewingCardState,
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
        resetGame,
        adjustBake,
        discardAnimal,
        cookOverflow,
        cookFromManager,
        discardFromManager,
        confirmOverflowEndTurn,
        resetOverflowManagement,
        cancelTurnAction: fullUndoAction, 
        confirmFeedPhase,
        resetFeed,
        selectCardForPlay,
        passCardPlay,
        toggleHandView: () => setIsViewingHand(prev => !prev),
        isViewingHand,
        resolveCardChoice,
        debug,
        playSound,
        toggleMute,
        isMuted
    };
};
