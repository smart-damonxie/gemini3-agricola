
import { Allocation, FarmLayout, Player, ResourceType } from "../types";
import { SCORING_TIERS } from "../constants";

export const getTierScore = (category: string, count: number): number => {
    const tiers = SCORING_TIERS[category];
    if (!tiers) return 0;
    if (count >= tiers.length) return tiers[tiers.length - 1];
    return tiers[count];
};

export const analyzeFarmLayout = (p: Player): FarmLayout => {
    const singles: { idx: number; type: 'house'|'stable'; capacity: number }[] = [];
    const houseTiles = p.farm.map((t, i) => t === 1 ? i : -1).filter(i => i !== -1);
    
    // House Capacity Rule: A house (regardless of rooms) can usually hold 1 pet.
    if (houseTiles.length > 0) {
         singles.push({ idx: houseTiles[0], type: 'house', capacity: 1 });
    }

    const visited = new Set<number>();
    const pastures: { capacity: number; tiles: number[]; assignedType?: string }[] = [];
    
    const hasW = (idx: number, s: string): boolean => {
        if (s === 't') return p.fences.has(`${idx}-t`);
        if (s === 'l') return p.fences.has(`${idx}-l`);
        if (s === 'r') return (idx % 5 === 4) ? p.fences.has(`${idx}-r`) : p.fences.has(`${idx + 1}-l`);
        if (s === 'b') return (idx >= 10) ? p.fences.has(`${idx}-b`) : p.fences.has(`${idx + 5}-t`);
        return false;
    };

    for (let i = 0; i < 15; i++) {
        // We only care about Empty(0) or Stable(5) for valid pastures
        if (visited.has(i) || (p.farm[i] !== 0 && p.farm[i] !== 5)) continue;
        let queue = [i], tiles: number[] = [], enclosed = true, hasStable = (p.farm[i] === 5);
        visited.add(i);
        while (queue.length) {
            const u = queue.shift()!;
            tiles.push(u);
            if (p.farm[u] === 5) hasStable = true;
            [{ n: u < 5 ? -1 : u - 5, w: 't' }, { n: u >= 10 ? -1 : u + 5, w: 'b' }, { n: u % 5 === 0 ? -1 : u - 1, w: 'l' }, { n: u % 5 === 4 ? -1 : u + 1, w: 'r' }]
                .forEach(nb => {
                    if (!hasW(u, nb.w)) {
                        if (nb.n === -1) enclosed = false;
                        else if (!visited.has(nb.n) && (p.farm[nb.n] === 0 || p.farm[nb.n] === 5)) {
                            visited.add(nb.n); queue.push(nb.n);
                        }
                    }
                });
        }
        if (enclosed) {
            const capacity = tiles.length * (hasStable ? 4 : 2);
            pastures.push({ capacity, tiles });
        } else {
            tiles.forEach(t => {
                if (p.farm[t] === 5) singles.push({ idx: t, type: 'stable', capacity: 1 });
            });
        }
    }
    return { pastures, singles };
};

