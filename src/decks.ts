import { parseMemoryPairs, type Word } from './data';
import type { MemoryDeck, Progress } from './progress';

export function selectedDeck(progress: Progress) { return progress.decks.find(deck => deck.id === progress.activeDeckId); }
export function nextDeckName(progress: Progress) {
  let index = 1;
  while (progress.decks.some(deck => deck.name === `나의 기억 ${index}`)) index++;
  return `나의 기억 ${index}`;
}
export function selectDeck(progress: Progress, id: string): Progress | undefined {
  const deck = progress.decks.find(item => item.id === id);
  return deck ? { ...progress, activeDeckId: id, custom: deck.words } : undefined;
}

/** Prepare a new save without mutating the current collection until storage succeeds. */
export function prepareDeckSave(progress: Progress, id: string | null, name: string, raw: string): { progress?: Progress; deck?: MemoryDeck; error?: string } {
  name = name.trim().normalize('NFC');
  if (!name || name.length > 40) return { error: '단어장 이름을 1~40자로 입력하세요.' };
  if (progress.decks.some(deck => deck.id !== id && deck.name.normalize('NFC').toLowerCase() === name.toLowerCase())) return { error: '같은 이름의 단어장이 있어요. 다른 이름을 사용하거나 해당 단어장을 선택하세요.' };
  if (id && !progress.decks.some(deck => deck.id === id)) return { error: '단어장을 다시 선택해 주세요.' };
  const saved: Word[] = progress.decks.flatMap(deck => deck.words).concat(progress.custom);
  const result = parseMemoryPairs(raw, saved);
  if (result.error) return { error: result.error };
  const deck = { id: id ?? crypto.randomUUID(), name, words: result.words };
  const decks = id ? progress.decks.map(item => item.id === id ? deck : item) : [...progress.decks, deck];
  return { deck, progress: { ...progress, decks, activeDeckId: deck.id, custom: deck.words } };
}
