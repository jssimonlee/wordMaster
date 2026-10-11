import './style.css';
import { COLORS, DEFAULT_WORDS, KIND_NAMES, parseWords, type WeaponKind, type Word } from './data';
import { loadProgress, mastery, recordAttempt, saveProgress } from './progress';
import { mountGame, type DungeonScene, type GameEvent, type Snapshot } from './game';
import type { UpgradeId, UpgradeOption } from './upgrades';

const paths: Record<string, string> = {
  sword: '<path d="m16 3 5 0 0 5-11 11-5-5L16 3Z"/><path d="m4 13 7 7M3 21l4-4"/>',
  bow: '<path d="M5 3c19 0 19 18 0 18l5-9-5-9Z"/><path d="M5 12h16m-4-4 4 4-4 4"/>',
  hammer: '<path d="m8 11 5 5-7 7-5-5 7-7Z"/><path d="m8 6 5-5 10 10-5 5L8 6Z"/>',
  book: '<path d="M12 5c-3-2-7-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  diamond: '<path d="m12 2 9 10-9 10L3 12 12 2Z"/><path d="m12 7 4 5-4 5-4-5 4-5Z"/>',
  heart: '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 2 11 8 16 6-5 13-11 8-16Z"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>',
  shield: '<path d="m12 2 9 4v6c0 5-6 9-9 10-3-1-9-5-9-10V6l9-4Z"/>',
  skull: '<path d="M5 15c-6-13 20-17 15 0l-3 2v4H8v-4l-3-2Z"/><path d="M8 10v3m8-3v3m-4 5v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9 8a3 3 0 1 1 4 3c-1 .5-1 1-1 3m0 3v1"/>',
  flag: '<path d="M5 22V3c7-5 8 5 15 0v11c-7 5-8-5-15 0"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
};
function icon(name: string, cls = '') { return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.diamond}</svg>`; }
function escape(text: string) { return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!)); }
function el<T extends HTMLElement = HTMLElement>(id: string) { return document.getElementById(id) as T; }
const progress = loadProgress();
let activeWords = DEFAULT_WORDS;
let scene: DungeonScene | undefined;
let state: Snapshot | undefined;
let overlay: 'start' | 'none' | 'pause' | 'hint' | 'reward' | 'upgrade' | 'finish' = 'start';
let modalOpen = false;
let ready = false;
let lastArmory = '';
let lastRoute = '';
let toastTimeout: ReturnType<typeof setTimeout>;
let runCorrect = 0, runWrong = 0, runHints = 0;
let codexTab: 'default' | 'custom' = 'default';

el('app').innerHTML = `
  <main class="game-panel" aria-label="던전 게임">
    <div class="game-stage">
      <div id="game-canvas" tabindex="0" aria-label="바닥 클릭 이동, 몬스터 클릭 공격, 스페이스 공격, Shift 회피, 1·2·3 무기 교체"></div>
      <header class="arena-menu">
        <a class="brand" href="/" aria-label="워드마스터 홈"><span class="brand-mark">${icon('sword')}</span><span>WORD<span class="brand-light">MASTER</span><small>기억의 던전 · <strong id="word-count">12</strong>개의 단어</small></span></a>
        <nav aria-label="게임 메뉴"><button id="codex-button" class="icon-button" aria-label="단어 도감" title="단어 도감">${icon('book')}</button><button id="custom-button" class="icon-button" aria-label="내 단어로 던전 만들기" title="내 단어로 던전 만들기">${icon('plus')}</button><button id="sound-button" class="icon-button" aria-label="소리 끄기">${icon('sound')}</button><button id="help-button" class="icon-button" aria-label="플레이 방법">${icon('help')}</button><button id="fullscreen-button" class="icon-button" aria-label="게임 전체 화면">${icon('expand')}</button><button id="pause-button" class="icon-button" aria-label="일시정지">${icon('pause')}</button></nav>
      </header>
      <div class="arena-chapter"><div class="room-title"><span class="room-index" id="room-index">01</span><span id="room-title">이끼빛 정원</span><span class="room-tag" id="room-tag">COMBAT</span></div><div class="arena-route"><span id="route-fraction">1 / 5</span><div id="route"></div></div></div>
      <div class="arena-status"><span id="timer">00:00</span><span id="enemy-count">남은 적 9</span><span id="wave-status">첫 적을 기다리는 중</span><span id="combo">×0 COMBO</span></div>
      <div id="boss-bar" class="boss-bar" hidden><span>기억을 삼킨 수호자</span><div><i id="boss-fill"></i></div><small id="boss-count"></small></div>
      <div class="bottom-hud">
        <div class="hud-growth"><strong id="level-text">LV. 1</strong><div class="xp-track"><i id="xp-fill"></i></div><small id="xp-text">0 / 24 XP</small><span id="burst-status">정답 0 / 3</span></div>
        <div class="hud-main">
          <div class="hud-vitals"><div class="health-line">${icon('heart')}<span>생명력</span><strong id="health-text">100 / 100</strong></div><div class="health-track"><div id="health-fill"></div></div><div class="hud-dash"><kbd>SHIFT</kbd><span>회피</span><span class="dash-track"><i id="dash-fill"></i></span><button id="quick-hint" class="icon-button" aria-label="단어 뜻 보기" title="뜻 보기 (Tab)">${icon('book')}</button></div></div>
          <div id="armory" class="armory"></div>
        </div>
        <div class="hud-details"><span id="build-label">무기 강화 전</span><span class="hud-record">조각 <b id="score">0</b> · 처치 <b id="kills">0</b> · 정답률 <b id="accuracy">—</b></span><span class="save-status" id="save-label">자동 저장</span></div>
      </div>
      <div id="game-overlay" class="game-overlay"></div>
      <div id="toast" class="toast" role="status" hidden></div>
      <div hidden><div id="weapon-art"></div><span id="weapon-kind"></span><span id="weapon-word"></span><span id="weapon-description"></span><span id="mastery-value"></span><i id="mastery-fill"></i><button id="hint-button">힌트</button></div>
    </div>
    <div id="modal-layer" class="modal-layer" hidden></div>
  </main>
