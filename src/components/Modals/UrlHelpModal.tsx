/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Link2, Copy, Check, ExternalLink, Globe, FileText, Lock, Sparkles, BookOpen } from 'lucide-react';
import { Language } from '../../i18n';

export interface UrlHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  currentCatalogUrl?: string;
  availableQuizFiles?: string[];
}

export const UrlHelpModal: React.FC<UrlHelpModalProps> = ({
  isOpen,
  onClose,
  lang,
  currentCatalogUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/quizzes/`,
  availableQuizFiles = ['intro_sv.json', 'intro_en.json']
}) => {
  const [selectedCatalog, setSelectedCatalog] = useState(currentCatalogUrl);
  const [selectedFile, setSelectedFile] = useState(availableQuizFiles[0] || 'intro_sv.json');
  const [lockMode, setLockMode] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : 'https://familyquiz.app/';
  
  // Construct dynamic sample link
  const buildSampleUrl = (cat: string, file: string, lock: boolean) => {
    try {
      const u = new URL(origin);
      if (cat) u.searchParams.set('catalog', cat);
      if (file) u.searchParams.set('quizFile', file);
      if (lock) u.searchParams.set('lock', '1');
      return u.toString();
    } catch {
      return `${origin}?catalog=${encodeURIComponent(cat)}&quizFile=${encodeURIComponent(file)}${lock ? '&lock=1' : ''}`;
    }
  };

  const dynamicUrl = buildSampleUrl(selectedCatalog, selectedFile, lockMode);

  const handleCopy = (urlToCopy: string) => {
    navigator.clipboard.writeText(urlToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const isSv = lang === 'sv';

  return (
    <AnimatePresence>
      <div 
        id="url-help-modal-overlay"
        className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          id="url-help-modal-container"
          initial={{ scale: 0.94, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-w-2xl w-full my-6 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-5 sm:p-6 bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-600 text-white flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-xl shadow-inner">
                <Link2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-black text-lg tracking-tight leading-tight">
                  {isSv ? 'Ladda quiz via URL (Katalog + Fil)' : 'Load Quiz via URL (Catalog + File)'}
                </h3>
                <p className="text-xs text-indigo-100 font-medium">
                  {isSv ? 'Dela direktlänkar som öppnar en specifik tipspromenad direkt' : 'Share direct links that launch a specific quiz trail immediately'}
                </p>
              </div>
            </div>
            <button
              id="btn-close-url-help-modal"
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="p-5 sm:p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1 text-slate-700 text-xs">

            {/* Quick overview */}
            <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-indigo-900 font-black text-sm">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span>{isSv ? 'Hur det fungerar' : 'How it works'}</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                {isSv 
                  ? 'Appen kan läsa av webbläsarens adressfält (både ?parametrar och #hash) för att automatiskt ladda ner och starta ett quiz från en katalog på en webbserver utan att användaren behöver importera manuellt.'
                  : 'The app can parse browser URL query parameters and hash to automatically download and launch a quiz trail from an online catalog without manual importing.'}
              </p>
            </div>

            {/* Parameter Reference Table */}
            <div className="space-y-3">
              <h4 className="font-black text-slate-800 text-sm flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-indigo-600" />
                <span>{isSv ? 'Parametrar som stöds' : 'Supported Parameters'}</span>
              </h4>
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs divide-y divide-slate-100">
                <div className="p-3 bg-slate-50 font-bold text-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <span>{isSv ? 'Funktion' : 'Function'}</span>
                  <span>{isSv ? 'Parameter-namn' : 'Parameter names'}</span>
                  <span>{isSv ? 'Exempel' : 'Example'}</span>
                </div>
                <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-indigo-500" />
                    {isSv ? 'Katalog-URL' : 'Catalog URL'}
                  </span>
                  <span className="font-mono text-indigo-600 text-[11px] break-all">
                    catalog, katalog, cat, catalogUrl
                  </span>
                  <span className="text-slate-500 font-mono text-[11px] break-all">
                    https://example.com/quizzes/
                  </span>
                </div>
                <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-500" />
                    {isSv ? 'Quiz-filnamn' : 'Quiz filename'}
                  </span>
                  <span className="font-mono text-purple-600 text-[11px] break-all">
                    quizFile, file, fil, quizfil, loadQuiz, quiz
                  </span>
                  <span className="text-slate-500 font-mono text-[11px] break-all">
                    sommarquiz.json
                  </span>
                </div>
                <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                    {isSv ? 'Låst deltagarläge' : 'Lock to Player Mode'}
                  </span>
                  <span className="font-mono text-amber-600 text-[11px]">
                    lock=1, mode=quiz
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    {isSv ? 'Döljer redigering för deltagare' : 'Hides edit buttons for participants'}
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive Link Builder */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="font-black text-slate-800 text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>{isSv ? 'Interaktiv direktlänks-generator' : 'Interactive Direct Link Builder'}</span>
                </h4>
                <span className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  {isSv ? 'Live-test' : 'Live Test'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">
                    {isSv ? '1. Katalog-URL' : '1. Catalog URL'}
                  </label>
                  <input
                    type="text"
                    value={selectedCatalog}
                    onChange={(e) => setSelectedCatalog(e.target.value)}
                    placeholder="https://example.com/quizzes/"
                    className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-300 bg-white focus:outline-indigo-600 shadow-2xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">
                    {isSv ? '2. Quiz-filnamn' : '2. Quiz Filename'}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={selectedFile}
                      onChange={(e) => setSelectedFile(e.target.value)}
                      placeholder="sommarquiz.json"
                      className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-300 bg-white focus:outline-indigo-600 shadow-2xs"
                    />
                    {availableQuizFiles.length > 0 && (
                      <select
                        aria-label={isSv ? 'Välj quizfil' : 'Select quiz file'}
                        value={selectedFile}
                        onChange={(e) => setSelectedFile(e.target.value)}
                        className="text-xs p-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-mono shrink-0 cursor-pointer shadow-2xs"
                      >
                        {availableQuizFiles.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="chk-lock-mode"
                  type="checkbox"
                  checked={lockMode}
                  onChange={(e) => setLockMode(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded cursor-pointer accent-indigo-600"
                />
                <label htmlFor="chk-lock-mode" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                  {isSv ? 'Lås i deltagarläge (lock=1) så att deltagare inte kan redigera' : 'Lock into participant mode (lock=1) so participants cannot edit'}
                </label>
              </div>

              {/* Dynamic URL output */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <span className="text-[11px] font-bold text-slate-600">
                  {isSv ? 'Färdig direktlänk:' : 'Generated direct link:'}
                </span>
                <div className="p-3 bg-slate-900 text-emerald-400 rounded-xl font-mono text-[11px] break-all select-all shadow-inner leading-relaxed">
                  {dynamicUrl}
                </div>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    id="btn-copy-generated-url"
                    onClick={() => handleCopy(dynamicUrl)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? (isSv ? 'Kopierad! ✓' : 'Copied! ✓') : (isSv ? 'Kopiera direktlänk' : 'Copy Direct Link')}</span>
                  </button>
                  <a
                    href={dynamicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl font-bold text-xs border border-slate-300 flex items-center gap-1.5 shadow-2xs transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{isSv ? 'Testa länk i ny flik' : 'Test Link in New Tab'}</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Ready-to-use Example URLs */}
            <div className="space-y-3">
              <h4 className="font-black text-slate-800 text-sm">
                {isSv ? 'Fler exempel på URL-format' : 'More URL format examples'}
              </h4>

              <div className="space-y-2">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                    <span>{isSv ? '1. Standardlänk (Katalog + Quizfil):' : '1. Standard link (Catalog + Quiz file):'}</span>
                    <button
                      onClick={() => handleCopy(`${origin}?catalog=https://example.com/quizzes/&quizFile=sommarquiz.json`)}
                      className="text-indigo-600 hover:underline font-bold text-[10px]"
                    >
                      {isSv ? 'Kopiera' : 'Copy'}
                    </button>
                  </div>
                  <code className="block font-mono text-[11px] text-slate-600 break-all select-all">
                    {origin}?catalog=https://example.com/quizzes/&amp;quizFile=sommarquiz.json
                  </code>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                    <span>{isSv ? '2. Svenska parametrar (Katalog + Fil):' : '2. Swedish parameters (Katalog + Fil):'}</span>
                    <button
                      onClick={() => handleCopy(`${origin}?katalog=https://example.com/quizzes/&fil=sommarquiz.json`)}
                      className="text-indigo-600 hover:underline font-bold text-[10px]"
                    >
                      {isSv ? 'Kopiera' : 'Copy'}
                    </button>
                  </div>
                  <code className="block font-mono text-[11px] text-slate-600 break-all select-all">
                    {origin}?katalog=https://example.com/quizzes/&amp;fil=sommarquiz.json
                  </code>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                    <span>{isSv ? '3. Relativ katalog på samma webbplats:' : '3. Relative catalog on same domain:'}</span>
                    <button
                      onClick={() => handleCopy(`${origin}?catalog=quizzes/&quizFile=intro_sv.json`)}
                      className="text-indigo-600 hover:underline font-bold text-[10px]"
                    >
                      {isSv ? 'Kopiera' : 'Copy'}
                    </button>
                  </div>
                  <code className="block font-mono text-[11px] text-slate-600 break-all select-all">
                    {origin}?catalog=quizzes/&amp;quizFile=intro_sv.json
                  </code>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                    <span>{isSv ? '4. Låst för deltagare (Döljer redigering):' : '4. Locked for participants (Hides edit):'}</span>
                    <button
                      onClick={() => handleCopy(`${origin}?catalog=https://example.com/quizzes/&quizFile=sommarquiz.json&lock=1`)}
                      className="text-indigo-600 hover:underline font-bold text-[10px]"
                    >
                      {isSv ? 'Kopiera' : 'Copy'}
                    </button>
                  </div>
                  <code className="block font-mono text-[11px] text-slate-600 break-all select-all">
                    {origin}?catalog=https://example.com/quizzes/&amp;quizFile=sommarquiz.json&amp;lock=1
                  </code>
                </div>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
            <button
              id="btn-close-url-help-footer"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white rounded-xl font-bold text-xs transition-all shadow-xs cursor-pointer"
            >
              {isSv ? 'Stäng' : 'Close'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
