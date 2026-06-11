export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`w-6 h-6 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin ${className}`} />
  );
}

export function PageLoader() {
  return (
    <div className="fixed inset-0 z-[9999] bg-[#0a0a0f] flex items-center justify-center">
      <Spinner className="w-10 h-10 border-[3px]" />
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/5 bg-[#0a0a0f] p-5 space-y-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