`;

function persist() {
  if (!saveProgress(progress)) el('save-label').textContent = '저장 불가 · 현재 세션만 유지';
}

function updateState(next: Snapshot) {
  state = next;
  document.querySelector<HTMLElement>('.game-stage')!.dataset.environment = next.environment;
  el('room-index').textContent = String(next.room + 1).padStart(2, '0');
  el('room-title').textContent = next.roomName;
  el('room-tag').textContent = next.boss ? 'BOSS' : 'COMBAT';
  el('room-tag').classList.toggle('boss', next.boss);
  el('health-text').innerHTML = `${next.hp} <i>/ ${next.maxHp}</i>`;
  el('health-fill').style.width = `${next.hp / next.maxHp * 100}%`;
  el('health-fill').classList.toggle('low', next.hp <= 30);
  el('enemy-count').textContent = `남은 적 ${next.remaining} · 필드 ${next.alive}`;
  el('wave-status').textContent = next.boss ? '마지막 수호자' : !next.remaining ? '첫 던전을 시작하세요' : next.nextSide !== null ? `${['위', '오른쪽', '아래', '왼쪽'][next.nextSide]}에서 등장 준비` : next.incoming ? `${next.spawnEvery.toFixed(1)}초 간격 · 대기 ${next.incoming}` : '마지막 적을 마무리하세요';
  el('level-text').textContent = `LV. ${next.level}`;
  el('xp-fill').style.width = `${next.xp / next.xpNeeded * 100}%`;
  el('xp-text').textContent = `${next.xp} / ${next.xpNeeded} XP`;
  el('burst-status').textContent = next.burst > 0 ? `기억 폭주 ${next.burst.toFixed(1)}s` : `정답 ${next.charge} / 3`;
  el('burst-status').classList.toggle('active', next.burst > 0);
  document.querySelector('.bottom-hud')!.classList.toggle('overdrive', next.burst > 0);
  el('build-label').textContent = `검 ${next.upgrades.sword} · 활 ${next.upgrades.bow} · 망치 ${next.upgrades.hammer} 단계${next.attackBoost ? ` · 공격력 +${next.attackBoost}` : ''}${next.haste > 1 ? ` · 속도 ×${next.haste.toFixed(2)}` : ''}`;
  el('combo').textContent = `×${next.combo} COMBO`;
  el('combo').classList.toggle('hot', next.combo >= 3);
  const seconds = Math.floor(next.elapsed);
  el('timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  el('dash-fill').style.width = `${next.dash * 100}%`;
  el('score').textContent = next.score.toLocaleString(); el('kills').textContent = String(next.kills);
  el('accuracy').textContent = runCorrect + runWrong ? `${Math.round(runCorrect / (runCorrect + runWrong) * 100)}%` : '—';
  el('boss-bar').hidden = !next.boss;
  el('boss-fill').style.width = `${(1 - next.bossSeals / next.totalSeals) * 100}%`;
  el('boss-count').textContent = `${next.bossSeals} / ${next.totalSeals} 봉인 파괴`;
  const armoryKey = next.words.map(word => word.id).join(',') + `:${next.slot}:${Object.values(next.upgrades).join(',')}`;
  if (armoryKey !== lastArmory) { lastArmory = armoryKey; renderArmory(next.words, next.slot); }
  const selected = next.words[next.slot];
  if (selected) {
    const percentage = mastery(progress.words[selected.id]);
    el('mastery-value').textContent = `${percentage}%`; el('mastery-fill').style.width = `${percentage}%`;
  }
  const routeKey = `${next.room}:${next.totalRooms}`;
  if (lastRoute !== routeKey) { lastRoute = routeKey; renderRoute(next); }
}

function renderArmory(words: Word[], slot: number) {
  el('armory').innerHTML = words.map((word, index) => `<button class="word-slot ${index === slot ? 'selected' : ''} ${word.kind}" data-slot="${index}" aria-pressed="${index === slot}" aria-label="${index + 1}번 무기 ${escape(word.word)}"><kbd>${index + 1}</kbd><span class="slot-art">${icon(word.kind)}</span><span class="slot-text"><strong>${escape(word.word)}</strong><small>${KIND_NAMES[word.kind]}${state?.upgrades[word.kind] ? ` · ${state.upgrades[word.kind]}단계` : ''}</small></span><span class="slot-selected">${icon('check')}</span></button>`).join('');
  el('armory').querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(button => button.addEventListener('click', () => { if (overlay !== 'hint' && !modalOpen) { scene?.equip(Number(button.dataset.slot)); button.blur(); } }));
  const selected = words[slot]; if (!selected) return;
  el('weapon-art').className = `weapon-art ${selected.kind}`; el('weapon-art').innerHTML = icon(selected.kind);
  el('weapon-kind').textContent = KIND_NAMES[selected.kind]; el('weapon-word').textContent = selected.word;
  el('weapon-word').style.color = COLORS[selected.kind];
  el('weapon-description').textContent = { sword: '빠른 연속 공격 · 근접', bow: '조준하는 원거리 공격', hammer: '묵직한 일격 · 근접 범위' }[selected.kind];
}

function renderRoute(next: Snapshot) {
  el('route-fraction').textContent = `${Math.min(next.room + 1, next.totalRooms)} / ${next.totalRooms}`;
  const nodes = Array.from({ length: next.totalRooms }, (_, index) => `<div class="route-node ${index === next.room ? 'current' : ''} ${index < next.room ? 'cleared' : ''} ${index === next.totalRooms - 1 ? 'boss-node' : ''}"><span>${index < next.room ? icon('check') : index === next.totalRooms - 1 ? icon('skull') : String(index + 1).padStart(2, '0')}</span></div>`);
  el('route').innerHTML = nodes.join('<div class="route-link"></div>');
}

function showStart() {
  overlay = 'start';
  el('game-overlay').hidden = false;
  el('game-overlay').innerHTML = `<div class="intro-panel"><div class="intro-emblem">${icon('sword')}<span></span></div><div class="eyebrow">ENTER THE FORGOTTEN ARCHIVE</div><h2>단어를 무기로.<br><em>기억을 힘으로.</em></h2><p>사방에서 깨어나는 적, 기억할수록 강해지는 무기.<br>뜻에 맞는 무기로 방어막을 깨고 조각을 모으세요.</p><div class="intro-stats"><span><strong>4</strong> 방향</span><i></i><span><strong>5</strong> 방</span><i></i><span><strong>1</strong> 수호자</span></div><button id="start-button" class="primary-button" ${ready ? '' : 'disabled'}>${icon('play')} ${ready ? '첫 던전 입장' : '던전 준비 중…'} ${icon('arrow')}</button><span class="intro-tip">바닥 클릭 이동 · 적 클릭 공격 · 1 / 2 / 3 무기 교체</span></div>`;
  el('start-button').addEventListener('click', () => startRun(DEFAULT_WORDS));
}

function startRun(words: Word[]) {
  if (!scene || !ready) return;
  closeModal(false); activeWords = words; runCorrect = runWrong = runHints = 0;
  lastArmory = lastRoute = ''; overlay = 'none'; el('game-overlay').hidden = true;
  el('word-count').textContent = String(words.length); el('toast').hidden = true;
  scene.start(words); el('game-canvas').focus();
  toast('첫 적은 위쪽 문에서 등장합니다. 적을 클릭하면 공격!');
}

function toast(text: string) {
  if (overlay !== 'none' || modalOpen) return;
  clearTimeout(toastTimeout); el('toast').textContent = text; el('toast').hidden = false;
  toastTimeout = setTimeout(() => { el('toast').hidden = true; }, 3000);
}

function hideOverlay() {
  overlay = 'none'; el('game-overlay').hidden = true;
  scene?.setPaused(false); el('game-canvas').focus();
}

function showPause() {
  if (!scene?.isRunning() || overlay !== 'none' || modalOpen) return;
  scene.setPaused(true); overlay = 'pause'; el('toast').hidden = true;
  el('game-overlay').hidden = false;
  el('game-overlay').innerHTML = `<div class="overlay-panel"><div class="overlay-symbol">${icon('pause')}</div><div class="eyebrow">TAKE A BREATH</div><h2>잠시 숨 고르기</h2><p>기억도, 모험도 서두를 필요는 없으니까.</p><button id="resume-button" class="primary-button">${icon('play')} 탐험 계속하기</button><button id="restart-button" class="text-button">현재 단어로 처음부터 다시</button><small>ESC를 눌러 돌아갈 수 있어요</small></div>`;
  el('resume-button').addEventListener('click', hideOverlay);
  el('restart-button').addEventListener('click', () => startRun(activeWords));
}

function showHint() {
  if (!state || !scene?.isRunning() || overlay !== 'none' || modalOpen) return;
  const word = state.words[state.slot];
  scene.setPaused(true); overlay = 'hint'; runHints++;
  recordAttempt(progress, word.id, 'hints'); persist(); el('toast').hidden = true;
  el('game-overlay').hidden = false;
  el('game-overlay').innerHTML = `<div class="overlay-panel hint-panel"><div class="eyebrow">A MEMORY REVEALED · 전투 일시정지</div><div class="hint-weapon ${word.kind}">${icon(word.kind)}</div><h2 style="color:${COLORS[word.kind]}">${escape(word.word)}</h2><strong class="hint-meaning">${escape(word.meaning)}</strong>${word.example ? `<blockquote>${escape(word.example)}</blockquote>` : '<p>이 단어에는 예문이 아직 없어요.</p>'}<p>이 뜻이 적힌 방어막을 공격하면 파괴할 수 있어요.</p><button id="hint-close" class="primary-button">기억했어. 다시 싸우기 ${icon('arrow')}</button><small>TAB 또는 ESC로 닫기</small></div>`;
  el('hint-close').addEventListener('click', hideOverlay);
}

function upgradeCards(options: UpgradeOption[], attribute: 'reward' | 'upgrade') {
  return options.map(option => `<button class="reward-option" data-${attribute}="${option.id}">${icon(option.icon)}<strong>${option.title}</strong><span>${option.description}</span></button>`).join('');
}

function showUpgrade(options: UpgradeOption[], level: number) {
  scene?.setPaused(true); overlay = 'upgrade'; el('toast').hidden = true;
  el('game-overlay').hidden = false;
  el('game-overlay').innerHTML = `<div class="reward-panel"><div class="eyebrow">LEVEL ${level} · 전투 일시정지</div><h2>무기가 진화합니다.</h2><p>이번 탐험에서 사용할 강화 하나를 선택하세요.</p><div class="reward-options">${upgradeCards(options, 'upgrade')}</div><small>무기 강화는 2단계까지 · 추가 공격은 깨진 방어막을 휩쓸어요</small></div>`;
  el('game-overlay').querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach(button => button.addEventListener('click', () => {
    overlay = 'none'; el('game-overlay').hidden = true; scene?.chooseUpgrade(button.dataset.upgrade as UpgradeId); el('game-canvas').focus();
  }));
}

function showReward(room: number) {
  scene?.setPaused(true); overlay = 'reward'; el('toast').hidden = true;
  el('game-overlay').hidden = false;
  el('game-overlay').innerHTML = `<div class="reward-panel"><div class="eyebrow">CHAMBER ${String(room + 1).padStart(2, '0')} CLEARED</div><h2>기억을 되찾았습니다.</h2><p>다음 방으로 향하기 전, 강화 하나를 선택하세요.</p><div class="reward-options">${upgradeCards(scene!.getUpgradeOptions(), 'reward')}</div><small>다음 방 입장 시 체력 10 회복 · 선택한 강화는 보스전까지 유지됩니다</small></div>`;
  el('game-overlay').querySelectorAll<HTMLButtonElement>('[data-reward]').forEach(button => button.addEventListener('click', () => {
    overlay = 'none'; el('game-overlay').hidden = true; scene?.chooseReward(button.dataset.reward as UpgradeId); el('game-canvas').focus();
  }));
}

function showFinish(won: boolean, final: Snapshot) {
  updateState(final);
  overlay = 'finish'; el('toast').hidden = true; el('game-overlay').hidden = false;
  progress.best = Math.max(progress.best, final.score); if (won) progress.cleared++; persist();
  const accuracy = runCorrect + runWrong ? Math.round(runCorrect / (runCorrect + runWrong) * 100) : 0;
  const reviewed = activeWords.filter(word => (progress.words[word.id]?.wrong ?? 0) > 0).slice(0, 4);
  el('game-overlay').innerHTML = `<div class="finish-panel"><div class="overlay-symbol ${won ? 'gold' : ''}">${icon(won ? 'diamond' : 'skull')}</div><div class="eyebrow">${won ? 'THE ARCHIVE IS YOURS' : 'YOUR MEMORY LIVES ON'}</div><h2>${won ? '던전을 정복했습니다.' : '다시 깨어날 시간.'}</h2><p>${won ? `${activeWords.length}개의 단어가 당신의 무기가 되었습니다.` : '이번 탐험에서 익힌 단어와 숙련도는 남아 있습니다.'}</p><div class="finish-stats"><span><strong>${final.score.toLocaleString()}</strong>기억의 조각</span><span><strong>${accuracy}%</strong>의미 적중률</span><span><strong>${runHints}</strong>힌트 사용</span></div>${reviewed.length ? `<div class="review-words"><small>다음 탐험에서 다시 만나 볼 단어</small><div>${reviewed.map(word => `<span>${escape(word.word)} <i>${escape(word.meaning)}</i></span>`).join('')}</div></div>` : ''}<button id="again-button" class="primary-button">${icon('play')} ${won ? '변화한 던전에 다시 도전' : '다시 도전하기'}</button><button id="finish-codex" class="text-button">내 단어 도감 확인하기 ${icon('arrow')}</button></div>`;
  el('again-button').addEventListener('click', () => startRun(activeWords));
  el('finish-codex').addEventListener('click', showCodex);
}

function openModal(content: string) {
  if (scene?.isRunning()) scene.setPaused(true);
  modalOpen = true; el('modal-layer').hidden = false;
  el('modal-layer').innerHTML = `<div class="modal" role="dialog" aria-modal="true" tabindex="-1"><button id="modal-close" class="icon-button modal-close" aria-label="닫기">${icon('close')}</button>${content}</div>`;
  el('modal-close').addEventListener('click', () => closeModal());
  el('modal-layer').querySelector<HTMLElement>('.modal')?.focus();
}

function closeModal(resume = true) {
  modalOpen = false; el('modal-layer').hidden = true; el('modal-layer').innerHTML = '';
  if (resume && overlay === 'none') { scene?.setPaused(false); el('game-canvas').focus(); }
}

function showCodex() {
  const words = codexTab === 'default' ? DEFAULT_WORDS : progress.custom;
  const average = words.length ? Math.round(words.reduce((sum, word) => sum + mastery(progress.words[word.id]), 0) / words.length) : 0;
  openModal(`<div class="eyebrow">YOUR COLLECTION</div><h2>기억의 도감</h2><p class="modal-subtitle">반복해서 맞힐수록 단어 숙련도가 올라갑니다. 힌트와 오답도 기록돼요.</p><div class="codex-tabs"><button data-tab="default" class="${codexTab === 'default' ? 'active' : ''}">유적의 단어 <span>12</span></button><button data-tab="custom" class="${codexTab === 'custom' ? 'active' : ''}">내 단어 <span>${progress.custom.length}</span></button></div><div class="codex-summary"><span>평균 숙련도 <strong>${average}%</strong></span><span>던전 정복 <strong>${progress.cleared}회</strong></span><span>최고 기록 <strong>${progress.best.toLocaleString()}</strong></span></div><div class="codex-list">${words.length ? words.map(word => `<div class="codex-word"><span class="codex-icon ${word.kind}">${icon(word.kind)}</span><div><strong>${escape(word.word)}</strong><span>${escape(word.meaning)}</span>${word.example ? `<small>${escape(word.example)}</small>` : ''}</div><div class="codex-progress"><strong>${mastery(progress.words[word.id])}%</strong><div><i style="width:${mastery(progress.words[word.id])}%"></i></div><small>정답 ${progress.words[word.id]?.correct ?? 0} · 오답 ${progress.words[word.id]?.wrong ?? 0}</small></div></div>`).join('') : '<div class="empty-codex">책에서 만난 단어를 추가하고<br>나만의 던전을 만들어 보세요.</div>'}</div>`);
  el('modal-layer').querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => button.addEventListener('click', () => { codexTab = button.dataset.tab as 'default' | 'custom'; showCodex(); }));
}

function showCustom() {
  const seed = progress.custom.length ? progress.custom.map(word => `${word.word} | ${word.meaning} | ${word.example}`).join('\n') : 'curious | 호기심이 많은 | She was curious about the old library.\nvanish | 사라지다 | The footprints vanish in the snow.\ncourage | 용기 | It takes courage to begin again.';
  openModal(`<div class="eyebrow">BUILD YOUR OWN DUNGEON</div><h2>읽던 책이, 다음 던전으로.</h2><p class="modal-subtitle">한 줄에 단어 하나씩, 3~30개를 입력하세요.<br>무기는 세 개씩 나뉘고 마지막에는 수호자가 기다립니다.</p><label class="input-label" for="custom-words">영어 단어 | 한국어 뜻 | 영어 예문 <span>예문은 선택</span></label><textarea id="custom-words" rows="9" spellcheck="false" placeholder="curious | 호기심이 많은 | She was curious.">${escape(seed)}</textarea><p id="custom-error" class="form-error" role="alert"></p><div class="custom-note">${icon('book')} 원문에서 쓰인 뜻 하나를 입력하세요. 같은 뜻은 구별해서 적어 주세요.</div><button id="create-dungeon" class="primary-button" ${ready ? '' : 'disabled'}>단어 저장하고 던전 입장 ${icon('arrow')}</button><p class="local-note">단어와 학습 기록은 이 브라우저에 저장됩니다.</p>`);
  el('create-dungeon').addEventListener('click', () => {
    const result = parseWords(el<HTMLTextAreaElement>('custom-words').value);
    if (result.error) { el('custom-error').textContent = result.error; return; }
    progress.custom = result.words; persist(); startRun(result.words);
  });
}

function showHelp() {
  openModal(`<div class="eyebrow">A GUIDE FOR THE MEMORY SEEKER</div><h2>당신의 단어로 싸우세요.</h2><div class="help-steps"><div><span>01</span><section><h3>적의 한국어 의미를 읽으세요.</h3><p>‘내키지 않는’ 방어막에는 <b>reluctant</b> 무기가 필요해요. 다른 무기는 튕겨 나갑니다.</p></section></div><div><span>02</span><section><h3>바닥은 이동, 몬스터는 공격.</h3><p>바닥을 클릭하면 이동해요. 몬스터를 클릭하면 검과 망치는 가까이 다가가 연속 공격하고, 활은 제자리에서 그 몬스터에게 발사해요. 바닥 클릭이나 방향키로 공격을 취소할 수 있어요. 1·2·3으로 무기를 바꾸세요. Space를 눌러 자동 조준 공격도 할 수 있어요.</p></section></div><div><span>03</span><section><h3>방어막을 부순 뒤 마무리하세요.</h3><p>방어막이 깨지면 어떤 무기로든 공격할 수 있어요. 적을 잡으면 조각이 자동으로 날아와 경험치가 됩니다. 레벨이 오르면 삼중 화살·검기·충격파 등을 선택하세요. 정답 3연속에는 5초간 기억 폭주가 켜집니다. Shift로 회피하세요.</p></section></div><div><span>04</span><section><h3>기억나지 않으면, 잠깐 펼쳐 보세요.</h3><p>Tab으로 현재 무기의 뜻과 예문을 확인하세요. 전투는 멈춥니다. 보스의 마지막 문양은 예문 속 빈칸으로 나타나요.</p></section></div></div><div class="help-keys"><span><kbd>마우스 클릭</kbd> 이동 / 적 공격</span><span><kbd>SPACE</kbd> 공격</span><span><kbd>SHIFT</kbd> 회피</span><span><kbd>1 · 2 · 3</kbd> 무기</span><span><kbd>TAB</kbd> 힌트</span><span><kbd>ESC</kbd> 일시정지</span></div>`);
}

function handleGameEvent(event: GameEvent) {
  if (event.type === 'ready') { ready = true; if (overlay === 'start') showStart(); }
  if (event.type === 'state') updateState(event.state);
  if (event.type === 'attempt') {
    if (event.result === 'correct') runCorrect++; else runWrong++;
    recordAttempt(progress, event.word.id, event.result); persist();
  }
  if (event.type === 'toast') toast(event.text);
  if (event.type === 'clear') showReward(event.room);
  if (event.type === 'upgrade') showUpgrade(event.options, event.level);
  if (event.type === 'finish') showFinish(event.won, event.state);
}

showStart();
const mounted = mountGame('game-canvas', handleGameEvent); scene = mounted.scene;
scene.audio.muted = progress.muted;
function updateSound() { el('sound-button').innerHTML = icon(progress.muted ? 'muted' : 'sound'); el('sound-button').setAttribute('aria-label', progress.muted ? '소리 켜기' : '소리 끄기'); }
updateSound();
el('sound-button').addEventListener('click', () => { progress.muted = !progress.muted; scene!.audio.muted = progress.muted; if (!progress.muted) scene!.audio.unlock(); persist(); updateSound(); });
el('codex-button').addEventListener('click', showCodex);
el('custom-button').addEventListener('click', showCustom);
el('help-button').addEventListener('click', showHelp);
el('quick-hint').addEventListener('click', () => { if (overlay === 'hint') hideOverlay(); else showHint(); });
el('fullscreen-button').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.querySelector<HTMLElement>('.game-panel')!.requestFullscreen();
  } catch { toast('이 브라우저에서는 전체 화면을 사용할 수 없어요.'); }
});
el('pause-button').addEventListener('click', () => { if (overlay === 'pause') hideOverlay(); else showPause(); });
el('hint-button').addEventListener('click', () => { if (overlay === 'hint') hideOverlay(); else showHint(); });
el('modal-layer').addEventListener('click', event => { if (event.target === el('modal-layer')) closeModal(); });
document.addEventListener('keydown', event => {
  if (modalOpen && event.key === 'Tab') {
    const targets = Array.from(el('modal-layer').querySelectorAll<HTMLElement>('button:not([disabled]),textarea,[tabindex="0"]'));
    const first = targets[0], last = targets[targets.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement?.classList.contains('modal'))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    return;
  }
  if (event.key === 'Escape') {
    if (modalOpen) closeModal(); else if (overlay === 'pause' || overlay === 'hint') hideOverlay(); else showPause();
    return;
  }
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || modalOpen) return;
  if (event.key === 'Tab' && scene?.isRunning()) {
    event.preventDefault(); if (overlay === 'hint') hideOverlay(); else showHint();
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) showPause(); });
window.addEventListener('blur', showPause);

// Development-only state inspection, used by browser integration tests.
if (import.meta.env.DEV) Object.assign(window, { __wordmaster: { scene, get state() { return state; }, get overlay() { return overlay; } } });
