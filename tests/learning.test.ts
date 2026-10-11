import { describe, expect, it, afterEach, vi } from 'vitest';
import { DEFAULT_WORDS, parseWords, parseMemoryPairs, serializeMemoryPairs, sentencePrompt, wordGroups } from '../src/data';
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
  it('turns Unicode questions and symbolic answers into the same playable pairs and preserves answer case', () => {
    const result = parseWords('프랑스의 수도는? | 파리 | 지리 해설\n7 × 8 = ? | 56\n물의 화학식은? | H2O | 수소와 산소', 'quiz');
    expect(result.error).toBeUndefined();
    expect(result.words.map(word => [word.word, word.meaning, word.example, word.format])).toEqual([
      ['파리', '프랑스의 수도는?', '지리 해설', 'quiz'], ['56', '7 × 8 = ?', '', 'quiz'], ['H2O', '물의 화학식은?', '수소와 산소', 'quiz'],
    ]);
    expect(resolveStrike(result.words[0].id, result.words[0].id, true)).toBe('break');
    expect(resolveStrike(result.words[1].id, result.words[0].id, true)).toBe('rebound');
    expect(sentencePrompt(result.words[0])).toBeNull();
    expect(parseWords('프랑스의 수도는? | 파리\n7 × 8 = ? | 56\n물의 화학식은? | H2O').error).toBeDefined();
  });
  it('rejects ambiguous quiz choices and empty or oversized fields', () => {
    expect(parseWords('A? | 답\nB? | 답\nC? | 다른 답', 'quiz').error).toContain('중복');
    expect(parseWords('A? | 하나\nA? | 둘\nC? | 셋', 'quiz').error).toContain('중복');
    expect(parseWords('A? | 하나\nB? |\nC? | 셋', 'quiz').error).toContain('2번째');
    expect(parseWords(`${'가'.repeat(81)} | 하나\nB? | 둘\nC? | 셋`, 'quiz').error).toContain('80자');
    expect(parseWords(`A? | ${'가'.repeat(41)}\nB? | 둘\nC? | 셋`, 'quiz').error).toContain('40자');
  });
  it('preserves quiz format and explanations when saving and loading the collection', () => {
    let stored = '';
    vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } });
    const progress = emptyProgress(); progress.custom = parseWords('A? | 1 | 해설\nB? | H2O\nC? | 한국어', 'quiz').words;
    expect(saveProgress(progress)).toBe(true); expect(loadProgress().custom).toEqual(progress.custom);
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

describe('unified memory input', () => {
  it('uses the same prompt-answer order for English, geography and chemistry in one deck', () => {
    const result = parseMemoryPairs('호기심이 많은 | curious | She was curious.\n프랑스의 수도는? | 파리\n물의 화학식은? | H2O');
    expect(result.error).toBeUndefined();
    expect(result.words.map(word => [word.meaning, word.word])).toEqual([['호기심이 많은', 'curious'], ['프랑스의 수도는?', '파리'], ['물의 화학식은?', 'H2O']]);
    expect(parseMemoryPairs(serializeMemoryPairs(result.words)).words).toEqual(result.words);
  });
  it('keeps legacy vocabulary identities and their mastery when editing the unified deck', () => {
    const old = parseWords('curious | 호기심이 많은\nvanish | 사라지다\ncourage | 용기').words;
    const progress = emptyProgress(); recordAttempt(progress, old[0].id, 'correct');
    const result = parseMemoryPairs(serializeMemoryPairs(old), old);
    expect(result.words.map(word => word.id)).toEqual(old.map(word => word.id));
    expect(mastery(progress.words[result.words[0].id])).toBe(18);
    const changed = parseMemoryPairs('호기심이 많은 | curious\n없어지다 | vanish\n용기 | courage',old);
    expect(changed.words[1].id).not.toBe(old[1].id);
  });
});
