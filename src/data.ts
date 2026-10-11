export type WeaponKind = 'sword' | 'bow' | 'hammer';
export type LearningFormat = 'vocabulary' | 'quiz';
export interface Word { id: string; word: string; meaning: string; example: string; kind: WeaponKind; format?: LearningFormat; }
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
export function parseWords(raw: string, format: LearningFormat = 'vocabulary'): { words: Word[]; error?: string } {
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 3 || lines.length > 30) return { words: [], error: `${format === 'quiz' ? '문제·답을' : '단어를'} 3~30개 입력해 주세요.` };
  const words: Word[] = [];
  const seen = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const [first = '', second = '', ...exampleParts] = line.split('|').map(part => part.trim());
    const word = format === 'quiz' ? second : first, meaning = format === 'quiz' ? first : second;
    const validWord = format === 'quiz' ? word.length > 0 && word.length <= 40 : /^[a-zA-Z][a-zA-Z '\-]{0,35}$/.test(word);
    if (!validWord || !meaning || meaning.length > (format === 'quiz' ? 80 : 35) || /[\u0000-\u001f\u007f]/u.test(word + meaning)) {
      return { words: [], error: format === 'quiz' ? `${index + 1}번째 줄을 확인해 주세요. 문제 | 답 | 해설 형식이에요. (문제 80자, 답 40자 이하)` : `${index + 1}번째 줄을 확인해 주세요. 영어 단어 | 뜻 | 예문 형식이에요. (뜻은 35자 이하)` };
    }
    const key = word.normalize('NFC').toLowerCase();
    if (seen.has(key)) return { words: [], error: `${word} ${format === 'quiz' ? '답이' : '단어가'} 중복되어 있어요.` };
    if (words.some(item => item.meaning.normalize('NFC') === meaning.normalize('NFC'))) return { words: [], error: `'${meaning}' ${format === 'quiz' ? '문제가' : '뜻이'} 중복돼요. 서로 구별되게 입력해 주세요.` };
    seen.add(key);
    words.push({ id: `${format === 'quiz' ? 'quiz' : 'custom'}:${key}:${meaning.normalize('NFC')}`, word: format === 'quiz' ? word : key, meaning, example: exampleParts.join(' | ').slice(0, 240), kind: KINDS[index % 3], ...(format === 'quiz' ? { format } : {}) });
  }
  return { words };
}
export function sentencePrompt(word: Word): string | null {
  if (!word.example || word.format === 'quiz') return null;
  const escaped = word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
  if (!pattern.test(word.example)) return null;
  return word.example.replace(pattern, '______');
}

/** One input order for any subject; reuse saved identities so learning records survive editing. */
export function parseMemoryPairs(raw: string, saved: Word[] = []): { words: Word[]; error?: string } {
  const result = parseWords(raw, 'quiz');
  if (result.error) return { ...result, error: result.error.replace('문제·답을', '기억을').replace('문제 | 답 | 해설', '문제·뜻 | 답·단어 | 설명') };
  result.words = result.words.map(word => {
    const previous = saved.find(item => item.word.normalize('NFC').toLowerCase() === word.word.normalize('NFC').toLowerCase()
      && item.meaning.normalize('NFC') === word.meaning.normalize('NFC'));
    return previous ? { ...word, id: previous.id, format: previous.format } : word;
  });
  return result;
}

export function serializeMemoryPairs(words: Word[]): string {
  return words.map(word => `${word.meaning} | ${word.word}${word.example ? ` | ${word.example}` : ''}`).join('\n');
}
