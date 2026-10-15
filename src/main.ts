import './style.css';
import { UPGRADE_COST } from './game/economy';
import { createSession, nearHopper, stepSession, type GameInput } from './game/session';
import { Renderer } from './render';

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <div class="identity"><span class="wordmark">WATER HOLE</span><span class="version">FIELD TEST / V0</span></div>
    <div class="readouts">
      <div class="tank-readout">
        <div class="readout-label"><span>WATER TANK</span><strong id="tank-label">0 / 20</strong></div>
        <div id="tank-meter" class="tank-meter" role="progressbar" aria-label="Water tank" aria-valuemin="0" aria-valuemax="20" aria-valuenow="0"><div id="tank-fill"></div></div>
      </div>
      <div class="credits-readout"><span class="readout-label">CREDITS</span><strong id="credits">0<span> cr</span></strong></div>
    </div>
    <button id="reset" class="quiet-button" type="button">Restart <kbd>R</kbd></button>
  </header>
  <section class="playfield" aria-label="Excavation site">
    <canvas id="game" tabindex="0" aria-label="Water Hole game. WASD to move and climb, Space to jump, mouse to aim, left click to dig, E to collect, F to sell at the machine, B to upgrade, R to restart."></canvas>
    <div class="objective"><span class="eyebrow" id="objective-step">01 / COLLECT & SELL</span><p id="objective">Earn 60 credits to upgrade your tank.</p></div>
    <div class="machine-panel" id="machine-panel">
      <div><span class="eyebrow">WATER EXCHANGE</span><span class="machine-status" id="machine-status">Return to the machine to sell.</span></div>
      <button id="upgrade" class="upgrade-button" type="button" disabled><span id="upgrade-label">Tank 20 → 40</span><span id="upgrade-price">60 cr <kbd>B</kbd></span></button>
    </div>
    <div id="notice" class="notice" role="status" aria-live="polite"></div>
    <div class="location"><span class="live-dot"></span>TEST SITE 01<span class="location-divider">/</span>FULL VISIBILITY</div>
  </section>
  <footer class="controls" aria-label="Controls">
    <span><kbd>A</kbd><kbd>D</kbd> Move</span>
    <span><kbd>W</kbd><kbd>S</kbd> Climb walls</span>
    <span><kbd>Space</kbd> Jump / wall jump</span>
    <span><kbd>LMB</kbd> Dig</span>
    <span><kbd>E</kbd> Hold to collect</span>
    <span><kbd>F</kbd> Sell at hopper</span>
  </footer>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new Renderer(canvas);
let session = createSession();
const keys = new Set<string>();
let digging = false;
let aim = { x: 300, y: 210 };
let pointer = { x: 0, y: 0, active: false };
let jumpPressed = false;
let depositPressed = false;
let upgradePressed = false;
let noticeUntil = 0;
let lastTime = performance.now();
let accumulated = 0;
const STEP = 1 / 60;

const tankLabel = document.querySelector<HTMLElement>('#tank-label')!;
const tankMeter = document.querySelector<HTMLElement>('#tank-meter')!;
const tankFill = document.querySelector<HTMLElement>('#tank-fill')!;
const credits = document.querySelector<HTMLElement>('#credits')!;
const objective = document.querySelector<HTMLElement>('#objective')!;
const objectiveStep = document.querySelector<HTMLElement>('#objective-step')!;
const machinePanel = document.querySelector<HTMLElement>('#machine-panel')!;
const machineStatus = document.querySelector<HTMLElement>('#machine-status')!;
const upgrade = document.querySelector<HTMLButtonElement>('#upgrade')!;
const upgradeLabel = document.querySelector<HTMLElement>('#upgrade-label')!;
const upgradePrice = document.querySelector<HTMLElement>('#upgrade-price')!;
const notice = document.querySelector<HTMLElement>('#notice')!;

function format(value: number): string {
  return value.toLocaleString('en', { maximumFractionDigits: 1 });
}

function showNotice(message: string) {
  notice.textContent = message;
  notice.classList.add('visible');
  noticeUntil = performance.now() + 2400;
}

function reset() {
  session = createSession();
  keys.clear();
  digging = false;
  jumpPressed = depositPressed = upgradePressed = false;
  accumulated = 0;
  showNotice('Fresh test site. Water is visible everywhere.');
  canvas.focus({ preventScroll: true });
}

document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', reset);
upgrade.addEventListener('click', () => {
  upgradePressed = true;
  canvas.focus({ preventScroll: true });
});

