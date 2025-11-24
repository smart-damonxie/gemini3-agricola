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

    let occupiedCount = 0;
    for (let i = 0; i < 15; i++) {
        if (p.farm[i] !== 0) {
            occupiedCount++;
        } else {
            for (const pasture of layout.pastures) {
                if (pasture.tiles.includes(i)) {
                    occupiedCount++;
                    break;
                }
            }
        }
    }
    s -= (15 - occupiedCount);

    s += p.stablesCount;
    const rooms = p.farm.filter(t => t === 1).length;
    const houseVal = p.houseType === 'wood' ? 0 : (p.houseType === 'clay' ? 1 : 2);
    s += rooms * houseVal;

    s += p.res.maxWorkers * 3;
    p.majors.forEach(m => s += m.score);
    p.majors.filter(m => m.special === 'bonus').forEach(m => {
        if (m.bonusType) s += Math.floor((p.res[m.bonusType] || 0) / 2);
    });
    s += p.begging * (-3);
    return s;
};

export const getAniIcon = (type: string) => type === 'sheep' ? '🐑' : (type === 'boar' ? '🐗' : '🐮');

export const calculateAllocation = (p: Player): Allocation => {
    const layout = analyzeFarmLayout(p);
    const animalGroups = [
        { type: 'sheep', count: p.animals.sheep, remaining: 0 },
        { type: 'boar', count: p.animals.boar, remaining: 0 },
        { type: 'cow', count: p.animals.cow, remaining: 0 }
    ];
    animalGroups.sort((a, b) => b.count - a.count);
    layout.pastures.sort((a, b) => b.capacity - a.capacity);
    const distribution: { icon: string; type: string }[][] = Array(15).fill(null).map(() => []);

    animalGroups.forEach(group => {
        let count = group.count;
        for (const pas of layout.pastures) {
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
    // In a closed graph (Eulerian or collection of cycles), every vertex must have degree >= 2.
    // Specifically, a vertex with Degree 1 is a dead end. Degree 3 (T-junction) is allowed for shared walls.
    const degrees: { [key: string]: number } = {};
    const addDeg = (x: number, y: number) => { 
        const k = `${x},${y}`; 
        degrees[k] = (degrees[k] || 0) + 1; 
    };

    p.fences.forEach(key => {
        const [idxStr, side] = key.split('-');
        const idx = parseInt(idxStr);
        const r = Math.floor(idx / 5);
        const c = idx % 5;
        // Map edges to vertices (x=col, y=row)
        // top: (c, r) -> (c+1, r)
        // bottom: (c, r+1) -> (c+1, r+1)
        // left: (c, r) -> (c, r+1)
        // right: (c+1, r) -> (c+1, r+1)
        if (side === 't') { addDeg(c, r); addDeg(c + 1, r); }
        if (side === 'b') { addDeg(c, r + 1); addDeg(c + 1, r + 1); }
        if (side === 'l') { addDeg(c, r); addDeg(c, r + 1); }
        if (side === 'r') { addDeg(c + 1, r); addDeg(c + 1, r + 1); }
    });

    for (const k in degrees) {
        // If any vertex has exactly 1 fence connected, it's a loose end.
        // Degree 0 is impossible (we iterate existing fences).
        if (degrees[k] === 1) return false; 
    }

    // 2. Content Check: Fences cannot enclose Rooms(1) or Fields(2)
    // analyzeFarmLayout only returns pastures that are fully enclosed.
    const layout = analyzeFarmLayout(p);
    
    // Check if any fence exists that is NOT part of a valid pasture
    // We can count total fences used in pastures vs total fences placed
    // But simplified check: ensure no pasture contains invalid types.
    for (const pasture of layout.pastures) {
        for (const tileIdx of pasture.tiles) {
            const type = p.farm[tileIdx];
            if (type !== 0 && type !== 5) return false; // Can only fence Empty(0) or Stable(5)
        }
    }
    
    // Ensure all placed fences are actually part of a pasture loop?
    // If degree check passes (no loose ends), then fences form cycles.
    // If those cycles contain Rooms/Fields, the check above catches it.
    // If those cycles contain Empty/Stable, they are valid pastures.
    
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