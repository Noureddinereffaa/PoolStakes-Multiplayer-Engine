import { useEffect, useState } from 'react';
import { getConnectionMetrics, type ConnectionGrade } from '../utils/connectionQuality';

function getGradeColor(grade: ConnectionGrade): string {
  switch (grade) {
    case 'excellent': return 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]';
    case 'good': return 'bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]';
    case 'poor': return 'bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.5)]';
    case 'dead': return 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]';
  }
}

function getGradeLabel(grade: ConnectionGrade, language: 'en' | 'ar'): string {
  switch (grade) {
    case 'excellent': return language === 'ar' ? 'ممتاز' : 'Excellent';
    case 'good': return language === 'ar' ? 'جيد' : 'Good';
    case 'poor': return language === 'ar' ? 'ضعيف' : 'Poor';
    case 'dead': return language === 'ar' ? 'منقطع' : 'Disconnected';
  }
}

export default function ConnectionStatus({ connectionGrade, isOffline, language }: { connectionGrade: ConnectionGrade | string; isOffline: boolean; language: 'en' | 'ar' }) {
  const [metrics, setMetrics] = useState({ rtt: 0, grade: 'excellent' as ConnectionGrade, packetLoss: 0 });

  useEffect(() => {
    const interval = setInterval(() => {
      const m = getConnectionMetrics();
      setMetrics(m);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  if (isOffline) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_4px_rgba(239,68,68,0.5)]" />
        <span className="text-[9px] font-mono text-red-400 font-bold">{language === 'ar' ? 'غير متصل' : 'OFFLINE'}</span>
      </div>
    );
  }

  const effectiveGrade = connectionGrade as ConnectionGrade || metrics.grade;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/30 border border-amber-900/30">
      <span className={`w-1.5 h-1.5 rounded-full ${getGradeColor(effectiveGrade)}`} />
      <span className="text-[8px] font-mono text-amber-400/80">{getGradeLabel(effectiveGrade, language)}</span>
      {metrics.rtt > 0 && (
        <span className="text-[7px] font-mono text-amber-600/60 ml-0.5">{Math.round(metrics.rtt)}ms</span>
      )}
    </div>
  );
}
