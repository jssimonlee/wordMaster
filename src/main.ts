import './style.css';
import { COLORS, DEFAULT_WORDS, KIND_NAMES, parseMemoryPairs, serializeMemoryPairs, type WeaponKind, type Word } from './data';
import { loadProgress, mastery, recordAttempt, saveProgress } from './progress';
import { mountGame, type DungeonScene, type GameEvent, type RunMode, type Snapshot } from './game';
import type { UpgradeId, UpgradeOption, BossUpgradeId, BossUpgradeOption } from './upgrades';

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
let activeMode: RunMode = 'campaign';
let scene: DungeonScene | undefined;
let state: Snapshot | undefined;
let overlay: 'start' | 'none' | 'pause' | 'hint' | 'reward' | 'upgrade' | 'finish' = 'start';
let modalOpen = false;
let ready = false;
let lastArmory = '';
let lastRoute = '';
let toastTimeout: ReturnType<typeof setTimeout>;
let upgradeUnlockTimer: ReturnType<typeof setTimeout>;
let upgradeSelectionReady = false;
let runCorrect = 0, runWrong = 0, runHints = 0;
let codexTab: 'default' | 'custom' = 'default';
let customDraft = progress.custom.length ? serializeMemoryPairs(progress.custom) : undefined;

function runeArt(kind: WeaponKind, cls = '') {
  return `<span class="rune-art ${kind} ${cls}" aria-hidden="true" style="--rune-x:${{ sword: 0, bow: 50, hammer: 100 }[kind]}%"></span>`;
}

