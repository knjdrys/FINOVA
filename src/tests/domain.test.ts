import { describe, it, expect } from 'vitest';
import { MoneyValue } from '../domain/money/MoneyValue';
import { DateUtils } from '../domain/date/DateUtils';
import { AccountEngine } from '../domain/account/AccountEngine';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';
import { SafeToSpendEngine } from '../domain/safe-to-spend/SafeToSpendEngine';
import { BudgetEngine } from '../domain/budget/BudgetEngine';
import { WhatIfEngine } from '../domain/what-if/WhatIfEngine';
import {
  Account,
  Budget,
  Category,
  MoneyCommitment,
  SavingsGoal,
  Transaction,
  UserSettings,
} from '../types';

describe('FINOVA Financial Domain & Invariant Test Suite', () => {
  const mockAccounts: Account[] = [
    {
      id: 'acc-1',
      userId: 'user-1',
      name: 'Meezan Bank',
      type: 'BANK',
      currency: 'PHP',
      initialBalance: 5000000, // 50,000.00
      currentBalance: 5000000,
      icon: 'Building2',
      color: '#132B1F',
      includeInTotalBalance: true,
      isArchived: false,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    },
    {
      id: 'acc-2',
      userId: 'user-1',
      name: 'NayaPay Wallet',
      type: 'E_WALLET',
      currency: 'PHP',
      initialBalance: 1000000, // 10,000.00
      currentBalance: 1000000,
      icon: 'Smartphone',
      color: '#10B981',
      includeInTotalBalance: true,
      isArchived: false,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    },
  ];

  const mockCategories: Category[] = [
    { id: 'cat-food', userId: 'user-1', name: 'Food', type: 'EXPENSE', icon: 'Utensils', color: '#F97316', isSystem: true, isArchived: false },
    { id: 'cat-salary', userId: 'user-1', name: 'Salary', type: 'INCOME', icon: 'Briefcase', color: '#10B981', isSystem: true, isArchived: false },
    { id: 'cat-bills', userId: 'user-1', name: 'Bills', type: 'EXPENSE', icon: 'Zap', color: '#6366F1', isSystem: true, isArchived: false },
  ];

  const mockSettings: UserSettings = {
    userId: 'user-1',
    userName: 'Juan Dela Cruz',
    currency: 'PHP',
    defaultTrackingPeriod: 'TODAY',
    budgetCycleMode: 'MONTHLY',
    semiMonthlyCutoffDay: 15,
    minimumReserve: 500000, // 5,000.00 reserve
    safeToSpendPeriod: 'END_OF_MONTH',
    darkTheme: false,
    notificationsEnabled: true,
    budgetWarningThreshold: 80,
    autoGenerateCommitmentsFromRecurring: true,
  };

  /* 1. MONEY PRECISION & ARITHMETIC */
  describe('MoneyValue Precision & Invariants', () => {
    it('handles exact integer minor units without floating-point drift', () => {
      const a = MoneyValue.fromMinorUnits(100000); // 1,000.00
      const b = MoneyValue.fromMinorUnits(25050);  // 250.50
      const sum = a.add(b);
      expect(sum.getMinorUnits()).toBe(125050);
      expect(sum.getMajorUnits()).toBe(1250.5);
    });

    it('parses formatted strings accurately', () => {
      const parsed = MoneyValue.parse('₱10,000.50', 'PHP');
      expect(parsed.getMinorUnits()).toBe(1000050);
      expect(parsed.format()).toBe('₱10,000.50');
    });

    it('formats numbers with correct currency symbols and commas', () => {
      const val = MoneyValue.fromMajorUnits(108401, 'PHP');
      expect(val.format()).toBe('₱108,401');
    });
  });

  /* 2. DATE BOUNDARY UTILITIES & 15-DAY CUTOFF */
  describe('DateUtils Boundaries & 15-Day Cycle', () => {
    it('correctly identifies month start, month end, and remaining days', () => {
      const refDate = '2026-05-15';
      expect(DateUtils.getMonthStartISO(refDate)).toBe('2026-05-01');
      expect(DateUtils.getMonthEndISO(refDate)).toBe('2026-05-31');
      expect(DateUtils.getElapsedDaysInMonth(refDate)).toBe(15);
      expect(DateUtils.getRemainingDaysInMonth(refDate)).toBe(17); // 31 - 15 + 1
    });

    it('calculates 15-day semi-monthly payroll cycle accurately', () => {
      const day10 = DateUtils.get15DayCycle('2026-05-10', 15);
      expect(day10.isFirstHalf).toBe(true);
      expect(day10.startDate).toBe('2026-05-01');
      expect(day10.endDate).toBe('2026-05-15');
      expect(day10.remainingDays).toBe(6); // 15 - 10 + 1

      const day20 = DateUtils.get15DayCycle('2026-05-20', 15);
      expect(day20.isFirstHalf).toBe(false);
      expect(day20.startDate).toBe('2026-05-16');
      expect(day20.endDate).toBe('2026-05-31');
      expect(day20.remainingDays).toBe(12); // 31 - 20 + 1
    });

    it('correctly handles leap years', () => {
      expect(DateUtils.getDaysInMonth(2028, 2)).toBe(29);
      expect(DateUtils.getDaysInMonth(2026, 2)).toBe(28);
    });
  });

  /* 3. TRANSACTION MUTATIONS & FINANCIAL INVARIANTS */
  describe('Transaction Financial Invariants', () => {
    it('INVARIANT 1: Expense decreases account balance', () => {
      const expenseTx: Transaction = {
        id: 'tx-exp-1',
        userId: 'user-1',
        type: 'EXPENSE',
        amount: 1000000, // 10,000.00
        currency: 'PHP',
        categoryId: 'cat-food',
        accountId: 'acc-1',
        date: '2026-05-15',
        tags: [],
        status: 'CONFIRMED',
        createdAt: '2026-05-15T10:00:00Z',
        updatedAt: '2026-05-15T10:00:00Z',
      };

      const updated = TransactionEngine.applyTransactionToAccounts(expenseTx, mockAccounts);
      const acc1 = updated.find((a) => a.id === 'acc-1')!;
      expect(acc1.currentBalance).toBe(4000000); // 50,000 - 10,000 = 40,000
    });

    it('INVARIANT 2: Income increases account balance', () => {
      const incomeTx: Transaction = {
        id: 'tx-inc-1',
        userId: 'user-1',
        type: 'INCOME',
        amount: 1500000, // 15,000.00
        currency: 'PHP',
        categoryId: 'cat-salary',
        accountId: 'acc-1',
        date: '2026-05-15',
        tags: [],
        status: 'CONFIRMED',
        createdAt: '2026-05-15T10:00:00Z',
        updatedAt: '2026-05-15T10:00:00Z',
      };

      const updated = TransactionEngine.applyTransactionToAccounts(incomeTx, mockAccounts);
      const acc1 = updated.find((a) => a.id === 'acc-1')!;
      expect(acc1.currentBalance).toBe(6500000); // 50,000 + 15,000 = 65,000
    });

    it('INVARIANT 3: Transfer moves funds between accounts with ZERO change to total combined money and ZERO change to income/expense', () => {
      const transferTx: Transaction = {
        id: 'tx-trf-1',
        userId: 'user-1',
        type: 'TRANSFER',
        amount: 500000, // 5,000.00
        currency: 'PHP',
        categoryId: 'transfer',
        accountId: 'acc-1',
        destinationAccountId: 'acc-2',
        date: '2026-05-15',
        tags: [],
        status: 'CONFIRMED',
        createdAt: '2026-05-15T10:00:00Z',
        updatedAt: '2026-05-15T10:00:00Z',
      };

      const initialTotal = AccountEngine.calculateTotalBalance(mockAccounts).getMinorUnits();
      const updated = TransactionEngine.applyTransactionToAccounts(transferTx, mockAccounts);
      const postTotal = AccountEngine.calculateTotalBalance(updated).getMinorUnits();

      expect(postTotal).toBe(initialTotal); // Funds conserved
      expect(updated.find((a) => a.id === 'acc-1')!.currentBalance).toBe(4500000);
      expect(updated.find((a) => a.id === 'acc-2')!.currentBalance).toBe(1500000);

      // Verify period totals exclude transfers
      const totals = TransactionEngine.calculatePeriodTotals([transferTx], '2026-05-01', '2026-05-31');
      expect(totals.totalIncome.getMinorUnits()).toBe(0);
      expect(totals.totalExpense.getMinorUnits()).toBe(0);
      expect(totals.netCashFlow.getMinorUnits()).toBe(0);
    });

    it('INVARIANT 4: Reversibility on Edit and Delete restores exact prior balance', () => {
      const tx: Transaction = {
        id: 'tx-1',
        userId: 'user-1',
        type: 'EXPENSE',
        amount: 800000, // 8,000
        currency: 'PHP',
        categoryId: 'cat-food',
        accountId: 'acc-1',
        date: '2026-05-15',
        tags: [],
        status: 'CONFIRMED',
        createdAt: '2026-05-15T10:00:00Z',
        updatedAt: '2026-05-15T10:00:00Z',
      };

      const afterAdd = TransactionEngine.applyTransactionToAccounts(tx, mockAccounts);
      expect(afterAdd.find((a) => a.id === 'acc-1')!.currentBalance).toBe(4200000);

      const afterDelete = TransactionEngine.reverseTransactionFromAccounts(tx, afterAdd);
      expect(afterDelete.find((a) => a.id === 'acc-1')!.currentBalance).toBe(5000000); // Fully restored
    });
  });

  /* 4. BUDGET & FORECASTING ENGINE */
  describe('Budget & Forecasting Engine', () => {
    const mockBudget: Budget = {
      id: 'bud-food',
      userId: 'user-1',
      name: 'Food & Groceries',
      amount: 3000000, // 30,000.00
      period: 'MONTHLY',
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      categoryIds: ['cat-food'],
      notifyThresholdPercentage: 80,
      isActive: true,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    };

    it('correctly calculates actual spending and projects run-rate risk', () => {
      const txList: Transaction[] = [
        {
          id: 't1',
          userId: 'user-1',
          type: 'EXPENSE',
          amount: 2000000, // 20,000 spent on day 10
          currency: 'PHP',
          categoryId: 'cat-food',
          accountId: 'acc-1',
          date: '2026-05-10',
          tags: [],
          status: 'CONFIRMED',
          createdAt: '2026-05-10T10:00:00Z',
          updatedAt: '2026-05-10T10:00:00Z',
        },
      ];

      const forecast = BudgetEngine.calculateBudgetForecast(mockBudget, txList, '2026-05-10');
      expect(forecast.actualSpent).toBe(2000000);
      expect(forecast.percentageUsed).toBe(67);
      expect(forecast.status).toBe('AT_RISK');
    });
  });

  /* 5. SAFE-TO-SPEND ENGINE (MONTHLY & 15-DAY MODES) */
  describe('SafeToSpend Calculation & Explainability', () => {
    const commitments: MoneyCommitment[] = [
      {
        id: 'comm-1',
        userId: 'user-1',
        title: 'Internet Bill',
        type: 'BILL',
        amount: 500000, // 5,000
        currency: 'PHP',
        direction: 'OUTFLOW',
        status: 'PROJECTED',
        dueDate: '2026-05-25',
        accountId: 'acc-1',
        categoryId: 'cat-bills',
        priority: 'ESSENTIAL',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ];

    const goals: SavingsGoal[] = [
      {
        id: 'goal-1',
        userId: 'user-1',
        name: 'Emergency Fund',
        targetAmount: 12000000, // 120,000
        currentAmount: 6000000,  // 60,000
        targetDate: '2026-11-01',
        priority: 'ESSENTIAL',
        status: 'ON_TRACK',
        icon: 'Shield',
        color: '#10B981',
        isArchived: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ];

    it('applies exact signature formula in standard monthly mode', () => {
      const res = SafeToSpendEngine.calculateSafeToSpend(
        mockAccounts,
        commitments,
        goals,
        mockSettings,
        '2026-05-15'
      );

      expect(res.totalAvailableBalance).toBe(6000000);
      expect(res.essentialUpcomingCommitments).toBe(500000);
      expect(res.minimumReserve).toBe(500000);
      expect(res.isDeficit).toBe(false);
      expect(res.dailySafeToSpend).toBeGreaterThan(0);
      expect(res.explanation.steps.length).toBe(4);
    });

    it('calculates 15-day semi-monthly payroll safe-to-spend accurately', () => {
      const semiMonthlySettings: UserSettings = {
        ...mockSettings,
        budgetCycleMode: 'SEMI_MONTHLY_15_DAYS',
      };

      const res = SafeToSpendEngine.calculateSafeToSpend(
        mockAccounts,
        commitments,
        goals,
        semiMonthlySettings,
        '2026-05-10'
      );

      expect(res.is15DayCycle).toBe(true);
      expect(res.remainingDaysInPeriod).toBe(6); // 15 - 10 + 1
      expect(res.cycleInfo?.cycleLabel).toContain('1st Cutoff');
    });
  });

  /* 6. WHAT-IF SANDBOX ISOLATION */
  describe('What-If Simulation Isolation', () => {
    it('simulates severe expenses without mutating real persistent account or budget data', () => {
      const initialBal = mockAccounts[0].currentBalance;

      const simResult = WhatIfEngine.simulateScenario(
        {
          title: 'New Laptop',
          amount: 25000000, // 250,000
          type: 'EXPENSE',
          date: '2026-05-16',
          categoryId: 'cat-food',
          accountId: 'acc-1',
        },
        mockAccounts,
        [],
        [],
        [],
        [],
        mockCategories,
        mockSettings,
        '2026-05-15'
      );

      expect(mockAccounts[0].currentBalance).toBe(initialBal);
      expect(simResult.verdict).toBe('HIGH_RISK');
    });
  });
});
