import './style.css';
import { COLORS, DEFAULT_WORDS, KIND_NAMES, parseMemoryPairs, serializeMemoryPairs, type WeaponKind, type Word } from './data';
import { nextDeckName, prepareDeckSave, selectDeck, selectedDeck } from './decks';
import { loadProgress, mastery, recordAttempt, saveProgress } from './progress';
import { mountGame, type DungeonScene, type GameEvent, type RunMode, type Snapshot } from './game';
import { BOSS_UPGRADE_INTERVAL, experienceNeeded, type UpgradeId, type UpgradeOption, type BossUpgradeId, type BossUpgradeOption } from './upgrades';
import { TypingScene } from './typing-game';
import { TOWER_SLOTS, MAX_TOWER_PROJECTILES, TOWER_UPGRADE_KEYS, TOWER_UPGRADE_NAMES, freshTowerUpgrades, isTowerUpgrade, towerAppearance, towerGlyph, towerSlotName, towerStats, towerUpgradeStats, type TowerUpgrade, type TowerView } from './towers';
import { DEFAULT_TYPING_SETTINGS, loadTypingSettings, saveTypingSettings, validateTypingSettings, TYPING_MAP_NAME, type TypingView } from './typing';

const paths: Record<string, string> = {
  home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3V10Z"/>',
  sword: '<path d="m16 3 5 0 0 5-11 11-5-5L16 3Z"/><path d="m4 13 7 7M3 21l4-4"/>',
  bow: '<path d="M5 3c19 0 19 18 0 18l5-9-5-9Z"/><path d="M5 12h16m-4-4 4 4-4 4"/>',
  hammer: '<path d="m8 11 5 5-7 7-5-5 7-7Z"/><path d="m8 6 5-5 10 10-5 5L8 6Z"/>',
  book: '<path d="M12 5c-3-2-7-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
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
let customDeckId = progress.activeDeckId;
let customName = selectedDeck(progress)?.name ?? nextDeckName(progress);
const memoryDrafts = new Map<string, { name: string; text: string }>();
let clearTypingInput: () => void = () => {};

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
        <div class="hud-growth"><strong id="level-text">LV. 1</strong><div class="xp-track"><i id="xp-fill"></i></div><small id="xp-text">0 / ${experienceNeeded(1)} XP</small><span id="burst-status">정답 0 / 3</span></div>
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

function focusBattle() {
  (activeMode === 'typing' ? el('typing-input') : el('game-canvas'))?.focus({ preventScroll: true });
}

function renderTypingDock() {
  el('armory').innerHTML = `<section class="spell-dock" aria-label="타이핑 마법"><div class="spell-caption"><span>${icon('bolt')} 마법 각인</span><span id="typing-chain">모든 일치 적 연결</span></div><div class="spell-entry"><div id="typing-runes" aria-hidden="true">답을 타이핑해 번개를 연결하세요</div><input id="typing-input" aria-label="마법 타이핑" autocomplete="off" autocapitalize="off" spellcheck="false" /></div><div class="spell-heat"><i id="typing-heat"></i></div><div class="spell-footer"><span id="typing-signal" role="status">70%부터 붉게 점화</span><span id="typing-rate">— 초 / 글자</span></div></section>`;
  const input = el<HTMLInputElement>('typing-input');
  clearTypingInput = bindTypingInput(input);
  el('typing-chain').insertAdjacentHTML('afterend', '<button id="tower-button" class="tower-button" type="button">탑 건설 · <span id="tower-points">0</span>P</button>');
  el('tower-button').addEventListener('click', () => { if (overlay === 'none' && !modalOpen) typingScene.editTowers(); });
  el('tower-panel')?.remove();
  document.querySelector('.game-stage')!.insertAdjacentHTML('beforeend', '<aside id="tower-panel" class="tower-panel" role="dialog" aria-labelledby="tower-title" hidden></aside>');
  el('tower-panel').addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if (button.dataset.rune !== undefined) typingScene.chooseTowerRune(button.dataset.rune);
    else if (button.dataset.towerSlot !== undefined) typingScene.selectTowerSlot(Number(button.dataset.towerSlot));
    else if (button.dataset.towerUpgrade && isTowerUpgrade(button.dataset.towerUpgrade)) typingScene.upgradeTower(button.dataset.towerUpgrade);
    else if (button.id === 'tower-move') typingScene.moveTower();
    else if (button.id === 'tower-close') { typingScene.closeTowers(); focusBattle(); }
  });
}

