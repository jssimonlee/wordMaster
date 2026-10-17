import { normalizeTyping } from './typing';

export const TOWER_SLOTS = 6;
export const MAX_TOWER_PROJECTILES = 6;
export const TOWER_UPGRADE_KEYS = ['power', 'speed', 'volley', 'range'] as const;
export type TowerUpgrade = typeof TOWER_UPGRADE_KEYS[number];
export type TowerUpgrades = Record<TowerUpgrade, number>;
export const TOWER_UPGRADE_NAMES: Record<TowerUpgrade, string> = { power: '공격력', speed: '연사 속도', volley: '다중 발사', range: '사거리' };
export const isTowerUpgrade = (value: string): value is TowerUpgrade => TOWER_UPGRADE_KEYS.some(key => key === value);
export const freshTowerUpgrades = (): TowerUpgrades => ({ power: 0, speed: 0, volley: 0, range: 0 });
export const towerInitial = (answer: string) => Array.from(normalizeTyping(answer.trim()))[0] ?? '';
export const towerGlyph = (initial: string) => /^[a-z]$/.test(initial) ? initial.toUpperCase() : initial;
export const towerSlotName = (slot: number) => `${slot < 3 ? '위' : '아래'} ${slot % 3 + 1}`;
export function towerAppearance(level: number) {
  const stage = Math.min(4, Math.max(1, Math.floor(level)));
  const names = ['낡은 목재 초소', '돌 감시탑', '비전 마법 포대', '백뢰의 성채'];
  return { stage, texture: `guardian-evolution-${stage}`, name: names[stage - 1], muzzle: [27, 48, 45, 58][stage - 1], size: [80, 88, 98, 108][stage - 1],
    runeX: [.492, .618, .5, .5][stage - 1], runeY: [.755, .605, .7, .772][stage - 1] };
}
export function towerStats(upgrades: TowerUpgrades = freshTowerUpgrades()) {
  return {
    damage: 12 + 48 * (1 - Math.exp(-upgrades.power / 6)),
    interval: 450 + 1150 / (1 + upgrades.speed * .35),
    projectiles: Math.min(MAX_TOWER_PROJECTILES, 1 + upgrades.volley),
    range: 1 + Math.log2(1 + upgrades.range) * .16,
  };
}
export function towerUpgradeStats(upgrades: TowerUpgrades, kind: TowerUpgrade) {
  return towerStats({ ...upgrades, [kind]: upgrades[kind] + 1 });
}
export interface TowerBuild { slot: number; initial: string; level: number; upgrades: TowerUpgrades; }
export interface RuneTower extends TowerBuild { nextShot: number; shots: number; }
export interface TowerView {
  points: number; runes: string[]; towers: TowerBuild[];
  editing: boolean; rune: string | null; selected: number | null; moving: boolean;
}

/** Run-local rewards. Tower kills never award points or unlock letters. */
export class RuneTowers {
  points = 0;
  runes: string[] = [];
  towers: RuneTower[] = [];
  earn(answer: string, tier: number) {
    const initial = towerInitial(answer);
    if (tier !== 3 || !initial) return false;
    this.points++;
    if (!this.runes.includes(initial)) this.runes.push(initial);
    return true;
  }
  at(slot: number) { return this.towers.find(tower => tower.slot === slot); }
  build(slot: number, initial: string, now: number) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= TOWER_SLOTS || this.at(slot) || !this.runes.includes(initial) || this.points < 1) return false;
    this.points--;
    this.towers.push({ slot, initial, level: 1, upgrades: freshTowerUpgrades(), nextShot: now + towerStats().interval, shots: 0 });
    return true;
  }
  upgrade(slot: number, kind: TowerUpgrade) {
    const tower = this.at(slot);
    if (!tower || !isTowerUpgrade(kind) || this.points < 1 || (kind === 'volley' && towerStats(tower.upgrades).projectiles >= MAX_TOWER_PROJECTILES)) return false;
    this.points--; tower.level++; tower.upgrades[kind]++;
    return true;
  }
  move(from: number, to: number) {
    const tower = this.at(from);
    if (!tower || !Number.isInteger(to) || to < 0 || to >= TOWER_SLOTS || this.at(to)) return false;
    tower.slot = to;
    return true;
  }
}
