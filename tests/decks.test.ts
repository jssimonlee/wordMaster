import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseMemoryPairs } from '../src/data';
import { emptyProgress, loadProgress, recordAttempt, saveProgress } from '../src/progress';
import { prepareDeckSave, selectDeck } from '../src/decks';

const raw = '프랑스의 수도는? | 파리\n물의 화학식은? | H2O\n7 × 8 = ? | 56';
afterEach(() => vi.unstubAllGlobals());
function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  return values;
}
describe('named memory books', () => {
  it('migrates the old book with its learning records and retains it when creating a new one', () => {
    const values = storage(), words = parseMemoryPairs(raw).words;
    values.set('wordmaster.v1', JSON.stringify({ custom: words, words: { [words[0].id]: { correct: 4, wrong: 1, hints: 0 } } }));
    const progress = loadProgress();
    expect(progress.decks).toEqual([{ id: 'legacy-memory', name: '기존 기억', words }]);
    const next = prepareDeckSave(progress, null, '화학', '원소 H | 수소\n원소 O | 산소\n원소 C | 탄소').progress!;
    expect(next.decks).toHaveLength(2); expect(next.decks[0].words).toEqual(words);
    expect(progress.decks).toHaveLength(1);
    expect(next.words[words[0].id].correct).toBe(4);
    expect(saveProgress(next)).toBe(true);
    expect(loadProgress().decks).toEqual(next.decks);
    expect(selectDeck(next, 'legacy-memory')!.custom).toEqual(words);
  });
  it('renames and edits only the selected book while preserving identities for unchanged pairs', () => {
    const progress = prepareDeckSave(emptyProgress(), null, '상식', raw).progress!;
    recordAttempt(progress, progress.custom[0].id, 'correct');
    const second = prepareDeckSave(progress, null, '과학', '빛의 속력? | 광속\n힘의 단위? | N\n에너지 단위? | J').progress!;
    const renamed = prepareDeckSave(second, progress.activeDeckId, '수도와 상식', raw).progress!;
    expect(renamed.decks).toHaveLength(2); expect(renamed.decks[1]).toEqual(second.decks[1]);
    expect(renamed.custom[0].id).toBe(progress.custom[0].id);
    expect(renamed.words[renamed.custom[0].id].correct).toBe(1);
    expect(prepareDeckSave(renamed, null, '수도와 상식', raw).error).toContain('같은 이름');
    expect(prepareDeckSave(renamed, null, '', raw).error).toContain('이름');
    expect(prepareDeckSave(renamed, null, '31개', Array.from({ length: 31 }, (_, i) => `문제${i} | 답${i}`).join('\n')).error).toContain('3~30');
  });
  it('does not impose a book-count cap and does not mutate the current books on failed writes', () => {
    storage(); let progress = emptyProgress();
    for (let i = 0; i < 35; i++) progress = prepareDeckSave(progress, null, `책 ${i}`, raw).progress!;
    expect(progress.decks).toHaveLength(35);
    const before = JSON.stringify(progress);
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('full'); } });
    const next = prepareDeckSave(progress, null, '새 책', raw).progress!;
    expect(saveProgress(next)).toBe(false); expect(JSON.stringify(progress)).toBe(before);
  });
});
