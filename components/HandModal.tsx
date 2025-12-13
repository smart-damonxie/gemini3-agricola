import React from 'react';
import { Card, Player } from '../types';

interface Props {
  cards: Card[];
  player: Player;
  onSelect?: (cardId: string) => void;
  onClose: () => void; // Used for "Pass" or "Close View"
  onCancel?: () => void; // Used for "Undo"
  title: string;
  readOnly?: boolean;
}

const HandModal: React.FC<Props> = ({ cards, player, onSelect, onClose, onCancel, title, readOnly = false }) => {
  const isMeeting = player.tempMode?.mode === 'play_minor_optional';

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn" onClick={readOnly ? onClose : onCancel}>
      <div className="bg-stone-900 border-4 border-yellow-700 rounded-xl p-6 max-w-4xl w-full flex flex-col shadow-2xl relative max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6 pb-2 border-b border-yellow-700/50">
          <h2 className="text-3xl font-bold text-yellow-500 tracking-wider">
            {title}
          </h2>
          <button onClick={readOnly ? onClose : onCancel} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-4 gap-4 p-2 scrollbar-thin scrollbar-thumb-stone-600">
            {cards.length === 0 && (
                <div className="col-span-4 text-center text-gray-500 py-10">You have no matching cards in hand.</div>
            )}
            {cards.map(card => {
                let canAfford = true;
                let conditionFailed = false;
                let conditionMsg = "";

                // In readOnly mode, we don't care about affordability for selection purposes, but visual feedback is still nice
                if (!readOnly) {
                    Object.entries(card.cost).forEach(([k, v]) => {
                        // @ts-ignore
                        if (player.res[k] < v) canAfford = false;
                    });
                    
                    if (card.condition) {
                        if (card.condition.minOccupations) {
                             const playedOccs = player.playedCards.filter(c => c.type === 'occupation').length;
                             if (playedOccs < card.condition.minOccupations) {
                                 conditionFailed = true;
                                 conditionMsg = `Needs ${card.condition.minOccupations} Occs`;
                             }
                        }
                        if (card.condition.fullFarm) {
                             const emptyTiles = player.farm.filter(t => t === 0).length;
                             if (emptyTiles > 0) {
                                 conditionFailed = true;
                                 conditionMsg = "Full Farm Req";
                             }
                        }
                    }
                }
                
                const disabled = !readOnly && (!canAfford || conditionFailed);

                return (
                    <div 
                        key={card.id} 
                        onClick={() => (!disabled && onSelect) && onSelect(card.id)}
                        className={`
                            relative rounded-lg overflow-hidden border-2 transition-all duration-200 p-3 flex flex-col
                            ${!disabled
                                ? 'cursor-pointer hover:border-green-500 hover:scale-105 bg-stone-800' 
                                : 'bg-stone-900 border-stone-800'}
                            ${disabled ? 'opacity-50 grayscale cursor-not-allowed' : ''}
                            ${card.type === 'occupation' ? 'border-yellow-600/60' : 'border-orange-600/60'}
                        `}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${card.type === 'occupation' ? 'bg-yellow-900 text-yellow-200' : 'bg-orange-900 text-orange-200'}`}>
                                {card.type === 'occupation' ? 'Occ' : 'Minor'}
                            </span>
                            <div className="text-[10px] text-white bg-black/50 px-1 rounded">
                                {Object.entries(card.cost).length === 0 ? 'Free' : Object.entries(card.cost).map(([k,v]) => `${v} ${k}`).join(', ')}
                            </div>
                        </div>
                        
                        <h3 className="text-sm font-bold text-white mb-1 leading-tight">{card.name}</h3>
                        <p className="text-[10px] text-gray-400 leading-snug flex-1">{card.desc}</p>
                        
                        {card.score > 0 && (
                            <div className="mt-2 self-end text-yellow-400 font-bold text-xs">
                                🌟 {card.score} VP
                            </div>
                        )}
                        
                        {!readOnly && !canAfford && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <span className="text-red-400 font-bold text-xs uppercase border border-red-400 px-2 py-1 rotate-12">Too Expensive</span>
                            </div>
                        )}
                        
                        {!readOnly && conditionFailed && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <span className="text-orange-400 font-bold text-xs uppercase border border-orange-400 px-2 py-1 rotate-12">{conditionMsg}</span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
        
        <div className="mt-4 flex justify-between items-center border-t border-stone-700 pt-4">
             {readOnly ? (
                 <div className="w-full flex justify-end">
                     <button 
                         onClick={onClose} 
                         className="px-6 py-2 bg-stone-700 hover:bg-stone-600 text-white rounded shadow font-bold text-sm"
                     >
                         Close
                     </button>
                 </div>
             ) : (
                 <>
                     {/* Left: Cancel Action (Undo) */}
                     <button 
                         onClick={onCancel} 
                         className="px-6 py-2 bg-red-900/50 hover:bg-red-800 text-red-200 rounded shadow font-bold text-sm border border-red-800"
                     >
                         Cancel Action
                     </button>

                     {/* Right: Pass/Skip Playing Card (Only for Meeting) */}
                     {isMeeting ? (
                         <button 
                            onClick={onClose} 
                            className="px-6 py-2 bg-stone-700 hover:bg-stone-600 text-white rounded shadow font-bold text-sm"
                         >
                             Don't Play Card
                         </button>
                     ) : (
                         <div className="text-stone-500 text-xs italic">Select a card to play or cancel action.</div>
                     )}
                 </>
             )}
        </div>
      </div>
    </div>
  );
};

export default HandModal;