el('app').innerHTML = `
  <main class="game-panel" aria-label="던전 게임">
    <div class="game-stage">
      <div id="game-canvas" tabindex="0" aria-label="바닥 클릭 이동, 몬스터 클릭 공격, 일반 던전 스페이스 공격, 보스전 이동 중 사격 중지, 정지하면 바라보는 방향으로 자동 공격, Shift 회피, 1·2·3 무기 교체"></div>
      <header class="arena-menu">
        <a class="brand" href="/" aria-label="워드마스터 홈"><span class="brand-mark">${icon('sword')}</span><span>WORD<span class="brand-light">MASTER</span><small>기억의 던전 · <strong id="word-count">12</strong>개의 <span id="collection-label">단어</span></small></span></a>
        <nav aria-label="게임 메뉴"><button id="codex-button" class="icon-button" aria-label="단어 도감" title="단어 도감">${icon('book')}</button><button id="custom-button" class="icon-button" aria-label="내 단어로 던전 만들기" title="내 단어로 던전 만들기">${icon('plus')}</button><button id="sound-button" class="icon-button" aria-label="소리 끄기">${icon('sound')}</button><button id="help-button" class="icon-button" aria-label="플레이 방법">${icon('help')}</button><button id="fullscreen-button" class="icon-button" aria-label="게임 전체 화면">${icon('expand')}</button><button id="pause-button" class="icon-button" aria-label="일시정지">${icon('pause')}</button></nav>
      </header>
      <div class="arena-chapter"><div class="room-title"><span class="room-index" id="room-index">01</span><span id="room-title">이끼빛 정원</span><span class="room-tag" id="room-tag">COMBAT</span></div><div class="arena-route"><span id="route-fraction">1 / 5</span><div id="route"></div></div></div>
      <div class="arena-status"><span id="timer">00:00</span><span id="enemy-count">남은 적 9</span><span id="wave-status">첫 적을 기다리는 중</span><span id="combo">×0 COMBO</span></div>
      <div id="boss-bar" class="boss-bar" hidden><span id="boss-round">라운드 1 / 12</span><div><i id="boss-fill"></i></div><small id="boss-count"></small></div>
      <div class="bottom-hud">
        <div class="hud-growth"><strong id="level-text">LV. 1</strong><div class="xp-track"><i id="xp-fill"></i></div><small id="xp-text">0 / 24 XP</small><span id="burst-status">정답 0 / 3</span></div>
        <div class="hud-main">
          <div class="hud-vitals"><div class="health-line">${icon('heart')}<span>생명력</span><strong id="health-text">100 / 100</strong></div><div class="health-track"><div id="health-fill"></div></div><div class="hud-dash"><kbd>SHIFT</kbd><span>회피</span><span class="dash-track"><i id="dash-fill"></i></span><button id="quick-hint" class="icon-button" aria-label="단어 뜻 보기" title="뜻 보기 (Tab)">${icon('book')}</button></div></div>
          <div id="armory" class="armory"></div>
        </div>
        <div class="hud-details"><span id="build-label">무기 강화 전</span><span class="hud-record">조각 <b id="score">0</b> · 처치 <b id="kills">0</b> · 정답률 <b id="accuracy">—</b></span><span class="save-status" id="save-label">자동 저장</span></div>
      </div>
      <div id="game-overlay" class="game-overlay"></div>
      <section id="upgrade-picker" class="upgrade-picker" aria-labelledby="upgrade-title" tabindex="-1" hidden></section>
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
  el('room-index').textContent = next.mode === 'boss' ? '01' : String(next.room + 1).padStart(2, '0');
  el('room-title').textContent = next.roomName;
  el('room-tag').textContent = next.boss ? 'BOSS' : 'COMBAT';
  el('room-tag').classList.toggle('boss', next.boss);
  el('health-text').innerHTML = `${next.hp} <i>/ ${next.maxHp}</i>`;
  el('health-fill').style.width = `${next.hp / next.maxHp * 100}%`;
  el('health-fill').classList.toggle('low', next.hp <= 30);
  el('enemy-count').textContent = `남은 적 ${next.remaining} · 필드 ${next.alive}`;
  el('wave-status').textContent = next.boss ? `${next.bossColumns}열 지원군 · ${next.bossRoundKills >= next.bossKillGoal ? next.miniBosses ? '미니 보스 먼저 격파' : '봉인 노출! 보스 관통 사격' : `격파 ${next.bossRoundKills} / ${next.bossKillGoal}`} · 계속 소환` : !next.remaining ? '첫 던전을 시작하세요' : next.nextSide !== null ? `${['위', '오른쪽', '아래', '왼쪽'][next.nextSide]}에서 등장 준비` : next.incoming ? `${next.spawnEvery.toFixed(1)}초 간격 · 대기 ${next.incoming}` : '마지막 적을 마무리하세요';
  el('level-text').textContent = next.boss ? `ROUND ${Math.min(next.bossSeals + 1, next.totalSeals)}` : `LV. ${next.level}`;
  el('xp-fill').style.width = `${next.boss ? next.bossSeals % 3 / 3 * 100 : next.xp / next.xpNeeded * 100}%`;
  el('xp-text').textContent = next.boss ? `${next.bossSeals % 3} / 3 라운드 · 다음 강화 선택` : `${next.xp} / ${next.xpNeeded} XP`;
  el('burst-status').textContent = next.boss ? next.bossAutoFire ? `동시 발사 ${next.bossArrows}발` : '이동 중 · 사격 중지' : next.burst > 0 ? `기억 폭주 ${next.burst.toFixed(1)}s` : `정답 ${next.charge} / 3`;
  el('burst-status').classList.toggle('active', next.burst > 0);
  document.querySelector('.bottom-hud')!.classList.toggle('overdrive', next.burst > 0);
  el('build-label').textContent = next.boss ? `${next.bossAutoFire ? '자동' : '중지'} ${(next.bossFireInterval / 1000).toFixed(2)}초 · ${next.bossArrows}발 · 유도 ${next.bossGuided}단계 · 미니 보스 ${next.miniBosses} · 골인 ${next.bossLeaks}회` : `검 ${next.upgrades.sword} · 활 ${next.upgrades.bow} · 망치 ${next.upgrades.hammer} 단계${next.attackBoost ? ` · 공격력 +${next.attackBoost}` : ''}${next.haste > 1 ? ` · 속도 ×${next.haste.toFixed(2)}` : ''}`;
  el('combo').textContent = `×${next.combo} COMBO`;
  el('combo').classList.toggle('hot', next.combo >= 3);
  const seconds = Math.floor(next.elapsed);
  el('timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  el('dash-fill').style.width = `${next.dash * 100}%`;
  el('score').textContent = next.score.toLocaleString(); el('kills').textContent = String(next.kills);
  el('accuracy').textContent = runCorrect + runWrong ? `${Math.round(runCorrect / (runCorrect + runWrong) * 100)}%` : '—';
  el('boss-bar').hidden = !next.boss;
  el('boss-round').textContent = `라운드 ${Math.min(next.bossSeals + 1, next.totalSeals)} / ${next.totalSeals}`;
  el('boss-fill').style.width = `${(1 - next.bossSeals / next.totalSeals) * 100}%`;
  el('boss-count').textContent = `${next.bossSeals} / ${next.totalSeals} 봉인 파괴`;
  const armoryKey = next.words.map(word => `${word.id}:${word.kind}`).join(',') + `:${next.slot}:${Object.values(next.upgrades).join(',')}:${next.bossArrows}`;
  if (armoryKey !== lastArmory) { lastArmory = armoryKey; renderArmory(next.words, next.slot); }
  const selected = next.words[next.slot];
  if (selected) {
    const percentage = mastery(progress.words[selected.id]);
    el('mastery-value').textContent = `${percentage}%`; el('mastery-fill').style.width = `${percentage}%`;
  }
  const routeKey = `${next.mode}:${next.room}:${next.totalRooms}`;
  if (lastRoute !== routeKey) { lastRoute = routeKey; renderRoute(next); }
}

function renderArmory(words: Word[], slot: number) {
  el('armory').innerHTML = words.map((word, index) => {
    // Retain each memory's emblem when the boss gives every weapon a ranged form.
    const emblem = activeWords.find(item => item.id === word.id)?.kind ?? word.kind;
    return `<button class="word-slot ${index === slot ? 'selected' : ''} ${emblem}" data-slot="${index}" aria-pressed="${index === slot}" aria-label="${index + 1}번 무기 ${escape(word.word)}" title="${escape(word.word)} · ${state?.boss ? '원거리 공격' : KIND_NAMES[word.kind]}"><kbd>${index + 1}</kbd>${runeArt(emblem, 'slot-art')}<span class="slot-text"><strong>${escape(word.word)}</strong><small>${state?.boss ? `원거리 · ${state.bossArrows}발` : `${KIND_NAMES[word.kind]}${state?.upgrades[word.kind] ? ` · ${state.upgrades[word.kind]}단계` : ''}`}</small></span><span class="slot-rank" aria-hidden="true">${state?.boss ? `${state.bossArrows}×` : [1, 2].map(rank => `<i class="${(state?.upgrades[word.kind] ?? 0) >= rank ? 'lit' : ''}"></i>`).join('')}</span><span class="slot-active-label" aria-hidden="true">장착</span></button>`;
  }).join('');
  el('armory').querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(button => button.addEventListener('click', () => { if (overlay === 'none' && !modalOpen) { scene?.equip(Number(button.dataset.slot)); button.blur(); } }));
  const selected = words[slot]; if (!selected) return;
  el('weapon-art').className = `weapon-art ${selected.kind}`; el('weapon-art').innerHTML = icon(selected.kind);
  el('weapon-kind').textContent = KIND_NAMES[selected.kind]; el('weapon-word').textContent = selected.word;
  el('weapon-word').style.color = COLORS[selected.kind];
  el('weapon-description').textContent = { sword: '빠른 연속 공격 · 근접', bow: '조준하는 원거리 공격', hammer: '묵직한 일격 · 근접 범위' }[selected.kind];
}

function renderRoute(next: Snapshot) {
  if (next.mode === 'boss') {
    el('route-fraction').textContent = '보스전';
    el('route').innerHTML = `<div class="route-node current boss-node"><span>${icon('skull')}</span></div>`;
    return;
  }
  el('route-fraction').textContent = `${Math.min(next.room + 1, next.totalRooms)} / ${next.totalRooms}`;
  const nodes = Array.from({ length: next.totalRooms }, (_, index) => `<div class="route-node ${index === next.room ? 'current' : ''} ${index < next.room ? 'cleared' : ''} ${index === next.totalRooms - 1 ? 'boss-node' : ''}"><span>${index < next.room ? icon('check') : index === next.totalRooms - 1 ? icon('skull') : String(index + 1).padStart(2, '0')}</span></div>`);
  el('route').innerHTML = nodes.join('<div class="route-link"></div>');
}

function showStart() {
  overlay = 'start';
  document.querySelector<HTMLElement>('.game-stage')!.dataset.screen = 'start';
  el('game-overlay').hidden = false;
  el('game-overlay').innerHTML = `<div class="title-screen"><div class="title-crest" aria-hidden="true">${runeArt('sword')}<span></span></div><h1>WORD<span>MASTER</span></h1><h2>기억의 던전</h2><p class="title-instruction">적의 문제에 맞는 답을 무기로 선택하세요.</p><div class="title-modes"><button id="start-button" class="adventure-button" ${ready ? '' : 'disabled'}>${runeArt('sword', 'menu-rune')}<span><strong>${ready ? '첫 던전 입장' : '던전 준비 중…'}</strong><small>네 개의 유적 탐험</small></span>${icon('arrow')}</button><button id="boss-start-button" class="adventure-button defense" ${ready ? '' : 'disabled'}>${runeArt('bow', 'menu-rune')}<span><strong>보스전 바로 도전</strong><small>자동 사격 · 12라운드 디펜스</small></span>${icon('arrow')}</button></div><div class="title-secondary"><button id="title-custom">${icon('plus')} 내 기억 만들기</button><button id="title-codex">${icon('book')} 기억의 도감</button></div><div class="title-controls"><span><kbd>클릭</kbd> 이동 · 조준</span><span><kbd>1 · 2 · 3</kbd> 무기 선택</span><span><kbd>Tab</kbd> 힌트</span></div></div>`;
  el('start-button').addEventListener('click', () => startRun(DEFAULT_WORDS));
  el('boss-start-button').addEventListener('click', () => startRun(DEFAULT_WORDS, 'boss'));
  el('title-custom').addEventListener('click', showCustom);
  el('title-codex').addEventListener('click', showCodex);
}

function startRun(words: Word[], mode: RunMode = 'campaign') {
  if (!scene || !ready) return;
  closeModal(false); activeWords = words; activeMode = mode; runCorrect = runWrong = runHints = 0;
  lastArmory = lastRoute = ''; overlay = 'none'; el('game-overlay').hidden = true; el('upgrade-picker').hidden = true;
  clearTimeout(upgradeUnlockTimer); upgradeSelectionReady = false;
  el('word-count').textContent = String(words.length); el('toast').hidden = true;
  document.querySelector<HTMLElement>('.game-stage')!.dataset.screen = 'playing';
  el('collection-label').textContent = '기억';
  scene.start(words, mode); el('game-canvas').focus();

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
  el('restart-button').addEventListener('click', () => startRun(activeWords, activeMode));
}

function showHint() {
  if (!state || !scene?.isRunning() || overlay !== 'none' || modalOpen) return;
  const word = state.words[state.slot];
  scene.setPaused(true); overlay = 'hint'; runHints++;
  recordAttempt(progress, word.id, 'hints'); persist(); el('toast').hidden = true;
  el('game-overlay').hidden = false;
  el('game-overlay').innerHTML = `<div class="overlay-panel hint-panel"><div class="eyebrow">A MEMORY REVEALED · 전투 일시정지</div><div class="hint-weapon ${word.kind}">${icon(word.kind)}</div><h2 style="color:${COLORS[word.kind]}">${escape(word.word)}</h2><strong class="hint-meaning">${escape(word.meaning)}</strong>${word.example ? `<blockquote>${escape(word.example)}</blockquote>` : `<p>${word.format === 'quiz' ? '이 문제에는 해설이 아직 없어요.' : '이 단어에는 예문이 아직 없어요.'}</p>`}<p>${word.format === 'quiz' ? '이 답을 장착해 위 문제가 표시된 적을 공격하세요.' : '이 뜻이 적힌 방어막을 공격하면 파괴할 수 있어요.'}</p><button id="hint-close" class="primary-button">기억했어. 다시 싸우기 ${icon('arrow')}</button><small>TAB 또는 ESC로 닫기</small></div>`;
  el('hint-close').addEventListener('click', hideOverlay);
}

const upgradeArt: Record<UpgradeId | BossUpgradeId, { cell: number; color: string }> = {
  speed: { cell: 0, color: '#ffd678' }, guided: { cell: 1, color: '#7ef2df' }, volley: { cell: 2, color: '#c6acff' },
  sword: { cell: 3, color: '#7ef2df' }, bow: { cell: 4, color: '#c6acff' }, hammer: { cell: 5, color: '#ffbf72' },
  power: { cell: 6, color: '#ffa7ad' }, haste: { cell: 7, color: '#8fd8ff' }, heal: { cell: 8, color: '#a0f6bb' },
};

function positionUpgradePicker() {
  const picker = el('upgrade-picker'), stage = document.querySelector<HTMLElement>('.game-stage')!;
  if (picker.hidden || !scene) return;
  const anchor = scene.getPlayerAnchor(), bounds = stage.getBoundingClientRect();
  const x = anchor.x * bounds.width, y = anchor.y * bounds.height;
  const width = picker.offsetWidth, height = picker.offsetHeight;
  let left = Math.max(10, Math.min(bounds.width - width - 10, x - width / 2));
  const topLimit = Math.max(100, document.querySelector<HTMLElement>('.arena-status')!.getBoundingClientRect().bottom - bounds.top + 12);
  const bottomLimit = document.querySelector<HTMLElement>('.bottom-hud')!.getBoundingClientRect().top - bounds.top - 10;
  const headGap = Math.max(43, anchor.head * bounds.height) + 17;
  // Keep the hero and health bar visible, even when they are against the upper edge.
  const above = y - headGap - height;
  const below = above < topLimit && y + 45 + height <= bottomLimit;
  const side = above < topLimit && !below && (x + 65 + width <= bounds.width - 10 || x - 65 - width >= 10);
  if (side) left = x + 65 + width <= bounds.width - 10 ? x + 65 : x - 65 - width;
  picker.dataset.placement = side ? 'side' : below ? 'below' : 'above';
  picker.style.left = `${left}px`;
  const top = Math.max(topLimit, Math.min(bottomLimit - height, side ? y - height / 2 : below ? y + 45 : above));
  picker.style.top = `${top}px`;
  picker.style.setProperty('--anchor-x', `${x - left}px`);
  picker.style.setProperty('--anchor-y', `${y - top}px`);
  picker.dataset.side = left > x ? 'right' : 'left';
}

function showUpgradePicker(options: (UpgradeOption | BossUpgradeOption)[], attribute: 'reward' | 'upgrade' | 'boss-upgrade', title: string, badge: string, note: string, choose: (id: UpgradeId | BossUpgradeId) => void) {
  clearTimeout(upgradeUnlockTimer); upgradeSelectionReady = false;
  scene?.setPaused(true); overlay = attribute === 'reward' ? 'reward' : 'upgrade';
  el('toast').hidden = true; el('game-overlay').hidden = true;
  const picker = el('upgrade-picker');
  picker.dataset.ready = 'false';
  picker.innerHTML = `<div class="upgrade-heading"><span>${badge}</span><h2 id="upgrade-title">${title}</h2></div><div class="upgrade-choices">${options.map((option, index) => {
    const art = upgradeArt[option.id];
    return `<div class="skill-option" style="--skill-color:${art.color};--art-x:${art.cell % 3 * 50}%;--art-y:${Math.floor(art.cell / 3) * 50}%"><button class="skill-choice" data-${attribute}="${option.id}" disabled aria-labelledby="skill-title-${index}" aria-describedby="skill-description-${index}"><span class="skill-medallion" aria-hidden="true"><span class="skill-art"></span><kbd>${index + 1}</kbd></span></button><strong id="skill-title-${index}">${escape(option.title)}</strong><span id="skill-description-${index}" class="skill-description">${escape(option.description)}</span></div>`;
  }).join('')}</div><small class="upgrade-note" role="status">잠시 멈춤 · 0.8초 뒤 강화 선택 가능</small><span class="upgrade-tether" aria-hidden="true"></span>`;
  picker.hidden = false;
  positionUpgradePicker();
  picker.focus({ preventScroll: true });
  picker.querySelectorAll<HTMLButtonElement>('.skill-choice').forEach(button => {
    let pointerArmed = false;
    // A press begun on the battlefield must never complete as a skill selection.
    button.addEventListener('pointerdown', event => { pointerArmed = upgradeSelectionReady && event.isPrimary && event.button === 0; });
    button.addEventListener('pointercancel', () => { pointerArmed = false; });
    button.addEventListener('click', event => {
      const freshPress = pointerArmed; pointerArmed = false;
      if (picker.hidden || modalOpen || !upgradeSelectionReady || (event.detail > 0 && !freshPress)) return;
      const id = button.getAttribute(`data-${attribute}`) as UpgradeId | BossUpgradeId;
      const option = options.find(option => option.id === id)!;
      picker.hidden = true; overlay = 'none'; upgradeSelectionReady = false;
      choose(id); scene?.showUpgradeEffect(option.title, upgradeArt[id].color);
      el('game-canvas').focus();
    });
  });
  upgradeUnlockTimer = setTimeout(() => {
    if (picker.hidden) return;
    upgradeSelectionReady = true; picker.dataset.ready = 'true';
    picker.querySelectorAll<HTMLButtonElement>('.skill-choice').forEach(button => { button.disabled = false; });
    picker.querySelector<HTMLElement>('.upgrade-note')!.textContent = `${note} · 이미지 클릭 / 1 · 2 · 3 선택 · 바깥 클릭은 무시`;
    positionUpgradePicker();
    if (!modalOpen && document.activeElement === picker) picker.querySelector<HTMLButtonElement>('.skill-choice')?.focus({ preventScroll: true });
  }, 800);
}

function showUpgrade(options: UpgradeOption[], level: number) {
  showUpgradePicker(options, 'upgrade', '무기가 진화합니다.', `LEVEL ${level} · 강화 선택`, '전투 일시정지', id => scene?.chooseUpgrade(id as UpgradeId));
}

function showBossUpgrade(options: BossUpgradeOption[], round: number, source: 'round' | 'miniboss' = 'round') {
  showUpgradePicker(options, 'boss-upgrade', source === 'miniboss' ? '미니 보스 처치! 강화 보상' : '방어 무기를 업그레이드!',
    source === 'miniboss' ? `MINI BOSS CLEAR · ROUND ${round}` : `ROUND ${round} CLEAR`,
    source === 'miniboss' ? '선택 후 1초 뒤 사격 재개' : '전투 일시정지', id => scene?.chooseBossUpgrade(id as BossUpgradeId));
}

function showReward(room: number) {
  showUpgradePicker(scene!.getUpgradeOptions(), 'reward', '기억을 되찾았습니다.', `CHAMBER ${String(room + 1).padStart(2, '0')} CLEAR`,
    '선택 후 다음 방 · 체력 10 회복', id => scene?.chooseReward(id as UpgradeId));
}

function showFinish(won: boolean, final: Snapshot) {
  el('upgrade-picker').hidden = true;
  clearTimeout(upgradeUnlockTimer); upgradeSelectionReady = false;
  updateState(final);
  overlay = 'finish'; el('toast').hidden = true; el('game-overlay').hidden = false;
  progress.best = Math.max(progress.best, final.score); if (won) progress.cleared++; persist();
  const accuracy = runCorrect + runWrong ? Math.round(runCorrect / (runCorrect + runWrong) * 100) : 0;
  const reviewed = activeWords.filter(word => (progress.words[word.id]?.wrong ?? 0) > 0).slice(0, 4);
  el('game-overlay').innerHTML = `<div class="finish-panel"><div class="overlay-symbol ${won ? 'gold' : ''}">${icon(won ? 'diamond' : 'skull')}</div><div class="eyebrow">${won ? 'THE ARCHIVE IS YOURS' : 'YOUR MEMORY LIVES ON'}</div><h2>${won ? '던전을 정복했습니다.' : '다시 깨어날 시간.'}</h2><p>${won ? `${activeWords.length}개의 기억이 당신의 무기가 되었습니다.` : '이번 탐험에서 익힌 기억과 숙련도는 남아 있습니다.'}</p><div class="finish-stats"><span><strong>${final.score.toLocaleString()}</strong>기억의 조각</span><span><strong>${accuracy}%</strong>정답 적중률</span><span><strong>${runHints}</strong>힌트 사용</span></div>${reviewed.length ? `<div class="review-words"><small>다음 탐험에서 다시 만나 볼 기억</small><div>${reviewed.map(word => `<span>${escape(word.word)} <i>${escape(word.meaning)}</i></span>`).join('')}</div></div>` : ''}<button id="again-button" class="primary-button">${icon('play')} ${won ? '변화한 던전에 다시 도전' : '다시 도전하기'}</button><button id="finish-codex" class="text-button">내 기억 도감 확인하기 ${icon('arrow')}</button></div>`;
  el('again-button').addEventListener('click', () => startRun(activeWords, activeMode));
  el('finish-codex').addEventListener('click', showCodex);
}

function openModal(content: string, variant: 'standard' | 'codex' | 'workshop' = 'standard') {
  if (scene?.isRunning()) scene.setPaused(true);
  modalOpen = true; el('modal-layer').hidden = false;
  el('modal-layer').innerHTML = `<div class="modal ${variant === 'standard' ? '' : `archive-modal ${variant}-modal`}" role="dialog" aria-modal="true" tabindex="-1"><button id="modal-close" class="icon-button modal-close" aria-label="닫기">${icon('close')}</button>${content}</div>`;
  el('modal-close').addEventListener('click', () => closeModal());
  el('modal-layer').querySelector<HTMLElement>('.modal')?.focus();
}

function closeModal(resume = true) {
  modalOpen = false; el('modal-layer').hidden = true; el('modal-layer').innerHTML = '';
  if (resume && overlay === 'none') { scene?.setPaused(false); el('game-canvas').focus(); }
}

function archiveHeader(_badge: string, title: string, subtitle: string) {
  return `<header class="archive-hero"><span class="archive-seal" aria-hidden="true">${icon('book')}</span><h2 id="archive-title">${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</header>`;
}

function showCodex() {
  const words = codexTab === 'default' ? DEFAULT_WORDS : progress.custom;
  const average = words.length ? Math.round(words.reduce((sum, word) => sum + mastery(progress.words[word.id]), 0) / words.length) : 0;
  openModal(`${archiveHeader('THE MEMORY ARCHIVE', '기억의 도감', '')}<div class="archive-body"><div class="codex-tabs"><button data-tab="default" aria-pressed="${codexTab === 'default'}" class="${codexTab === 'default' ? 'active' : ''}">${icon('book')} 유적의 단어 <span>12</span></button><button data-tab="custom" aria-pressed="${codexTab === 'custom'}" class="${codexTab === 'custom' ? 'active' : ''}">${icon('diamond')} 내 기억 <span>${progress.custom.length}</span></button></div><div class="codex-summary"><span>${icon('diamond')}<small>평균 숙련도</small><strong>${average}<small> / 100</small></strong></span><span>${icon('flag')}<small>던전 정복</small><strong>${progress.cleared}회</strong></span><span>${icon('shield')}<small>최고 기록</small><strong>${progress.best.toLocaleString()}</strong></span></div><label class="codex-search">${icon('help')}<input id="codex-search" type="search" aria-label="도감 검색" placeholder="기억 검색" autocomplete="off" /></label><div class="codex-list"></div><details class="mastery-help"><summary>숙련 점수란?</summary><p>정답 +18 · 오답 −8 · 힌트 −3. 0~100점의 게임 점수이며 실제 암기율은 아니에요.</p></details></div>`, 'codex');
  function renderEntries() {
    const query = el<HTMLInputElement>('codex-search').value.trim().toLowerCase();
    const found = words.filter(word => `${word.word} ${word.meaning} ${word.example}`.toLowerCase().includes(query));
    el('modal-layer').querySelector<HTMLElement>('.codex-list')!.innerHTML = found.length ? found.map(word => {
      const percentage = mastery(progress.words[word.id]), record = progress.words[word.id];
      return `<article class="codex-word ${word.kind}"><div class="codex-card-header">${runeArt(word.kind, 'codex-icon')}<span>${KIND_NAMES[word.kind]}</span><b class="mastery-badge ${percentage >= 100 ? 'mastered' : ''}">${percentage >= 100 ? '숙련 완료' : percentage > 0 ? '수련 중' : '새 기억'}</b></div><div class="codex-content"><strong>${escape(word.word)}</strong><span><b>문제·뜻</b> ${escape(word.meaning)}</span>${word.example ? `<small><b>설명</b> ${escape(word.example)}</small>` : ''}</div><div class="codex-progress"><span>숙련 점수</span><strong>${percentage} / 100</strong><div><i style="width:${percentage}%"></i></div><small>정답 ${record?.correct ?? 0} · 오답 ${record?.wrong ?? 0} · 힌트 ${record?.hints ?? 0}</small></div></article>`;
    }).join('') : `<div class="empty-codex">${icon('book')}<strong>${words.length ? '이 기억은 아직 없어요.' : '아직 비어 있는 마법서'}</strong><span>${words.length ? '다른 단어나 문제로 찾아보세요.' : '내 단어나 문제·답을 새겨 나만의 던전을 만들어 보세요.'}</span></div>`;
  }
  renderEntries(); el('codex-search').addEventListener('input', renderEntries);
  el('modal-layer').querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => button.addEventListener('click', () => { codexTab = button.dataset.tab as 'default' | 'custom'; showCodex(); }));
}

function showCustom() {
  const seed = customDraft ?? '호기심이 많은 | curious | She was curious about the old library.\n프랑스의 수도는? | 파리\n7 × 8 = ? | 56';
  openModal(`${archiveHeader('', '나만의 기억 만들기', '')}<div class="archive-body"><div class="workshop-layout"><section class="rune-inscription"><label class="input-label" for="custom-words">문제·뜻 | 답·단어 | 설명<span>설명은 선택</span></label><textarea id="custom-words" rows="7" spellcheck="false" placeholder="호기심이 많은 | curious\n프랑스의 수도는? | 파리">${escape(seed)}</textarea><div class="inscription-meta"><span>한 줄에 하나 · 3~30개</span><strong id="inscription-count"></strong></div><p id="custom-error" class="form-error" role="alert"></p><div class="custom-note">${icon('book')}<span>앞은 적의 문제, 뒤는 무기의 답이에요.<br>설명은 도감과 <kbd>Tab</kbd> 힌트에서 볼 수 있어요.</span></div></section><aside class="workshop-preview" aria-label="전투 미리보기"><h3>전투 미리보기</h3><div id="custom-preview"></div></aside></div><div class="workshop-actions"><button id="create-dungeon" class="primary-button" ${ready ? '' : 'disabled'}>${icon('play')} 저장하고 던전 입장 ${icon('arrow')}</button><button id="create-boss" class="boss-start-button" ${ready ? '' : 'disabled'}>${icon('skull')} 저장하고 보스전 도전</button></div></div>`, 'workshop');
  const input = el<HTMLTextAreaElement>('custom-words');
  function updatePreview() {
    customDraft = input.value;
    const lines = input.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    el('inscription-count').textContent = `${lines.length} / 30`;
    const pairs = lines.slice(0, 3).map(line => line.split('|').map(part => part.trim()));
    el('custom-preview').innerHTML = `<div class="preview-creature">${icon('shield')}<small>적의 문제·뜻</small><strong>${escape(pairs[0]?.[0] || '문제·뜻')}</strong></div><span class="preview-arrow">${icon('arrow')} 맞는 답으로 공격</span><div class="preview-runes">${pairs.map((pair, index) => `<div class="preview-rune">${runeArt((['sword', 'bow', 'hammer'] as WeaponKind[])[index])}<strong>${escape(pair[1] || '?')}</strong><kbd>${index + 1}</kbd></div>`).join('')}</div>`;
  }
  updatePreview(); input.addEventListener('input', updatePreview);
  function createCustom(mode: RunMode) {
    const result = parseMemoryPairs(input.value, progress.custom);
    if (result.error) { el('custom-error').textContent = result.error; return; }
    progress.custom = result.words; persist(); startRun(result.words, mode);
  }
  el('create-dungeon').addEventListener('click', () => createCustom('campaign'));
  el('create-boss').addEventListener('click', () => createCustom('boss'));
}


function showHelp() {
  openModal(`${archiveHeader('', '전투 안내', '')}<div class="archive-body"><div class="help-steps"><div><span>01</span><section><h3>적의 문제에 맞는 답을 선택</h3><p>예: ‘내키지 않는’에는 <b>reluctant</b>. 1·2·3으로 무기를 바꾸세요. 오답은 생명력 −8.</p></section></div><div><span>02</span><section><h3>던전 탐험</h3><p>바닥 클릭으로 이동, 적 클릭 또는 Space로 공격. Shift로 회피하고, 방어막을 깬 적을 처치해 경험치를 모으세요.</p></section></div><div><span>03</span><section><h3>보스 디펜스</h3><p>이동 중에는 사격을 멈추고, 서 있으면 바라보는 방향으로 자동 발사해요. 왼쪽 골인선을 지키세요. 돌파당하면 생명력 −12.</p></section></div><div><span>04</span><section><h3>강화와 힌트</h3><p>주황색 미니 보스를 처치하면 강화 선택! 선택할 때까지 전투가 멈춰요. Tab은 현재 무기의 문제와 설명을 보여줍니다.</p></section></div></div><button id="help-close" class="primary-button">확인 ${icon('check')}</button></div>`, 'codex');
  el('help-close').addEventListener('click', () => closeModal());
}

function handleGameEvent(event: GameEvent) {
  if (event.type === 'ready') {
    ready = true; scene?.scale.on('resize', positionUpgradePicker);
    if (overlay === 'start') showStart();
    el('modal-layer').querySelectorAll<HTMLButtonElement>('#create-dungeon, #create-boss').forEach(button => { button.disabled = false; });
  }
  if (event.type === 'state') updateState(event.state);
  if (event.type === 'attempt') {
    if (event.result === 'correct') runCorrect++; else runWrong++;
    recordAttempt(progress, event.word.id, event.result); persist();
  }
  if (event.type === 'toast') toast(event.text);
  if (event.type === 'clear') showReward(event.room);
  if (event.type === 'upgrade') showUpgrade(event.options, event.level);
  if (event.type === 'bossUpgrade') showBossUpgrade(event.options, event.round, event.source);
  if (event.type === 'finish') showFinish(event.won, event.state);
}

showStart();
const mounted = mountGame('game-canvas', handleGameEvent); scene = mounted.scene;
new ResizeObserver(() => requestAnimationFrame(positionUpgradePicker)).observe(document.querySelector('.game-stage')!);
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
    const targets = Array.from(el('modal-layer').querySelectorAll<HTMLElement>('button:not([disabled]),textarea,input,summary,[tabindex="0"]'));
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
  if (!el('upgrade-picker').hidden) {
    event.stopPropagation();
    const buttons = Array.from(el('upgrade-picker').querySelectorAll<HTMLButtonElement>('.skill-choice'));
    const index = ['1', '2', '3'].indexOf(event.key);
    if (index >= 0) { event.preventDefault(); if (upgradeSelectionReady && !event.repeat) buttons[index]?.click(); }
    else if (event.key === ' ') event.preventDefault();
    else if (event.key === 'Enter') {
      event.preventDefault();
      if (upgradeSelectionReady && !event.repeat && buttons.includes(document.activeElement as HTMLButtonElement)) (document.activeElement as HTMLButtonElement).click();
    }
    else if (event.key === 'Tab') {
      event.preventDefault();
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(current + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
    }
    return;
  }
  if (event.key === 'Tab' && scene?.isRunning()) {
    event.preventDefault(); if (overlay === 'hint') hideOverlay(); else showHint();
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) showPause(); });
window.addEventListener('blur', showPause);

// Development-only state inspection, used by browser integration tests.
if (import.meta.env.DEV) Object.assign(window, { __wordmaster: { scene, get state() { return state; }, get overlay() { return overlay; } } });
