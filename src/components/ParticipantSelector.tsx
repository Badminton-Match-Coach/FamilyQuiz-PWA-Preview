import React from 'react';
import { Participant } from '../types';

interface ParticipantSelectorProps {
  participants: Participant[];
  onSelect: (participantId: string) => void;
  onCancel: () => void;
}

export const ParticipantSelector: React.FC<ParticipantSelectorProps> = ({ participants, onSelect, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
        <h2 className="text-xl font-bold mb-4">Vem svarar?</h2>
        <div className="space-y-2">
          {participants.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="w-full p-3 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
            >
              {p.name}
            </button>
          ))}
          <button
            onClick={onCancel}
            className="w-full p-3 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition mt-2"
          >
            Avbryt
          </button>
        </div>
      </div>
    </div>
  );
};