function renderTowerState(view: TowerView) {
  if (!el('tower-panel') || !el('tower-points')) return;
  el<HTMLInputElement>('typing-input').readOnly = view.editing;
  el('tower-points').textContent = String(view.points);
  el('tower-button').classList.toggle('ready', view.points > 0);
  const panel = el('tower-panel');
  if (!view.editing) { panel.hidden = true; panel.dataset.state = ''; return; }
  const key = JSON.stringify(view);
  if (panel.dataset.state === key) return;
  const wasHidden = panel.hidden;
  const focused = document.activeElement instanceof HTMLButtonElement && panel.contains(document.activeElement)
    ? { id: document.activeElement.id, rune: document.activeElement.dataset.rune, slot: document.activeElement.dataset.towerSlot } : null;
  panel.hidden = false; panel.dataset.state = key;
  const selected = view.towers.find(tower => tower.slot === view.selected);
  const level = selected?.level ?? 1, appearance = towerAppearance(level), next = towerAppearance(level + 1);
  const initial = selected?.initial ?? view.rune, glyph = initial ? escape(towerGlyph(initial)) : '＋';
  const upgrades = selected?.upgrades ?? freshTowerUpgrades(), stats = towerStats(upgrades);
  const value = (kind: TowerUpgrade, values = stats) => ({ power: values.damage.toFixed(1), speed: `${(values.interval / 1000).toFixed(2)}초`, volley: `${values.projectiles}발`, range: `${Math.round(values.range * 100)}%` })[kind];
  const symbols: Record<TowerUpgrade, string> = { power: 'sword', speed: 'bolt', volley: 'bow', range: 'target' };
  const upgradeChoices = selected ? TOWER_UPGRADE_KEYS.map(kind => {
    const capped = kind === 'volley' && stats.projectiles >= MAX_TOWER_PROJECTILES;
    return `<button id="tower-upgrade${kind === 'power' ? '' : `-${kind}`}" type="button" data-tower-upgrade="${kind}" ${view.points < 1 || capped ? 'disabled' : ''} aria-label="${TOWER_UPGRADE_NAMES[kind]} 강화 ${value(kind)}에서 ${value(kind, towerUpgradeStats(upgrades, kind))} · 1P"><span class="tower-upgrade-icon">${icon(symbols[kind])}</span><span class="tower-upgrade-detail"><strong>${TOWER_UPGRADE_NAMES[kind]} <small>+${upgrades[kind]}</small></strong><span>${value(kind)} <b>→ ${value(kind, towerUpgradeStats(upgrades, kind))}</b></span></span><small class="tower-upgrade-cost">${capped ? '최대' : '◆ 1P'}</small></button>`;
  }).join('') : '';
  const portrait = (form: ReturnType<typeof towerAppearance>, letter: string, cls = '') => `<div class="tower-portrait ${cls}" style="--rune-x:${form.runeX * 100}%;--rune-y:${form.runeY * 100}%" aria-hidden="true"><img src="/assets/art/${form.texture}.png" alt="" draggable="false" /><b>${letter}</b></div>`;
  const note = view.moving ? '이동할 빈 칸을 선택하세요 · 무료 이동' : view.rune ? `${towerGlyph(view.rune)} 탑을 배치할 빈 칸을 선택하세요 · 건설 1P` : selected ? '강화하거나 다른 빈 칸으로 이동할 수 있습니다.' : '각인을 고른 뒤 빈 칸에 탑을 건설하세요.';
  const stat = (label: string, value: string) => `<div><small>${label}</small><strong>${value}</strong></div>`;
  panel.innerHTML = `
    <header class="tower-heading"><span class="tower-crest" aria-hidden="true">${icon('bolt')}</span><div><small>DEFENSE · 전투 일시정지</small><h2 id="tower-title">수호탑 지휘소</h2></div><div class="tower-currency" aria-label="보유 탑 포인트 ${view.points}"><span aria-hidden="true">◆</span><strong>${view.points}</strong><small>P</small></div></header>
    <div class="tower-content">
      <section class="tower-selection" aria-label="선택한 수호탑">
        <div class="tower-showcase">
          ${portrait(appearance, glyph)}
          <div class="tower-identity"><small>${selected ? `${towerSlotName(selected.slot)} 전선 · 선택한 수호탑` : '신규 건설 · 1P'}</small><h3>${appearance.name}</h3><strong class="tower-level">Lv.${level}</strong><div class="tower-evolution" aria-label="외형 ${appearance.stage} / 4단계">${[1, 2, 3, 4].map(stage => `<i class="${stage <= appearance.stage ? 'lit' : ''}"></i>`).join('')}</div><p>${initial ? `<b>${glyph}</b>로 시작하는 적을` : '같은 각인의 적을'}<br>자동으로 추적 사격</p></div>
        </div>
        <div class="tower-stats" aria-label="현재 능력">
          ${stat('한 발 공격력', value('power'))}
          ${stat('공격 간격', value('speed'))}
          ${stat('동시 발사', value('volley'))}
          ${stat('사거리', value('range'))}
        </div>
        ${selected ? `<div class="tower-next">${portrait(next, glyph, 'mini')}<div><small>NEXT · Lv.${level + 1}</small><strong>${next.name}</strong><span>${next.stage > appearance.stage ? '어떤 능력을 강화해도 외형이 진화합니다' : '최종 외형 · 능력은 계속 강화할 수 있습니다'}</span></div></div><div class="tower-section-heading tower-upgrade-heading"><h3>강화할 능력 선택</h3><span>선택한 능력만 강화 · 각 1P</span></div><div class="tower-upgrade-options" aria-label="강화 방향 선택">${upgradeChoices}</div><p class="tower-volley-guide">다중 발사는 같은 각인의 적에게 나누어 발사하고, 적이 하나면 집중 사격합니다. 최대 ${MAX_TOWER_PROJECTILES}발.</p>` : '<p class="tower-build-hint">최고 등급 정답으로 얻은 각인을 전선에 배치하세요.<br>설치 후 공격력 · 연사 · 다중 발사 · 사거리를 골라 강화합니다.</p>'}
      </section>
      <section class="tower-deployment" aria-label="수호탑 배치">
        <div class="tower-section-heading"><h3>전선 배치 <small>${view.towers.length} / ${TOWER_SLOTS}</small></h3>${selected ? `<button id="tower-move" type="button" aria-pressed="${view.moving}" ${view.towers.length === TOWER_SLOTS ? 'disabled' : ''}>${view.moving ? '이동 위치 선택 중' : '위치 옮기기'}</button>` : '<span>칸 선택으로 건설</span>'}</div>
        <div class="tower-tactical-map"><span class="tower-map-label">북쪽 전선</span><div class="tower-slot-grid" aria-label="위쪽과 아래쪽 고정 배치 칸">${Array.from({ length: TOWER_SLOTS }, (_, slot) => {
          const tower = view.towers.find(item => item.slot === slot), empty = !tower;
          return `<button type="button" data-tower-slot="${slot}" aria-label="${towerSlotName(slot)} 칸${tower ? ` ${escape(towerGlyph(tower.initial))} 탑 레벨 ${tower.level}` : ' 빈 자리'}" aria-pressed="${view.selected === slot}" class="${tower ? 'occupied' : ''} ${empty && (view.rune || view.moving) ? 'available' : ''}"><small>${towerSlotName(slot)}</small><strong>${tower ? escape(towerGlyph(tower.initial)) : '+'}</strong><small>${tower ? `Lv.${tower.level}` : '빈 자리'}</small></button>`;
        }).join('')}</div><div class="tower-map-path" aria-hidden="true"><span>수호선</span><i>‹ ‹ ‹</i><span>적 진입</span></div><span class="tower-map-label south">남쪽 전선</span></div>
        <p class="tower-note" role="status">${escape(note)}</p>
      </section>
      <section class="tower-arsenal"><div class="tower-section-heading"><h3>건설 각인</h3><span>한 기당 ◆ 1P</span></div><div class="tower-runes" aria-label="건설할 첫 글자">${view.runes.length ? view.runes.map(rune => `<button type="button" data-rune="${escape(rune)}" aria-label="${escape(towerGlyph(rune))} 탑 건설" aria-pressed="${view.rune === rune}" ${view.points < 1 ? 'disabled' : ''}>${escape(towerGlyph(rune))}</button>`).join('') : '<span>최고 등급 정답으로 각인과 1P를 획득하세요.</span>'}</div></section>
    </div>
    <footer class="tower-footer"><button id="tower-close" type="button">${icon('play')} 전투 재개 <kbd>Esc</kbd></button><small>창 밖 전장을 클릭해도 전투가 재개됩니다</small></footer>`;
  if (wasHidden) panel.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({ preventScroll: true });
  else if (focused) Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).find(button => !button.disabled && (focused.id ? button.id === focused.id : focused.rune !== undefined ? button.dataset.rune === focused.rune : button.dataset.towerSlot === focused.slot))?.focus({ preventScroll: true });
}

