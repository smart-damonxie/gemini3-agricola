import React from 'react';
import { SCORING_TIERS } from '../constants';

interface Props {
  onClose: () => void;
}

const CATEGORY_MAP: {[key:string]: {label: string, icon: string}} = {
  fields: { label: 'Fields', icon: '🚜' },
  pastures: { label: 'Pastures', icon: '🛖' },
  grain: { label: 'Grain', icon: '🌾' },
  veg: { label: 'Vegetables', icon: '🥕' },
  sheep: { label: 'Sheep', icon: '🐑' },
  boar: { label: 'Boar', icon: '🐗' },
  cow: { label: 'Cattle', icon: '🐮' },
};

const POINTS = [-1, 1, 2, 3, 4];

const ScoringTable: React.FC<Props> = ({ onClose }) => {
  const getRange = (cat: string, targetScore: number) => {
    const tiers = SCORING_TIERS[cat];
    const indices: number[] = [];
    tiers.forEach((score, count) => {
        if (score === targetScore) indices.push(count);
    });
    
    if (indices.length === 0) return '-';
    
    // Check if it's the last element in tiers, meaning "or more"
    const isLast = indices[indices.length - 1] === tiers.length - 1;
    
    if (indices.length === 1) {
        return isLast ? `${indices[0]}+` : `${indices[0]}`;
    }
    
    // Range
    const start = indices[0];
    const end = indices[indices.length - 1];
    return isLast ? `${start}+` : `${start}-${end}`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-800 border-2 border-yellow-600 rounded-lg shadow-2xl p-6 max-w-2xl w-full mx-4 animate-fadeIn" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-yellow-400 flex items-center gap-2">
            📊 Scoring Rules <span className="text-sm text-gray-400 font-normal">(Items needed for score)</span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl p-1">✕</button>
        </div>
        
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
                <thead className="text-xs uppercase bg-slate-700 text-yellow-200">
                    <tr>
                        <th className="px-4 py-3 rounded-tl-lg">Resource</th>
                        {POINTS.map(p => (
                            <th key={p} className="px-4 py-3 text-center bg-slate-700/50 border-l border-slate-600">
                                <span className={`inline-block w-6 h-6 rounded-full ${p < 0 ? 'bg-red-900/80 text-red-200' : 'bg-green-900/80 text-green-200'} flex items-center justify-center mx-auto shadow-sm`}>
                                    {p}
                                </span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {Object.keys(SCORING_TIERS).map((cat, idx) => (
                        <tr key={cat} className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-white flex items-center gap-3">
                                <span className="text-xl filter drop-shadow-md">{CATEGORY_MAP[cat].icon}</span>
                                {CATEGORY_MAP[cat].label}
                            </td>
                            {POINTS.map(p => {
                                const range = getRange(cat, p);
                                return (
                                    <td key={p} className="px-4 py-3 text-center border-l border-slate-700/50">
                                        <span className={`${range === '-' ? 'text-gray-600' : 'text-white font-mono'}`}>
                                            {range}
                                        </span>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        
        <div className="mt-4 text-xs text-gray-400 text-center italic bg-slate-900/50 p-2 rounded">
            * Numbers indicate the quantity of items/tiles required. e.g., "0-1" means 0 or 1 item. "8+" means 8 or more.
        </div>
        
        <div className="mt-4 flex justify-end">
             <button onClick={onClose} className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded shadow">
                 Close
             </button>
        </div>
      </div>
    </div>
  );
};

export default ScoringTable;