const gameKeys = new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'KeyE', 'KeyF', 'KeyB', 'KeyR']);
window.addEventListener('keydown', event => {
  if (!gameKeys.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLButtonElement && event.code === 'Space') return;
  event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'Space') jumpPressed = true;
  if (event.code === 'KeyF') depositPressed = true;
  if (event.code === 'KeyB') upgradePressed = true;
  if (event.code === 'KeyR') reset();
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => {
  keys.clear();
  digging = false;
  jumpPressed = depositPressed = upgradePressed = false;
});
canvas.addEventListener('pointermove', event => {
  pointer = { x: event.clientX, y: event.clientY, active: true };
});
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  canvas.focus({ preventScroll: true });
  pointer = { x: event.clientX, y: event.clientY, active: true };
  digging = true;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointerup', () => { digging = false; });
canvas.addEventListener('lostpointercapture', () => { digging = false; });
canvas.addEventListener('contextmenu', event => event.preventDefault());

function updateHUD() {
  const tank = session.tank;
  tankLabel.textContent = `${format(tank.water)} / ${tank.capacity}`;
  tankFill.style.width = `${Math.min(100, tank.water / tank.capacity * 100)}%`;
  tankMeter.setAttribute('aria-valuenow', tank.water.toFixed(2));
  tankMeter.setAttribute('aria-valuemax', String(tank.capacity));
  credits.innerHTML = `${format(tank.credits)}<span> cr</span>`;
  const atMachine = nearHopper(session);
  machinePanel.classList.toggle('in-range', atMachine);
  machineStatus.textContent = atMachine
    ? (tank.water > .01 ? 'Press F to sell your water.' : '1 water = 1 credit. Bring a full tank.')
    : 'Return to the machine to sell.';
  upgrade.disabled = !atMachine || tank.upgraded || tank.credits < UPGRADE_COST;
  upgradeLabel.textContent = tank.upgraded ? 'Capacity upgraded' : 'Tank 20 → 40';
  upgradePrice.innerHTML = tank.upgraded ? 'Installed' : '60 cr <kbd>B</kbd>';
  if (session.completed) {
    objectiveStep.textContent = 'V0 LOOP COMPLETE';
    objective.textContent = 'Dig. Collect. Sell. Upgrade. Carry more. You did it.';
  } else if (tank.upgraded) {
    objectiveStep.textContent = '03 / CARRY MORE';
    objective.textContent = 'Collect more than 20 water with your upgraded tank.';
  } else if (tank.credits >= UPGRADE_COST) {
    objectiveStep.textContent = '02 / UPGRADE';
    objective.textContent = 'Buy the larger tank at the machine. Press B nearby.';
  } else {
    objectiveStep.textContent = '01 / COLLECT & SELL';
    objective.textContent = tank.water >= tank.capacity - .01
      ? 'Tank full. Climb back and press F at the hopper.'
      : `Earn ${format(Math.max(0, UPGRADE_COST - tank.credits))} more credits to upgrade your tank.`;
  }
  if (performance.now() > noticeUntil) notice.classList.remove('visible');
}

function tick(time: number) {
  const elapsed = Math.min(.05, (time - lastTime) / 1000);
  lastTime = time;
  if (!document.hidden) accumulated += elapsed;
  if (pointer.active) aim = renderer.screenToWorld(pointer.x, pointer.y);
  while (accumulated >= STEP) {
    const input: GameInput = {
      left: keys.has('KeyA'), right: keys.has('KeyD'),
      up: keys.has('KeyW'), down: keys.has('KeyS'), jumpPressed,
      digging, aim, collecting: keys.has('KeyE'), depositPressed, upgradePressed,
    };
    const beforeCredits = session.tank.credits;
    const beforeUpgrade = session.tank.upgraded;
    const beforeComplete = session.completed;
    const attemptedDeposit = depositPressed;
    stepSession(session, input, STEP);
    if (session.tank.credits > beforeCredits) showNotice(`Sold water for ${format(session.tank.credits - beforeCredits)} credits.`);
    else if (attemptedDeposit) showNotice(nearHopper(session) ? 'Your tank is empty.' : 'Water can only be released at the hopper.');
    if (!beforeUpgrade && session.tank.upgraded) showNotice('Tank upgraded: capacity 20 → 40.');
    if (!beforeComplete && session.completed) showNotice('V0 complete. Keep experimenting, or press R to restart.');
    jumpPressed = depositPressed = upgradePressed = false;
    accumulated -= STEP;
  }
  renderer.render(session, aim, keys.has('KeyE'));
  updateHUD();
  requestAnimationFrame(tick);
}

// Inspection hooks exist only in the development build for deterministic playtests.
if (import.meta.env.DEV) {
  Object.defineProperty(window, '__waterHole', { get: () => session });
}
requestAnimationFrame(tick);