export const calculateScore = (p: Player): number => {
    let s = 0;
    const layout = analyzeFarmLayout(p);

    s += getTierScore('fields', p.farm.filter(t => t === 2).length);
    s += getTierScore('pastures', layout.pastures.length);
    s += getTierScore('grain', p.res.grain);
    s += getTierScore('veg', p.res.veg);
    s += getTierScore('sheep', p.animals.sheep);
    s += getTierScore('boar', p.animals.boar);
    s += getTierScore('cow', p.animals.cow);

    // Unused spaces calculation
    let occupiedCount = 0;
    for (let i = 0; i < 15; i++) {
        // Direct occupancy (House, Field, Stable)
        if (p.farm[i] !== 0) {
            occupiedCount++;
        } else {
            // Check if it's part of a pasture (even if empty)
            for (const pasture of layout.pastures) {
                if (pasture.tiles.includes(i)) {
                    occupiedCount++;
                    break;
                }
            }
        }
    }
    s -= (15 - occupiedCount);

    // Fenced Stables Score
    // Rule: Score equals total number of stables contained in enclosures
    let fencedStablesCount = 0;
    for (let i = 0; i < 15; i++) {
        if (p.farm[i] === 5) { // Stable
            // Check if this stable is part of a valid pasture
            const inPasture = layout.pastures.some(pas => pas.tiles.includes(i));
            if (inPasture) fencedStablesCount++;
        }
    }
    s += Math.min(4, fencedStablesCount);

    const rooms = p.farm.filter(t => t === 1).length;
    const houseVal = p.houseType === 'wood' ? 0 : (p.houseType === 'clay' ? 1 : 2);
    s += rooms * houseVal;

    s += p.res.maxWorkers * 3;
    
    // Major Scores
    p.majors.forEach(m => s += m.score);
    
    // Bonus Points for Workshops
    p.majors.filter(m => m.special === 'bonus').forEach(m => {
        if (m.id === 'm7') { // Joinery (Wood)
            // 3/5/7 wood -> 1/2/3 points
            if (p.res.wood >= 7) s += 3;
            else if (p.res.wood >= 5) s += 2;
            else if (p.res.wood >= 3) s += 1;
        } else if (m.id === 'm8') { // Pottery (Clay)
            // 3/5/7 clay -> 1/2/3 points
            if (p.res.clay >= 7) s += 3;
            else if (p.res.clay >= 5) s += 2;
            else if (p.res.clay >= 3) s += 1;
        } else if (m.id === 'm6') { // Basketmaker (Reed)
            // 2/4/5 reed -> 1/2/3 points
            if (p.res.reed >= 5) s += 3;
            else if (p.res.reed >= 4) s += 2;
            else if (p.res.reed >= 2) s += 1;
        }
    });

    s += p.begging * (-3);
    return s;
};

export const getAniIcon = (type: string) => type === 'sheep' ? '🐑' : (type === 'boar' ? '🐗' : '🐮');

export const calculateAllocation = (p: Player): Allocation => {
    const distribution: { icon: string; type: string }[][] = Array(15).fill(null).map(() => []);

    // 1. Place Workers in Rooms
    const rooms = p.farm.map((t, i) => t === 1 ? i : -1).filter(i => i !== -1);
    let workersPlaced = 0;
    rooms.forEach(rIdx => {
        if (workersPlaced < p.res.maxWorkers) {
            // We use a generic worker icon here. The Component will color it.
            distribution[rIdx].push({ icon: '👷', type: 'worker' });
            workersPlaced++;
        }
    });

    // 2. Place Animals
    // If Manual Assignment exists, use it exclusively
    if (p.assignedAnimals && Object.keys(p.assignedAnimals).length > 0) {
        const used = { sheep: 0, boar: 0, cow: 0 };

        Object.entries(p.assignedAnimals).forEach(([key, list]) => {
            const idx = parseInt(key);
            if (idx >= 0 && idx < 15) {
                list.forEach(type => {
                     distribution[idx].push({ icon: getAniIcon(type), type: 'ani' });
                     if (type === 'sheep') used.sheep++;
                     else if (type === 'boar') used.boar++;
                     else if (type === 'cow') used.cow++;
                });
            }
        });

        let overflow = 0;
        overflow += Math.max(0, p.animals.sheep - used.sheep);
        overflow += Math.max(0, p.animals.boar - used.boar);
        overflow += Math.max(0, p.animals.cow - used.cow);

        return { distribution, overflow };
    }

    // Default Auto-Allocation
    const layout = analyzeFarmLayout(p);
    const animalGroups = [
        { type: 'sheep', count: p.animals.sheep, remaining: 0 },
        { type: 'boar', count: p.animals.boar, remaining: 0 },
        { type: 'cow', count: p.animals.cow, remaining: 0 }
    ];
    animalGroups.sort((a, b) => b.count - a.count);
    
    // Sort pastures by capacity to optimize large herds
    const sortedPastures = [...layout.pastures].sort((a, b) => b.capacity - a.capacity);
    
    animalGroups.forEach(group => {
        let count = group.count;
        for (const pas of sortedPastures) {
            if (count <= 0) break;
            if (pas.assignedType) continue;
            pas.assignedType = group.type;
            const take = Math.min(count, pas.capacity);
            count -= take;
            const base = Math.floor(take / pas.tiles.length);
            const rem = take % pas.tiles.length;
            pas.tiles.forEach((tIdx, i) => {
                const n = base + (i < rem ? 1 : 0);
                for (let k = 0; k < n; k++) distribution[tIdx].push({ icon: getAniIcon(group.type), type: 'ani' });
            });
        }
        group.remaining = count;
    });

    const slots = [...layout.singles];
    animalGroups.forEach(group => {
        while (group.remaining > 0 && slots.length > 0) {
            const slot = slots.shift()!;
            distribution[slot.idx].push({ icon: getAniIcon(group.type), type: 'ani' });
            group.remaining--;
        }
    });

    const overflow = animalGroups.reduce((sum, g) => sum + g.remaining, 0);
    return { distribution, overflow };
};

