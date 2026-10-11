export class GameAudio {
  private context?: AudioContext;
  muted = false;
  unlock() {
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Audio is optional. */ }
  }
  play(effect: 'swing' | 'shoot' | 'hit' | 'smash' | 'break' | 'wrong' | 'hurt' | 'dash' | 'clear') {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    const context = this.context;
    const patterns = { swing: [350, 100, .09], shoot: [720, 180, .12], hit: [190, 45, .14], smash: [110, 28, .24], break: [880, 220, .22], wrong: [145, 65, .15], hurt: [90, 35, .16], dash: [220, 620, .1], clear: [440, 880, .42] };
    const [from, to, duration] = patterns[effect];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = effect === 'break' || effect === 'clear' || effect === 'hit' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(from, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(to, context.currentTime + duration);
    gain.gain.setValueAtTime(effect === 'smash' ? .16 : effect === 'hit' ? .11 : .065, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    if (effect === 'clear' || effect === 'dash') return;
    // A short filtered noise transient adds a crack to hits and air to swings.
    const impact = effect === 'hit' || effect === 'smash' || effect === 'break';
    const noiseDuration = effect === 'smash' ? .18 : impact ? .1 : .06;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * noiseDuration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = context.createBufferSource(); noise.buffer = buffer;
    const filter = context.createBiquadFilter(); filter.type = 'lowpass';
    filter.frequency.setValueAtTime(effect === 'smash' ? 1100 : impact ? 3600 : 1800, context.currentTime);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(impact ? .16 : .045, context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(.001, context.currentTime + noiseDuration);
    noise.connect(filter); filter.connect(envelope); envelope.connect(context.destination);
    noise.start();
    noise.onended = () => { noise.disconnect(); filter.disconnect(); envelope.disconnect(); };
  }
}