function bindTypingInput(input: HTMLInputElement): () => void {
  let composing = false, committed = '';
  let attached = true;
  input.addEventListener('compositionstart', () => { if (!attached || !input.isConnected) return; composing = true; committed = input.value; typingScene.noteTypingKey(); });
  input.addEventListener('compositionend', () => { if (!attached || !input.isConnected) return; composing = false; typingScene.acceptTyping(input.value); });
  input.addEventListener('input', event => {
    if (!attached || !input.isConnected) return;
    typingScene.acceptTyping(input.value, composing || (event as InputEvent).isComposing, committed);
  });
  input.addEventListener('keydown', event => {
    if (!attached || !input.isConnected) return;
    if (event.isComposing || composing) return;
    if (event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); if (overlay === 'hint') hideOverlay(); else showHint(); return; }
    if (event.key === 'Enter') { event.preventDefault(); typingScene.acceptTyping(input.value, false, input.value, true); return; }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) typingScene.noteTypingKey();
  });
  input.addEventListener('paste', event => { event.preventDefault(); toast('마법은 직접 타이핑해서 완성하세요.'); });
  const syncScroll = () => { if (!attached) return; const letters = el('typing-runes').firstElementChild as HTMLElement | null; if (letters && input.value) letters.style.transform = `translateX(${-input.scrollLeft}px)`; };
  input.addEventListener('scroll', syncScroll);
  input.addEventListener('input', () => requestAnimationFrame(syncScroll));
  return () => {
    if (!composing) { input.value = ''; return; }
    // Detach the completed IME session so its delayed commit cannot re-fire
    // the old answer or insert its final syllable into the next spell.
    attached = false;
    const fresh = input.cloneNode(false) as HTMLInputElement; fresh.value = '';
    input.replaceWith(fresh); clearTypingInput = bindTypingInput(fresh);
    if (overlay === 'none' && !modalOpen) fresh.focus({ preventScroll: true });
  };
}

function renderTypingView(view: TypingView, clearInput = false) {
  if (activeMode !== 'typing' || !el('typing-input')) return;
  if (clearInput) clearTypingInput();
  const dock = el('typing-runes').closest<HTMLElement>('.spell-dock')!;
  dock.dataset.valid = String(view.valid); dock.dataset.burning = String(view.progress >= .7 && view.valid);
  dock.dataset.record = String(view.record); dock.dataset.composing = String(view.composing);
  const runes = el('typing-runes');
  if (runes.dataset.value !== view.value) {
    runes.dataset.value = view.value;
    runes.innerHTML = view.value ? `<span class="spell-letters">${escape(view.value.normalize('NFC'))}</span>` : '<small>답을 타이핑해 번개를 연결하세요</small>';
  }
  el('typing-heat').style.width = `${Math.min(100, view.progress * 100)}%`;
  el('typing-chain').textContent = view.connected ? `${view.connected}마리 연결 · ${view.capacity < 0 ? '전체 공명' : `최대 ${view.capacity}연쇄`}` : '번개 연결 대기';
  el('typing-rate').textContent = view.rate === null ? '— 초 / 글자' : `${view.rate.toFixed(3)} 초 / 글자`;
  el('typing-signal').textContent = view.composing ? '글자 조합 중' : view.ambiguous ? 'Enter로 완성 · 계속 입력하면 긴 답' : view.value && !view.valid ? '연결 끊김 · 지우고 다시 입력' : view.result || (view.progress >= .7 ? '점화 · 마법을 완성하세요!' : '70%부터 붉게 점화');
}

