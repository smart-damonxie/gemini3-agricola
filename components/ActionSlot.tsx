import React from 'react';
import { Action, Player } from '../types';

interface Props {
  action: Action;
  occupiedBy?: Player;
  onClick: () => void;
}

const ActionSlot: React.FC<Props> = ({ action, occupiedBy, onClick }) => {
  return (
    <div
      onClick={!occupiedBy ? onClick : undefined}
      className={`
        relative flex flex-col justify-center p-2 rounded border-2 min-h-[50px] transition-all duration-100 cursor-pointer shadow-sm
        ${occupiedBy 
          ? 'bg-neutral-700 border-neutral-600 cursor-not-allowed opacity-80' 
          : 'bg-stone-300 border-stone-500 text-stone-900 hover:bg-white hover:-translate-y-0.5 hover:border-yellow-500 active:translate-y-0'}
      `}
      style={occupiedBy ? { borderLeftWidth: '6px', borderLeftColor: occupiedBy.color } : {}}
    >
      {action.acc && action.cur !== undefined && (
        <div className="absolute -top-2 -right-2 bg-red-700 text-white text-[10px] px-1.5 rounded-full border border-white shadow-sm z-10">
          {action.cur}
        </div>
      )}
      
      <div className="font-bold text-sm leading-tight">
        {action.name}
      </div>
      
      {occupiedBy && (
        <div className="text-[10px] mt-1" style={{ color: occupiedBy.color }}>
          {occupiedBy.name}
        </div>
      )}
      
      {action.desc && !occupiedBy && (
        <div className="text-[10px] text-stone-600 leading-none mt-1">{action.desc}</div>
      )}
    </div>
  );
};

export default ActionSlot;