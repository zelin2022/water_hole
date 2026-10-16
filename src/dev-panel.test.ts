import { describe, expect, it, vi } from 'vitest';
import { DevPanel } from './dev-panel';
import { createSession, type Session } from './game/session';

function setup(session: Session, open = true) {
  const listeners = new Map<string, (event: Event) => void>();
  const feedback = { textContent: '' };
  const panel = {
    addEventListener: (type: string, listener: (event: Event) => void) => listeners.set(type, listener),
    querySelector: () => feedback,
  } as unknown as HTMLElement;
  const changed = vi.fn();
  const close = vi.fn();
  const control = new DevPanel(panel, { session: () => session, isOpen: () => open, changed, close });
  return { control, changed, close, feedback, clickEnd: () => listeners.get('click')!({ target: {
    closest: (selector: string) => selector === '[data-dev-end]' ? {} : null,
  } } as unknown as Event) };
}

describe('developer ending control', () => {
  it('offers a warp button and notifies the host after completing the actual session', () => {
    const session = createSession({ seed: 42 });
    const panel = setup(session);
    expect(panel.control.render()).toContain('data-dev-end');
    expect(panel.control.render()).toContain('Warp to demo end');
    panel.changed.mockImplementation(() => expect(session.completed).toBe(true));
    panel.clickEnd();
    expect(panel.changed).toHaveBeenCalledOnce();
    expect(panel.close).not.toHaveBeenCalled();
  });

  it('ignores the button unless the developer panel is open', () => {
    const session = createSession({ seed: 42 });
    const panel = setup(session, false);
    panel.clickEnd();
    expect(session.completed).toBe(false);
    expect(panel.changed).not.toHaveBeenCalled();
  });

  it('reports failure without telling the host to change screens', () => {
    const session = createSession({ seed: 42 });
    session.world.water.fill(0);
    const panel = setup(session);
    panel.clickEnd();
    expect(session.completed).toBe(false);
    expect(panel.changed).not.toHaveBeenCalled();
    expect(panel.feedback.textContent).toContain('Not enough water');
  });
});
