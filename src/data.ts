export type WeaponKind = 'sword' | 'bow' | 'hammer';
export interface Word { id: string; word: string; meaning: string; example: string; kind: WeaponKind; }
export const KINDS: WeaponKind[] = ['sword', 'bow', 'hammer'];
export const KIND_NAMES: Record<WeaponKind, string> = { sword: '기억의 검', bow: '메아리 활', hammer: '파쇄의 망치' };
export const COLORS: Record<WeaponKind, string> = { sword: '#68e6ca', bow: '#b2a2ff', hammer: '#f0bf77' };
export const DEFAULT_WORDS: Word[] = [
  { id: 'reluctant', word: 'reluctant', meaning: '내키지 않는', example: 'He was reluctant to answer the question.', kind: 'sword' },
  { id: 'abundant', word: 'abundant', meaning: '풍부한', example: 'The forest has abundant wildlife.', kind: 'bow' },
  { id: 'reckless', word: 'reckless', meaning: '무모한', example: 'His reckless decision put everyone in danger.', kind: 'hammer' },
  { id: 'conceal', word: 'conceal', meaning: '숨기다', example: 'She tried to conceal her disappointment.', kind: 'sword' },
  { id: 'fragile', word: 'fragile', meaning: '깨지기 쉬운', example: 'Please handle this fragile glass with care.', kind: 'bow' },
  { id: 'endure', word: 'endure', meaning: '견디다', example: 'They had to endure a long, cold winter.', kind: 'hammer' },
  { id: 'elusive', word: 'elusive', meaning: '찾기 어려운', example: 'The answer remained elusive.', kind: 'sword' },
  { id: 'diminish', word: 'diminish', meaning: '줄어들다', example: 'The pain began to diminish after a while.', kind: 'bow' },
  { id: 'confront', word: 'confront', meaning: '맞서다', example: 'We need to confront the problem together.', kind: 'hammer' },
  { id: 'cautious', word: 'cautious', meaning: '신중한', example: 'Be cautious when crossing this bridge.', kind: 'sword' },
  { id: 'inevitable', word: 'inevitable', meaning: '불가피한', example: 'Some changes are inevitable.', kind: 'bow' },
  { id: 'scarce', word: 'scarce', meaning: '부족한', example: 'Clean water is scarce in this region.', kind: 'hammer' },
];
export const ROOM_NAMES = ['이끼빛 정원', '달빛 서고', '불씨의 대장간', '서리 유적'];
export function wordGroups(words: Word[]): Word[][] {
  const result: Word[][] = [];
  for (let i = 0; i < words.length; i += 3) result.push(words.slice(i, i + 3));
  return result;
}
export function parseWords(raw: string): { words: Word[]; error?: string } {
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 3 || lines.length > 30) return { words: [], error: '단어를 3~30개 입력해 주세요.' };
  const words: Word[] = [];
  const seen = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const [word = '', meaning = '', ...exampleParts] = line.split('|').map(part => part.trim());
    if (!/^[a-zA-Z][a-zA-Z '\-]{0,35}$/.test(word) || !meaning || meaning.length > 35) {
      return { words: [], error: `${index + 1}번째 줄을 확인해 주세요. 영어 단어 | 뜻 | 예문 형식이에요. (뜻은 35자 이하)` };
    }
    const key = word.toLowerCase();
    if (seen.has(key)) return { words: [], error: `${word} 단어가 중복되어 있어요.` };
    if (words.some(item => item.meaning === meaning)) return { words: [], error: `'${meaning}' 뜻이 중복돼요. 서로 구별되는 뜻으로 입력해 주세요.` };
    seen.add(key);
    words.push({ id: `custom:${key}:${meaning}`, word: key, meaning, example: exampleParts.join(' | ').slice(0, 240), kind: KINDS[index % 3] });
  }
  return { words };
}
export function sentencePrompt(word: Word): string | null {
  if (!word.example) return null;
  const escaped = word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
  if (!pattern.test(word.example)) return null;
  return word.example.replace(pattern, '______');
}
