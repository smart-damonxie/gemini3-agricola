import { GameState, Player, Action } from '../types';
import { BASE_ACTIONS } from '../constants';

export const getAIAction = (gameState: GameState, player: Player): Action | null => {
    // Filter available actions
    const available = [...BASE_ACTIONS, ...gameState.roundCards].filter(a => gameState.occupied[a.id] === undefined);
    
    // Simple Heuristic: Prioritize resources and growth
    const doable = available.filter(act => {
         if(act.type === 'res' || act.type === 'res_combo' || act.mode === 'meeting') return true;
         // AI currently avoids complex modes like building/fencing in this simplified version
         return false; 
    });

    // If no "doable" simple actions, pick any available (likely will skip/fail safely in handler if complex)
    // Or just pass.
    if (available.length === 0) return null;

    // Pick random from doable, or fallback to first available
    const act = doable.length > 0 ? doable[Math.floor(Math.random() * doable.length)] : available[0];
    
    return act || null;
};

export const aiDiscardOverflow = (player: Player, overflowCount: number): { sheep: number, boar: number, cow: number } => {
    let rem = overflowCount;
    const discard = { sheep: 0, boar: 0, cow: 0 };
    
    // Simple strategy: discard cheapest animals first or just random
    // Here we discard in order: Sheep -> Boar -> Cow
    while(rem > 0) {
        if (player.animals.sheep > discard.sheep) { discard.sheep++; rem--; }
        else if (player.animals.boar > discard.boar) { discard.boar++; rem--; }
        else if (player.animals.cow > discard.cow) { discard.cow++; rem--; }
        else break; // Should not happen if logic is correct
    }
    return discard;
};