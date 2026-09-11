import { NavTab } from '../navigation/BottomNavigation';

/** One stop on the guided first-run tour. */
export interface TourStep {
  id: number;
  tab: NavTab;
  selector: string;
  /** i18n keys into `tour.sN.*` — translated at render time so the tour follows the active language. */
  badgeKey: string;
  titleKey: string;
  descriptionKey: string;
  targetKey: string;
  takeawayKey: string;
}

const step = (
  id: number,
  tab: NavTab,
  selector: string,
): TourStep => ({
  id,
  tab,
  selector,
  badgeKey: `tour.s${id}.badge`,
  titleKey: `tour.s${id}.title`,
  descriptionKey: `tour.s${id}.description`,
  targetKey: `tour.s${id}.target`,
  takeawayKey: `tour.s${id}.takeaway`,
});

export const TOUR_STEPS: TourStep[] = [
  step(1, 'HOME', '[data-tour="wave-card"]'),
  step(2, 'HOME', '[data-tour="safe-to-spend"]'),
  step(3, 'HOME', '[data-tour="quick-add"]'),
  step(4, 'ALL_EXPENSES', '[data-tour="category-chips"]'),
  step(5, 'ANALYTICS', '[data-tour="what-if-banner"]'),
  step(6, 'SETTINGS', '[data-tour="payroll-cycle-setting"]'),
  step(7, 'SETTINGS', '[data-tour="bank-accounts-setting"]'),
];
