import React from 'react';
import { Home, ListOrdered, Plus, BarChart3, Settings, CalendarDays } from 'lucide-react';
import { useI18n } from '../../i18n';

export type NavTab = 'HOME' | 'ALL_EXPENSES' | 'PLANS' | 'ANALYTICS' | 'SETTINGS';

interface BottomNavigationProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenQuickActions: () => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  currentTab,
  onSelectTab,
  onOpenQuickActions,
}) => {
  const { t } = useI18n();
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 flex justify-center pointer-events-none pb-safe">
      <nav className="pointer-events-auto w-full max-w-lg md:max-w-2xl bg-(--surface)/95 backdrop-blur-lg border-t border-(--line)/70 sm:border sm:rounded-t-[32px] sm:shadow-2xl px-4 sm:px-6 py-2">
        <div className="flex items-center justify-between relative">
          {/* Home Tab */}
          <button
            type="button"
            onClick={() => onSelectTab('HOME')}
            className={`flex flex-1 flex-col items-center justify-center py-1 transition-all cursor-pointer min-w-0 ${
              currentTab === 'HOME' ? 'text-(--ink) scale-105' : 'text-(--ink-3) hover:text-(--ink-2)'
            }`}
          >
            <Home className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.3]" />
            <span className="text-[11px] sm:text-[11px] font-bold mt-1 truncate min-w-0">{t('nav.home')}</span>
            {currentTab === 'HOME' ? (
              <span className="h-1.5 w-1.5 rounded-full bg-(--accent-bright) mt-0.5 shadow-xs"></span>
            ) : (
              <span className="h-1.5 w-1.5 mt-0.5 opacity-0"></span>
            )}
          </button>

          {/* Transactions Tab */}
          <button
            type="button"
            onClick={() => onSelectTab('ALL_EXPENSES')}
            className={`flex flex-1 flex-col items-center justify-center py-1 transition-all cursor-pointer min-w-0 ${
              currentTab === 'ALL_EXPENSES' ? 'text-(--ink) scale-105' : 'text-(--ink-3) hover:text-(--ink-2)'
            }`}
          >
            <ListOrdered className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.3]" />
            <span className="text-[11px] sm:text-[11px] font-bold mt-1 truncate min-w-0">{t('nav.transactions')}</span>
            {currentTab === 'ALL_EXPENSES' ? (
              <span className="h-1.5 w-1.5 rounded-full bg-(--accent-bright) mt-0.5 shadow-xs"></span>
            ) : (
              <span className="h-1.5 w-1.5 mt-0.5 opacity-0"></span>
            )}
          </button>

          {/* Plans Tab */}
          <button
            type="button"
            onClick={() => onSelectTab('PLANS')}
            className={`flex flex-1 flex-col items-center justify-center py-1 transition-all cursor-pointer min-w-0 ${
              currentTab === 'PLANS' ? 'text-(--ink) scale-105' : 'text-(--ink-3) hover:text-(--ink-2)'
            }`}
          >
            <CalendarDays className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.3]" />
            <span className="text-[11px] sm:text-[11px] font-bold mt-1 truncate min-w-0">{t('nav.plans')}</span>
            {currentTab === 'PLANS' ? (
              <span className="h-1.5 w-1.5 rounded-full bg-(--accent-bright) mt-0.5 shadow-xs"></span>
            ) : (
              <span className="h-1.5 w-1.5 mt-0.5 opacity-0"></span>
            )}
          </button>

          {/* Elevated Floating Quick-Add Button with soft glow ring */}
          <div data-tour="quick-add" className="relative -top-5 sm:-top-6 flex items-center justify-center px-1 sm:px-2 shrink-0">
            <div className="rounded-full bg-(--accent-soft)/80 p-1 sm:p-1.5 shadow-sm">
              <button
                type="button"
                onClick={onOpenQuickActions}
                aria-label={t('nav.addTransaction')}
                className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-(--accent) text-(--brand) shadow-md shadow-lime-600/30 transition-transform duration-150 hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Plus className="h-6 w-6 sm:h-8 sm:w-8 stroke-[3]" />
              </button>
            </div>
          </div>

          {/* Analytics Tab */}
          <button
            type="button"
            onClick={() => onSelectTab('ANALYTICS')}
            className={`flex flex-1 flex-col items-center justify-center py-1 transition-all cursor-pointer min-w-0 ${
              currentTab === 'ANALYTICS' ? 'text-(--ink) scale-105' : 'text-(--ink-3) hover:text-(--ink-2)'
            }`}
          >
            <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.3]" />
            <span className="text-[11px] sm:text-[11px] font-bold mt-1 truncate min-w-0">{t('nav.insights')}</span>
            {currentTab === 'ANALYTICS' ? (
              <span className="h-1.5 w-1.5 rounded-full bg-(--accent-bright) mt-0.5 shadow-xs"></span>
            ) : (
              <span className="h-1.5 w-1.5 mt-0.5 opacity-0"></span>
            )}
          </button>

          {/* Settings Tab */}
          <button
            type="button"
            onClick={() => onSelectTab('SETTINGS')}
            className={`flex flex-1 flex-col items-center justify-center py-1 transition-all cursor-pointer min-w-0 ${
              currentTab === 'SETTINGS' ? 'text-(--ink) scale-105' : 'text-(--ink-3) hover:text-(--ink-2)'
            }`}
          >
            <Settings className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.3]" />
            <span className="text-[11px] sm:text-[11px] font-bold mt-1 truncate min-w-0">{t('nav.settings')}</span>
            {currentTab === 'SETTINGS' ? (
              <span className="h-1.5 w-1.5 rounded-full bg-(--accent-bright) mt-0.5 shadow-xs"></span>
            ) : (
              <span className="h-1.5 w-1.5 mt-0.5 opacity-0"></span>
            )}
          </button>
        </div>
      </nav>
    </div>
  );
};
