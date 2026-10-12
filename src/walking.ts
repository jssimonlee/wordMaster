import Phaser from 'phaser';

export type WalkingKind = 'chaser' | 'charger' | 'caster' | 'miniboss';
export interface WalkState { phase: number; frame: number; }
const KINDS: WalkingKind[] = ['chaser', 'charger', 'caster', 'miniboss'];
const FRAMES = 12;
const COLS = 14, ROWS = 18;

function smooth(from: number, to: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/** Deform a continuous mesh: opposite legs lift and swing, arms counter-swing.
 * Keeping the texture bounds and sprite centre fixed preserves combat geometry.
 */
export function walkingVertex(x: number, y: number, phase: number, kind: WalkingKind) {
  const step = Math.sin(phase), side = x < .5 ? -1 : 1;
  const leg = smooth(.55, .96, y) * smooth(.025, .16, Math.abs(x - .5));
  const arm = smooth(.19, .39, Math.abs(x - .5)) * smooth(.22, .4, y) * (1 - smooth(.6, .74, y));
  const cloth = kind === 'caster' ? .7 : 1;
  const lift = Math.max(0, side * step);
  const bob = Math.abs(Math.cos(phase)) * .012 * Math.sin(Math.PI * y);
  return {
    x: x + side * step * .044 * leg * cloth - side * step * .024 * arm + step * .006 * Math.sin(Math.PI * y),
    y: y - lift * .052 * leg - bob + side * step * .012 * arm,
  };
}

type Point = { x: number; y: number; };
function triangle(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, source: Point[], dest: Point[]) {
  const [p, q, r] = source, [a, b, c] = dest;
  const ux = q.x - p.x, uy = q.y - p.y, vx = r.x - p.x, vy = r.y - p.y;
  const det = ux * vy - vx * uy;
  const m0 = ((b.x - a.x) * vy - (c.x - a.x) * uy) / det;
  const m1 = ((b.y - a.y) * vy - (c.y - a.y) * uy) / det;
  const m2 = ((c.x - a.x) * ux - (b.x - a.x) * vx) / det;
  const m3 = ((c.y - a.y) * ux - (b.y - a.y) * vx) / det;
  // Subpixel overlap prevents hairline seams between adjacent triangles.
  const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3;
  ctx.save(); ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const point = dest[i], distance = Math.hypot(point.x - cx, point.y - cy);
    const x = point.x + (point.x - cx) / distance * .4, y = point.y + (point.y - cy) / distance * .4;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.clip();
  ctx.transform(m0, m1, m2, m3, a.x - m0 * p.x - m2 * p.y, a.y - m1 * p.x - m3 * p.y);
  ctx.drawImage(image, 0, 0); ctx.restore();
}

/** Build reusable high-resolution walk cycles once from the existing character art. */
export function prepareWalking(scene: Phaser.Scene) {
  const atlas = scene.textures.get('characters');
  for (const kind of KINDS) {
    const key = `walk-${kind}`;
    if (scene.textures.exists(key)) continue;
    const frame = atlas.get(kind), w = frame.realWidth, h = frame.realHeight;
    const image = frame.source.image;
    if (!(image instanceof HTMLCanvasElement) && !(image instanceof HTMLImageElement)) throw new Error('Walking requires a loaded character atlas.');
    const source = document.createElement('canvas'); source.width = w; source.height = h;
    source.getContext('2d')!.drawImage(image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, w, h);
    const gutter = 4, strideX = w + gutter * 2, strideY = h + gutter * 2;
    const canvas = document.createElement('canvas');
    canvas.width = Phaser.Math.Pow2.GetNext(strideX * 3); canvas.height = Phaser.Math.Pow2.GetNext(strideY * 4);
    const ctx = canvas.getContext('2d')!;
    for (let index = 0; index < FRAMES; index++) {
      const offsetX = index % 3 * strideX + gutter, offsetY = Math.floor(index / 3) * strideY + gutter;
      const phase = index / FRAMES * Math.PI * 2;
      ctx.save(); ctx.translate(offsetX, offsetY); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
        const points = [[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1]];
        const from = points.map(([x, y]) => ({ x: x / COLS * w, y: y / ROWS * h }));
        const to = points.map(([x, y]) => { const vertex = walkingVertex(x / COLS, y / ROWS, phase, kind); return { x: vertex.x * w, y: vertex.y * h }; });
        triangle(ctx, source, [from[0], from[1], from[2]], [to[0], to[1], to[2]]);
        triangle(ctx, source, [from[0], from[2], from[3]], [to[0], to[2], to[3]]);
      }
      ctx.restore();
    }
    const texture = scene.textures.addCanvas(key, canvas)!;
    for (let index = 0; index < FRAMES; index++) texture.add(index, 0, index % 3 * strideX + gutter, Math.floor(index / 3) * strideY + gutter, w, h);
  }
}

export function newWalk(seed: number): WalkState {
  return { phase: seed * 2.399963, frame: -1 };
}

export function animateWalking(sprite: Phaser.GameObjects.Sprite, shadow: Phaser.GameObjects.Ellipse, walk: WalkState, kind: WalkingKind, distance: number, dt: number) {
  if (distance <= .005) {
    if (sprite.texture.key !== 'characters' || sprite.frame.name !== kind) sprite.setTexture('characters', kind);
    walk.frame = -1; shadow.setScale(1); return;
  }
  const speed = distance / Math.max(1, dt) * 1000;
  // Armour has a weightier cadence; charges run faster, but never flicker.
  const cadence = Math.min(12, Math.max(kind === 'charger' ? 4 : 4.8, speed * .08));
  walk.phase = (walk.phase + dt / 1000 * cadence) % (Math.PI * 2);
  const frame = Math.floor(walk.phase / (Math.PI * 2) * FRAMES) % FRAMES;
  if (frame !== walk.frame || sprite.texture.key !== `walk-${kind}`) sprite.setTexture(`walk-${kind}`, frame);
  walk.frame = frame;
  shadow.setScale(1 - Math.abs(Math.cos(walk.phase)) * .09, 1 + Math.abs(Math.cos(walk.phase)) * .04);
}
