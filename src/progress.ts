import type { Word } from './data';
export interface WordRecord { correct: number; wrong: number; hints: number; }
export interface Progress { words: Record<string, WordRecord>; cleared: number; best: number; muted: boolean; custom: Word[]; }
const KEY = 'wordmaster.v1';
export function emptyProgress(): Progress { return { words: {}, cleared: 0, best: 0, muted: false, custom: [] }; }
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
    if (Array.isArray(value.custom)) result.custom = value.custom.filter((w: Word) => w && typeof w.id === 'string' && typeof w.word === 'string' && typeof w.meaning === 'string' && typeof w.example === 'string' && ['sword', 'bow', 'hammer'].includes(w.kind)).slice(0, 30);
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
