
import React, { useState, useEffect } from 'react';
import { Player, ResourceType } from '../types';
import { analyzeFarmLayout } from '../utils/gameLogic';

interface Props {
    player: Player;
    onClose: () => void;
    onSave: (assignments: { [key: number]: ResourceType[] }) => void;
    onCook?: (type: 'sheep'|'boar'|'cow', assignments: { [key: number]: ResourceType[] }) => void;
    onDiscard?: (type: 'sheep'|'boar'|'cow', isNewborn: boolean, assignments: { [key: number]: ResourceType[] }) => void;
    pendingBreeding?: { sheep: number, boar: number, cow: number };
}

interface Zone {
    id: string; // e.g. "pasture_0", "stable_8"
    type: 'pasture' | 'stable' | 'house';
    tiles: number[];
    capacity: number;
    assigned: ResourceType[];
}

const AnimalManager: React.FC<Props> = ({ player, onClose, onSave, onCook, onDiscard, pendingBreeding }) => {
    const [zones, setZones] = useState<Zone[]>([]);
    const [availableAdults, setAvailableAdults] = useState({ sheep: 0, boar: 0, cow: 0 });
    const [availableNewborns, setAvailableNewborns] = useState({ sheep: 0, boar: 0, cow: 0 });

    useEffect(() => {
        // Initialize Zones based on farm layout
        const layout = analyzeFarmLayout(player);
        const newZones: Zone[] = [];
        
        // Pastures
        layout.pastures.forEach((p, idx) => {
            newZones.push({
                id: `pasture_${idx}`,
                type: 'pasture',
                tiles: p.tiles,
                capacity: p.capacity,
                assigned: []
            });
        });

        // Singles (House/Stable)
        layout.singles.forEach(s => {
            newZones.push({
                id: `${s.type}_${s.idx}`,
                type: s.type === 'house' ? 'house' : 'stable',
                tiles: [s.idx],
                capacity: s.capacity,
                assigned: []
            });
        });

        // Initialize assignments from existing player state if present
        if (player.assignedAnimals && Object.keys(player.assignedAnimals).length > 0) {
             // Rehydrate assignments
             newZones.forEach(z => {
                 z.tiles.forEach(tIdx => {
                     const animalsOnTile = player.assignedAnimals[tIdx];
                     if (animalsOnTile) {
                         z.assigned.push(...animalsOnTile);
                     }
                 });
             });
        }
        
        // Initial Calculation of Available animals
        recalcAvailable(newZones, player.animals, pendingBreeding || {sheep:0, boar:0, cow:0});
        setZones(newZones);
    }, [player, pendingBreeding]); 

    const recalcAvailable = (currentZones: Zone[], currentAdults: any, currentNewborns: any) => {
        const used = { sheep: 0, boar: 0, cow: 0 };
        currentZones.forEach(z => {
            z.assigned.forEach(a => {
                if (a === 'sheep') used.sheep++;
                if (a === 'boar') used.boar++;
                if (a === 'cow') used.cow++;
            });
        });

        // Logic: Allocation takes from Adults first, then Newborns.
        
        const remAdults = {
            sheep: Math.max(0, currentAdults.sheep - used.sheep),
            boar: Math.max(0, currentAdults.boar - used.boar),
            cow: Math.max(0, currentAdults.cow - used.cow),
        };

        const usedFromNewborns = {
            sheep: Math.max(0, used.sheep - currentAdults.sheep),
            boar: Math.max(0, used.boar - currentAdults.boar),
            cow: Math.max(0, used.cow - currentAdults.cow),
        };

        const remNewborns = {
            sheep: Math.max(0, currentNewborns.sheep - usedFromNewborns.sheep),
            boar: Math.max(0, currentNewborns.boar - usedFromNewborns.boar),
            cow: Math.max(0, currentNewborns.cow - usedFromNewborns.cow),
        };

        setAvailableAdults(remAdults);
        setAvailableNewborns(remNewborns);
    };

    const getAssignments = () => {
        const assignments: { [key: number]: ResourceType[] } = {};
        zones.forEach(z => {
            if (z.assigned.length === 0) return;
            const animals = [...z.assigned];
            let tileIndex = 0;
            while (animals.length > 0) {
                const ani = animals.shift()!;
                const tIdx = z.tiles[tileIndex % z.tiles.length];
                if (!assignments[tIdx]) assignments[tIdx] = [];
                assignments[tIdx].push(ani);
                tileIndex++;
            }
        });
        return assignments;
    };

    const handleAdd = (zoneIndex: number, type: ResourceType) => {
        // @ts-ignore
        const total = availableAdults[type] + availableNewborns[type];
        if (total <= 0) return;

        const updatedZones = [...zones];
        const zone = updatedZones[zoneIndex];

        if (zone.assigned.length >= zone.capacity) return; // Full
        // STRICT RULE: Mixed animals not allowed (except empty)
        if (zone.assigned.length > 0 && zone.assigned[0] !== type) return;

        zone.assigned.push(type);
        setZones(updatedZones);
        recalcAvailable(updatedZones, player.animals, pendingBreeding || {sheep:0, boar:0, cow:0});
    };

    const handleRemove = (zoneIndex: number, type: ResourceType) => {
        const updatedZones = [...zones];
        const zone = updatedZones[zoneIndex];
        const idx = zone.assigned.indexOf(type);
        if (idx > -1) {
            zone.assigned.splice(idx, 1);
            setZones(updatedZones);
            recalcAvailable(updatedZones, player.animals, pendingBreeding || {sheep:0, boar:0, cow:0});
        }
    };

    const handleSave = () => {
        onSave(getAssignments());
    };

    const handleAuto = () => {
        onSave({});
    };

    const handleCook = (type: 'sheep'|'boar'|'cow') => {
        if(onCook) onCook(type, getAssignments());
    };

    const handleDiscard = (type: 'sheep'|'boar'|'cow', isNewborn: boolean) => {
        if(onDiscard) onDiscard(type, isNewborn, getAssignments());
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-800 border-2 border-indigo-500 rounded-lg shadow-2xl p-6 max-w-4xl w-full flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-indigo-500/50">
                    <h2 className="text-2xl font-bold text-indigo-300">Animal Adjustment</h2>
                    <div className="flex flex-col items-end">
                        <div className="flex gap-4 items-center mb-1">
                            <div className="text-sm text-gray-400 font-bold">Adults (Cookable):</div>
                            <div className="flex gap-2">
                                 {['sheep','boar','cow'].map(t => {
                                     const type = t as 'sheep'|'boar'|'cow';
                                     return (
                                         <div key={type} className="flex items-center bg-slate-700 rounded overflow-hidden border border-slate-600">
                                             <span className="px-2 py-1 text-white">{type === 'sheep' ? '🐑' : type === 'boar' ? '🐗' : '🐮'} {availableAdults[type]}</span>
                                             <div className="flex border-l border-slate-500">
                                                 {onCook && (
                                                    <button 
                                                        onClick={() => handleCook(type)} 
                                                        disabled={player.animals[type] <= 0}
                                                        className="bg-orange-600 hover:bg-orange-500 text-white text-[10px] px-1.5 py-1.5 font-bold disabled:opacity-50 border-r border-orange-500"
                                                        title="Cook 1 Adult"
                                                    >
                                                        🔥
                                                    </button>
                                                 )}
                                                 {onDiscard && (
                                                     <button 
                                                        onClick={() => handleDiscard(type, false)} 
                                                        disabled={player.animals[type] <= 0}
                                                        className="bg-red-700 hover:bg-red-600 text-white text-[10px] px-1.5 py-1.5 font-bold disabled:opacity-50"
                                                        title="Discard 1 Adult"
                                                     >
                                                        🗑️
                                                     </button>
                                                 )}
                                             </div>
                                         </div>
                                     );
                                 })}
                            </div>
                        </div>
                        {pendingBreeding && (
                            <div className="flex gap-4 items-center">
                                <div className="text-sm text-yellow-400 font-bold">Newborns (No Cook):</div>
                                <div className="flex gap-2">
                                     {['sheep','boar','cow'].map(t => {
                                         const type = t as 'sheep'|'boar'|'cow';
                                         const count = availableNewborns[type];
                                         const has = count > 0;
                                         return (
                                             <div key={`new-${type}`} className={`flex items-center rounded border overflow-hidden ${has ? 'bg-slate-900 border-yellow-700' : 'bg-slate-800 border-gray-700 opacity-50'}`}>
                                                  <span className={`px-2 py-1 ${has ? 'text-yellow-200' : 'text-gray-500'}`}>
                                                      {type === 'sheep' ? '🐑' : type === 'boar' ? '🐗' : '🐮'} {count}
                                                  </span>
                                                  {onDiscard && has && (
                                                     <button 
                                                        onClick={() => handleDiscard(type, true)} 
                                                        className="bg-red-900 hover:bg-red-800 text-white text-[10px] px-1.5 py-1.5 font-bold border-l border-red-700"
                                                        title="Discard 1 Newborn"
                                                     >
                                                        🗑️
                                                     </button>
                                                  )}
                                             </div>
                                         );
                                     })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-4 p-2">
                    {zones.map((zone, idx) => (
                        <div key={idx} className={`border rounded p-3 flex flex-col gap-2 ${zone.type === 'house' ? 'bg-orange-900/30 border-orange-700' : zone.type === 'stable' ? 'bg-yellow-900/30 border-yellow-700' : 'bg-green-900/30 border-green-700'}`}>
                            <div className="flex justify-between items-center text-xs uppercase font-bold text-gray-300">
                                <span>{zone.type} (Cap: {zone.capacity})</span>
                                <span className="text-[10px] text-gray-500">Tiles: {zone.tiles.join(',')}</span>
                            </div>
                            
                            <div className="bg-black/40 h-16 rounded flex items-center justify-center flex-wrap gap-1 p-1 overflow-hidden relative">
                                {zone.assigned.length === 0 && <span className="text-gray-600 text-xs italic">Empty</span>}
                                {zone.assigned.map((a, i) => (
                                    <span key={i} className="text-lg leading-none cursor-pointer hover:scale-125 transition-transform" onClick={() => handleRemove(idx, a)} title="Click to remove">
                                        {a === 'sheep' ? '🐑' : a === 'boar' ? '🐗' : '🐮'}
                                    </span>
                                ))}
                                <div className="absolute top-0 right-0 text-[9px] bg-black/60 px-1 rounded text-white">{zone.assigned.length}/{zone.capacity}</div>
                            </div>

                            <div className="flex justify-center gap-1 mt-auto">
                                <button disabled={(availableAdults.sheep + availableNewborns.sheep) <= 0 || zone.assigned.length >= zone.capacity} onClick={() => handleAdd(idx, 'sheep')} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm disabled:opacity-30 disabled:cursor-not-allowed">🐑</button>
                                <button disabled={(availableAdults.boar + availableNewborns.boar) <= 0 || zone.assigned.length >= zone.capacity} onClick={() => handleAdd(idx, 'boar')} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm disabled:opacity-30 disabled:cursor-not-allowed">🐗</button>
                                <button disabled={(availableAdults.cow + availableNewborns.cow) <= 0 || zone.assigned.length >= zone.capacity} onClick={() => handleAdd(idx, 'cow')} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm disabled:opacity-30 disabled:cursor-not-allowed">🐮</button>
                            </div>
                        </div>
                    ))}
                    {zones.length === 0 && <div className="col-span-3 text-center text-gray-500 py-10">No animal containers (Pastures/Stables) found. Build some first!</div>}
                </div>

                <div className="mt-4 pt-4 border-t border-indigo-500/50 flex justify-end gap-3">
                    <button onClick={handleAuto} className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 text-white rounded shadow text-sm font-bold">
                        Reset to Auto
                    </button>
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded shadow text-sm">
                        Cancel
                    </button>
                    <button onClick={handleSave} className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded shadow font-bold">
                        Save Strategy
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AnimalManager;
