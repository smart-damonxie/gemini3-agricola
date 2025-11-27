
import React, { useState, useEffect } from 'react';
import { Player, ResourceType } from '../types';
import { analyzeFarmLayout } from '../utils/gameLogic';

interface Props {
    player: Player;
    onClose: () => void;
    onSave: (assignments: { [key: number]: ResourceType[] }) => void;
}

interface Zone {
    id: string; // e.g. "pasture_0", "stable_8"
    type: 'pasture' | 'stable' | 'house';
    tiles: number[];
    capacity: number;
    assigned: ResourceType[];
}

const AnimalManager: React.FC<Props> = ({ player, onClose, onSave }) => {
    const [zones, setZones] = useState<Zone[]>([]);
    const [available, setAvailable] = useState({ sheep: 0, boar: 0, cow: 0 });

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
             // We need to map back from tileIdx to Zone
             newZones.forEach(z => {
                 z.tiles.forEach(tIdx => {
                     const animalsOnTile = player.assignedAnimals[tIdx];
                     if (animalsOnTile) {
                         z.assigned.push(...animalsOnTile);
                     }
                 });
             });
        }
        // Calculate remaining based on total owned vs assigned
        recalcAvailable(newZones);
        setZones(newZones);
    }, [player]);

    const recalcAvailable = (currentZones: Zone[]) => {
        const used = { sheep: 0, boar: 0, cow: 0 };
        currentZones.forEach(z => {
            z.assigned.forEach(a => {
                if (a === 'sheep') used.sheep++;
                if (a === 'boar') used.boar++;
                if (a === 'cow') used.cow++;
            });
        });
        setAvailable({
            sheep: Math.max(0, player.animals.sheep - used.sheep),
            boar: Math.max(0, player.animals.boar - used.boar),
            cow: Math.max(0, player.animals.cow - used.cow),
        });
    };

    const handleAdd = (zoneIndex: number, type: ResourceType) => {
        // @ts-ignore
        if (available[type] <= 0) return; // No more animals of this type

        const updatedZones = [...zones];
        const zone = updatedZones[zoneIndex];

        if (zone.assigned.length >= zone.capacity) return; // Full

        // Rule Check: Pastures usually 1 type.
        // Prompt asks for flexibility, but let's warn or restrict slightly if mixing types in same pasture?
        // Actually, let's allow flexibility as requested, but standard logic warns.
        // "1 sheep in room, 3 pigs in pen" implies single type per location usually.
        // Let's strictly enforce single type per Zone for simplicity unless it's a House which might be weird.
        // Actually house can hold 1 pet.
        
        const currentTypes = Array.from(new Set(zone.assigned));
        if (currentTypes.length > 0 && !currentTypes.includes(type)) {
            // Trying to mix types
            if (zone.type === 'pasture' || zone.type === 'stable') {
                // Usually not allowed. Let's block it for now to avoid confusion.
                // Or maybe allow if user really wants? "Flexible".
                // I will block it because visualized icons overlap weirdly if mixed.
                // alert("Cannot mix animal types in one enclosure!");
                // return;
            }
        }

        zone.assigned.push(type);
        setZones(updatedZones);
        recalcAvailable(updatedZones);
    };

    const handleRemove = (zoneIndex: number, type: ResourceType) => {
        const updatedZones = [...zones];
        const zone = updatedZones[zoneIndex];
        const idx = zone.assigned.indexOf(type);
        if (idx > -1) {
            zone.assigned.splice(idx, 1);
            setZones(updatedZones);
            recalcAvailable(updatedZones);
        }
    };

    const handleSave = () => {
        const assignments: { [key: number]: ResourceType[] } = {};
        
        zones.forEach(z => {
            if (z.assigned.length === 0) return;
            
            // Distribute animals from Zone to Tiles
            // e.g. Zone has 3 sheep, tiles [0, 1]. Tile 0 gets 2, Tile 1 gets 1.
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
        
        onSave(assignments);
    };

    const handleAuto = () => {
        onSave({}); // Clearing assignments triggers auto-calc in main logic
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-800 border-2 border-indigo-500 rounded-lg shadow-2xl p-6 max-w-4xl w-full flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-indigo-500/50">
                    <h2 className="text-2xl font-bold text-indigo-300">Strategy: Animal Placement</h2>
                    <div className="flex gap-4 items-center">
                        <div className="text-sm text-gray-400">Unassigned:</div>
                        <div className="flex gap-2">
                             <span className={`px-2 py-1 rounded bg-slate-700 ${available.sheep > 0 ? 'text-white font-bold' : 'text-gray-500'}`}>🐑 {available.sheep}</span>
                             <span className={`px-2 py-1 rounded bg-slate-700 ${available.boar > 0 ? 'text-white font-bold' : 'text-gray-500'}`}>🐗 {available.boar}</span>
                             <span className={`px-2 py-1 rounded bg-slate-700 ${available.cow > 0 ? 'text-white font-bold' : 'text-gray-500'}`}>🐮 {available.cow}</span>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-4 p-2">
                    {zones.map((zone, idx) => (
                        <div key={idx} className={`border rounded p-3 flex flex-col gap-2 ${zone.type === 'house' ? 'bg-orange-900/30 border-orange-700' : zone.type === 'stable' ? 'bg-yellow-900/30 border-yellow-700' : 'bg-green-900/30 border-green-700'}`}>
                            <div className="flex justify-between items-center text-xs uppercase font-bold text-gray-300">
                                <span>{zone.type} (Cap: {zone.capacity})</span>
                                <span className="text-[10px] text-gray-500">Tiles: {zone.tiles.join(',')}</span>
                            </div>
                            
                            {/* Current Contents */}
                            <div className="bg-black/40 h-16 rounded flex items-center justify-center flex-wrap gap-1 p-1 overflow-hidden relative">
                                {zone.assigned.length === 0 && <span className="text-gray-600 text-xs italic">Empty</span>}
                                {zone.assigned.map((a, i) => (
                                    <span key={i} className="text-lg leading-none cursor-pointer hover:scale-125 transition-transform" onClick={() => handleRemove(idx, a)} title="Click to remove">
                                        {a === 'sheep' ? '🐑' : a === 'boar' ? '🐗' : '🐮'}
                                    </span>
                                ))}
                                <div className="absolute top-0 right-0 text-[9px] bg-black/60 px-1 rounded text-white">{zone.assigned.length}/{zone.capacity}</div>
                            </div>

                            {/* Controls */}
                            <div className="flex justify-center gap-1 mt-auto">
                                <button disabled={available.sheep <= 0 || zone.assigned.length >= zone.capacity} onClick={() => handleAdd(idx, 'sheep')} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm disabled:opacity-30 disabled:cursor-not-allowed">🐑</button>
                                <button disabled={available.boar <= 0 || zone.assigned.length >= zone.capacity} onClick={() => handleAdd(idx, 'boar')} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm disabled:opacity-30 disabled:cursor-not-allowed">🐗</button>
                                <button disabled={available.cow <= 0 || zone.assigned.length >= zone.capacity} onClick={() => handleAdd(idx, 'cow')} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm disabled:opacity-30 disabled:cursor-not-allowed">🐮</button>
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
