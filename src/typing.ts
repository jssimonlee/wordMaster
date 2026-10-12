import type { Word } from './data';

export const TYPING_MAP_NAME = '백뢰의 회랑';
export const TYPING_ROUNDS = 12;
export interface TypingSettings { triple: number; double: number; single: number; }
export const DEFAULT_TYPING_SETTINGS: TypingSettings = { triple: .15, double: .20, single: .30 };
export interface TypingView {
  value: string; composing: boolean; valid: boolean; letters: number; progress: number;
  rate: number | null; capacity: number; connected: number; ambiguous: boolean;
  result: string; record: boolean;
}

export function normalizeTyping(value: string) { return value.normalize('NFC').toLocaleLowerCase(); }
export function letterCount(value: string) { return Array.from(value.normalize('NFC')).length; }
export function typingPair(word: Word, round: number) {
  const reversed = round >= 7;
  return { prompt: reversed ? word.word : word.meaning, answer: reversed ? word.meaning : word.word, reversed };
}
export function typingTier(secondsPerLetter: number, settings = DEFAULT_TYPING_SETTINGS): number {
  if (secondsPerLetter < settings.triple) return 3;
  if (secondsPerLetter <= settings.double) return 2;
  if (secondsPerLetter <= settings.single) return 1;
  return 0;
}
export function reactionCapacity(elapsedMs: number, letters: number, settings = DEFAULT_TYPING_SETTINGS) {
  if (elapsedMs < 600) return Infinity;
  return Math.max(1, typingTier(elapsedMs / 1000 / Math.max(1, letters), settings));
}
export function typingSpawnInterval(round: number, elapsedMs = 0) {
  return Math.max(1350, 2500 - (Math.max(1, Math.min(TYPING_ROUNDS, round)) - 1) * 90 - Math.min(160, elapsedMs / 60000 * 60));
}
export function validateTypingSettings(settings: TypingSettings) {
  return [settings.triple, settings.double, settings.single].every(value => Number.isFinite(value) && value >= .03 && value <= 2)
    && settings.triple < settings.double && settings.double < settings.single;
}
export function loadTypingSettings(): TypingSettings {
  try {
    const value = JSON.parse(localStorage.getItem('wordmaster.typing.settings') || 'null');
    if (value && validateTypingSettings(value)) return { triple: value.triple, double: value.double, single: value.single };
  } catch { /* Use the playable defaults if storage is unavailable. */ }
  return { ...DEFAULT_TYPING_SETTINGS };
}
export function saveTypingSettings(settings: TypingSettings) {
  if (!validateTypingSettings(settings)) return false;
  try { localStorage.setItem('wordmaster.typing.settings', JSON.stringify(settings)); return true; } catch { return false; }
}

export function loadTypingRecords(): Record<string, number> {
  try {
    const value = JSON.parse(localStorage.getItem('wordmaster.typing.records') || '{}');
    return Object.fromEntries(Object.entries(value).filter(([, time]) => typeof time === 'number' && Number.isFinite(time) && time > 0 && time < 60)) as Record<string, number>;
  } catch { return {}; }
}
export function recordTypingSpeed(records: Record<string, number>, key: string, rate: number) {
  const previous = records[key];
  const improved = previous !== undefined && rate < previous - .0005;
  if (previous === undefined || improved) {
    records[key] = rate;
    try { localStorage.setItem('wordmaster.typing.records', JSON.stringify(records)); } catch { /* Records still work for this run. */ }
  }
  return improved;
}
