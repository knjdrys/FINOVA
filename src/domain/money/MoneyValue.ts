import { CurrencyCode, CURRENCY_CONFIGS } from '../../types';

/**
 * MoneyValue provides deterministic, floating-point safe monetary calculations.
 * All monetary amounts are stored as integer minor units.
 */
export class MoneyValue {
  private readonly minorUnits: number;
  private readonly currency: CurrencyCode;

  private constructor(minorUnits: number, currency: CurrencyCode = 'PHP') {
    this.minorUnits = Math.round(minorUnits);
    this.currency = currency;
  }

  public static fromMinorUnits(minorUnits: number, currency: CurrencyCode = 'PHP'): MoneyValue {
    return new MoneyValue(minorUnits, currency);
  }

  public static fromMajorUnits(majorUnits: number, currency: CurrencyCode = 'PHP'): MoneyValue {
    const multiplier = CURRENCY_CONFIGS[currency]?.minorUnitMultiplier ?? 100;
    return new MoneyValue(Math.round(majorUnits * multiplier), currency);
  }

  public static parse(input: string | number, currency: CurrencyCode = 'PHP'): MoneyValue {
    if (typeof input === 'number') {
      return MoneyValue.fromMajorUnits(input, currency);
    }
    if (!input || typeof input !== 'string') {
      return new MoneyValue(0, currency);
    }
    const cleaned = input.replace(/[^0-9.-]/g, '').trim();
    const parsedNumber = parseFloat(cleaned);
    if (isNaN(parsedNumber)) {
      return new MoneyValue(0, currency);
    }
    return MoneyValue.fromMajorUnits(parsedNumber, currency);
  }

  public static zero(currency: CurrencyCode = 'PHP'): MoneyValue {
    return new MoneyValue(0, currency);
  }

  public getMinorUnits(): number {
    return this.minorUnits;
  }

  public getMajorUnits(): number {
    const multiplier = CURRENCY_CONFIGS[this.currency]?.minorUnitMultiplier ?? 100;
    return this.minorUnits / multiplier;
  }

  /**
   * Grouping-free decimal string for `type="number"` inputs. format() emits
   * locale commas ("25,000.00") which number inputs REJECT — every edit form
   * showed a blank amount for values >= 1,000. Never use format() for input
   * state; never use this for display (no symbol, no grouping).
   */
  public toInputString(): string {
    return String(this.getMajorUnits());
  }

  public getCurrency(): CurrencyCode {
    return this.currency;
  }

  public getCurrencySymbol(): string {
    return CURRENCY_CONFIGS[this.currency]?.symbol || '₱';
  }

  public withCurrency(newCurrency: CurrencyCode): MoneyValue {
    return new MoneyValue(this.minorUnits, newCurrency);
  }

  public add(other: MoneyValue): MoneyValue {
    return new MoneyValue(this.minorUnits + other.minorUnits, this.currency);
  }

  public subtract(other: MoneyValue): MoneyValue {
    return new MoneyValue(this.minorUnits - other.minorUnits, this.currency);
  }

  public multiply(factor: number): MoneyValue {
    return new MoneyValue(Math.round(this.minorUnits * factor), this.currency);
  }

  public divide(divisor: number): MoneyValue {
    if (divisor === 0) return new MoneyValue(0, this.currency);
    return new MoneyValue(Math.round(this.minorUnits / divisor), this.currency);
  }

  public isPositive(): boolean {
    return this.minorUnits > 0;
  }

  public isNegative(): boolean {
    return this.minorUnits < 0;
  }

  public isZero(): boolean {
    return this.minorUnits === 0;
  }

  public isGreaterThan(other: MoneyValue): boolean {
    return this.minorUnits > other.minorUnits;
  }

  public isLessThan(other: MoneyValue): boolean {
    return this.minorUnits < other.minorUnits;
  }

  public equals(other: MoneyValue): boolean {
    return this.minorUnits === other.minorUnits;
  }

  /**
   * Format money into clean human-readable text.
   * e.g. "₱10,000", "Rs 10,000", "$10,000"
   */
  public format(options?: {
    includeSymbol?: boolean;
    compact?: boolean;
    forceDecimals?: boolean;
    signDisplay?: 'auto' | 'always' | 'never' | 'exceptZero';
  }): string {
    const config = CURRENCY_CONFIGS[this.currency] || CURRENCY_CONFIGS.PHP;
    const major = Math.abs(this.getMajorUnits());
    const isNeg = this.minorUnits < 0;

    let numStr = '';
    const hasCents = this.minorUnits % config.minorUnitMultiplier !== 0;
    const showDecimals = options?.forceDecimals ?? (hasCents && config.minorUnitMultiplier > 1);

    if (options?.compact && major >= 1000000) {
      numStr = `${(major / 1000000).toFixed(1)}M`;
    } else if (options?.compact && major >= 1000) {
      numStr = `${(major / 1000).toFixed(1)}K`;
    } else {
      numStr = major.toLocaleString('en-US', {
        minimumFractionDigits: showDecimals ? 2 : 0,
        maximumFractionDigits: 2,
      });
    }

    let signPrefix = '';
    if (isNeg) {
      signPrefix = '-';
    } else if (options?.signDisplay === 'always' && this.minorUnits > 0) {
      signPrefix = '+';
    }

    let symbol = '';
    if (options?.includeSymbol !== false) {
      const sym = config.symbol || '₱';
      // Append a space if symbol has letters (like Rs, AED, CHF, SAR, Rp, RM)
      symbol = /^[A-Za-z]+$/.test(sym) ? `${sym} ` : sym;
    }

    return `${signPrefix}${symbol}${numStr}`;
  }
}