function updateTypingState(next: Snapshot) {
  const wave = next.typing!;
  renderTowerState(wave.fortifications);
  document.querySelector<HTMLElement>('.game-stage')!.dataset.environment = 'tempest';
  el('room-index').textContent = String(wave.round).padStart(2, '0'); el('room-title').textContent = TYPING_MAP_NAME;
  el('room-tag').textContent = wave.reversed ? 'REVERSE' : 'SPELL'; el('room-tag').classList.remove('boss');
  el('route-fraction').textContent = `${wave.round} / 12 라운드`; el('route').innerHTML = '';
  el('health-text').textContent = `${next.hp} / 100`; el('health-fill').style.width = `${next.hp}%`;
  el('health-fill').classList.toggle('low', next.hp <= 30);
  el('enemy-count').textContent = `필드 ${next.alive} · 소환 ${wave.spawned} / ${wave.quota}`;
  el('wave-status').textContent = wave.reversed ? '답을 보고 문제 입력 · 반전' : '문제를 보고 답 입력';
  el('level-text').textContent = `ROUND ${wave.round} / 12`; el('xp-fill').style.width = `${(wave.round - 1) / 12 * 100}%`;
  el('xp-text').textContent = wave.reversed ? '기억 반전' : '7라운드부터 기억 반전';
  el('burst-status').textContent = `수호탑 ${wave.fortifications.towers.length} / ${TOWER_SLOTS}`; el('burst-status').classList.remove('active');
  document.querySelector('.bottom-hud')!.classList.remove('overdrive');
  el('build-label').textContent = `돌파 ${next.bossLeaks}회 · ${wave.best === null ? '첫 입력으로 기록 수립' : `최고 ${wave.best.toFixed(3)}초 / 글자`}`;
  el('combo').textContent = `×${next.combo} COMBO`; el('combo').classList.toggle('hot', next.combo >= 3);
  const seconds = Math.floor(next.elapsed);
  el('timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  el('score').textContent = next.score.toLocaleString(); el('kills').textContent = String(next.kills);
  el('accuracy').textContent = runCorrect + runWrong ? `${Math.round(runCorrect / (runCorrect + runWrong) * 100)}%` : '—';
  el('boss-bar').hidden = true;
}

function showTypingSettings() {
  const settings = loadTypingSettings();
  openModal(`${archiveHeader('', '번개 공명 설정', '')}<div class="archive-body typing-settings"><p>글자당 입력 시간 · 초</p><div class="threshold-grid">${(['triple', 'double', 'single'] as const).map((key, index) => `<label><strong>${3 - index}연쇄</strong><small>${index ? '이하' : '미만'}이면 최대 ${3 - index}마리 폭발</small><input id="threshold-${key}" aria-label="${3 - index}연쇄 기준" type="number" min="0.03" max="2" step="0.01" value="${settings[key]}" /></label>`).join('')}</div><p class="threshold-note">가장 느린 구간은 피해와 화상만 줘요.<br>첫 입력은 기록 수립, 이후 같은 답의 최고 기록 경신은 주변에도 피해를 줘요.</p><p id="threshold-error" class="form-error" role="alert"></p><div class="threshold-actions"><button id="threshold-reset" class="text-button">기본값</button><button id="threshold-save" class="primary-button">설정 적용 ${icon('check')}</button></div></div>`, 'codex');
  el('threshold-reset').addEventListener('click', () => {
    for (const key of ['triple', 'double', 'single'] as const) el<HTMLInputElement>(`threshold-${key}`).value = String(DEFAULT_TYPING_SETTINGS[key]);
  });
  el('threshold-save').addEventListener('click', () => {
    const value = { triple: Number(el<HTMLInputElement>('threshold-triple').value), double: Number(el<HTMLInputElement>('threshold-double').value), single: Number(el<HTMLInputElement>('threshold-single').value) };
    if (!validateTypingSettings(value)) { el('threshold-error').textContent = '0.03~2초 사이에서 3연쇄 < 2연쇄 < 1연쇄 순으로 설정하세요.'; return; }
    if (!saveTypingSettings(value)) { el('threshold-error').textContent = '설정을 저장하지 못했어요.'; return; }
    typingScene.updateSettings(value); closeModal();
  });
}

function updateState(next: Snapshot) {
  state = next;
  if (next.mode === 'typing') { updateTypingState(next); return; }
  document.querySelector<HTMLElement>('.game-stage')!.dataset.environment = next.environment;
  el('room-index').textContent = next.mode === 'boss' ? '01' : String(next.room + 1).padStart(2, '0');
  el('room-title').textContent = next.roomName;
  el('room-tag').textContent = next.boss ? 'BOSS' : 'COMBAT';
  el('room-tag').classList.toggle('boss', next.boss);
  el('health-text').innerHTML = `${next.hp} <i>/ ${next.maxHp}</i>`;
  el('health-fill').style.width = `${next.hp / next.maxHp * 100}%`;
  el('health-fill').classList.toggle('low', next.hp <= 30);
  el('enemy-count').textContent = `남은 적 ${next.remaining} · 필드 ${next.alive}`;
  el('wave-status').textContent = next.boss ? `${next.bossColumns}열 지원군 · ${next.bossRoundKills >= next.bossKillGoal ? next.miniBosses ? '미니 보스 먼저 격파' : '봉인 노출! 보스를 클릭해 다음 라운드' : `격파 ${next.bossRoundKills} / ${next.bossKillGoal}`} · 계속 소환` : !next.remaining ? '첫 던전을 시작하세요' : next.nextSide !== null ? `${['위', '오른쪽', '아래', '왼쪽'][next.nextSide]}에서 등장 준비` : next.incoming ? `${next.spawnEvery.toFixed(1)}초 간격 · 대기 ${next.incoming}` : '마지막 적을 마무리하세요';
  el('level-text').textContent = next.boss ? `ROUND ${Math.min(next.bossSeals + 1, next.totalSeals)}` : `LV. ${next.level}`;
  el('xp-fill').style.width = `${next.boss ? next.bossSeals % BOSS_UPGRADE_INTERVAL / BOSS_UPGRADE_INTERVAL * 100 : next.xp / next.xpNeeded * 100}%`;
  el('xp-text').textContent = next.boss ? `${next.bossSeals % BOSS_UPGRADE_INTERVAL} / ${BOSS_UPGRADE_INTERVAL} 라운드 · 다음 강화 선택` : `${next.xp} / ${next.xpNeeded} XP`;
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
  el('boss-start-button').insertAdjacentHTML('afterend', `<button id="typing-start-button" class="adventure-button tempest" ${ready ? '' : 'disabled'}><span class="storm-emblem">${icon('bolt')}</span><span><strong>${TYPING_MAP_NAME}</strong><small>타이핑 마법 · 번개 연쇄 · 12라운드</small></span>${icon('arrow')}</button>`);
  el('typing-start-button').addEventListener('click', () => startRun(DEFAULT_WORDS, 'typing'));
  el('title-custom').addEventListener('click', showCustom);
  el('title-codex').addEventListener('click', showCodex);
}

function startRun(words: Word[], mode: RunMode = 'campaign') {
  if (!scene || !ready) return;
  if (el('tower-panel')) el('tower-panel').hidden = true;
  closeModal(false); activeWords = words; activeMode = mode; runCorrect = runWrong = runHints = 0;
  lastArmory = lastRoute = ''; overlay = 'none'; el('game-overlay').hidden = true; el('upgrade-picker').hidden = true;
  clearTimeout(upgradeUnlockTimer); upgradeSelectionReady = false;
  el('word-count').textContent = String(words.length); el('toast').hidden = true;
  document.querySelector<HTMLElement>('.game-stage')!.dataset.screen = 'playing';
  el('collection-label').textContent = '기억';
  document.querySelector<HTMLElement>('.game-stage')!.dataset.mode = mode;
  el('game-canvas').setAttribute('aria-label', mode === 'typing' ? '클릭으로 마법사 이동, 아래 입력창에서 답을 타이핑해 번개 공격, Tab 힌트, Esc 일시정지' : '바닥 클릭 이동, 몬스터 클릭 공격, 스페이스 공격, 1·2·3 무기 교체');
  if (mode === 'typing') {
    dungeonScene.setPaused(true); mounted.game.scene.sleep('dungeon');
    scene = typingScene; renderTypingDock();
  } else {
    mounted.game.scene.stop('typing'); mounted.game.scene.wake('dungeon'); scene = dungeonScene;
  }
  scene.audio.muted = progress.muted;
  scene.start(words, mode); focusBattle();

}

function returnToTitle() {
  if (activeMode === 'typing') typingScene.closeTowers();
  scene?.setPaused(true);
  closeModal(false);
  clearTimeout(toastTimeout); clearTimeout(upgradeUnlockTimer);
  upgradeSelectionReady = false;
  el('upgrade-picker').hidden = true;
  el('toast').hidden = true;
  showStart();
  el('start-button').focus({ preventScroll: true });
}

function toast(text: string) {
  if (overlay !== 'none' || modalOpen) return;
  clearTimeout(toastTimeout); el('toast').textContent = text; el('toast').hidden = false;
  toastTimeout = setTimeout(() => { el('toast').hidden = true; }, 3000);
}

function hideOverlay() {
  overlay = 'none'; el('game-overlay').hidden = true;
  scene?.setPaused(false); focusBattle();
}

function showPause() {
  if (!scene?.isRunning() || overlay !== 'none' || modalOpen) return;
  if (activeMode === 'typing') typingScene.closeTowers();
  scene.setPaused(true); overlay = 'pause'; el('toast').hidden = true;
  el('game-overlay').hidden = false;
  el('game-overlay').innerHTML = `<div class="overlay-panel"><div class="overlay-symbol">${icon('pause')}</div><div class="eyebrow">TAKE A BREATH</div><h2>잠시 숨 고르기</h2><p>기억도, 모험도 서두를 필요는 없으니까.</p><button id="resume-button" class="primary-button">${icon('play')} 탐험 계속하기</button><button id="restart-button" class="text-button">현재 단어로 처음부터 다시</button><small>ESC를 눌러 돌아갈 수 있어요</small></div>`;
  el('resume-button').addEventListener('click', hideOverlay);
  el('restart-button').addEventListener('click', () => startRun(activeWords, activeMode));
  el('restart-button').insertAdjacentHTML('afterend', `<button id="pause-home-button" class="text-button">${icon('home')} 초기 화면으로</button>`);
  el('pause-home-button').addEventListener('click', returnToTitle);
  if (activeMode === 'typing') el('resume-button').focus();
}

function showHint() {
  if (activeMode === 'typing') typingScene.closeTowers();
  if (!state || !scene?.isRunning() || overlay !== 'none' || modalOpen) return;
  const word = activeMode === 'typing' ? typingScene.hint() : state.words[state.slot];
  scene.setPaused(true); overlay = 'hint'; runHints++;
  recordAttempt(progress, word.id, 'hints'); persist(); el('toast').hidden = true;
  el('game-overlay').hidden = false;
  el('game-overlay').innerHTML = `<div class="overlay-panel hint-panel"><div class="eyebrow">A MEMORY REVEALED · 전투 일시정지</div><div class="hint-weapon ${word.kind}">${icon(word.kind)}</div><h2 style="color:${COLORS[word.kind]}">${escape(word.word)}</h2><strong class="hint-meaning">${escape(word.meaning)}</strong>${word.example ? `<blockquote>${escape(word.example)}</blockquote>` : `<p>${word.format === 'quiz' ? '이 문제에는 해설이 아직 없어요.' : '이 단어에는 예문이 아직 없어요.'}</p>`}<p>${word.format === 'quiz' ? '이 답을 장착해 위 문제가 표시된 적을 공격하세요.' : '이 뜻이 적힌 방어막을 공격하면 파괴할 수 있어요.'}</p><button id="hint-close" class="primary-button">기억했어. 다시 싸우기 ${icon('arrow')}</button><small>TAB 또는 ESC로 닫기</small></div>`;
  el('hint-close').addEventListener('click', hideOverlay);
  if (activeMode === 'typing') el('hint-close').previousElementSibling!.textContent = '이 답을 입력하면 같은 문제가 적힌 적에게 번개가 연결돼요.';
  if (activeMode === 'typing') el('hint-close').focus();
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
  if (activeMode === 'typing') el('again-button').focus();
}

function openModal(content: string, variant: 'standard' | 'codex' | 'workshop' = 'standard') {
  if (activeMode === 'typing') typingScene.closeTowers();
  if (scene?.isRunning()) scene.setPaused(true);
  modalOpen = true; el('modal-layer').hidden = false;
  el('modal-layer').innerHTML = `<div class="modal ${variant === 'standard' ? '' : `archive-modal ${variant}-modal`}" role="dialog" aria-modal="true" tabindex="-1"><button id="modal-close" class="icon-button modal-close" aria-label="닫기">${icon('close')}</button>${content}</div>`;
  el('modal-close').addEventListener('click', () => closeModal());
  el('modal-layer').querySelector<HTMLElement>('.modal')?.focus();
}

function closeModal(resume = true) {
  modalOpen = false; el('modal-layer').hidden = true; el('modal-layer').innerHTML = '';
  if (resume && overlay === 'none') { scene?.setPaused(false); focusBattle(); }
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
  if (codexTab === 'custom' && progress.decks.length) {
    el('codex-search').closest('.codex-search')!.insertAdjacentHTML('beforebegin', `<label class="codex-memory-select">단어장<select id="codex-memory-deck" aria-label="도감 단어장 선택">${progress.decks.map(deck => `<option value="${escape(deck.id)}" ${deck.id === progress.activeDeckId ? 'selected' : ''}>${escape(deck.name)} · ${deck.words.length}개</option>`).join('')}</select></label>`);
    el('codex-memory-deck').addEventListener('change', () => {
      const id = el<HTMLSelectElement>('codex-memory-deck').value, next = selectDeck(progress, id);
      if (!next || !saveProgress(next)) return;
      Object.assign(progress, next); customDeckId = id;
      const draft = memoryDrafts.get(id), deck = selectedDeck(progress)!;
      customName = draft?.name ?? deck.name; customDraft = draft?.text ?? serializeMemoryPairs(deck.words);
      showCodex();
    });
  }
  el('modal-layer').querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => button.addEventListener('click', () => { codexTab = button.dataset.tab as 'default' | 'custom'; showCodex(); }));
}

