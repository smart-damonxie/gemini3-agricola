
import React from 'react';
import { DB_MAJORS } from '../constants';
import { MajorCard } from '../types';

interface Props {
    availableMajors: MajorCard[];
    onClose: () => void;
}

const MajorGallery: React.FC<Props> = ({ availableMajors, onClose }) => {
    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn" onClick={onClose}>
            <div className="bg-stone-900 border-4 border-yellow-700 rounded-xl p-6 max-w-6xl w-full h-[90vh] flex flex-col shadow-2xl relative" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6 pb-2 border-b border-yellow-700/50">
                    <h2 className="text-3xl font-bold text-yellow-500 tracking-wider">Major Improvements Gallery</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl transition-colors">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 p-4 scrollbar-thin scrollbar-thumb-stone-600">
                    {DB_MAJORS.map(major => {
                        const isAvailable = availableMajors.some(m => m.id === major.id);
                        
                        return (
                            <div key={major.id} className={`relative group rounded-lg overflow-hidden border-2 transition-all duration-300 ${isAvailable ? 'border-yellow-600/50 hover:border-yellow-400 hover:scale-105 hover:shadow-xl' : 'border-stone-800 bg-stone-950 opacity-60'}`}>
                                <div className="aspect-[2/3] bg-stone-800 relative flex items-center justify-center">
                                    {isAvailable ? (
                                        <img 
                                            src={`/assets/majors/${major.id}.png`} 
                                            alt={major.name}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                            }}
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                                            <span className="text-4xl opacity-20">🔒</span>
                                        </div>
                                    )}
                                    
                                    {/* Fallback for missing images or when unavailable (hidden logic per prompt) */}
                                    <div className={`hidden absolute inset-0 flex flex-col items-center justify-center p-2 text-center ${isAvailable ? '' : 'flex'}`}>
                                        <span className="text-lg font-bold text-stone-300 mb-2">{major.name}</span>
                                        <span className="text-xs text-stone-500">{major.desc}</span>
                                    </div>

                                    {/* Sold Overlay */}
                                    {!isAvailable && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                            <span className="text-red-500 font-black text-3xl border-4 border-red-500 px-4 py-2 -rotate-12 uppercase tracking-widest opacity-80">
                                                Sold
                                            </span>
                                        </div>
                                    )}
                                </div>
                                
                                {isAvailable && (
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 transform translate-y-full group-hover:translate-y-0 transition-transform">
                                        <div className="text-white text-xs font-bold">{major.name}</div>
                                        <div className="text-yellow-400 text-[10px]">Cost: {Object.entries(major.cost).map(([k,v]) => `${v} ${k}`).join(', ')}</div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default MajorGallery;
