import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WORDS } from '../src/data';
import { letterCount, normalizeTyping, typingPair, typingTier, reactionCapacity, typingSpawnInterval, validateTypingSettings, loadTypingSettings, saveTypingSettings, recordTypingSpeed, loadTypingRecords } from '../src/typing';

afterEach(() => vi.unstubAllGlobals());
function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  return values;
}
describe('typing spell rules', () => {
  it('uses the specified inclusive and exclusive speed boundaries', () => {
    expect([.149, .15, .2, .201, .3, .301].map(rate => typingTier(rate))).toEqual([3, 2, 2, 1, 1, 0]);
    expect(typingTier(.25, { triple: .3, double: .4, single: .5 })).toBe(3);
  });
  it('counts composed Korean syllables and normalizes equivalent Unicode', () => {
    expect(letterCount('한글')).toBe(2); expect(letterCount('한글')).toBe(2);
    expect(normalizeTyping('CAFÉ')).toBe(normalizeTyping('cafe\u0301'));
    expect(letterCount('🦉')).toBe(1);
    expect(typingPair(DEFAULT_WORDS[0], 6).answer).toBe(DEFAULT_WORDS[0].word);
    expect(typingPair(DEFAULT_WORDS[0], 7).answer).toBe(DEFAULT_WORDS[0].meaning);
  });
  it('starts with all matching enemies and reduces connections as the same prefix slows', () => {
    expect(reactionCapacity(300, 4)).toBe(Infinity);
    expect(reactionCapacity(610, 5)).toBe(3); expect(reactionCapacity(900, 5)).toBe(2);
    expect(reactionCapacity(1200, 5)).toBe(1); expect(reactionCapacity(9000, 5)).toBe(1);
    const intervals = Array.from({ length: 12 }, (_, index) => typingSpawnInterval(index + 1));
    expect(intervals[0]).toBe(2500);
    expect(intervals.every((value, index) => !index || intervals[index - 1] - value <= 90)).toBe(true);
    expect(typingSpawnInterval(12, 10000000)).toBeGreaterThanOrEqual(1350);
  });
  it('validates and persists ordered thresholds, recovering malformed storage', () => {
    const values = storage();
    expect(validateTypingSettings({ triple: .2, double: .2, single: .3 })).toBe(false);
    expect(validateTypingSettings({ triple: NaN, double: .2, single: .3 })).toBe(false);
    expect(saveTypingSettings({ triple: .18, double: .25, single: .4 })).toBe(true);
    expect(loadTypingSettings()).toEqual({ triple: .18, double: .25, single: .4 });
    values.set('wordmaster.typing.settings', '{oops');
    expect(loadTypingSettings()).toEqual({ triple: .15, double: .2, single: .3 });
  });
  it('requires a prior record for a shockwave and keeps independent reverse records', () => {
    storage(); const records: Record<string, number> = {};
    expect(recordTypingSpeed(records, 'forward:x', .21)).toBe(false);
    expect(recordTypingSpeed(records, 'forward:x', .22)).toBe(false);
    expect(recordTypingSpeed(records, 'forward:x', .19)).toBe(true);
    expect(recordTypingSpeed(records, 'reverse:x', .1)).toBe(false);
    expect(loadTypingRecords()).toEqual({ 'forward:x': .19, 'reverse:x': .1 });
  });
});
