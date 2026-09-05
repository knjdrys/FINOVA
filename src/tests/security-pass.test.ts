/**
 * Security pass tests — App Lock (PBKDF2 PIN) + per-user storage scoping.
 * Runs in the node vitest env, so we install minimal localStorage/sessionStorage
 * stubs before importing the modules under test.
 */
import { describe, it, expect, beforeEach } from 'vitest';

function makeStorageStub() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => { map.clear(); },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  };
}

(globalThis as any).localStorage = makeStorageStub();
(globalThis as any).sessionStorage = makeStorageStub();

import { AppLockService } from '../services/security/AppLockService';
import { FinovaStorage } from '../services/storage/FinovaStorage';

describe('AppLockService — PIN lock', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('is not configured on a clean device', () => {
    expect(AppLockService.isConfigured()).toBe(false);
    expect(AppLockService.isUnlocked()).toBe(false);
  });

  it('rejects weak or malformed PINs', () => {
    expect(AppLockService.validatePinFormat('12')).not.toBeNull();       // too short
    expect(AppLockService.validatePinFormat('12345678901')).not.toBeNull(); // too long
    expect(AppLockService.validatePinFormat('12a4')).not.toBeNull();     // non-digit
    expect(AppLockService.validatePinFormat('1111')).not.toBeNull();     // repeated
    expect(AppLockService.validatePinFormat('1234')).not.toBeNull();     // ascending sequence
    expect(AppLockService.validatePinFormat('4321')).not.toBeNull();     // descending sequence
    expect(AppLockService.validatePinFormat('7391')).toBeNull();         // acceptable
  });

  it('setup stores a PBKDF2 verifier, never the PIN itself', async () => {
    const res = await AppLockService.setup('7391');
    expect(res.ok).toBe(true);
    expect(AppLockService.isConfigured()).toBe(true);
    expect(AppLockService.isUnlocked()).toBe(true); // setup unlocks the session
    const raw = localStorage.getItem('FINOVA_APP_LOCK_V1') || '';
    expect(raw).not.toContain('7391');              // PIN not stored in plaintext
    const rec = JSON.parse(raw);
    expect(rec.salt).toBeTruthy();
    expect(rec.hash).toBeTruthy();
    expect(rec.salt).not.toBe(rec.hash);
  });

  it('verify accepts the right PIN and rejects wrong ones', async () => {
    await AppLockService.setup('7391');
    AppLockService.setUnlocked(false);
    const good = await AppLockService.verify('7391');
    expect(good.ok).toBe(true);
    AppLockService.setUnlocked(false);
    const bad = await AppLockService.verify('0000');
    expect(bad.ok).toBe(false);
  });

  it('rate-limits after repeated failures with a backoff', async () => {
    await AppLockService.setup('7391');
    AppLockService.setUnlocked(false);
    for (let i = 0; i < 5; i++) {
      await AppLockService.verify('0000');
    }
    // 6th attempt must be refused by lockout, not by hash mismatch.
    const res = await AppLockService.verify('7391');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Too many attempts/);
    expect(AppLockService.lockoutRemainingMs()).toBeGreaterThan(0);
  });

  it('remove clears the lock', async () => {
    await AppLockService.setup('7391');
    const res = await AppLockService.remove();
    expect(res.ok).toBe(true);
    expect(AppLockService.isConfigured()).toBe(false);
    expect(localStorage.getItem('FINOVA_APP_LOCK_V1')).toBeNull();
  });
});

describe('FinovaStorage — per-user namespacing', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('unscoped and guest data live under distinct keys', () => {
    FinovaStorage.setScopeForUser(null);
    const state = FinovaStorage.loadState();
    state.accounts.push({
      id: 'a1', name: 'Test', type: 'cash', currentBalance: 100, currency: 'PHP',
      icon: 'wallet', isDeleted: false, createdAt: '', updatedAt: '',
    } as any);
    FinovaStorage.saveState(state);
    expect(localStorage.getItem('FINOVA_FINANCIAL_OS_DATA_V4:none')).toBeTruthy();
    FinovaStorage.setScopeForUser({ id: 'g1', isGuest: true } as any);
    expect(localStorage.getItem('FINOVA_FINANCIAL_OS_DATA_V4:guest')).toBeNull();
  });

  it('signed-in data is namespaced by user id and invisible to other users', () => {
    FinovaStorage.setScopeForUser({ id: 'user-aaa' } as any);
    const state = FinovaStorage.loadState();
    state.accounts.push({
      id: 'a2', name: 'Private', type: 'cash', currentBalance: 500, currency: 'PHP',
      icon: 'wallet', isDeleted: false, createdAt: '', updatedAt: '',
    } as any);
    FinovaStorage.saveState(state);
    expect(localStorage.getItem('FINOVA_FINANCIAL_OS_DATA_V4:u:user-aaa')).toBeTruthy();

    // Switching users sees an empty state, not user-aaa's data.
    FinovaStorage.setScopeForUser({ id: 'user-bbb' } as any);
    const other = FinovaStorage.loadState();
    expect(other.accounts.find((a) => a.id === 'a2')).toBeUndefined();

    // Back to the owner — data is there again.
    FinovaStorage.setScopeForUser({ id: 'user-aaa' } as any);
    const back = FinovaStorage.loadState();
    expect(back.accounts.find((a) => a.id === 'a2')).toBeTruthy();
  });

  it('wipeForUser removes a user\'s namespace entirely', () => {
    FinovaStorage.setScopeForUser({ id: 'user-ccc' } as any);
    FinovaStorage.saveState(FinovaStorage.loadState());
    expect(localStorage.getItem('FINOVA_FINANCIAL_OS_DATA_V4:u:user-ccc')).toBeTruthy();
    FinovaStorage.wipeForUser('user-ccc');
    expect(localStorage.getItem('FINOVA_FINANCIAL_OS_DATA_V4:u:user-ccc')).toBeNull();
  });

  it('one-time migration moves legacy data into the first scoped user, only once', () => {
    // Seed the pre-scoping legacy key directly.
    const legacy = { ...FinovaStorage.loadState(), accounts: [{ id: 'legacy-1', name: 'Old', type: 'cash', currentBalance: 42, currency: 'PHP', icon: 'wallet', isDeleted: false, createdAt: '', updatedAt: '' }] };
    localStorage.setItem('FINOVA_FINANCIAL_OS_DATA_V4', JSON.stringify(legacy));

    // First scoped load migrates it and sets the device flag.
    FinovaStorage.setScopeForUser({ id: 'user-ddd' } as any);
    const migrated = FinovaStorage.loadState();
    expect(migrated.accounts.find((a) => a.id === 'legacy-1')).toBeTruthy();
    expect(localStorage.getItem('FINOVA_FINANCIAL_OS_DATA_V4:u:user-ddd')).toBeTruthy();

    // A second user must NOT inherit the legacy data (flag already set).
    FinovaStorage.wipeForUser('user-ddd');
    FinovaStorage.setScopeForUser({ id: 'user-eee' } as any);
    const second = FinovaStorage.loadState();
    expect(second.accounts.find((a) => a.id === 'legacy-1')).toBeUndefined();
  });
});
