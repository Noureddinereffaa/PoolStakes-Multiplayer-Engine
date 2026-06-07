import React from 'react';
import { MatchHistory as MatchType } from '../types';
import { History, Target, TrendingUp, Cpu } from 'lucide-react';

interface MatchHistoryProps {
  history: MatchType[];
}

export default function MatchHistory({ history }: MatchHistoryProps) {
  const totalCommission = history.reduce((acc, curr) => acc + curr.commission, 0);
  const totalPrizePaid = history.reduce((acc, curr) => acc + curr.prizeAmount, 0);

  return (
    <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 shadow-xl flex flex-col gap-4">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-400" /> LARAVEL-DATABASE MATCH TRANSACTION LEDGER
        </h3>
        <span className="text-xs bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded-full font-mono border border-emerald-900">
          Match Total: {history.length}
        </span>
      </div>

      {/* Overview Stat Box */}
      {history.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-slate-950 p-4 border border-slate-800 rounded-lg">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-slate-500 font-mono text-slate-400/70">TOTAL COMMISSIONS TO SITE</span>
            <span className="text-sm font-bold text-emerald-400 font-mono">${totalCommission.toFixed(2)}</span>
          </div>
          <div className="flex flex-col gap-0.5 border-l border-slate-800 pl-4">
            <span className="text-[10px] text-slate-500 font-mono text-slate-400/70">TOTAL PAID OUT PRIZES</span>
            <span className="text-sm font-bold text-sky-400 font-mono">${totalPrizePaid.toFixed(2)}</span>
          </div>
          <div className="hidden md:flex flex-col gap-0.5 border-l border-slate-800 pl-4">
            <span className="text-[10px] text-slate-500 font-mono text-slate-400/70">LEDGER STATUS FLAG</span>
            <span className="text-xs text-slate-300 font-mono flex items-center gap-1 mt-0.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400 animate-pulse" /> Live Synchronization
            </span>
          </div>
        </div>
      ) : null}

      {/* History List */}
      <div className="flex flex-col gap-2.5 max-h-[350px] overflow-auto">
        {history.length === 0 ? (
          <div className="text-center py-6 text-slate-505 font-mono text-xs text-slate-500 italic">
            No completed matches in database. Shoot the 8-ball into a pocket legally to trigger payouts!
          </div>
        ) : (
          history.map((m) => (
            <div
              key={m.id}
              className="p-3 bg-slate-950 border border-slate-850 hover:border-slate-800 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-3 transition-colors"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-slate-200 font-mono">{m.winnerName}</span>
                  <span className="text-[10px] text-emerald-400 font-mono">beat</span>
                  <span className="text-xs font-semibold text-slate-400 font-mono">{m.loserName}</span>

                  {(m.winnerName === 'Authoritative_AI_Bot' || m.loserName === 'Authoritative_AI_Bot') && (
                    <span className="text-[8px] uppercase bg-amber-500/10 text-amber-500 px-1 rounded border border-amber-500/20 flex items-center gap-0.5 font-mono">
                      <Cpu className="w-2.5 h-2.5" /> bot_match
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  Room: {m.roomName} • Timestamp: {m.timestamp}
                </div>
              </div>

              <div className="flex items-center gap-2 md:text-right md:flex-col md:items-end self-stretch md:self-auto border-t md:border-t-0 border-slate-900 pt-2 md:pt-0">
                <div className="flex items-center gap-1.5 md:flex-row-reverse text-xs">
                  <span className="text-[10px] text-slate-400 font-mono">Prize Paid:</span>
                  <span className="font-bold text-emerald-400 font-mono">${m.prizeAmount.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-1.5 md:flex-row-reverse text-[10px] text-slate-500 font-mono">
                  <span>Commission:</span>
                  <span className="text-amber-500">${m.commission.toFixed(2)} (5%)</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
