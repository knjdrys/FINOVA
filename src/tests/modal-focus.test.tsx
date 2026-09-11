// @vitest-environment jsdom
/**
 * Modal focus-lifecycle regression (onboarding typing bug).
 *
 * The focus effect used to depend on `onClose`, and consumers pass inline
 * arrows (OnboardingModal: `onClose={() => {}}`) that change identity every
 * render. Each keystroke re-rendered the modal, the effect re-ran
 * `first.focus()`, and focus was yanked out of the text input onto the X
 * button — making step 1 (name) and step 2 (balance) untypeable.
 *
 * (In jsdom every element reports offsetParent null, so the pre-fix code
 * focused the dialog div instead of the X — the assertion below fails on
 * either target, since focus must stay in the input.)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import { Modal } from '../components/ui/Modal';

afterEach(cleanup);

const TypingModal: React.FC = () => {
  const [value, setValue] = useState('');
  return (
    // Deliberately unstable onClose — mirrors OnboardingModal's inline arrow.
    <Modal isOpen onClose={() => {}} title="Type here">
      <label>
        Name
        <input value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
    </Modal>
  );
};

describe('modal focus lifecycle', () => {
  it('keeps focus in the text input across keystrokes with an inline onClose', () => {
    render(<TypingModal />);
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    input.focus();
    for (const ch of ['K', 'E']) {
      fireEvent.change(input, { target: { value: input.value + ch } });
      expect(document.activeElement).toBe(input);
    }
    expect(input.value).toBe('KE');
  });

  it('still closes on Escape with a stable onClose', () => {
    let closed = 0;
    const Stable: React.FC = () => {
      const [value, setValue] = useState('');
      const onClose = React.useCallback(() => {
        closed += 1;
      }, []);
      return (
        <Modal isOpen onClose={onClose} title="Esc">
          <input aria-label="field" value={value} onChange={(e) => setValue(e.target.value)} />
        </Modal>
      );
    };
    render(<Stable />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed).toBe(1);
  });
});
