import { describe, expect, it } from 'vitest';
import { RuneTowers, towerAppearance, towerGlyph, towerInitial, towerStats, freshTowerUpgrades, MAX_TOWER_PROJECTILES } from '../src/towers';

describe('first-letter guardian towers', () => {
  it('evolves through four separate illustrated forms and retains the final form at higher levels', () => {
    expect([1, 2, 3, 4, 12].map(level => towerAppearance(level).stage)).toEqual([1, 2, 3, 4, 4]);
    expect(new Set([1, 2, 3, 4].map(level => towerAppearance(level).texture)).size).toBe(4);
    expect(towerAppearance(1).muzzle).toBeLessThan(towerAppearance(4).muzzle);
  });
  it('awards one point per highest-tier answer and unlocks its normalized initial', () => {
    const towers = new RuneTowers();
    for (const tier of [0, 1, 2]) expect(towers.earn('Reluctant', tier)).toBe(false);
    expect(towers.earn('Reluctant', 3)).toBe(true);
    towers.earn('reckless', 3);
    expect(towers.points).toBe(2); expect(towers.runes).toEqual(['r']);
    expect(towerInitial('  E\u0301clair')).toBe('é');
    expect(towerInitial('빛나는')).toBe('빛'); expect(towerGlyph('r')).toBe('R');
    expect(towers.earn(' ', 3)).toBe(false);
  });
  it('spends only on valid builds and upgrades, and moves existing towers for free', () => {
    const towers = new RuneTowers();
    expect(towers.build(0, 'r', 0)).toBe(false);
    for (let i = 0; i < 4; i++) towers.earn('rune', 3);
    for (const slot of [-1, 6, .5]) expect(towers.build(slot, 'r', 0)).toBe(false);
    expect(towers.build(0, 'x', 0)).toBe(false);
    expect(towers.build(0, 'r', 100)).toBe(true);
    expect(towers.build(0, 'r', 100)).toBe(false);
    expect(towers.upgrade(0, 'power')).toBe(true);
    expect(towers.upgrade(5, 'speed')).toBe(false);
    expect(towers.points).toBe(2);
    const tower = towers.at(0)!;
    expect(towers.move(0, 4)).toBe(true);
    expect(towers.at(4)).toBe(tower); expect(tower.level).toBe(2); expect(towers.points).toBe(2);
    towers.build(5, 'r', 100);
    expect(towers.move(4, 5)).toBe(false);
    towers.upgrade(4, 'volley'); expect(towers.upgrade(4, 'volley')).toBe(false);
    expect(towers.points).toBe(0);
  });
  it('only improves the chosen ability and preserves specializations when moving', () => {
    const towers = new RuneTowers();
    for (let i = 0; i < 6; i++) towers.earn('rune', 3);
    towers.build(0, 'r', 0);
    const tower = towers.at(0)!, base = towerStats(tower.upgrades);
    towers.upgrade(0, 'speed');
    expect(towerStats(tower.upgrades)).toEqual({ ...base, interval: expect.closeTo(450 + 1150 / 1.35) });
    towers.upgrade(0, 'volley');
    expect(towerStats(tower.upgrades).projectiles).toBe(2);
    expect(towerStats(tower.upgrades).damage).toBe(12);
    towers.upgrade(0, 'range');
    expect(towerStats(tower.upgrades).range).toBeCloseTo(1.16);
    towers.upgrade(0, 'power');
    expect(towerStats(tower.upgrades).damage).toBeCloseTo(19.368877205250523);
    expect(tower.level).toBe(5);
    expect(tower.upgrades).toEqual({ power: 1, speed: 1, volley: 1, range: 1 });
    expect(towers.move(0, 4)).toBe(true);
    expect(towers.at(4)?.upgrades).toEqual(tower.upgrades);
    const points = towers.points;
    expect(towers.upgrade(4, 'unknown' as any)).toBe(false);
    expect(towers.points).toBe(points);
  });
  it('caps simultaneous projectiles without spending a point on a maxed choice', () => {
    const towers = new RuneTowers();
    for (let i = 0; i < 12; i++) towers.earn('rune', 3);
    towers.build(0, 'r', 0);
    for (let i = 1; i < MAX_TOWER_PROJECTILES; i++) expect(towers.upgrade(0, 'volley')).toBe(true);
    const points = towers.points, level = towers.at(0)!.level;
    expect(towerStats(towers.at(0)!.upgrades).projectiles).toBe(6);
    expect(towers.upgrade(0, 'volley')).toBe(false);
    expect(towers.points).toBe(points); expect(towers.at(0)!.level).toBe(level);
    expect(towers.upgrade(0, 'speed')).toBe(true);
  });
  it('keeps power and speed improving without a level cap while each hit remains weaker than a full spell', () => {
    const upgrades = freshTowerUpgrades(); let previous = towerStats(upgrades);
    for (let level = 1; level <= 30; level++) {
      upgrades.power++; upgrades.speed++; upgrades.range++;
      const next = towerStats(upgrades);
      expect(next.damage).toBeGreaterThan(previous.damage); expect(next.damage).toBeLessThan(100);
      expect(next.interval).toBeLessThan(previous.interval); expect(next.interval).toBeGreaterThan(450);
      expect(next.range).toBeGreaterThan(previous.range); expect(next.projectiles).toBe(1);
      previous = next;
    }
  });
});
