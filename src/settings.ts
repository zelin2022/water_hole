export const ACTION_LABELS = {
  left: 'Move left', right: 'Move right', up: 'Climb up', down: 'Climb down',
  jump: 'Jump / wall jump', dig: 'Swing pickaxe', collect: 'Collect water',
  unload: 'Unload at hopper', shop: 'Equipment shop', sonar: 'Sonar ping', pause: 'Pause',
} as const;
export type Action = keyof typeof ACTION_LABELS;
export type Bindings = Record<Action, string>;
export interface Settings { music: number; sfx: number; fullscreen: boolean; resolution: string; bindings: Bindings }
export const RESOLUTIONS = ['1024x720', '1280x800', '1600x900', '1920x1080'];
export const DEFAULT_SETTINGS: Settings = {
  music: 0.25, sfx: 0.65, fullscreen: false, resolution: '1280x800',
  bindings: { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', jump: 'Space', dig: 'Mouse0',
    collect: 'KeyE', unload: 'KeyF', shop: 'KeyB', sonar: 'KeyQ', pause: 'Escape' },
};
export function readSettings(raw: string | null): Settings {
  const result = { ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_SETTINGS.bindings } };
  try {
    const saved = JSON.parse(raw ?? '{}');
    for (const channel of ['music', 'sfx'] as const) {
      if (Number.isFinite(saved[channel])) result[channel] = Math.max(0, Math.min(1, saved[channel]));
    }
    result.fullscreen = saved.fullscreen === true;
    if (RESOLUTIONS.includes(saved.resolution)) result.resolution = saved.resolution;
    if (saved.bindings) {
      const candidate = { ...result.bindings, ...saved.bindings };
      const values = (Object.keys(ACTION_LABELS) as Action[]).map(action => candidate[action]);
      if (values.every(code => typeof code === 'string' && /^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Space|Escape|Tab|Enter|ShiftLeft|ControlLeft|Mouse[012])$/.test(code))
        && new Set(values).size === values.length
        && (Object.keys(ACTION_LABELS) as Action[]).every(action => action === 'pause' || candidate[action] !== 'Escape')) {
        for (const action of Object.keys(ACTION_LABELS) as Action[]) result.bindings[action] = candidate[action];
      }
    }
  } catch { /* A corrupt preferences file must not stop the game from launching. */ }
  return result;
}
export function rebind(bindings: Bindings, action: Action, code: string): boolean {
  if (code === 'Escape' && action !== 'pause') return false;
  if ((Object.keys(ACTION_LABELS) as Action[]).some(other => other !== action && bindings[other] === code)) return false;
  if (!/^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Space|Escape|Tab|Enter|ShiftLeft|ControlLeft|Mouse[012])$/.test(code)) return false;
  bindings[action] = code;
  return true;
}
export function keyLabel(code: string): string {
  return code.replace(/^(Key|Digit)/, '').replace('Mouse0', 'LMB').replace('Mouse1', 'MMB').replace('Mouse2', 'RMB').replace('Arrow', '').replace('ShiftLeft', 'Shift').replace('ControlLeft', 'Ctrl');
}
