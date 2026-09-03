export interface SemiMonthlyCycleInfo {
  cycleLabel: string;
  isFirstHalf: boolean;
  startDate: string;
  endDate: string;
  elapsedDays: number;
  remainingDays: number;
  totalDays: number;
}

export class DateUtils {
  public static getTodayISO(): string {
    const now = new Date();
    return this.formatISO(now);
  }

  public static formatISO(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  public static parseISO(dateStr: string): Date {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date(dateStr);
  }

  public static getMonthStartISO(dateStr?: string): string {
    const d = dateStr ? this.parseISO(dateStr) : new Date();
    d.setDate(1);
    return this.formatISO(d);
  }

  public static getMonthEndISO(dateStr?: string): string {
    const d = dateStr ? this.parseISO(dateStr) : new Date();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return this.formatISO(end);
  }

  public static getDaysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
  }

  public static getElapsedDaysInMonth(dateStr?: string): number {
    const d = dateStr ? this.parseISO(dateStr) : new Date();
    return Math.max(1, d.getDate());
  }

  public static getRemainingDaysInMonth(dateStr?: string): number {
    const d = dateStr ? this.parseISO(dateStr) : new Date();
    const totalDays = this.getDaysInMonth(d.getFullYear(), d.getMonth() + 1);
    const elapsed = d.getDate();
    return Math.max(1, totalDays - elapsed + 1);
  }

  public static getTotalDaysInMonth(dateStr?: string): number {
    const d = dateStr ? this.parseISO(dateStr) : new Date();
    return this.getDaysInMonth(d.getFullYear(), d.getMonth() + 1);
  }

  /**
   * Semi-Monthly (15-Day) cycle calculator for bi-weekly / 15-day payroll earners
   */
  public static get15DayCycle(dateStr?: string, cutoffDay: number = 15): SemiMonthlyCycleInfo {
    const d = dateStr ? this.parseISO(dateStr) : new Date();
    const year = d.getFullYear();
    const month = d.getMonth();
    const day = d.getDate();
    const totalDaysInMonth = this.getDaysInMonth(year, month + 1);

    if (day <= cutoffDay) {
      // 1st Half: Day 1 to cutoffDay (e.g. 1st - 15th)
      const startDate = this.formatISO(new Date(year, month, 1));
      const endDate = this.formatISO(new Date(year, month, cutoffDay));
      const elapsedDays = Math.max(1, day);
      const remainingDays = Math.max(1, cutoffDay - day + 1);
      const totalDays = cutoffDay;

      return {
        cycleLabel: `1st Cutoff (1st - ${cutoffDay}th)`,
        isFirstHalf: true,
        startDate,
        endDate,
        elapsedDays,
        remainingDays,
        totalDays,
      };
    } else {
      // 2nd Half: cutoffDay + 1 to End of Month (e.g. 16th - 30/31st)
      const startDate = this.formatISO(new Date(year, month, cutoffDay + 1));
      const endDate = this.formatISO(new Date(year, month, totalDaysInMonth));
      const elapsedDays = Math.max(1, day - cutoffDay);
      const remainingDays = Math.max(1, totalDaysInMonth - day + 1);
      const totalDays = totalDaysInMonth - cutoffDay;

      return {
        cycleLabel: `2nd Cutoff (${cutoffDay + 1}th - End)`,
        isFirstHalf: false,
        startDate,
        endDate,
        elapsedDays,
        remainingDays,
        totalDays,
      };
    }
  }

  public static daysBetween(startISO: string, endISO: string): number {
    const d1 = this.parseISO(startISO);
    const d2 = this.parseISO(endISO);
    const diffTime = d2.getTime() - d1.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  public static addDaysISO(dateStr: string, days: number): string {
    const d = this.parseISO(dateStr);
    d.setDate(d.getDate() + days);
    return this.formatISO(d);
  }

  public static addMonthsISO(dateStr: string, months: number): string {
    const d = this.parseISO(dateStr);
    d.setMonth(d.getMonth() + months);
    return this.formatISO(d);
  }

  public static isDateInRange(dateStr: string, startISO: string, endISO: string): boolean {
    return dateStr >= startISO && dateStr <= endISO;
  }

  public static getDayAbbreviation(dateStr: string): string {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const d = this.parseISO(dateStr);
    return days[d.getDay()] || 'SUN';
  }

  public static formatDisplayDate(dateStr: string, options?: { fullYear?: boolean; includeDay?: boolean }): string {
    const todayISO = this.getTodayISO();
    const yesterdayISO = this.addDaysISO(todayISO, -1);
    const tomorrowISO = this.addDaysISO(todayISO, 1);

    if (dateStr === todayISO) return 'Today';
    if (dateStr === yesterdayISO) return 'Yesterday';
    if (dateStr === tomorrowISO) return 'Tomorrow';

    const d = this.parseISO(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    const dayAbbr = this.getDayAbbreviation(dateStr);

    if (options?.includeDay) {
      return `${dayAbbr} ${month} ${day}${options.fullYear ? `, ${year}` : ''}`;
    }

    if (options?.fullYear) {
      return `${month} ${day}, ${year}`;
    }

    return `${month} ${day}`;
  }

  public static getMonthName(monthNumber: number): string {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthNumber - 1] || '';
  }
}