function showCustom() {
  const seed = customDraft ?? '호기심이 많은 | curious | She was curious about the old library.\n프랑스의 수도는? | 파리\n7 × 8 = ? | 56';
  openModal(`${archiveHeader('', '나만의 기억 만들기', '')}<div class="archive-body"><div class="workshop-layout"><section class="rune-inscription"><label class="input-label" for="custom-words">문제·뜻 | 답·단어 | 설명<span>설명은 선택</span></label><textarea id="custom-words" rows="7" spellcheck="false" placeholder="호기심이 많은 | curious\n프랑스의 수도는? | 파리">${escape(seed)}</textarea><div class="inscription-meta"><span>한 줄에 하나 · 3~30개</span><strong id="inscription-count"></strong></div><p id="custom-error" class="form-error" role="alert"></p><div class="custom-note">${icon('book')}<span>앞은 적의 문제, 뒤는 무기의 답이에요.<br>설명은 도감과 <kbd>Tab</kbd> 힌트에서 볼 수 있어요.</span></div></section><aside class="workshop-preview" aria-label="전투 미리보기"><h3>전투 미리보기</h3><div id="custom-preview"></div></aside></div><div class="workshop-actions"><button id="create-dungeon" class="primary-button" ${ready ? '' : 'disabled'}>${icon('play')} 던전 입장 ${icon('arrow')}</button><button id="create-boss" class="boss-start-button" ${ready ? '' : 'disabled'}>${icon('skull')} 보스전 도전</button></div></div>`, 'workshop');
  const input = el<HTMLTextAreaElement>('custom-words');
  el('custom-words').closest('.workshop-layout')!.insertAdjacentHTML('beforebegin', `<div class="memory-library"><label>단어장 선택<select id="memory-deck" aria-label="단어장 선택"><option value="">새 단어장</option>${progress.decks.map(deck => `<option value="${escape(deck.id)}" ${deck.id === customDeckId ? 'selected' : ''}>${escape(deck.name)} · ${deck.words.length}개</option>`).join('')}</select></label><button id="new-memory" class="text-button">${icon('plus')} 새 단어장</button></div><label class="memory-name" for="memory-name">단어장 이름<input id="memory-name" type="text" maxlength="40" value="${escape(customName)}" autocomplete="off" /></label>`);
  el('custom-error').insertAdjacentHTML('afterend', `<div class="memory-save-row"><button id="save-memory" class="boss-start-button">${icon('book')} ${customDeckId ? '변경 저장' : '새 단어장 저장'}</button><span id="memory-status" role="status">단어장마다 3~30개 · 여러 개 저장 가능</span></div>`);
  const nameInput = el<HTMLInputElement>('memory-name');
  const rememberDraft = () => {
    customName = nameInput.value; customDraft = input.value;
    memoryDrafts.set(customDeckId ?? '', { name: customName, text: customDraft });
  };
  const changeDeck = (id: string | null, blank = false) => {
    rememberDraft();
    if (id) {
      const next = selectDeck(progress, id);
      if (!next || !saveProgress(next)) { el<HTMLSelectElement>('memory-deck').value = customDeckId ?? ''; el('custom-error').textContent = '단어장 선택을 저장하지 못했어요.'; return; }
      Object.assign(progress, next);
    }
    customDeckId = id;
    const deck = progress.decks.find(item => item.id === id), draft = memoryDrafts.get(id ?? '');
    customName = blank ? nextDeckName(progress) : draft?.name ?? deck?.name ?? nextDeckName(progress);
    customDraft = blank ? '' : draft?.text ?? (deck ? serializeMemoryPairs(deck.words) : '');
    showCustom();
  };
  el<HTMLSelectElement>('memory-deck').value = customDeckId ?? '';
  el('memory-deck').addEventListener('change', () => changeDeck(el<HTMLSelectElement>('memory-deck').value || null));
  el('new-memory').addEventListener('click', () => changeDeck(null, true));
  nameInput.addEventListener('input', rememberDraft);
  function updatePreview() {
    rememberDraft();
    const lines = input.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    el('inscription-count').textContent = `${lines.length} / 30`;
    const pairs = lines.slice(0, 3).map(line => line.split('|').map(part => part.trim()));
    el('custom-preview').innerHTML = `<div class="preview-creature">${icon('shield')}<small>적의 문제·뜻</small><strong>${escape(pairs[0]?.[0] || '문제·뜻')}</strong></div><span class="preview-arrow">${icon('arrow')} 맞는 답으로 공격</span><div class="preview-runes">${pairs.map((pair, index) => `<div class="preview-rune">${runeArt((['sword', 'bow', 'hammer'] as WeaponKind[])[index])}<strong>${escape(pair[1] || '?')}</strong><kbd>${index + 1}</kbd></div>`).join('')}</div>`;
  }
  updatePreview(); input.addEventListener('input', updatePreview);
  function saveMemory() {
    const result = prepareDeckSave(progress, customDeckId, nameInput.value, input.value);
    if (result.error || !result.progress || !result.deck) { el('custom-error').textContent = result.error ?? '단어장을 확인하세요.'; return; }
    if (!saveProgress(result.progress)) { el('custom-error').textContent = '저장 공간이 부족하거나 브라우저 저장을 사용할 수 없어요. 기존 단어장은 유지됩니다.'; return; }
    Object.assign(progress, result.progress); customDeckId = result.deck.id; rememberDraft();
    el('custom-error').textContent = ''; el('memory-status').textContent = `‘${result.deck.name}’ 저장됨 · ${result.deck.words.length}개`;
    el('save-memory').innerHTML = `${icon('book')} 변경 저장`;
    el('memory-deck').innerHTML = `<option value="">새 단어장</option>${progress.decks.map(deck => `<option value="${escape(deck.id)}" ${deck.id === customDeckId ? 'selected' : ''}>${escape(deck.name)} · ${deck.words.length}개</option>`).join('')}`;
    return result.deck.words;
  }
  el('save-memory').addEventListener('click', saveMemory);
  function createCustom(mode: RunMode) {
    const result = parseMemoryPairs(input.value, progress.decks.flatMap(deck => deck.words).concat(progress.custom));
    if (result.error) { el('custom-error').textContent = result.error; return; }
    startRun(result.words, mode);
  }
  el('create-dungeon').addEventListener('click', () => createCustom('campaign'));
  el('create-boss').addEventListener('click', () => createCustom('boss'));
  el('create-boss').insertAdjacentHTML('afterend', `<button id="create-typing" class="boss-start-button tempest" ${ready ? '' : 'disabled'}>${icon('bolt')} 백뢰의 회랑 입장</button>`);
  el('create-typing').addEventListener('click', () => createCustom('typing'));
}


