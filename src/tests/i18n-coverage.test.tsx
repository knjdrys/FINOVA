// @vitest-environment jsdom
/**
 * i18n coverage tests — parity only proves keys exist in both locales, NOT that
 * components reference them correctly. t() renders a typo'd key VERBATIM, so a
 * wrong key looks like a stray "tutorial.s1.tag" string in the UI. These tests
 * walk every step of both education surfaces and fail on any raw-key leak.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { setLanguage } from '../i18n/core';
import { TutorialModal } from '../components/modals/TutorialModal';
import { GuidedAppTour } from '../components/tutorial/GuidedAppTour';

afterEach(() => {
  cleanup();
  setLanguage('en');
});

const LEAK_RE = /(tutorial|tour)\.[a-z0-9.]+/i;

describe('tutorial i18n coverage', () => {
  it('all 7 tutorial steps render without raw-key leaks (en)', () => {
    render(<TutorialModal isOpen onClose={() => undefined} currency="PHP" />);
    for (let step = 1; step <= 7; step++) {
      expect(document.body.textContent ?? '').not.toMatch(LEAK_RE);
      if (step < 7) fireEvent.click(screen.getByText('Next'));
    }
    // Landed on the last step: Done button + step-7 content visible.
    expect(screen.getByText('Done')).toBeTruthy();
    expect(document.body.textContent ?? '').toContain('Currencies & Download Spreadsheet');
  });

  it('tutorial step 1 localizes to Filipino with no leaks', () => {
    setLanguage('fil');
    render(<TutorialModal isOpen onClose={() => undefined} currency="PHP" />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(LEAK_RE);
    expect(text).toContain('Buod ng Gastos at Time Filters');
    expect(text).toContain('Gabay ng PALDO');
  });

  it('interpolated tutorial strings resolve vars (no "{sym}" residue)', () => {
    render(<TutorialModal isOpen onClose={() => undefined} currency="PHP" />);
    // Step 1 preview embeds the currency symbol via {sym}.
    expect(document.body.textContent ?? '').toContain('Budget ₱30,000');
    expect(document.body.textContent ?? '').not.toContain('{sym}');
  });
});

describe('guided tour i18n coverage', () => {
  it('all 7 tour steps render without raw-key leaks (en)', () => {
    render(<GuidedAppTour isOpen onClose={() => undefined} onNavigateTab={() => undefined} />);
    for (let step = 1; step <= 7; step++) {
      expect(document.body.textContent ?? '').not.toMatch(LEAK_RE);
      if (step < 7) fireEvent.click(screen.getByText('Next'));
    }
    expect(screen.getByText('Got It! Start')).toBeTruthy();
    expect(document.body.textContent ?? '').toContain('Bank Accounts, Currencies & Clean Start');
  });

  it('tour step 1 localizes to Filipino with no leaks', () => {
    setLanguage('fil');
    render(<GuidedAppTour isOpen onClose={() => undefined} onNavigateTab={() => undefined} />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(LEAK_RE);
    expect(text).toContain('Buod ng Gastos at Time Filters');
  });
});
