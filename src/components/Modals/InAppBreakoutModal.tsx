/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ExternalLink, Copy, Check, X, Compass, Smartphone } from 'lucide-react';
import { Language, t } from '../../i18n';

export interface InAppBreakoutModalProps {
  lang: Language;
}

export const InAppBreakoutModal: React.FC<InAppBreakoutModalProps> = ({ lang }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isInApp, setIsInApp] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
    const isMetaInApp = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line|Twitter|Pinterest|LinkedInApp/i.test(ua);
    
    // Also check sessionStorage if user dismissed it in this session
    const dismissed = sessionStorage.getItem('quiz_breakout_dismissed');
    
    if (isMetaInApp && !dismissed) {
      setIsInApp(true);
      // Automatically show reminder banner after a short delay
      const timer = setTimeout(() => setIsOpen(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!isInApp) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleCopyAndBreakout = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 4000);
      }
      // Try opening in external browser
      window.open(currentUrl, '_blank');
    } catch {
      // ignore
    }
  };

  const handleDismiss = () => {
    setIsOpen(false);
    setIsInApp(false);
    try {
      sessionStorage.setItem('quiz_breakout_dismissed', 'true');
    } catch {
      // ignore
    }
  };

  return (
    <>
      {/* Sticky Top Banner in Messenger/Instagram */}
      {!isOpen && (
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 text-white px-4 py-2.5 shadow-lg flex items-center justify-between gap-3 text-xs sm:text-sm font-bold z-[3000] relative animate-fade-in">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-lg shrink-0">🚀</span>
            <span className="truncate">
              {lang === 'sv' 
                ? 'Öppna i Safari/Chrome för bästa GPS-stöd & funktioner!'
                : 'Open in Safari/Chrome for best GPS & features!'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsOpen(true)}
              className="px-3 py-1 bg-white text-orange-600 rounded-xl text-xs font-black shadow-sm hover:bg-orange-50 transition-colors"
            >
              {lang === 'sv' ? 'Bryt ut ↗' : 'Break out ↗'}
            </button>
            <button
              onClick={handleDismiss}
              className="p-1 text-white/80 hover:text-white rounded-lg"
              title="Stäng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Breakout Instructions Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 text-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xl">
                  🌐
                </div>
                <div>
                  <h3 className="font-black text-lg text-slate-900">
                    {lang === 'sv' ? 'Öppna i din webbläsare' : 'Open in your browser'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {lang === 'sv' ? 'Messenger / Instagram In-App Browser detekterad' : 'Messenger / Instagram In-App Browser detected'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-xs text-amber-900 space-y-2 font-medium leading-relaxed">
              <p className="font-bold flex items-center gap-1.5 text-amber-950 text-sm">
                <span>💡</span>
                <span>{lang === 'sv' ? 'Varför bryta ut?' : 'Why breakout?'}</span>
              </p>
              <p>
                {lang === 'sv'
                  ? 'Inbyggda webbläsare i Facebook/Messenger och Instagram kan begränsa GPS-positionering och lagring. Alla dina promptdata och inställningar följer med automatiskt!'
                  : 'In-app browsers in Facebook/Messenger and Instagram can limit GPS location and storage. All your prompt data and settings carry over automatically!'}
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100 text-xs text-slate-600">
              <p className="font-bold text-slate-800">
                {lang === 'sv' ? 'Gör så här:' : 'How to do it:'}
              </p>
              <ol className="list-decimal list-inside space-y-1.5 font-medium pl-1">
                <li>
                  {lang === 'sv'
                    ? 'Tryck på de tre prickarna (...) eller delningsknappen längst upp till höger.'
                    : 'Tap the three dots (...) or share button at the top right.'}
                </li>
                <li>
                  {lang === 'sv'
                    ? 'Välj "Öppna i Safari" eller "Öppna i Chrome" (eller "Öppna i extern webbläsare").'
                    : 'Select "Open in Safari" or "Open in Chrome".'}
                </li>
              </ol>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleCopyAndBreakout}
                className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{lang === 'sv' ? 'Länk kopierad till urklipp!' : 'Link copied to clipboard!'}</span>
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    <span>{lang === 'sv' ? 'Kopiera länk & öppna i webbläsare' : 'Copy link & open in browser'}</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDismiss}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs transition-colors"
              >
                {lang === 'sv' ? 'Fortsätt här ändå' : 'Continue here anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
