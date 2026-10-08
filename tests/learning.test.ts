import { describe, expect, it, afterEach, vi } from 'vitest';
import { DEFAULT_WORDS, parseWords, sentencePrompt, wordGroups } from '../src/data';
import { emptyProgress, loadProgress, mastery, recordAttempt, resolveStrike, saveProgress } from '../src/progress';

afterEach(() => vi.unstubAllGlobals());
describe('custom dungeon content', () => {
  it('keeps every word playable when the last weapon group is incomplete', () => {
    const result = parseWords('curious | 호기심이 많은\nvanish | 사라지다\ncourage | 용기\nsteady | 꾸준한');
    expect(result.error).toBeUndefined();
    expect(wordGroups(result.words).map(group => group.length)).toEqual([3, 1]);
    expect(wordGroups(result.words).flat().map(word => word.word)).toEqual(['curious', 'vanish', 'courage', 'steady']);
  });
  it('rejects ambiguous meanings, duplicate words, invalid lines and oversized decks', () => {
    expect(parseWords('one | 하나\ntwo | 하나\nthree | 셋').error).toContain('중복');
    expect(parseWords('one | 하나\nONE | 일\nthree | 셋').error).toContain('중복');
    expect(parseWords('one | 하나\ntwo\nthree | 셋').error).toContain('2번째');
    expect(parseWords('one | 하나').words).toEqual([]);
    expect(parseWords(Array.from({ length: 31 }, () => 'one | 하나').join('\n')).error).toContain('3~30');
  });
  it('uses the original sentence only when it actually contains the selected word', () => {
    for (const word of DEFAULT_WORDS) {
      expect(sentencePrompt(word)).toContain('______');
      expect(sentencePrompt(word)?.toLowerCase()).not.toContain(word.word);
    }
    expect(sentencePrompt({ ...DEFAULT_WORDS[0], example: 'An unrelated sentence.' })).toBeNull();
    expect(sentencePrompt({ ...DEFAULT_WORDS[0], word: 'end', example: 'A splendid day.' })).toBeNull();
  });
  it('tracks different senses of a custom word independently', () => {
    const a = parseWords('charge | 청구하다\nvanish | 사라지다\ncourage | 용기').words;
    const b = parseWords('charge | 돌진하다\nvanish | 사라지다\ncourage | 용기').words;
    expect(a[0].id).not.toBe(b[0].id);
    expect(a[1].id).toBe(b[1].id);
  });
});
describe('meaning shields and progress', () => {
  it('requires the matching word to break a shield but permits any weapon afterward', () => {
    expect(resolveStrike('reluctant', 'reluctant', true)).toBe('break');
    expect(resolveStrike('reckless', 'reluctant', true)).toBe('rebound');
    expect(resolveStrike('reckless', 'reluctant', false)).toBe('hit');
  });
  it('records successes, errors and hints separately and bounds mastery', () => {
    const progress = emptyProgress();
    recordAttempt(progress, 'reluctant', 'correct');
    recordAttempt(progress, 'reluctant', 'wrong');
    recordAttempt(progress, 'reluctant', 'hints');
    expect(progress.words.reluctant).toEqual({ correct: 1, wrong: 1, hints: 1 });
    expect(mastery(progress.words.reluctant)).toBe(7);
    expect(mastery({ correct: 0, wrong: 3, hints: 0 })).toBe(0);
    expect(mastery({ correct: 20, wrong: 0, hints: 0 })).toBe(100);
  });
  it('persists progress and safely handles malformed or unavailable storage', () => {
    let stored = '';
    vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } });
    const progress = emptyProgress(); recordAttempt(progress, 'reluctant', 'correct');
    expect(saveProgress(progress)).toBe(true); expect(loadProgress().words.reluctant.correct).toBe(1);
    stored = 'broken json'; expect(loadProgress()).toEqual(emptyProgress());
    stored = JSON.stringify({ words: { invalid: { correct: 'many' }, valid: { correct: 2, wrong: 0, hints: 0 } }, cleared: -1 });
    expect(Object.keys(loadProgress().words)).toEqual(['valid']);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(loadProgress()).toEqual(emptyProgress()); expect(saveProgress(progress)).toBe(false);
  });
});
