export interface CasinoPerformanceBudget {
  frameBudgetMs: number;
  currentMs: number;
  exceeded: boolean;
  report(costMs: number): void;
  reset(): void;
}

const BUDGET_MS = 2;

export function createCasinoPerformanceBudget(frameBudgetMs = BUDGET_MS): CasinoPerformanceBudget {
  let frameCost = 0;
  let budgetExceeded = false;

  return {
    frameBudgetMs,
    get currentMs() { return frameCost; },
    get exceeded() { return budgetExceeded; },

    report: (costMs: number) => {
      frameCost += costMs;
      if (frameCost > frameBudgetMs) {
        budgetExceeded = true;
      }
    },

    reset: () => {
      frameCost = 0;
      budgetExceeded = false;
    },
  };
}