export const validateFenceRules = (p: Player): boolean => {
    // 1. Degree Check: No "Loose Ends" allowed.
    const degrees: { [key: string]: number } = {};
    const addDeg = (x: number, y: number) => { 
        const k = `${x},${y}`; 
        degrees[k] = (degrees[k] || 0) + 1; 
    };

    const hasW = (idx: number, s: string): boolean => {
        if (s === 't') return p.fences.has(`${idx}-t`);
        if (s === 'l') return p.fences.has(`${idx}-l`);
        if (s === 'r') return (idx % 5 === 4) ? p.fences.has(`${idx}-r`) : p.fences.has(`${idx + 1}-l`);
        if (s === 'b') return (idx >= 10) ? p.fences.has(`${idx}-b`) : p.fences.has(`${idx + 5}-t`);
        return false;
    };

    p.fences.forEach(key => {
        const [idxStr, side] = key.split('-');
        const idx = parseInt(idxStr);
        const r = Math.floor(idx / 5);
        const c = idx % 5;
        // Map edges to vertices (x=col, y=row)
        if (side === 't') { addDeg(c, r); addDeg(c + 1, r); }
        if (side === 'b') { addDeg(c, r + 1); addDeg(c + 1, r + 1); }
        if (side === 'l') { addDeg(c, r); addDeg(c, r + 1); }
        if (side === 'r') { addDeg(c + 1, r); addDeg(c + 1, r + 1); }
    });

    for (const k in degrees) {
        // Degree 1 means a dead end
        if (degrees[k] === 1) return false; 
    }

    // 2. Content Check: Fences cannot enclose Rooms(1) or Fields(2).
    // They can ONLY enclose Empty(0) or Stable(5).
    // We iterate through all Rooms and Fields and verify they can "escape" to the outside.
    for (let i = 0; i < 15; i++) {
        const type = p.farm[i];
        if (type === 1 || type === 2) { // Room or Field
            // Check if enclosed by performing a Flood Fill (BFS)
            let escaped = false;
            let queue = [i];
            let visited = new Set<number>();
            visited.add(i);

            while(queue.length > 0) {
                const u = queue.shift()!;
                const neighbors = [
                    { n: u < 5 ? -1 : u - 5, w: 't' }, 
                    { n: u >= 10 ? -1 : u + 5, w: 'b' }, 
                    { n: u % 5 === 0 ? -1 : u - 1, w: 'l' }, 
                    { n: u % 5 === 4 ? -1 : u + 1, w: 'r' }
                ];

                for (let nb of neighbors) {
                    if (!hasW(u, nb.w)) {
                        if (nb.n === -1) {
                            escaped = true;
                            break;
                        } else {
                            if (!visited.has(nb.n)) {
                                visited.add(nb.n);
                                queue.push(nb.n);
                            }
                        }
                    }
                }
                if (escaped) break;
            }
            if (!escaped) return false; // Trapped! Invalid.
        }
    }
    
    return true;
};

export const getFenceVertices = (fenceKey: string): string[] => {
    const [idxStr, side] = fenceKey.split('-');
    const idx = parseInt(idxStr);
    const r = Math.floor(idx / 5);
    const c = idx % 5;
    if (side === 't') return [`${r},${c}`, `${r},${c + 1}`];
    if (side === 'b') return [`${r + 1},${c}`, `${r + 1},${c + 1}`];
    if (side === 'l') return [`${r},${c}`, `${r + 1},${c}`];
    if (side === 'r') return [`${r},${c + 1}`, `${r + 1},${c + 1}`];
    return [];
};

export const hasNeighbor = (p: Player, idx: number, type: number): boolean => {
    const n = [];
    if (idx >= 5) n.push(idx - 5); if (idx < 10) n.push(idx + 5);
    if (idx % 5 !== 0) n.push(idx - 1); if (idx % 5 !== 4) n.push(idx + 1);
    return n.some(x => p.farm[x] === type);
};
