/** Render at display pixel density without changing the game's world coordinates. */
export function renderingScale(width: number, height: number, deviceRatio = window.devicePixelRatio || 1) {
  const displayZoom = Math.max(.1, Math.min(width / 1040, height / 620));
  const worldPixels = width * height / (displayZoom * displayZoom);
  return Math.min(4, Math.max(1, displayZoom * deviceRatio), Math.sqrt(8_000_000 / worldPixels));
}
