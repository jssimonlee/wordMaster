import type { WeaponKind } from './data';

export type UpgradeId = WeaponKind | 'power' | 'haste' | 'heal';
export type WeaponLevels = Record<WeaponKind, number>;
export interface UpgradeOption { id: UpgradeId; title: string; description: string; icon: string; }
export const emptyWeaponLevels = (): WeaponLevels => ({ sword: 0, bow: 0, hammer: 0 });
export const experienceNeeded = (level: number) => 24 + (level - 1) * 12;
export const spawnInterval = (elapsedMs: number, room: number) => Math.max(1500, 4000 - elapsedMs * .07 - room * 150);
export const arrowCount = (level: number) => level >= 2 ? 5 : level >= 1 ? 3 : 1;

export function upgradeOptions(levels: WeaponLevels, kinds: WeaponKind[]): UpgradeOption[] {
  const choices: UpgradeOption[] = [];
  for (const kind of [...new Set(kinds)]) {
    if (levels[kind] >= 2) continue;
    const names = {
      sword: ['바람의 검기', '회오리 검무'], bow: ['삼중 화살', '오연 관통 사격'], hammer: ['대지의 충격파', '연쇄 지진'],
    };
    const descriptions = {
      sword: ['공격 범위 증가 · 깨진 방어막을 가르는 검기', '더 긴 검기 · 세 번째 공격마다 회전베기'],
      bow: ['부채꼴로 화살 3발 · 추가 화살로 주변 적 공격', '화살 5발 · 방어막을 깨고 뒤의 적까지 관통'],
      hammer: ['주변의 깨진 방어막에 광역 충격파', '더 넓은 충격파 · 주변에 연쇄 폭발'],
    };
    choices.push({ id: kind, title: names[kind][levels[kind]], description: descriptions[kind][levels[kind]], icon: kind });
  }
  const extras: UpgradeOption[] = [
    { id: 'power', title: '날카로운 기억', description: '모든 무기의 본체 공격력 +8', icon: 'sword' },
    { id: 'haste', title: '바람의 발걸음', description: '공격 속도 · 회피 회복 속도 증가', icon: 'bolt' },
    { id: 'heal', title: '생명의 샘', description: '체력 35 회복 · 최대 체력 +10', icon: 'heart' },
  ];
  return [...choices, ...extras].slice(0, 3);
}
