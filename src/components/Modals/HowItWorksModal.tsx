/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle, X, Users, MapPin, Trophy, Mail } from 'lucide-react';
import { Language, t } from '../../i18n';

export interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const HowItWorksModal: React.FC<HowItWorksModalProps> = ({ isOpen, onClose, lang }) => {
  if (!isOpen) return null;

  const content = {
    sv: {
      title: 'Så här deltar du',
      subtitle: 'Så här deltar du i tipspromenaden',
      step1Title: 'Välj eller lägg till deltagare',
      step1Desc: 'Börja med att välja ditt namn eller lag. Välj om du deltar som Barn 👶 eller Vuxen 🧑 för att få åldersanpassade frågor.',
      step2Title: 'Gå tipspromenaden & svara',
      step2Desc: 'Använd kartan för att hitta stationerna. Klicka på en fråga för att läsa och besvara (1X2, poäng eller fritext). Om quizet kräver ordning besvarar du fråga 1, 2, 3... i tur och ordning.',
      step3Title: 'Se resultat, facit & diplom',
      step3Desc: 'När alla har besvarat frågorna (eller med rätt quiz-lösenord) låses facit och slutresultat upp. Följ din rutt på GPS-kartan och hämta ditt personliga diplom!',
      footer: 'Inställningar och skapande av nya quiz nås via menyvalet Redigera (kräver app-lösenord).'
    },
    en: {
      title: 'How It Works',
      subtitle: 'How to participate in the quiz walk',
      step1Title: 'Choose or Add Participant',
      step1Desc: 'Start by selecting your name or team. Choose whether you participate as Child 👶 or Adult 🧑 to receive age-appropriate questions.',
      step2Title: 'Walk the Trail & Answer',
      step2Desc: 'Use the map to find the stations. Tap a question to read and answer (1X2, point or free-text). If sequential order is required, answer questions 1, 2, 3... in order.',
      step3Title: 'View Results, Key & Diploma',
      step3Desc: 'Once everyone has answered (or with the quiz password), the answer key and final results unlock. Trace your path on the GPS map and claim your personal diploma!',
      footer: 'Settings and quiz creation are available under Edit (requires app password).'
    },
    fr: {
      title: 'Comment ça marche',
      subtitle: 'Comment participer à la balade-quiz',
      step1Title: 'Choisir ou ajouter un participant',
      step1Desc: 'Commencez par sélectionner votre nom ou équipe. Choisissez Enfant 👶 ou Adulte 🧑 pour des questions adaptées.',
      step2Title: 'Parcourir le sentier et répondre',
      step2Desc: 'Utilisez la carte pour trouver les stations. Appuyez sur une question pour répondre (1X2, points ou texte libre).',
      step3Title: 'Voir les résultats, corrigé et diplôme',
      step3Desc: 'Une fois que tout le monde a répondu (ou avec le mot de passe), le corrigé et les résultats se déverrouillent. Récupérez votre diplôme !',
      footer: 'Les paramètres et la création de quiz sont disponibles sous Édition (nécessite le mot de passe de l\'application).'
    },
    es: {
      title: 'Cómo funciona',
      subtitle: 'Cómo participar en el recorrido',
      step1Title: 'Elegir o añadir participante',
      step1Desc: 'Comienza seleccionando tu nombre o equipo. Elige si participas como Niño 👶 o Adulto 🧑 para recibir preguntas adaptadas.',
      step2Title: 'Recorrer la ruta y responder',
      step2Desc: 'Usa el mapa para encontrar las estaciones. Toca una pregunta para responder (1X2, puntos o texto libre).',
      step3Title: 'Ver resultados, respuestas y diploma',
      step3Desc: 'Una vez que todos hayan respondido (o con la contraseña), las respuestas y resultados se desbloquearán. ¡Obtén tu diploma!',
      footer: 'La configuración y creación de cuestionarios están disponibles en Editar (requiere contraseña de la aplicación).'
    }
  };

  const c = content[lang] || content.sv;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl border border-slate-200 overflow-hidden max-w-lg w-full"
        >
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 text-white relative">
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-3">
              <HelpCircle className="w-6 h-6" />
            </div>
            <h3 className="text-xl sm:text-2xl font-black">{c.title}</h3>
            <p className="text-xs text-indigo-100 font-medium mt-1">
              {c.subtitle}
            </p>
          </div>

          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Step 1 */}
            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100">
              <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shrink-0 font-black text-sm shadow-md">
                1
              </div>
              <div className="space-y-1">
                <h4 className="font-black text-sm text-slate-800 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  {c.step1Title}
                </h4>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  {c.step1Desc}
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-amber-50/70 border border-amber-100">
              <div className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center shrink-0 font-black text-sm shadow-md">
                2
              </div>
              <div className="space-y-1">
                <h4 className="font-black text-sm text-slate-800 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-600" />
                  {c.step2Title}
                </h4>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  {c.step2Desc}
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100">
              <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shrink-0 font-black text-sm shadow-md">
                3
              </div>
              <div className="space-y-1">
                <h4 className="font-black text-sm text-slate-800 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-emerald-600" />
                  {c.step3Title}
                </h4>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  {c.step3Desc}
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-3">
            <div className="text-center text-[10px] text-slate-400 font-medium space-y-1">
              <p>&copy; 2026 B-G Luttrén &bull; {c.footer}</p>
              <div>
                <a 
                  href="mailto:bo-goran@luttren.nu?subject=FamilyQuizPWA"
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-black text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl border border-indigo-100 mt-1"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>bo-goran@luttren.nu</span>
                </a>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase shadow-md transition-all active:scale-95"
            >
              {t(lang, 'confirm')}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
