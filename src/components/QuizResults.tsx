import React from 'react';
import { Participant, Question, AnswerRecord } from '../types';

interface QuizResultsProps {
  participants: Participant[];
  questions: Question[];
  answers: AnswerRecord[];
}

export const QuizResults: React.FC<QuizResultsProps> = ({ participants, questions, answers }) => {
  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Resultat</h2>
      <div className="space-y-4">
        {questions.map((q, qIdx) => (
          <div key={q.id} className="border p-4 rounded">
            <h3 className="font-bold">{q.text}</h3>
            <p>Rätt svar: {q.options[q.correctAnswers[0]]}</p>
            <div className="mt-2 space-y-1">
              {participants.map(p => {
                const answer = answers.find(a => a.participantId === p.id && a.questionIndex === qIdx);
                return (
                  <div key={p.id} className="flex justify-between">
                    <span>{p.name}: {answer ? (answer.isCorrect ? '✅' : '❌') : '-'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