function showHelp() {
  if (activeMode === 'typing' && overlay !== 'start') {
    openModal(`${archiveHeader('', '백뢰의 회랑', '')}<div class="archive-body"><div class="help-steps"><div><span>01</span><section><h3>답을 타이핑해 번개 연결</h3><p>일치하는 적이 붉어지고, 70%부터 타올라요. 틀리면 연결이 끊어져요. 지우고 다시 입력하세요.</p></section></div><div><span>02</span><section><h3>빠르게 완성해 연쇄 폭발</h3><p>입력 속도에 따라 최대 3·2·1마리를 처치해요. 더 느리면 피해만 줍니다. 같은 답의 기록을 경신하면 주변까지 충격파!</p></section></div><div><span>03</span><section><h3>12라운드의 기억 수호</h3><p>7라운드부터 문제와 답이 뒤집혀요. 적이 왼쪽 수호선을 넘으면 생명력 −12. Tab은 힌트, 번개 메뉴는 속도 설정이에요.</p></section></div></div><button id="help-close" class="primary-button">확인 ${icon('check')}</button></div>`, 'codex');
    el('help-close').addEventListener('click', () => closeModal()); return;
  }
  openModal(`${archiveHeader('', '전투 안내', '')}<div class="archive-body"><div class="help-steps"><div><span>01</span><section><h3>적의 문제에 맞는 답을 선택</h3><p>예: ‘내키지 않는’에는 <b>reluctant</b>. 1·2·3으로 무기를 바꾸세요. 오답은 생명력 −8.</p></section></div><div><span>02</span><section><h3>던전 탐험</h3><p>바닥 클릭으로 이동, 적 클릭 또는 Space로 공격. Shift로 회피하고, 방어막을 깬 적을 처치해 경험치를 모으세요.</p></section></div><div><span>03</span><section><h3>보스 디펜스</h3><p>이동 중에는 사격을 멈추고, 서 있으면 바라보는 방향으로 자동 발사해요. 왼쪽 골인선을 지키세요. 돌파당하면 생명력 −12.</p></section></div><div><span>04</span><section><h3>강화와 힌트</h3><p>주황색 미니 보스 3마리를 처치할 때마다 강화 선택! 선택할 때까지 전투가 멈춰요. Tab은 현재 무기의 문제와 설명을 보여줍니다.</p></section></div></div><button id="help-close" class="primary-button">확인 ${icon('check')}</button></div>`, 'codex');
  el('help-close').addEventListener('click', () => closeModal());
}

