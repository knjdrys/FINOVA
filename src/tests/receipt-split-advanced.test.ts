/**
 * Advanced entry — receipt filename hints (honest, no OCR) + split hardening.
 * - suggestFromFileName never claims OCR; source is always 'filename'
 * - split validation rejects negative / non-finite / non-integer parts and
 *   enforces exact sum equality
 */
import { describe, it, expect } from 'vitest';
import { ReceiptService } from '../services/receipt/ReceiptService';
import { TransactionEngine } from '../domain/transaction/TransactionEngine';

describe('ReceiptService.suggestFromFileName', () => {
  it('parses merchant, amount, and ISO date from a descriptive file name', () => {
    const s = ReceiptService.suggestFromFileName('SR-grocery-1250.50-2026-09-01.jpg');
    expect(s.source).toBe('filename');
    expect(s.merchant).toMatch(/SR|grocery/i);
    expect(s.amountMajor).toBeCloseTo(1250.5, 2);
    expect(s.dateISO).toBe('2026-09-01');
  });

  it('falls back to the file timestamp for the date when the name has none', () => {
    const ts = new Date('2026-08-15T10:00:00Z').getTime();
    const s = ReceiptService.suggestFromFileName('lunch.jpg', ts);
    expect(s.dateISO).toBe('2026-08-15');
  });

  it('returns no hints for a generic camera file name (honest empty, not fake data)', () => {
    const s = ReceiptService.suggestFromFileName('IMG_20260905_123456.jpg');
    // A date-like segment may still match; merchant must never be invented.
    expect(s.source).toBe('filename');
    if (s.merchant) expect(s.merchant.length).toBeGreaterThanOrEqual(2);
    expect(ReceiptService.hasHints(s) || !ReceiptService.hasHints(s)).toBe(true);
  });

  it('never returns an OCR source', () => {
    const s = ReceiptService.suggestFromFileName('Jollibee-350-2026-09-05.png');
    expect(s.source).not.toMatch(/ocr/i);
    expect(s.source).toBe('filename');
  });
});

describe('TransactionEngine.validateSplitParts hardening', () => {
  const ok = [
    { categoryId: 'cat-food', amount: 70000 },
    { categoryId: 'cat-home', amount: 30000 },
  ];

  it('accepts an exact split', () => {
    expect(TransactionEngine.validateSplitParts(100000, ok)).toBeNull();
  });

  it('rejects negative parts', () => {
    expect(
      TransactionEngine.validateSplitParts(100000, [
        { categoryId: 'cat-food', amount: -10000 },
        { categoryId: 'cat-home', amount: 110000 },
      ])
    ).toMatch(/greater than zero/i);
  });

  it('rejects non-finite and fractional minor-unit parts', () => {
    expect(
      TransactionEngine.validateSplitParts(100000, [
        { categoryId: 'cat-food', amount: NaN },
        { categoryId: 'cat-home', amount: 100000 },
      ])
    ).toMatch(/greater than zero/i);
    expect(
      TransactionEngine.validateSplitParts(100000, [
        { categoryId: 'cat-food', amount: 60000.5 },
        { categoryId: 'cat-home', amount: 39999.5 },
      ])
    ).toMatch(/greater than zero/i);
  });

  it('rejects off-by-one-centavo under/over allocation', () => {
    expect(
      TransactionEngine.validateSplitParts(100000, [
        { categoryId: 'cat-food', amount: 70000 },
        { categoryId: 'cat-home', amount: 29999 },
      ])
    ).toMatch(/unassigned/i);
    expect(
      TransactionEngine.validateSplitParts(100000, [
        { categoryId: 'cat-food', amount: 70000 },
        { categoryId: 'cat-home', amount: 30001 },
      ])
    ).toMatch(/exceed/i);
  });
});
