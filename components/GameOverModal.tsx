
import React, { useMemo } from 'react';
import { Player } from '../types';
import { analyzeFarmLayout, getTierScore } from '../utils/gameLogic';

interface Props {
    players: Player[];
    onRestart: () => void;
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
    cards: number;
    bonus: number;
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
                stables: p.stablesCount,
                rooms: 0,
                family: p.res.maxWorkers * 3,
                begging: p.begging * (-3),
                cards: 0,
                bonus: 0,
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
            b.unused = (15 - occupiedCount) * -1; // -1 per unused

            // Rooms
            const rooms = p.farm.filter(t => t === 1).length;
            const houseVal = p.houseType === 'wood' ? 0 : (p.houseType === 'clay' ? 1 : 2);
            b.rooms = rooms * houseVal;

            // Cards & Bonus
            p.majors.forEach(m => b.cards += m.score);
            p.majors.filter(m => m.special === 'bonus').forEach(m => {
                if (m.bonusType) b.bonus += Math.floor((p.res[m.bonusType] || 0) / 2);
            });

            b.total = b.fields + b.pastures + b.grain + b.veg + b.sheep + b.boar + b.cow + 
                      b.unused + b.stables + b.rooms + b.family + b.begging + b.cards + b.bonus;

            return { player: p, breakdown: b };
        }).sort((a,b) => b.breakdown.total - a.breakdown.total);
    }, [players]);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn">
            <div className="bg-stone-900 border-4 border-yellow-600 rounded-xl p-8 max-w-5xl w-full shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-700 via-yellow-400 to-yellow-700"></div>
                
                <h1 className="text-4xl font-bold text-center text-yellow-500 mb-2 drop-shadow-md">🏆 Game Over 🏆</h1>
                <div className="text-center text-stone-400 mb-6">Final Scores</div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-stone-200">
                        <thead>
                            <tr className="border-b-2 border-stone-700 text-yellow-200 uppercase text-xs tracking-wider">
                                <th className="p-2 text-left">Category</th>
                                {scores.map((s, idx) => (
                                    <th key={s.player.id} className="p-2 text-center">
                                        <div className="flex flex-col items-center">
                                            {idx === 0 && <span className="text-xl">👑</span>}
                                            <span style={{color: s.player.color}} className="font-bold">{s.player.name}</span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-800">
                            {[
                                { k: 'fields', l: 'Fields' },
                                { k: 'pastures', l: 'Pastures' },
                                { k: 'grain', l: 'Grain' },
                                { k: 'veg', l: 'Vegetables' },
                                { k: 'sheep', l: 'Sheep' },
                                { k: 'boar', l: 'Boar' },
                                { k: 'cow', l: 'Cattle' },
                                { k: 'unused', l: 'Unused Spaces (-)' },
                                { k: 'stables', l: 'Fenced Stables' },
                                { k: 'rooms', l: 'Rooms' },
                                { k: 'family', l: 'Family Members' },
                                { k: 'begging', l: 'Begging (-)' },
                                { k: 'cards', l: 'Cards' },
                                { k: 'bonus', l: 'Bonus Points' },
                            ].map((row) => (
                                <tr key={row.k} className="hover:bg-stone-800/50">
                                    <td className="p-2 font-medium text-stone-400">{row.l}</td>
                                    {scores.map(s => (
                                        <td key={s.player.id} className="p-2 text-center font-mono">
                                            {/* @ts-ignore */}
                                            {s.breakdown[row.k]}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            <tr className="bg-stone-800 font-bold text-lg text-white">
                                <td className="p-3 border-t-2 border-stone-600">TOTAL</td>
                                {scores.map((s, idx) => (
                                    <td key={s.player.id} className={`p-3 text-center border-t-2 border-stone-600 ${idx === 0 ? 'text-yellow-400 text-2xl animate-pulse' : ''}`}>
                                        {s.breakdown.total}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="mt-8 flex justify-center">
                    <button 
                        onClick={onRestart} 
                        className="px-8 py-3 bg-gradient-to-b from-green-600 to-green-800 hover:from-green-500 hover:to-green-700 text-white font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all text-lg border border-green-400"
                    >
                        🔄 Play Again
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GameOverModal;
