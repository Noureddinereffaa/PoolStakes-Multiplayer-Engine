import React from 'react';
import { MatchHistory as MatchType } from '../types';
import { History, TrendingUp, Cpu, Trophy } from 'lucide-react';
import { Lang, t } from '../i18n';

interface Props {
  history: MatchType[];
  language?: Lang;
}

export default function MatchHistory({ history, language = 'en' }: Props) {
  const totalCommission = history.reduce((s, m) => s + m.commission, 0);
  const totalPrizes = history.reduce((s, m) => s + m.prizeAmount, 0);

  return (
    <div className="rounded-2xl border border-white/8 bg-[#12121a] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-black text-white flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-400" />
          {t(language, 'matchTransactionLedgerTitle')}
        </h3>
        <span className="text-xs text-slate-500 font-mono bg-white/5 px-2 py-0.5 rounded-full">
          {history.length} {language === 'ar' ? 'مباراة' : 'matches'}
        </span>
      </div>

      {history.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4 p-3 rounded-xl bg-white/3 border border-white/5">
          <div>
            <div className="text-[10px] text-slate-500 mb-0.5">{t(language, 'totalCommissions')}</div>
            <div className="font-black text-amber-400 text-sm font-mono">${totalCommission.toFixed(2)}</div>
          </div>
          <div className="border-x border-white/5 px-3">
            <div className="text-[10px] text-slate-500 mb-0.5">{t(language, 'totalPrizes')}</div>
            <div className="font-black text-emerald-400 text-sm font-mono">${totalPrizes.toFixed(2)}</div>
          </div>
          <div className="pl-3">
            <div className="text-[10px] text-slate-500 mb-0.5">{t(language, 'ledgerStatusFlag')}</div>
            <div className="text-xs text-slate-300 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              {language === 'ar' ? 'حي' : 'Live'}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {history.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-sm">
            {t(language, 'noCompletedMatches')}
          </div>
        ) : (
          history.map(m => {
            const isBot = m.winnerName === 'Authoritative_AI_Bot' || m.loserName === 'Authoritative_AI_Bot';
            return (
              <div key={m.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-white/5 hover:border-white/10 transition">
                <div className="flex items-center gap-2 min-w-0">
                  <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-200 truncate">
                      {m.winnerName} <span className="text-xs text-slate-500 font-normal">vs</span> {m.loserName}
                    </div>
                    <div className="text-[10px] text-slate-600 font-mono">{m.roomName} • {m.timestamp}</div>
                  </div>
                  {isBot && (
                    <span className="shrink-0 text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 flex items-center gap-0.5">
                      <Cpu className="w-2.5 h-2.5" /> BOT
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0 ml-4">
                  <div className="font-black text-emerald-400 text-sm font-mono">${m.prizeAmount.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-600 font-mono">${m.stake} × 2</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