function handleGameEvent(event: GameEvent) {
  if (event.type === 'ready') {
    ready = true; scene?.scale.on('resize', positionUpgradePicker);
    if (overlay === 'start') showStart();
    el('modal-layer').querySelectorAll<HTMLButtonElement>('#create-dungeon, #create-boss, #create-typing').forEach(button => { button.disabled = false; });
  }
  if (event.type === 'state') updateState(event.state);
  if (event.type === 'typing') renderTypingView(event.view, event.clearInput);
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
const typingScene = new TypingScene(handleGameEvent);
const mounted = mountGame('game-canvas', handleGameEvent, [typingScene]);
const dungeonScene = mounted.scene; scene = dungeonScene;
new ResizeObserver(() => requestAnimationFrame(positionUpgradePicker)).observe(document.querySelector('.game-stage')!);
scene.audio.muted = progress.muted;
function updateSound() { el('sound-button').innerHTML = icon(progress.muted ? 'muted' : 'sound'); el('sound-button').setAttribute('aria-label', progress.muted ? '소리 켜기' : '소리 끄기'); }
updateSound();
el('sound-button').addEventListener('click', () => { progress.muted = !progress.muted; scene!.audio.muted = progress.muted; if (!progress.muted) scene!.audio.unlock(); persist(); updateSound(); if (activeMode === 'typing' && overlay === 'none' && !modalOpen) focusBattle(); });
el('codex-button').addEventListener('click', showCodex);
el('custom-button').addEventListener('click', showCustom);
el('help-button').addEventListener('click', showHelp);
el('help-button').insertAdjacentHTML('beforebegin', `<button id="typing-settings-button" class="icon-button" aria-label="타이핑 전투 설정" title="타이핑 전투 설정">${icon('bolt')}</button>`);
el('typing-settings-button').addEventListener('click', showTypingSettings);
el('quick-hint').addEventListener('click', () => { if (overlay === 'hint') hideOverlay(); else showHint(); });
el('fullscreen-button').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.querySelector<HTMLElement>('.game-panel')!.requestFullscreen();
  } catch { toast('이 브라우저에서는 전체 화면을 사용할 수 없어요.'); }
});
el('pause-button').addEventListener('click', () => { if (overlay === 'pause') hideOverlay(); else showPause(); });
el('pause-button').insertAdjacentHTML('beforebegin', `<button id="home-button" class="icon-button" aria-label="초기 화면으로" title="초기 화면으로">${icon('home')}</button>`);
el('home-button').addEventListener('click', returnToTitle);
document.querySelector<HTMLAnchorElement>('.arena-menu .brand')!.addEventListener('click', event => { event.preventDefault(); returnToTitle(); });
el('hint-button').addEventListener('click', () => { if (overlay === 'hint') hideOverlay(); else showHint(); });
document.addEventListener('keydown', event => {
  if (event.isComposing) return;
  const towerPanel = el('tower-panel');
  if (!modalOpen && activeMode === 'typing' && towerPanel && !towerPanel.hidden) {
    if (event.key === 'Escape') { event.preventDefault(); typingScene.closeTowers(); focusBattle(); }
    else if (event.key === 'Tab') {
      event.preventDefault();
      const buttons = Array.from(towerPanel.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
    }
    return;
  }
  if (modalOpen && event.key === 'Tab') {
    const targets = Array.from(el('modal-layer').querySelectorAll<HTMLElement>('button:not([disabled]),textarea,input,select,summary,[tabindex="0"]'));
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
if (import.meta.env.DEV) Object.assign(window, { __wordmaster: { get scene() { return scene; }, typingScene, dungeonScene, get state() { return state; }, get overlay() { return overlay; } } });
