import { describe, it, expect } from 'vitest';
import { digitsOnly, groupDigits, parseMoney, formatMoneyShort } from './money';

/**
 * These exist because of a real entry: `5000000` typed into a field labelled
 * "FEE CEILING (€M)", stored as five trillion euros, printed as "€5000000.0m".
 * Every player on the roster cleared the budget, all twenty-five scored 87, and
 * nothing on screen looked wrong.
 */

describe('groupDigits', () => {
  it('groups while typing', () => {
    expect(groupDigits('5')).toBe('5');
    expect(groupDigits('5000')).toBe('5,000');
    expect(groupDigits('5000000')).toBe('5,000,000');
  });

  it('survives a pasted, already-formatted amount', () => {
    expect(groupDigits('€4,000,000')).toBe('4,000,000');
  });

  it('drops leading zeros rather than showing 0,005', () => {
    expect(groupDigits('0005000')).toBe('5,000');
  });

  it('is empty when there is nothing to group', () => {
    expect(groupDigits('')).toBe('');
    expect(groupDigits('abc')).toBe('');
  });
});

describe('parseMoney', () => {
  it('reads a grouped amount back', () => {
    expect(parseMoney('5,000,000')).toBe(5_000_000);
  });

  it('is null for an empty field, not zero', () => {
    // Zero would tell the scorer the club will not pay anything, which silently
    // drops every player rather than leaving the criterion unstated.
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('   ')).toBeNull();
  });
});

describe('formatMoneyShort', () => {
  it('says it the way an agent says it', () => {
    expect(formatMoneyShort(5_000_000)).toBe('€5.0m');
    expect(formatMoneyShort(850_000)).toBe('€850k');
    expect(formatMoneyShort(250)).toBe('€250');
  });

  it('makes a mis-keyed amount impossible to ignore', () => {
    // The exact value that got stored. It has to read as absurd.
    expect(formatMoneyShort(5_000_000_000_000)).toBe('€5000.0bn');
    expect(formatMoneyShort(100_000_000_000)).toBe('€100.0bn');
  });

  it('steps up rather than printing a four-figure k', () => {
    // 999,600 rounds to 1000k, which is a million and should say so.
    expect(formatMoneyShort(999_600)).toBe('€1.0m');
    expect(formatMoneyShort(999_000)).toBe('€999k');
  });

  it('handles the boundaries without changing magnitude', () => {
    expect(formatMoneyShort(1_000)).toBe('€1k');
    expect(formatMoneyShort(999)).toBe('€999');
    expect(formatMoneyShort(1_000_000)).toBe('€1.0m');
    expect(formatMoneyShort(0)).toBe('€0');
  });
});

describe('digitsOnly', () => {
  it('keeps only digits', () => {
    expect(digitsOnly('€1.234,56')).toBe('123456');
    expect(digitsOnly('-500')).toBe('500');
  });
});
