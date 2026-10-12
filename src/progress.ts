import type { Word } from './data';
export interface WordRecord { correct: number; wrong: number; hints: number; }
export interface MemoryDeck { id: string; name: string; words: Word[]; }
export interface Progress { words: Record<string, WordRecord>; cleared: number; best: number; muted: boolean; custom: Word[]; decks: MemoryDeck[]; activeDeckId: string | null; }
const KEY = 'wordmaster.v1';
export function emptyProgress(): Progress { return { words: {}, cleared: 0, best: 0, muted: false, custom: [], decks: [], activeDeckId: null }; }
function loadWords(value: unknown): Word[] {
  return Array.isArray(value) ? value.filter((w: Word) => w && typeof w.id === 'string' && typeof w.word === 'string' && typeof w.meaning === 'string' && typeof w.example === 'string' && ['sword', 'bow', 'hammer'].includes(w.kind)).slice(0, 30) : [];
}
export function loadProgress(): Progress {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!value || typeof value !== 'object') return emptyProgress();
    const result = emptyProgress();
    if (value.words && typeof value.words === 'object' && !Array.isArray(value.words)) {
      for (const [id, record] of Object.entries(value.words)) {
        const item = record as WordRecord;
        if (item && [item.correct, item.wrong, item.hints].every(n => Number.isFinite(n) && n >= 0)) result.words[id] = item;
      }
    }
    result.cleared = Number.isFinite(value.cleared) && value.cleared >= 0 ? value.cleared : 0;
    result.best = Number.isFinite(value.best) && value.best >= 0 ? value.best : 0;
    result.muted = value.muted === true;
    if (Array.isArray(value.decks)) {
      for (const deck of value.decks) {
        if (!deck || typeof deck.id !== 'string' || !deck.id || deck.id.length > 100 || typeof deck.name !== 'string' || !deck.name.trim() || deck.name.length > 40 || result.decks.some(item => item.id === deck.id)) continue;
        const words = loadWords(deck.words);
        if (words.length) result.decks.push({ id: deck.id, name: deck.name.trim(), words });
      }
    }
    const legacy = loadWords(value.custom);
    if (!result.decks.length && legacy.length) result.decks.push({ id: 'legacy-memory', name: '기존 기억', words: legacy });
    result.activeDeckId = result.decks.find(deck => deck.id === value.activeDeckId)?.id ?? result.decks[0]?.id ?? null;
    result.custom = result.decks.find(deck => deck.id === result.activeDeckId)?.words ?? [];
    return result;
  } catch { return emptyProgress(); }
}
export function saveProgress(progress: Progress): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); return true; } catch { return false; }
}
export function mastery(record?: WordRecord): number {
  if (!record) return 0;
  return Math.max(0, Math.min(100, Math.round(record.correct * 18 - record.wrong * 8 - record.hints * 3)));
}
export function recordAttempt(progress: Progress, id: string, event: keyof WordRecord) {
  const record = progress.words[id] ??= { correct: 0, wrong: 0, hints: 0 };
  record[event]++;
}
export function resolveStrike(weaponId: string, targetId: string, shielded: boolean): 'break' | 'rebound' | 'hit' {
  return shielded ? weaponId === targetId ? 'break' : 'rebound' : 'hit';
}
