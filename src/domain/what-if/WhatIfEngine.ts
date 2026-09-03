import {
  Account,
  Budget,
  Category,
  MoneyCommitment,
  SavingsGoal,
  Transaction,
  UserSettings,
  WhatIfSimulationInput,
  WhatIfSimulationResult,
} from '../../types';
import { DateUtils } from '../date/DateUtils';
import { MoneyValue } from '../money/MoneyValue';
import { SafeToSpendEngine } from '../safe-to-spend/SafeToSpendEngine';
import { BudgetEngine } from '../budget/BudgetEngine';
import { TimelineEngine } from '../timeline/TimelineEngine';
import { RiskEngine } from '../risk/RiskEngine';

export class WhatIfEngine {
  /**
   * Simulates a hypothetical financial decision in strict isolation without mutating any persistent state.
   */
  public static simulateScenario(
    input: WhatIfSimulationInput,
    accounts: Account[],
    transactions: Transaction[],
    budgets: Budget[],
    goals: SavingsGoal[],
    commitments: MoneyCommitment[],
    categories: Category[],
    settings: UserSettings,
    referenceDateISO?: string
  ): WhatIfSimulationResult {
    const todayISO = referenceDateISO || DateUtils.getTodayISO();
    const currency = settings.currency || accounts[0]?.currency || 'PKR';
    const monthEndISO = DateUtils.getMonthEndISO(todayISO);

    // 1. Base calculations before simulation
    const baseSafeToSpend = SafeToSpendEngine.calculateSafeToSpend(
      accounts,
      commitments,
      goals,
      settings,
      todayISO
    );

    const baseTimeline = TimelineEngine.generateTimeline(
      accounts,
      transactions,
      commitments,
      categories,
      todayISO,
      DateUtils.addDaysISO(todayISO, 30),
      todayISO
    );
    const baseMonthEndDay = baseTimeline.find((d) => d.date === monthEndISO) || baseTimeline[baseTimeline.length - 1];
    const baseMonthEndBalance = baseMonthEndDay ? baseMonthEndDay.projectedEndOfDayBalance : baseSafeToSpend.totalAvailableBalance;

    // 2. Clone state for simulation
    const simAccounts: Account[] = accounts.map((a) => {
      if (a.id === input.accountId) {
        let newBalance = a.currentBalance;
        if (input.type === 'EXPENSE') {
          newBalance -= input.amount;
        } else if (input.type === 'INCOME') {
          newBalance += input.amount;
        }
        return { ...a, currentBalance: newBalance };
      }
      return { ...a };
    });

    // Create simulated transaction
    const simTx: Transaction = {
      id: 'sim-tx-0',
      userId: 'user-sim',
      type: input.type === 'INCOME' || input.type === 'RECURRING_INCOME' ? 'INCOME' : 'EXPENSE',
      amount: input.amount,
      currency,
      categoryId: input.categoryId,
      accountId: input.accountId,
      merchant: `Simulated: ${input.title}`,
      date: input.date || todayISO,
      tags: ['simulated'],
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const simTransactions = [...transactions, simTx];

    // If recurring or future commitment
    const simCommitments = [...commitments];
    if (input.type === 'RECURRING_EXPENSE' || input.type === 'RECURRING_INCOME') {
      simCommitments.push({
        id: 'sim-comm-0',
        userId: 'user-sim',
        title: input.title,
        type: input.type === 'RECURRING_EXPENSE' ? 'BILL' : 'EXPECTED_INCOME',
        amount: input.amount,
        currency,
        direction: input.type === 'RECURRING_EXPENSE' ? 'OUTFLOW' : 'INFLOW',
        status: 'PROJECTED',
        dueDate: input.date || todayISO,
        accountId: input.accountId,
        categoryId: input.categoryId,
        priority: 'ESSENTIAL',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // 3. Re-evaluate Safe-to-Spend in simulated world
    const simSafeToSpend = SafeToSpendEngine.calculateSafeToSpend(
      simAccounts,
      simCommitments,
      goals,
      settings,
      todayISO
    );

    // 4. Re-evaluate Budgets
    const affectedBudgets: WhatIfSimulationResult['affectedBudgets'] = [];
    for (const b of budgets) {
      if (!b.isActive) continue;
      const isRelevant = b.categoryIds.length === 0 || b.categoryIds.includes(input.categoryId);
      if (!isRelevant) continue;

      const baseForecast = BudgetEngine.calculateBudgetForecast(b, transactions, todayISO);
      const simForecast = BudgetEngine.calculateBudgetForecast(b, simTransactions, todayISO);

      affectedBudgets.push({
        budgetId: b.id,
        budgetName: b.name,
        originalProjectedSpent: baseForecast.projectedMonthEndSpent,
        simulatedProjectedSpent: simForecast.projectedMonthEndSpent,
        budgetAmount: b.amount,
        wasOverBudget: baseForecast.projectedMonthEndSpent > b.amount,
        willBeOverBudget: simForecast.projectedMonthEndSpent > b.amount,
      });
    }

    // 5. Re-evaluate Timeline & Risks
    const simTimeline = TimelineEngine.generateTimeline(
      simAccounts,
      simTransactions,
      simCommitments,
      categories,
      todayISO,
      DateUtils.addDaysISO(todayISO, 30),
      todayISO
    );

    const simMonthEndDay = simTimeline.find((d) => d.date === monthEndISO) || simTimeline[simTimeline.length - 1];
    const simMonthEndBalance = simMonthEndDay ? simMonthEndDay.projectedEndOfDayBalance : simSafeToSpend.totalAvailableBalance;

    const baseRisks = RiskEngine.detectCashFlowRisks(accounts, baseTimeline, commitments, goals, settings, todayISO);
    const simRisks = RiskEngine.detectCashFlowRisks(simAccounts, simTimeline, simCommitments, goals, settings, todayISO);

    // Filter newly triggered risks
    const baseRiskIds = new Set(baseRisks.map((r) => r.id));
    const newRisks = simRisks.filter((r) => !baseRiskIds.has(r.id));

    // 6. Impact on goals
    const affectedGoals: WhatIfSimulationResult['affectedGoals'] = [];
    if (simSafeToSpend.isDeficit && goals.length > 0) {
      for (const g of goals) {
        if (g.currentAmount < g.targetAmount) {
          affectedGoals.push({
            goalId: g.id,
            goalName: g.name,
            impactDescription: `May require pausing ${MoneyValue.fromMinorUnits(g.targetAmount / 12, currency).format()} monthly contribution due to cash-flow pressure.`,
          });
        }
      }
    }

    // 7. Calculate deltas & verdict
    const safeToSpendDelta = simSafeToSpend.dailySafeToSpend - baseSafeToSpend.dailySafeToSpend;
    const balanceDelta = simMonthEndBalance - baseMonthEndBalance;

    let verdict: 'SAFE' | 'CAUTION' | 'HIGH_RISK' = 'SAFE';
    let summarySentence = '';

    const amountMoney = MoneyValue.fromMinorUnits(input.amount, currency);
    const deltaMoney = MoneyValue.fromMinorUnits(Math.abs(safeToSpendDelta), currency);

    if (newRisks.some((r) => r.severity === 'CRITICAL') || simSafeToSpend.isDeficit) {
      verdict = 'HIGH_RISK';
      summarySentence = `Spending ${amountMoney.format()} triggers a cash-flow deficit or overdraft risk this month.`;
    } else if (affectedBudgets.some((b) => !b.wasOverBudget && b.willBeOverBudget) || newRisks.length > 0) {
      verdict = 'CAUTION';
      summarySentence = `This expense pushes your budget over limit and reduces daily Safe-to-Spend by ${deltaMoney.format()}/day.`;
    } else {
      verdict = 'SAFE';
      summarySentence = `Comfortable purchase! Safe-to-Spend adjusts by ${deltaMoney.format()}/day with healthy safety reserves intact.`;
    }

    return {
      input,
      baseSafeToSpendDaily: baseSafeToSpend.dailySafeToSpend,
      simulatedSafeToSpendDaily: simSafeToSpend.dailySafeToSpend,
      safeToSpendDelta,
      baseMonthEndProjectedBalance: baseMonthEndBalance,
      simulatedMonthEndProjectedBalance: simMonthEndBalance,
      balanceDelta,
      affectedBudgets,
      affectedGoals,
      newRisks,
      verdict,
      summarySentence,
    };
  }
}
