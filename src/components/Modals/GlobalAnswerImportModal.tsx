import React, { useState, useMemo } from 'react';
import { X, Download, Clipboard, CheckCircle2, AlertTriangle, Users, FileCheck2, HelpCircle, ArrowRight } from 'lucide-react';
import { Language, t } from '../../i18n';
import { QuizConfig } from '../../types';
import {
  parseParticipantAnswerPayload,
  isQuizMatch,
  isQuizCodeOrUrl,
  ParticipantAnswerPayload
} from '../../utils/answerSharing';

export interface GlobalAnswerImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  quizConfig: QuizConfig;
  onImportPayload: (payload: ParticipantAnswerPayload) => void;
  onLoadQuizCode?: (code: string) => void;
}

export const GlobalAnswerImportModal: React.FC<GlobalAnswerImportModalProps> = ({
  isOpen,
  onClose,
  lang,
  quizConfig,
  onImportPayload,
  onLoadQuizCode
}) => {
  const [inputVal, setInputVal] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const detectedPayload = useMemo<ParticipantAnswerPayload | null>(() => {
    if (!inputVal.trim()) return null;
    return parseParticipantAnswerPayload(inputVal);
  }, [inputVal]);

  const looksLikeQuiz = useMemo<boolean>(() => {
    if (!inputVal.trim() || detectedPayload) return false;
    return isQuizCodeOrUrl(inputVal);
  }, [inputVal, detectedPayload]);

  const quizMatches = useMemo<boolean>(() => {
    if (!detectedPayload) return false;
    return isQuizMatch(detectedPayload, quizConfig);
  }, [detectedPayload, quizConfig]);

  if (!isOpen) return null;

  const handlePasteFromClipboard = async () => {
    setStatusMessage(null);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setInputVal(text.trim());
          return;
        }
      }
      setStatusMessage(
        lang === 'sv'
          ? 'Kunde inte läsa automatiskt från urklipp. Klistra in manuellt i textrutan.'
          : 'Could not read automatically from clipboard. Please paste manually.'
      );
    } catch {
      setStatusMessage(
        lang === 'sv'
          ? 'Kunde inte komma åt urklipp. Klistra in manuellt i textrutan med Ctrl+V eller långtryck.'
          : 'Could not access clipboard. Please paste manually into the text box.'
      );
    }
  };

  const handleConfirmImport = () => {
    setStatusMessage(null);
    const trimmed = inputVal.trim();
    if (!trimmed) {
      setStatusMessage(
        lang === 'sv'
          ? 'Klistra in en svarslänk eller kod i rutan först.'
          : 'Please paste an answer link or code first.'
      );
      return;
    }

    const payload = detectedPayload || parseParticipantAnswerPayload(trimmed);

    if (!payload) {
      if (looksLikeQuiz) {
        setStatusMessage(
          lang === 'sv'
            ? 'Detta ser ut att vara en tipspromenad (frågor), inte deltagarsvar! För att skicka in svar måste deltagaren trycka på "Skicka in våra svar" i sin tipspromenad och skicka den länken.'
            : 'This appears to be a quiz (questions), not participant answers! To share answers, participants must click "Submit our answers" in their quiz.'
        );
      } else {
        setStatusMessage(
          lang === 'sv'
            ? 'Kunde inte känna igen några deltagarsvar i texten. Kontrollera att hela länken eller koden kopierades (börjar vanligtvis med https://...#qps= eller qps=).'
            : 'Could not recognize any participant answers in the input. Please ensure you copied the complete link (starts with #qps= or qps=).'
        );
      }
      return;
    }

    if (!quizMatches && payload.title) {
      const confirmMsg =
        t(lang, 'answerImportQuizMismatchConfirm', {
          title: payload.title,
          currentTitle: quizConfig.title || 'Tipspromenad'
        }) ||
        `Svaren är märkta för "${payload.title}". Vill du läsa in dem till det aktiva quizet ("${quizConfig.title}") ändå?`;

      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    onImportPayload(payload);
    setInputVal('');
    setStatusMessage(null);
    onClose();
  };

  const handleLoadAsQuiz = () => {
    if (onLoadQuizCode && inputVal.trim()) {
      onLoadQuizCode(inputVal.trim());
      onClose();
    }
  };

  const participantsCount = detectedPayload?.participants?.length || 0;
  const answersCount = detectedPayload?.answers?.length || 0;
  const hasInput = inputVal.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-slate-100 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-lg">
                {t(lang, 'importAnswersModalTitle') || 'Läs in deltagarsvar'}
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                {t(lang, 'importAnswersModalDesc') || 'Klistra in länken eller koden med svar från deltagarna'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input Area */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black text-slate-600 uppercase tracking-wider">
              {lang === 'sv' ? 'Svarslänk eller svarskod' : 'Answer link or code'}
            </label>
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              className="text-xs font-black text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors"
            >
              <Clipboard className="w-3.5 h-3.5" />
              <span>{t(lang, 'pasteFromClipboardBtn') || 'Klistra in från urklipp'}</span>
            </button>
          </div>

          <textarea
            value={inputVal}
            onChange={e => {
              setInputVal(e.target.value);
              if (statusMessage) setStatusMessage(null);
            }}
            placeholder={
              lang === 'sv'
                ? 'Klistra in hela länken (t.ex. https://...#qps=...) eller texten från deltagarna här...'
                : 'Paste the full link (e.g. https://...#qps=...) or message here...'
            }
            rows={4}
            className={`w-full p-3.5 rounded-2xl border text-xs font-mono focus:ring-2 focus:outline-none transition-all placeholder:text-slate-400 ${
              detectedPayload
                ? 'border-emerald-300 bg-emerald-50/20 focus:ring-emerald-500'
                : looksLikeQuiz
                ? 'border-amber-300 bg-amber-50/20 focus:ring-amber-500'
                : 'border-slate-200 focus:ring-indigo-500'
            }`}
          />

          {statusMessage && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{statusMessage}</p>
                {looksLikeQuiz && onLoadQuizCode && (
                  <button
                    type="button"
                    onClick={handleLoadAsQuiz}
                    className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    <span>{lang === 'sv' ? 'Läs in som tipspromenad istället' : 'Load as quiz instead'}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {!hasInput && !statusMessage && (
            <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
              <HelpCircle className="w-3.5 h-3.5 shrink-0 text-slate-300" />
              <span>
                {lang === 'sv'
                  ? 'Deltagarna skapar länken genom att trycka på "Skicka in våra svar" i sin tipspromenad.'
                  : 'Participants create this link by tapping "Submit our answers" in their quiz.'}
              </span>
            </p>
          )}

          {hasInput && !detectedPayload && !looksLikeQuiz && !statusMessage && (
            <p className="text-[11px] text-indigo-600 font-medium flex items-center gap-1 mt-1">
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>
                {lang === 'sv'
                  ? 'Klicka på "Läs in svar" nedan för att tolka koden.'
                  : 'Click "Import answers" below to process the code.'}
              </span>
            </p>
          )}

          {hasInput && looksLikeQuiz && !statusMessage && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {lang === 'sv'
                    ? 'Detta ser ut som ett quiz (frågor), inte deltagarsvar.'
                    : 'This appears to be a quiz (questions), not answers.'}
                </span>
              </div>
              {onLoadQuizCode && (
                <button
                  type="button"
                  onClick={handleLoadAsQuiz}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold shrink-0 cursor-pointer transition-colors"
                >
                  {lang === 'sv' ? 'Ladda quiz' : 'Load quiz'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Live Detected Payload Preview */}
        {detectedPayload && (
          <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 space-y-2.5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-black text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{lang === 'sv' ? 'Giltiga deltagarsvar funna!' : 'Valid answers detected!'}</span>
              </div>
              {detectedPayload.title && (
                <span className="text-[10px] font-black bg-white px-2 py-0.5 rounded-full border border-emerald-200 text-emerald-800 truncate max-w-[180px]">
                  {detectedPayload.title}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-white border border-emerald-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500 shrink-0" />
                <div>
                  <div className="font-black text-slate-800">{participantsCount}</div>
                  <div className="text-[10px] text-slate-400 font-medium">{lang === 'sv' ? 'Deltagare' : 'Participants'}</div>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-emerald-100 flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <div>
                  <div className="font-black text-slate-800">{answersCount}</div>
                  <div className="text-[10px] text-slate-400 font-medium">{lang === 'sv' ? 'Registrerade svar' : 'Recorded answers'}</div>
                </div>
              </div>
            </div>

            {detectedPayload.participants && detectedPayload.participants.length > 0 && (
              <div className="pt-1">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                  {lang === 'sv' ? 'Deltagare i svaret:' : 'Included participants:'}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {detectedPayload.participants.map((p, idx) => (
                    <span
                      key={p.id || idx}
                      className="px-2 py-0.5 rounded-md bg-white text-indigo-700 text-[11px] font-bold border border-indigo-100 shadow-2xs"
                    >
                      {p.name || t(lang, 'defaultParticipantName')}
                      <span className="text-[9px] text-indigo-400 ml-1">({p.type === 'barn' ? 'Barn' : 'Vuxen'})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {!quizMatches && (
              <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  {lang === 'sv'
                    ? `Obs! Svaren är märkta för "${detectedPayload.title || 'annat quiz'}". När du klickar på läs in kommer de att sparas till det aktuella quizet.`
                    : `Note: Answers are tagged for "${detectedPayload.title || 'another quiz'}". They will be imported into the current quiz.`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-black text-xs text-slate-600 cursor-pointer transition-colors"
          >
            {t(lang, 'cancel') || 'Avbryt'}
          </button>
          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={!hasInput}
            className={`px-5 py-2.5 rounded-xl font-black text-xs text-white flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer ${
              detectedPayload
                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                : hasInput
                ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
                : 'bg-slate-300 opacity-50 pointer-events-none'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>
              {detectedPayload
                ? lang === 'sv'
                  ? `Läs in ${participantsCount} deltagare och svar`
                  : `Import ${participantsCount} participants & answers`
                : t(lang, 'importAnswersBtn') || 'Läs in svar'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
