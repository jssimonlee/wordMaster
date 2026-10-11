import { describe, expect, it } from 'vitest';
import { arrowCount, emptyWeaponLevels, experienceNeeded, spawnInterval, upgradeOptions } from '../src/upgrades';

describe('arena progression', () => {
  it('accelerates spawning while retaining a lower bound', () => {
    expect(spawnInterval(0, 0)).toBe(4000);
    expect(spawnInterval(20000, 0)).toBe(2600);
    expect(spawnInterval(60000, 3)).toBe(1500);
  });
  it('increases XP thresholds and evolves arrows from one to three to five', () => {
    expect([1, 2, 3].map(experienceNeeded)).toEqual([24, 36, 48]);
    expect([0, 1, 2].map(arrowCount)).toEqual([1, 3, 5]);
  });
  it('offers available weapons and replaces capped upgrades with universal rewards', () => {
    expect(upgradeOptions(emptyWeaponLevels(), ['sword', 'bow', 'hammer']).map(item => item.id)).toEqual(['sword', 'bow', 'hammer']);
    expect(upgradeOptions({ sword: 2, bow: 2, hammer: 2 }, ['sword', 'bow', 'hammer']).map(item => item.id)).toEqual(['power', 'haste', 'heal']);
    expect(upgradeOptions(emptyWeaponLevels(), ['sword']).map(item => item.id)).toEqual(['sword', 'power', 'haste']);
    expect(upgradeOptions({ sword: 1, bow: 1, hammer: 1 }, ['sword', 'bow', 'hammer']).map(item => item.title)).toEqual(['회오리 검무', '오연 관통 사격', '연쇄 지진']);
  });
});
