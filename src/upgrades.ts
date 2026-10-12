import type { WeaponKind } from './data';

export type UpgradeId = WeaponKind | 'power' | 'haste' | 'heal';
export type WeaponLevels = Record<WeaponKind, number>;
export interface UpgradeOption { id: UpgradeId; title: string; description: string; icon: string; }
export type BossUpgradeId = 'speed' | 'guided' | 'volley';
export interface BossUpgradeOption { id: BossUpgradeId; title: string; description: string; icon: string; }
export function bossUpgradeOptions(speed: number, guided: number, arrows: number): BossUpgradeOption[] {
  return [
    { id: 'speed', title: '공격 속도', description: `자동 발사 간격 ${(700 / speed / 1000).toFixed(2)}초 → ${(700 / (speed + .3) / 1000).toFixed(2)}초`, icon: 'bolt' },
    { id: 'guided', title: '가이디드 미사일', description: guided ? `유도 ${guided} → ${guided + 1}단계 · 더 빠르게 방향을 바꿔 추적` : '탄환이 목표를 따라 방향을 바꿔요 · 선택한 단어는 그대로', icon: 'diamond' },
    { id: 'volley', title: '발사 수 증가', description: `동시 발사 ${arrows} → ${arrows + 1}발 · 여러 미니언에게 나눠 발사`, icon: 'bow' },
  ];
}
export const emptyWeaponLevels = (): WeaponLevels => ({ sword: 0, bow: 0, hammer: 0 });
export const ROOM_REWARD_INTERVAL = 3;
export const BOSS_UPGRADE_INTERVAL = 9;
export const MINI_BOSS_REWARD_INTERVAL = 3;
export const experienceNeeded = (level: number) => 72 + (level - 1) * 36;
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
