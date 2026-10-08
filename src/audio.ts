export class GameAudio {
  private context?: AudioContext;
  muted = false;
  unlock() {
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Audio is optional. */ }
  }
  play(effect: 'swing' | 'break' | 'wrong' | 'hurt' | 'dash' | 'clear') {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    const context = this.context;
    const patterns = { swing: [350, 100, .07], break: [880, 220, .22], wrong: [145, 65, .15], hurt: [90, 35, .16], dash: [220, 620, .1], clear: [440, 880, .42] };
    const [from, to, duration] = patterns[effect];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = effect === 'break' || effect === 'clear' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(from, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(to, context.currentTime + duration);
    gain.gain.setValueAtTime(.055, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + duration);
  }
}
