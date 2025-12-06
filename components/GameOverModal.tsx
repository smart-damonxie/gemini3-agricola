

import React, { useMemo } from 'react';
import { Player } from '../types';
import { analyzeFarmLayout, getTierScore, calculateScore } from '../utils/gameLogic';

interface Props {
    players: Player[];
    onRestart: () => void;
}

interface BonusDetail {
    name: string;
    points: number;
    desc: string;
}

interface ScoreBreakdown {
    fields: number;
    pastures: number;
    grain: number;
    veg: number;
    sheep: number;
    boar: number;
    cow: number;
    unused: number;
    stables: number;
    rooms: number;
    family: number;
    begging: number;
    cardsBase: number;
    cardsBonus: number;
    bonusDetails: BonusDetail[];
    cardDetails: {name: string, score: number}[];
    total: number;
}

const GameOverModal: React.FC<Props> = ({ players, onRestart }) => {
    
    const scores: {player: Player, breakdown: ScoreBreakdown}[] = useMemo(() => {
        return players.map(p => {
            const layout = analyzeFarmLayout(p);
            
            const b: ScoreBreakdown = {
                fields: getTierScore('fields', p.farm.filter(t => t === 2).length),
                pastures: getTierScore('pastures', layout.pastures.length),
                grain: getTierScore('grain', p.res.grain),
                veg: getTierScore('veg', p.res.veg),
                sheep: getTierScore('sheep', p.animals.sheep),
                boar: getTierScore('boar', p.animals.boar),
                cow: getTierScore('cow', p.animals.cow),
                unused: 0,
                stables: 0,
                rooms: 0,
                family: p.res.maxWorkers * 3,
                begging: p.begging * (-3),
                cardsBase: 0,
                cardsBonus: 0,
                bonusDetails: [],
                cardDetails: [],
                total: 0
            };

            // Unused spaces
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
            b.unused = (15 - occupiedCount) * -1;

            // Fenced Stables
            let fencedStablesCount = 0;
            for (let i = 0; i < 15; i++) {
                if (p.farm[i] === 5) { // Stable
                    const inPasture = layout.pastures.some(pas => pas.tiles.includes(i));
                    if (inPasture) fencedStablesCount++;
                }
            }
            b.stables = Math.min(4, fencedStablesCount);

            // Rooms
            const rooms = p.farm.filter(t => t === 1).length;
            const houseVal = p.houseType === 'wood' ? 0 : (p.houseType === 'clay' ? 1 : 2);
            b.rooms = rooms * houseVal;

            // Cards & Bonuses
            p.majors.forEach(m => {
                b.cardsBase += m.score;
                b.cardDetails.push({name: m.name, score: m.score});
            });
            
            p.majors.filter(m => m.special === 'bonus').forEach(m => {
                let pts = 0;
                let desc = '';
                if (m.id === 'm7') { // Joinery
                    const wood = p.res.wood;
                    if (wood >= 7) pts = 3;
                    else if (wood >= 5) pts = 2;
                    else if (wood >= 3) pts = 1;
                    desc = `(${wood} wood)`;
                } else if (m.id === 'm8') { // Pottery
                    const clay = p.res.clay;
                    if (clay >= 7) pts = 3;
                    else if (clay >= 5) pts = 2;
                    else if (clay >= 3) pts = 1;
                    desc = `(${clay} clay)`;
                } else if (m.id === 'm6') { // Basketmaker
                    const reed = p.res.reed;
                    if (reed >= 5) pts = 3;
                    else if (reed >= 4) pts = 2;
                    else if (reed >= 2) pts = 1;
                    desc = `(${reed} reed)`;
                }
                if (pts > 0) {
                    b.cardsBonus += pts;
                    b.bonusDetails.push({ name: m.name.split(' ')[0], points: pts, desc });
                }
            });

            // Use the comprehensive score function for total accuracy including Braggart/Steward
            // We pass ALL players here
            b.total = calculateScore(p, players);
            
            // Adjust cardsBase/bonus display purely for breakdown visual (might not sum perfectly if new logic added to total, but close enough)
            // Actually, calculateScore returns the single number. 
            // The breakdown struct calculates components manually.
            // Any discrepancy (like Braggart points) needs to be added to cardsBase or cardsBonus visually if we want match.
            // Let's check extra points from calculateScore vs breakdown sum.
            const breakdownSum = b.fields + b.pastures + b.grain + b.veg + b.sheep + b.boar + b.cow + 
                      b.unused + b.stables + b.rooms + b.family + b.begging + b.cardsBase + b.cardsBonus;
            
            if (b.total !== breakdownSum) {
                const diff = b.total - breakdownSum;
                b.cardsBonus += diff;
                if (diff > 0) b.bonusDetails.push({ name: 'Special Cards', points: diff, desc: '(Steward/Braggart/etc)' });
            }

            return { player: p, breakdown: b };
        }).sort((a,b) => b.breakdown.total - a.breakdown.total);
    }, [players]);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn">
            <div className="bg-stone-900 border-4 border-yellow-600 rounded-xl p-8 max-w-6xl w-full shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-700 via-yellow-400 to-yellow-700"></div>
                
                <h1 className="text-4xl font-bold text-center text-yellow-500 mb-2 drop-shadow-md">🏆 Game Over 🏆</h1>
                <div className="text-center text-stone-400 mb-6">Final Scoreboard</div>

                <div className="overflow-auto flex-1 scrollbar-thin scrollbar-thumb-stone-600 pr-2">
                    <table className="w-full text-sm text-stone-200 border-collapse">
                        <thead className="sticky top-0 bg-stone-900 z-10">
                            <tr className="border-b-2 border-stone-700 text-yellow-200 uppercase text-xs tracking-wider">
                                <th className="p-3 text-left w-48 bg-stone-900">Category</th>
                                {scores.map((s, idx) => (
                                    <th key={s.player.id} className="p-3 text-center bg-stone-900 min-w-[120px]">
                                        <div className="flex flex-col items-center">
                                            {idx === 0 && <span className="text-2xl animate-bounce">👑</span>}
                                            <span style={{color: s.player.color}} className="font-bold text-base">{s.player.name}</span>
                                            <div className="text-[10px] font-normal opacity-70 mt-1">
                                                {s.player.houseType.toUpperCase()} House, {s.player.res.maxWorkers} Family
                                            </div>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-800 text-stone-300">
                            <tr className="bg-stone-800/30">
                                <td className="p-2 pl-3 font-bold text-yellow-500/80" colSpan={scores.length + 1}>FARM</td>
                            </tr>
                            {[
                                { k: 'fields', l: 'Fields 🚜' },
                                { k: 'pastures', l: 'Pastures 🛖' },
                                { k: 'grain', l: 'Grain 🌾' },
                                { k: 'veg', l: 'Vegetables 🥕' },
                                { k: 'sheep', l: 'Sheep 🐑' },
                                { k: 'boar', l: 'Boar 🐗' },
                                { k: 'cow', l: 'Cattle 🐮' },
                                { k: 'unused', l: 'Unused Spaces 🟥 (-)' },
                                { k: 'stables', l: 'Fenced Stables 🏚️' },
                            ].map((row) => (
                                <tr key={row.k} className="hover:bg-stone-800/50 transition-colors">
                                    <td className="p-2 pl-4 font-medium">{row.l}</td>
                                    {scores.map(s => (
                                        <td key={s.player.id} className="p-2 text-center font-mono">
                                            {/* @ts-ignore */}
                                            {s.breakdown[row.k]}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            
                            <tr className="bg-stone-800/30">
                                <td className="p-2 pl-3 font-bold text-yellow-500/80" colSpan={scores.length + 1}>HOME & FAMILY</td>
                            </tr>
                            <tr className="hover:bg-stone-800/50 transition-colors">
                                <td className="p-2 pl-4 font-medium">Rooms (Mat. Points) 🏠</td>
                                {scores.map(s => (
                                    <td key={s.player.id} className="p-2 text-center font-mono">{s.breakdown.rooms}</td>
                                ))}
                            </tr>
                            <tr className="hover:bg-stone-800/50 transition-colors">
                                <td className="p-2 pl-4 font-medium">Family Members 👷</td>
                                {scores.map(s => (
                                    <td key={s.player.id} className="p-2 text-center font-mono">{s.breakdown.family}</td>
                                ))}
                            </tr>
                            <tr className="hover:bg-stone-800/50 transition-colors">
                                <td className="p-2 pl-4 font-medium text-red-400">Begging Cards 🆘</td>
                                {scores.map(s => (
                                    <td key={s.player.id} className="p-2 text-center font-mono text-red-400">{s.breakdown.begging}</td>
                                ))}
                            </tr>

                            <tr className="bg-stone-800/30">
                                <td className="p-2 pl-3 font-bold text-yellow-500/80" colSpan={scores.length + 1}>IMPROVEMENTS</td>
                            </tr>
                            <tr className="hover:bg-stone-800/50 transition-colors align-top">
                                <td className="p-2 pl-4 font-medium">
                                    Cards (Base) 📜
                                </td>
                                {scores.map(s => (
                                    <td key={s.player.id} className="p-2 text-center text-xs">
                                        <div className="font-mono text-base mb-1">{s.breakdown.cardsBase}</div>
                                        <div className="flex flex-col gap-0.5 opacity-70">
                                            {s.breakdown.cardDetails.map((c, i) => (
                                                <div key={i}>{c.name.split('(')[0]} ({c.score})</div>
                                            ))}
                                        </div>
                                    </td>
                                ))}
                            </tr>
                            <tr className="hover:bg-stone-800/50 transition-colors align-top">
                                <td className="p-2 pl-4 font-medium">
                                    Bonus Points ⭐
                                </td>
                                {scores.map(s => (
                                    <td key={s.player.id} className="p-2 text-center text-xs">
                                        <div className="font-mono text-base mb-1 text-yellow-300">{s.breakdown.cardsBonus}</div>
                                        <div className="flex flex-col gap-0.5 opacity-70 text-yellow-100/70">
                                            {s.breakdown.bonusDetails.map((b, i) => (
                                                <div key={i}>{b.name} +{b.points} {b.desc}</div>
                                            ))}
                                        </div>
                                    </td>
                                ))}
                            </tr>

                            <tr className="bg-stone-800 font-bold text-lg text-white sticky bottom-0 z-10 shadow-lg">
                                <td className="p-4 border-t-2 border-stone-600">TOTAL SCORE</td>
                                {scores.map((s, idx) => (
                                    <td key={s.player.id} className={`p-4 text-center border-t-2 border-stone-600 ${idx === 0 ? 'text-yellow-400 text-3xl animate-pulse' : ''}`}>
                                        {s.breakdown.total}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="mt-6 flex justify-center">
                    <button 
                        onClick={onRestart} 
                        className="px-10 py-3 bg-gradient-to-b from-green-600 to-green-800 hover:from-green-500 hover:to-green-700 text-white font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all text-xl border border-green-400"
                    >
                        🔄 Play Again
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GameOverModal;