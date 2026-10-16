import './style.css';
import { buyUpgrade, upgradeAvailability, UPGRADE_DEFINITIONS, upgradeStats, type UpgradeId } from './game/economy';
import { createSession, nearHopper, playerCenter, stepSession, type GameInput, type Session, type SessionOptions } from './game/session';
import { deserializeSession, serializeSession } from './game/save';
import { createVision, pingSonar, SONAR_COOLDOWN, updateVision } from './game/vision';
import { ACTION_LABELS, DEFAULT_SETTINGS, keyLabel, readSettings, rebind, RESOLUTIONS, type Action } from './settings';
import { AudioEngine } from './audio';
import { Renderer } from './render';
import { DevPanel } from './dev-panel';
import { DEFAULT_STEP_HEIGHT_CELLS } from './game/player';
import { APP_VERSION, DEMO_LABEL, FEEDBACK_URL, STORE_URL } from './release-info';
import { formatBugReport } from './reporting';

declare global {
  interface Window { waterHoleDesktop?: { setDisplay(options: { fullscreen: boolean; width: number; height: number }): Promise<void>; quit(): void; openExternal(url: string): Promise<void> } }
}
const DEV_TOOLS_ENABLED = import.meta.env.VITE_DEV_TOOLS === 'true';
type Screen = 'home' | 'new' | 'playing' | 'pause' | 'shop' | 'settings' | 'confirm' | 'ended' | 'dev' | 'support' | 'credits';
const SAVE_KEY = 'water-hole.demo.save.v1';
const SETTINGS_KEY = 'water-hole.settings.v1';
const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <div class="identity"><span class="wordmark">WATER HOLE</span><span class="version">${DEMO_LABEL}</span></div>
    <div class="readouts"><div class="tank-readout"><div class="readout-label"><span>WATER TANK</span><strong id="tank-label">0 / 20</strong></div>
      <div id="tank-meter" class="tank-meter" role="progressbar" aria-label="Water tank" aria-valuemin="0" aria-valuemax="20" aria-valuenow="0"><div id="tank-fill"></div></div></div>
      <div class="credits-readout"><span class="readout-label">CREDITS</span><strong id="credits">0<span> cr</span></strong></div></div>
    <button id="menu" class="quiet-button" type="button">Menu <kbd>Esc</kbd></button>
  </header>
  <section class="playfield" aria-label="Excavation site">
    <canvas id="game" tabindex="0" aria-label="Water Hole excavation game"></canvas>
    <div class="field-readout"><span class="eyebrow" id="field-label">SURFACE OPERATIONS</span><p id="field-hint">Dig. Collect. Return. Improve.</p></div>
    <button id="shop-open" class="machine-prompt" type="button"><span class="eyebrow">WATER EXCHANGE</span><span id="machine-status"></span></button>
    <div class="location" id="location"></div><div id="notice" class="notice" role="status" aria-live="polite"></div>
    <div id="overlay" class="overlay"><section id="panel" class="panel" role="dialog" aria-modal="true" aria-label="Game menu"></section></div>
  </section><footer id="controls" class="controls" aria-label="Controls"></footer>`;
function el<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
function read(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
const canvas = el<HTMLCanvasElement>('game');
const renderer = new Renderer(canvas);
const audio = new AudioEngine();
const settings = readSettings(read(SETTINGS_KEY));
let session = createSession();
let vision = createVision(session.world, session.explored);
let screen: Screen = 'home';
let settingsReturn: Screen = 'home';
let supportReturn: Screen = 'home';
let creditsReturn: Screen = 'home';
let reportDraft: string | null = null;
let devReturn: 'playing' | 'pause' | 'shop' = 'playing';
let hasRun = false;
let pendingNew: SessionOptions = {};
let bindingAction: Action | null = null;
let aim = { x: 320, y: 180 };
let pointer = { x: 0, y: 0, active: false };
const held = new Set<string>();
const pressed = new Set<Action>();
let accumulated = 0, lastTime = performance.now(), lastVisionAt = -1, lastTerrainVersion = -1;
let lastAutoSaveAt = 0, noticeUntil = 0, lastHUDAt = 0;
const STEP = 1 / 60;
const format = (value: number) => value.toLocaleString('en', { maximumFractionDigits: 1 });
const down = (action: Action) => held.has(settings.bindings[action]);
const devPanel = DEV_TOOLS_ENABLED ? new DevPanel(el('panel'), {
  session: () => session,
  isOpen: () => screen === 'dev',
  changed: () => {
    clearInput(); pointer.active = false;
    const centre = playerCenter(session); aim = { x: centre.x + session.facing * 80, y: centre.y };
    lastVisionAt = -1; updateHUD(); saveRun(false);
  },
  close: () => changeScreen(devReturn),
}) : null;
function clearInput(): void { held.clear(); pressed.clear(); accumulated = 0; }
function notice(message: string): void { el('notice').textContent = message; el('notice').classList.add('visible'); noticeUntil = performance.now() + 3200; }
function syncSonar(): void {
  session.sonar = vision.sonar; session.lastSonarAt = vision.lastSonarAt;
  session.subsurfaceScan = vision.subsurfaceScan; session.lastSubsurfaceScanAt = vision.lastSubsurfaceScanAt;
}
function saveRun(notify = true): boolean {
  if (!hasRun) return false;
  try { syncSonar(); localStorage.setItem(SAVE_KEY, serializeSession(session)); lastAutoSaveAt = session.time; if (notify) notice('Expedition saved.'); return true; }
  catch { if (notify) notice('Could not save. Local storage may be full or unavailable.'); return false; }
}
function restore(next: Session): void {
  reportDraft = null;
  next.options.stepHeightCells = DEFAULT_STEP_HEIGHT_CELLS;
  if (!DEV_TOOLS_ENABLED) {
    next.options.debugVision = false;
  }
  session = next; hasRun = true; vision = createVision(session.world, session.explored);
  vision.sonar = session.sonar; vision.lastSonarAt = session.lastSonarAt; pointer.active = false;
  vision.subsurfaceScan = session.subsurfaceScan; vision.lastSubsurfaceScanAt = session.lastSubsurfaceScanAt;
  const centre = playerCenter(session); aim = { x: centre.x + session.facing * 80, y: centre.y };
  lastVisionAt = -1; lastTerrainVersion = -1; lastAutoSaveAt = session.time;
  renderControls();
  changeScreen(session.completed ? 'ended' : 'playing');
}
function loadRun(): void {
  try { const raw = read(SAVE_KEY); if (!raw) { notice('No saved expedition yet.'); return; } restore(deserializeSession(raw)); notice('Expedition loaded.'); }
  catch (error) { notice(error instanceof Error ? error.message : 'Could not load the expedition.'); }
}
function saveSettings(): void {
  audio.volumes(settings.music, settings.sfx);
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { notice('Could not store preferences.'); }
  renderControls();
}
function heading(eyebrow: string, title: string, text = ''): string { return `<span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${text ? `<p class="panel-intro">${text}</p>` : ''}`; }
function button(action: string, label: string, primary = false, disabled = false): string { return `<button type="button" data-action="${action}" class="${primary ? 'primary-button' : 'menu-button'}" ${disabled ? 'disabled' : ''}>${label}</button>`; }
function changeScreen(next: Screen): void {
  if (screen === 'support') reportDraft = el<HTMLTextAreaElement>('bug-report').value;
  clearInput(); bindingAction = null; screen = next; el('overlay').hidden = next === 'playing';
  audio.setActive(!['pause', 'settings', 'dev', 'support', 'credits'].includes(next)); renderPanel();
  updateHUD();
  if (next === 'playing') canvas.focus({ preventScroll: true });
}
function renderPanel(): void {
  el('panel').className = `panel panel-${screen}`;
  if (screen === 'playing') return;
  const saved = !!read(SAVE_KEY);
  switch (screen) {
    case 'home': el('panel').innerHTML = `${heading('A SMALL INDUSTRIAL EXPEDITION', 'Useful work.<br>Deeper ground.', 'Find water beneath the surface. Bring it back. Build the equipment to go further.')}
      <div class="menu-stack">${hasRun && !session.completed ? button('resume', 'Resume expedition', true) : ''}${button('new', 'New game', !hasRun || session.completed)}${button('load', 'Continue saved game', false, !saved)}${button('settings', 'Settings')}${button('support', 'Feedback / report a bug')}${button('credits', 'Credits')}${window.waterHoleDesktop ? button('quit', 'Quit') : ''}</div><p class="small-note">A finite site. A pickaxe. A water exchange.</p>`; break;
    case 'new': el('panel').innerHTML = `${heading('NEW EXPEDITION', 'Choose your site', 'Choose a seed to generate a fresh excavation site.')}
      <form id="new-form"><label class="setting-row">Site seed<input id="site-seed" type="number" min="0" max="4294967295" step="1" value="${crypto.getRandomValues(new Uint32Array(1))[0]}"></label>
      <div class="panel-actions"><button type="submit" class="primary-button">Begin expedition</button>${button('back-home', 'Back')}</div></form><p class="small-note">A new expedition replaces the single saved game after confirmation.</p>`;
      break;
    case 'confirm': el('panel').innerHTML = `${heading('START OVER', 'Replace this expedition?', 'Starting a new game replaces your current expedition and saved game.')}<div class="panel-actions">${button('confirm-new', 'Start new expedition', true)}${button('cancel-new', 'Keep current expedition')}</div>`; break;
    case 'pause': el('panel').innerHTML = `${heading('EXPEDITION PAUSED', 'Take a breather', 'Terrain, water, and equipment are paused.')}<div class="menu-stack">${button('resume', 'Resume', true)}${button('save', 'Save game')}${button('load', 'Load saved game', false, !saved)}${button('settings', 'Settings')}${button('support', 'Feedback / report a bug')}${button('home', 'Save & return to menu')}${window.waterHoleDesktop ? button('quit', 'Save & quit') : ''}</div>`; break;
    case 'shop': renderShop(); break;
    case 'settings': renderSettings(); break;
    case 'support': renderSupport(); break;
    case 'credits': el('panel').innerHTML = `${heading('WATER HOLE', 'Credits')}<dl class="credit-list"><dt>Created by</dt><dd>zelin2022</dd><dt>Visuals & sound</dt><dd>Procedural artwork and original synthesized music and sound effects.</dd><dt>Runtime</dt><dd>Electron and Chromium. Third-party license notices are included with the desktop application.</dd></dl><p class="small-note">${DEMO_LABEL}</p><div class="panel-actions">${button('credits-back', 'Back', true)}</div>`; break;
    case 'dev': if (DEV_TOOLS_ENABLED) el('panel').innerHTML = devPanel!.render(); break;
    case 'ended': el('panel').innerHTML = `${heading('WATER HOLE', 'Thanks for playing<br>the demo.', 'You have reached the end of this demo. Thanks for spending some time underground.')}<div class="panel-actions">${button('support', 'Feedback / report a bug', true)}${STORE_URL ? button('store', 'Wishlist on Steam') : ''}${button('new', 'New expedition')}${button('home', 'Main menu')}${window.waterHoleDesktop ? button('quit', 'Quit') : ''}</div>`; break;
  }
}
function renderSupport(): void {
  el('panel').innerHTML = `${heading('FEEDBACK / BUG REPORT', 'Help improve the next expedition', 'Describe what happened below. The report includes your site seed, equipment, and demo version so an issue can be reproduced.')}<label class="report-label" for="bug-report">Your report</label><textarea id="bug-report" rows="12" spellcheck="false"></textarea><div class="panel-actions">${button('copy-report', 'Copy report', true)}${button('download-report', 'Download report')}${hasRun ? button('download-save', 'Download save') : ''}${FEEDBACK_URL ? button('feedback-page', 'Open feedback page') : ''}</div><p class="small-note">${FEEDBACK_URL ? 'Open the feedback page to send your report. You can attach an exported save if it helps explain the issue.' : 'The feedback channel is being prepared. You can copy or download a report below.'} Nothing is sent automatically.</p><div class="panel-actions">${button('support-back', 'Back')}</div>`;
  el<HTMLTextAreaElement>('bug-report').value = reportDraft ?? formatBugReport(hasRun ? session : null, navigator.platform);
}
function downloadText(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copyReport(): Promise<void> {
  try { await navigator.clipboard.writeText(el<HTMLTextAreaElement>('bug-report').value); notice('Report copied.'); }
  catch { notice('Could not copy. Download the report, or select its text and copy it.'); }
}
async function openReleaseLink(url: string | null): Promise<void> {
  if (!url) return;
  try {
    if (window.waterHoleDesktop) await window.waterHoleDesktop.openExternal(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  } catch { notice('Could not open the page. Please try again.'); }
}
function statDescription(id: UpgradeId): string {
  const stats = upgradeStats(session.tank), level = session.tank.upgrades[id];
  const next = upgradeStats({ ...session.tank, upgrades: { ...session.tank.upgrades, [id]: level + 1 } });
  switch (id) {
    case 'digRadius': return `Impact radius ${stats.digRadius} → ${next.digRadius ?? stats.digRadius}`;
    case 'digDamage': return `Damage per strike ${stats.digDamage} → ${next.digDamage ?? stats.digDamage}`;
    case 'digSpeed': return `Seconds per swing ${stats.digInterval.toFixed(2)} → ${(next.digInterval ?? stats.digInterval).toFixed(2)}`;
    case 'climbSpeed': return `Climbing speed ${stats.climbSpeed} → ${next.climbSpeed ?? stats.climbSpeed}`;
    case 'jumpPower': return `Jump launch speed ${format(stats.jumpSpeed)} → ${format(next.jumpSpeed ?? stats.jumpSpeed)}`;
    case 'capacity': return `Water capacity ${stats.capacity} → ${next.capacity ?? stats.capacity} · Full unload ${format(stats.capacity / stats.unloadRate)}s → ${format(next.capacity / next.unloadRate)}s`;
    case 'torsoLamp': return `Light radius ${format(stats.torsoRadius)} → ${format(next.torsoRadius ?? stats.torsoRadius)} · Rock reveal ${format(stats.terrainRevealCells)} → ${format(next.terrainRevealCells ?? stats.terrainRevealCells)} cells`;
    case 'headlampWidth': return `Beam angle ${format(stats.headlampHalfAngle * 360 / Math.PI)}° → ${format((next.headlampHalfAngle ?? stats.headlampHalfAngle) * 360 / Math.PI)}°`;
    case 'headlampDepth': return `Beam depth ${format(stats.headlampRange)} → ${format(next.headlampRange ?? stats.headlampRange)}`;
    case 'detectorRange': return session.tank.upgrades.detector
      ? `Detection radius ${stats.detectorRadius} → ${next.detectorRadius ?? stats.detectorRadius}`
      : `With detector: radius ${[160, 240, 320][level]} → ${[160, 240, 320][Math.min(2, level + 1)]}`;
    default: return level ? 'Installed' : 'One-time equipment purchase';
  }
}
function renderShop(): void {
  el('panel').innerHTML = `${heading('WATER EXCHANGE / EQUIPMENT', 'Make the next trip easier', `${format(session.tank.credits)} credits available`)}<div class="upgrade-grid">${UPGRADE_DEFINITIONS.map(definition => {
    const availability = upgradeAvailability(session.tank, definition.id);
    if (availability === 'unavailable') return '';
    const level = session.tank.upgrades[definition.id], cost = definition.costs[level];
    const unaffordable = availability === 'unaffordable';
    return `<article class="upgrade-card"><div class="upgrade-title"><h2>${definition.name}</h2><span>${level} / ${definition.costs.length}</span></div><p>${definition.description}</p><div class="upgrade-effect">${statDescription(definition.id)}</div>
      <button type="button" data-purchase="${definition.id}" class="purchase-button${unaffordable ? ' unaffordable' : ''}" ${unaffordable ? 'disabled' : ''}>${unaffordable ? `${cost} cr` : `Install · ${cost} cr`}</button></article>`;
  }).join('')}</div><div class="panel-actions">${button('resume', 'Return to work', true)}</div>`;
}
function renderSettings(): void {
  el('panel').innerHTML = `${heading('SETTINGS', 'Your working setup')}<div class="settings-grid"><section><h2>Graphics</h2>
    <label class="setting-row">Window size<select id="resolution">${RESOLUTIONS.map(value => `<option ${settings.resolution === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
    <label class="setting-row">Fullscreen<input id="fullscreen" type="checkbox" ${settings.fullscreen ? 'checked' : ''}></label>${button('apply-display', 'Apply display')}
    <h2>Audio</h2><label class="setting-row">Music<input id="music-volume" type="range" min="0" max="1" step="0.05" value="${settings.music}"></label>
    <label class="setting-row">Sound effects<input id="sfx-volume" type="range" min="0" max="1" step="0.05" value="${settings.sfx}"></label></section>
    <section><h2>Keybindings</h2><div class="binding-list">${(Object.keys(ACTION_LABELS) as Action[]).map(action => `<div class="binding-row"><span>${ACTION_LABELS[action]}</span><button type="button" data-binding="${action}">${keyLabel(settings.bindings[action])}</button></div>`).join('')}</div>${button('reset-bindings', 'Reset bindings')}</section></div>
    <div class="panel-actions">${button('settings-back', 'Back', true)}</div><p class="small-note">Select a binding, then press a key or mouse button. Escape cancels binding capture.</p>`;
}
async function applyDisplay(): Promise<void> {
  const fullscreen = el<HTMLInputElement>('fullscreen').checked, resolution = el<HTMLSelectElement>('resolution').value;
  const [width, height] = resolution.split('x').map(Number);
  try {
    if (window.waterHoleDesktop) await window.waterHoleDesktop.setDisplay({ fullscreen, width, height });
    else if (fullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    else if (!fullscreen && document.fullscreenElement) await document.exitFullscreen();
    settings.fullscreen = fullscreen; settings.resolution = resolution;
    saveSettings(); notice('Display settings applied.');
  } catch { notice('This display mode could not be applied.'); }
}
function renderControls(): void {
  const hints: [Action, string][] = [['left', 'Move'], ['up', 'Climb'], ['jump', session.tank.upgrades.doubleJump ? 'Jump / air jump' : 'Jump'], ['dig', 'Strike'], ['collect', 'Collect'], ['unload', 'Unload'], ['shop', 'Shop'], ['sonar', 'Sonar']];
  el('controls').innerHTML = hints.map(([action, label]) => `<span><kbd>${keyLabel(settings.bindings[action])}${action === 'left' ? ` / ${keyLabel(settings.bindings.right)}` : action === 'up' ? ` / ${keyLabel(settings.bindings.down)}` : ''}</kbd>${label}</span>`).join('');
  if (DEV_TOOLS_ENABLED) el('controls').insertAdjacentHTML('beforeend', '<span><kbd>&#96;</kbd>Dev panel</span>');
  el('menu').innerHTML = `Menu <kbd>${keyLabel(settings.bindings.pause)}</kbd>`;
}
function beginNew(): void { restore(createSession(pendingNew)); saveRun(false); notice('Explore the shaft. Hold your dig control for repeated pickaxe strikes.'); }
el('panel').addEventListener('submit', event => {
  event.preventDefault(); if (screen !== 'new') return;
  const seed = Number(el<HTMLInputElement>('site-seed').value);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) { notice('Choose a whole-number seed between 0 and 4294967295.'); return; }
  pendingNew = { seed };
  if (hasRun || read(SAVE_KEY)) changeScreen('confirm'); else beginNew();
});
el('panel').addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!target || target.disabled) return;
  void audio.unlock().catch(() => {}); audio.play('menu');
  if (target.dataset.binding) { bindingAction = target.dataset.binding as Action; target.textContent = 'Press input…'; return; }
  if (target.dataset.purchase) {
    if (screen === 'shop' && nearHopper(session) && buyUpgrade(session.tank, target.dataset.purchase as UpgradeId)) { audio.play('buy'); lastVisionAt = -1; saveRun(false); renderShop(); renderControls(); updateHUD(); }
    return;
  }
  switch (target.dataset.action) {
    case 'resume': changeScreen(session.completed ? 'ended' : 'playing'); break;
    case 'new': changeScreen('new'); break;
    case 'confirm-new': beginNew(); break;
    case 'cancel-new': changeScreen(hasRun && !session.completed ? 'playing' : 'home'); break;
    case 'back-home': changeScreen(hasRun && !session.completed ? 'pause' : 'home'); break;
    case 'load': loadRun(); break;
    case 'save': saveRun(); break;
    case 'home': if (hasRun && !saveRun()) return; changeScreen('home'); break;
    case 'settings': settingsReturn = screen; changeScreen('settings'); break;
    case 'settings-back': changeScreen(settingsReturn); break;
    case 'support': supportReturn = screen; changeScreen('support'); break;
    case 'support-back': changeScreen(supportReturn); break;
    case 'credits': creditsReturn = screen; changeScreen('credits'); break;
    case 'credits-back': changeScreen(creditsReturn); break;
    case 'copy-report': void copyReport(); break;
    case 'download-report': downloadText(`water-hole-report-v${APP_VERSION}.txt`, el<HTMLTextAreaElement>('bug-report').value, 'text/plain;charset=utf-8'); break;
    case 'download-save': if (hasRun) { syncSonar(); downloadText(`water-hole-save-${session.seed}-v${APP_VERSION}.json`, serializeSession(session), 'application/json'); } break;
    case 'feedback-page': void openReleaseLink(FEEDBACK_URL); break;
    case 'store': void openReleaseLink(STORE_URL); break;
    case 'reset-bindings': settings.bindings = { ...DEFAULT_SETTINGS.bindings }; bindingAction = null; saveSettings(); renderSettings(); break;
    case 'apply-display': void applyDisplay(); break;
    case 'quit': if (hasRun && !saveRun()) return; window.waterHoleDesktop?.quit(); break;
  }
});
el('panel').addEventListener('input', event => {
  const target = event.target as HTMLInputElement;
  if (target.id === 'music-volume') { settings.music = Number(target.value); saveSettings(); }
  if (target.id === 'sfx-volume') { settings.sfx = Number(target.value); saveSettings(); }
});
function captureBinding(code: string): void {
  if (!bindingAction) return;
  if (code === 'Escape') { bindingAction = null; renderSettings(); return; }
  if (!rebind(settings.bindings, bindingAction, code)) { notice('That input is already assigned or unsupported. Choose another.'); return; }
  bindingAction = null; saveSettings(); renderSettings();
}
function pause(): void { if (hasRun && !session.completed) changeScreen('pause'); }
el('menu').addEventListener('click', () => screen === 'playing' ? pause() : changeScreen(hasRun && !session.completed ? 'pause' : 'home'));
el('shop-open').addEventListener('click', () => { if (screen === 'playing' && nearHopper(session)) changeScreen('shop'); });
window.addEventListener('keydown', event => {
  void audio.unlock().catch(() => {});
  if (bindingAction) { event.preventDefault(); captureBinding(event.code); return; }
  if ((event.ctrlKey && event.code !== 'ControlLeft') || event.metaKey || event.altKey) return;
  if (screen === 'support' || screen === 'credits') {
    if (event.code === 'Escape' && !event.repeat) { event.preventDefault(); changeScreen(screen === 'support' ? supportReturn : creditsReturn); }
    return;
  }
  if (DEV_TOOLS_ENABLED && event.code === 'Backquote') {
    if (screen === 'dev') { event.preventDefault(); if (!event.repeat) changeScreen(devReturn); }
    else if (hasRun && !session.completed && (screen === 'playing' || screen === 'pause' || screen === 'shop')) {
      event.preventDefault(); if (event.repeat) return;
      devReturn = screen; changeScreen('dev');
    }
    return;
  }
  if (((event.code === settings.bindings.pause && !(DEV_TOOLS_ENABLED && screen === 'dev')) || event.code === 'Escape') && !(event.target instanceof HTMLInputElement && screen === 'new')) {
    event.preventDefault(); if (event.repeat) return;
    if (screen === 'playing') pause();
    else if (DEV_TOOLS_ENABLED && screen === 'dev') changeScreen(devReturn);
    else if (screen === 'pause' || screen === 'shop') changeScreen('playing');
    else if (screen === 'settings') changeScreen(settingsReturn);
    else if (screen === 'new' || screen === 'confirm') changeScreen(hasRun && !session.completed ? 'pause' : 'home');
    return;
  }
  if (screen !== 'playing') return;
  const action = (Object.keys(ACTION_LABELS) as Action[]).find(value => settings.bindings[value] === event.code); if (!action) return;
  event.preventDefault(); held.add(event.code); if (event.repeat) return;
  if (action === 'shop') { if (nearHopper(session)) changeScreen('shop'); else notice('Return to the water exchange to buy equipment.'); }
  else pressed.add(action);
});
window.addEventListener('keyup', event => held.delete(event.code));
window.addEventListener('pointerdown', event => {
  void audio.unlock().catch(() => {});
  if (bindingAction && !(event.target as HTMLElement).closest('[data-binding]')) { event.preventDefault(); event.stopImmediatePropagation(); captureBinding(`Mouse${event.button}`); }
}, true);
canvas.addEventListener('pointermove', event => { pointer = { x: event.clientX, y: event.clientY, active: true }; });
canvas.addEventListener('pointerdown', event => {
  if (screen !== 'playing') return;
  event.preventDefault(); canvas.focus({ preventScroll: true }); pointer = { x: event.clientX, y: event.clientY, active: true };
  const code = `Mouse${event.button}`; held.add(code);
  const action = (Object.keys(ACTION_LABELS) as Action[]).find(value => settings.bindings[value] === code);
  if (action === 'shop') { if (nearHopper(session)) changeScreen('shop'); } else if (action === 'pause') pause(); else if (action) pressed.add(action);
  canvas.setPointerCapture(event.pointerId);
});
window.addEventListener('pointerup', event => held.delete(`Mouse${event.button}`));
canvas.addEventListener('lostpointercapture', () => { held.delete('Mouse0'); held.delete('Mouse1'); held.delete('Mouse2'); });
canvas.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('blur', () => { clearInput(); if (screen === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (screen === 'playing') pause(); } });
window.addEventListener('beforeunload', () => { if (hasRun) saveRun(false); });
function updateHUD(): void {
  const { tank, player } = session;
  el('tank-label').textContent = `${format(tank.water)} / ${tank.capacity}`; el('tank-fill').style.width = `${Math.min(100, tank.water / tank.capacity * 100)}%`;
  el('tank-meter').setAttribute('aria-valuenow', tank.water.toFixed(2)); el('tank-meter').setAttribute('aria-valuemax', String(tank.capacity));
  el('credits').innerHTML = `${format(tank.credits)}<span> cr</span>`;
  const nearby = nearHopper(session); el('shop-open').hidden = screen !== 'playing' || !nearby;
  el('machine-status').textContent = session.unloading ? 'Transferring water…' : `${keyLabel(settings.bindings.unload)} unload · ${keyLabel(settings.bindings.shop)} equipment`;
  el('field-label').textContent = player.wall ? 'WALL ATTACHED' : `DEPTH ${Math.max(0, Math.floor((player.y - session.surfaceY) / 4))} m`;
  el('field-hint').textContent = session.unloading ? 'Unloading into the hopper. Move away or press unload again to stop.' : player.wall && !tank.upgrades.wallDig ? `${keyLabel(settings.bindings.up)} / ${keyLabel(settings.bindings.down)} climb up / down. Jump or move away to detach. A work harness unlocks wall digging.` : tank.water >= tank.capacity - 0.01 ? 'Tank full. Return to the water exchange.' : nearby ? 'Water earns credits here. Buy equipment to improve your next trip.' : 'Hold to strike terrain. Collect exposed water into your tank.';
  const cooldown = Math.max(0, SONAR_COOLDOWN - (session.time - vision.lastSonarAt));
  const waterLayout = session.options.waterDistribution === 'depth-weighted' ? 'THREE POCKET SIZES'
    : session.options.waterDistribution === 'many-small' ? 'MANY SMALL POCKETS' : 'FEWER LARGE POCKETS';
  el('location').textContent = `SITE ${session.seed} / SONAR EXPLORATION / ${waterLayout}${tank.upgrades.sonar ? ` / SONAR ${cooldown > 0 ? `${Math.ceil(cooldown)}s` : 'READY'}` : ''}`;
  el('field-hint').hidden = !hasRun || screen === 'ended';
}
function tick(time: number): void {
  const elapsed = Math.max(0, Math.min(0.05, (time - lastTime) / 1000)); lastTime = time;
  if (screen === 'playing' && !document.hidden) accumulated += elapsed;
  if (pointer.active) aim = renderer.screenToWorld(pointer.x, pointer.y);
  while (accumulated >= STEP && screen === 'playing') {
    const input: GameInput = { left: down('left'), right: down('right'), up: down('up'), down: down('down'), jumpPressed: pressed.has('jump'), digging: down('dig'), aim, collecting: down('collect'), depositPressed: pressed.has('unload') };
    if (pressed.has('sonar')) {
      if (!session.tank.upgrades.sonar) notice('Install cave sonar at the water exchange.');
      else if (pingSonar(session.world, vision, playerCenter(session), session.time, renderer.getSonarRadius(session))) { syncSonar(); audio.play('sonar'); }
      else notice(`Sonar recharging: ${Math.ceil(SONAR_COOLDOWN - (session.time - vision.lastSonarAt))}s.`);
    }
    if (pressed.has('unload') && !nearHopper(session)) notice('Water can only be released at the hopper.');
    const beforeStrike = session.lastStrike, beforeWater = session.tank.water, beforeDelivered = session.delivered;
    stepSession(session, input, STEP);
    if (session.lastStrike !== beforeStrike) { audio.play('strike'); if (session.lastStrike?.removed) audio.play('break'); }
    if (session.tank.water > beforeWater) audio.play('collect'); if (session.delivered > beforeDelivered) audio.play('unload');
    pressed.clear(); accumulated -= STEP;
    if (session.completed) { audio.play('end'); saveRun(false); changeScreen('ended'); }
  }
  if (session.time - lastVisionAt > 0.075 || lastTerrainVersion !== session.world.terrainVersion || lastVisionAt < 0) {
    const { torsoRadius, headlampRange, headlampHalfAngle, terrainRevealCells } = upgradeStats(session.tank);
    updateVision(session.world, vision, { position: playerCenter(session), headPosition: { x: session.player.x + session.player.width / 2, y: session.player.y + 6 }, aim, facing: session.facing, time: session.time, debugVision: DEV_TOOLS_ENABLED && session.options.debugVision,
      torsoRadius, headlampRange, headlampHalfAngle, terrainRevealCells, bodyBounds: session.player });
    lastVisionAt = session.time; lastTerrainVersion = session.world.terrainVersion;
  }
  audio.setScene(Math.max(0, (session.player.y - session.surfaceY) / session.world.cellSize),
    session.tank.water / session.tank.capacity);
  renderer.render(session, aim, screen === 'playing' && down('collect'), vision);
  if (hasRun && screen === 'playing' && session.time - lastAutoSaveAt >= 30) saveRun(false);
  if (time - lastHUDAt > 100) { updateHUD(); lastHUDAt = time; } if (time > noticeUntil) el('notice').classList.remove('visible');
  requestAnimationFrame(tick);
}
audio.volumes(settings.music, settings.sfx); renderControls(); changeScreen('home'); updateHUD();
if (window.waterHoleDesktop) { const [width, height] = settings.resolution.split('x').map(Number); void window.waterHoleDesktop.setDisplay({ fullscreen: settings.fullscreen, width, height }).catch(() => {}); }
if (import.meta.env.DEV) {
  Object.defineProperty(window, '__waterHole', { get: () => session });
  Object.defineProperty(window, '__waterHoleUI', { get: () => ({ screen, vision, save: saveRun, load: loadRun }) });
}
requestAnimationFrame(tick);
