import { NavTab } from '../navigation/BottomNavigation';

/** One stop on the guided first-run tour. */
export interface TourStep {
  id: number;
  tab: NavTab;
  selector: string;
  badge: string;
  title: string;
  description: string;
  targetLabel: string;
  keyTakeaway: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 1,
    tab: 'HOME',
    selector: '[data-tour="wave-card"]',
    badge: 'Step 1 of 7 • Home',
    title: 'Spending Summary & Time Filters',
    description:
      'This card shows how much money you spent. Tap Today, This Week, or This Month to switch views anytime.',
    targetLabel: 'Spending Summary Card',
    keyTakeaway: 'Tap any time button to see today, this week, or this month.',
  },
  {
    id: 2,
    tab: 'HOME',
    selector: '[data-tour="safe-to-spend"]',
    badge: 'Step 2 of 7 • Daily Limit',
    title: 'Daily Safe-to-Spend™ Limit',
    description:
      'This shows how much money you can spend each day without worrying. It protects your upcoming bills and savings first, then divides what is left by your remaining days.',
    targetLabel: 'Daily Safe-to-Spend Bar',
    keyTakeaway: 'Tap "Details" to see how your daily limit is calculated.',
  },
  {
    id: 3,
    tab: 'HOME',
    selector: '[data-tour="quick-add"]',
    badge: 'Step 3 of 7 • Add Transactions',
    title: 'Quick-Add Button (+)',
    description:
      'Tap this bright button anytime to add an expense, record income, plan a bill, or set a budget. It opens a menu of everything you can add — no need to hunt through tabs.',
    targetLabel: 'Quick-Add (+) Button',
    keyTakeaway: 'Moving money between banks updates your balances automatically.',
  },
  {
    id: 4,
    tab: 'ALL_EXPENSES',
    selector: '[data-tour="category-chips"]',
    badge: 'Step 4 of 7 • Categories',
    title: 'Filter by Category & History',
    description:
      'See all your past spending sorted by day. Tap any category (like Food, Bills, or Shopping) to see only those items.',
    targetLabel: 'Category Filter Buttons',
    keyTakeaway: 'Tap a category to quickly find what you spent on food, bills, or shopping.',
  },
  {
    id: 5,
    tab: 'ANALYTICS',
    selector: '[data-tour="what-if-banner"]',
    badge: 'Step 5 of 7 • Decision Tester',
    title: 'Test a Purchase Before Spending',
    description:
      'Thinking of buying something big? Test it here first to see how it will change your daily spending before you pay with real money.',
    targetLabel: 'Purchase Simulator',
    keyTakeaway: 'Test purchases safely without changing your real account balances.',
  },
  {
    id: 6,
    tab: 'SETTINGS',
    selector: '[data-tour="payroll-cycle-setting"]',
    badge: 'Step 6 of 7 • Payday Setup',
    title: 'Twice-a-Month Payday (15-Day Cycle)',
    description:
      'If you get paid twice a month (like the 15th and end of the month), PALDO splits your budget into two 15-day halves so you do not run out of money before payday.',
    targetLabel: '15-Day Payday Setup',
    keyTakeaway: 'Your daily safe spending matches your next payday.',
  },
  {
    id: 7,
    tab: 'SETTINGS',
    selector: '[data-tour="bank-accounts-setting"]',
    badge: 'Step 7 of 7 • Banks & Settings',
    title: 'Bank Accounts, Currencies & Clean Start',
    description:
      'Add your real bank accounts (like GRBank, BPI, GCash, or Maya). Change your currency or start fresh with ₱0 whenever you want.',
    targetLabel: 'Bank Accounts Manager',
    keyTakeaway: "You are all set! You're ready to easily track your real money.",
  },
];

