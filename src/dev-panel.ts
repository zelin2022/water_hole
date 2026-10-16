import { MAX_DEV_CREDITS, setDevCredits, setOmniVision, teleportToHopper } from './game/dev-tools';
import type { Session } from './game/session';

interface DevPanelActions {
  session(): Session;
  isOpen(): boolean;
  changed(): void;
  close(): void;
}

/** Imported tools are removed from builds whose dev-tools flag is disabled. */
export class DevPanel {
  constructor(private readonly panel: HTMLElement, private readonly actions: DevPanelActions) {
    panel.addEventListener('change', event => {
      const input = event.target as HTMLInputElement;
      if (!actions.isOpen()) return;
      if (input.id === 'dev-omni-vision' && setOmniVision(actions.session(), input.checked)) actions.changed();
    });
    panel.addEventListener('submit', event => {
      if (!actions.isOpen() || (event.target as HTMLFormElement).id !== 'dev-credits-form') return;
      event.preventDefault();
      const input = panel.querySelector<HTMLInputElement>('#dev-credits')!;
      if (!input.value.trim() || !input.checkValidity() || !setDevCredits(actions.session(), Number(input.value))) {
        this.feedback(`Enter a credit balance from 0 to ${MAX_DEV_CREDITS.toLocaleString('en')}.`);
        input.reportValidity();
        return;
      }
      actions.changed();
      this.feedback(`Credits set to ${actions.session().tank.credits.toLocaleString('en', { maximumFractionDigits: 10 })} cr.`);
    });
    panel.addEventListener('click', event => {
      if (!actions.isOpen()) return;
      const target = event.target as HTMLElement;
      if (target.closest('[data-dev-close]')) actions.close();
      else if (target.closest('[data-dev-teleport]')) {
        if (!teleportToHopper(actions.session())) {
          this.feedback(actions.session().completed ? 'This demo has ended.' : 'No clear space near the hopper. Teleport cancelled.');
          return;
        }
        actions.changed();
        this.feedback('Player moved to the hopper.');
      }
    });
  }

  render(): string {
    const session = this.actions.session();
    return `<span class="eyebrow">PROVISIONAL TOOLS</span><h1>Dev panel</h1>
      <p class="panel-intro">Changes apply to this expedition. Gameplay is paused.</p>
      <label class="setting-row">Omni vision<input id="dev-omni-vision" type="checkbox" ${session.options.debugVision ? 'checked' : ''}></label>
      <form id="dev-credits-form"><label class="setting-row">Set credits to<input id="dev-credits" type="number" min="0" max="${MAX_DEV_CREDITS}" step="any" value="${session.tank.credits}" required></label>
        <button type="submit" class="primary-button">Set credits</button></form>
      <button type="button" data-dev-teleport class="menu-button">Teleport to hopper</button>
      <p id="dev-feedback" class="small-note" role="status" aria-live="polite"></p>
      <div class="panel-actions"><button type="button" data-dev-close class="menu-button">Close panel</button></div>
      <p class="small-note">Backtick or Escape closes this panel.</p>`;
  }

  private feedback(message: string): void {
    this.panel.querySelector<HTMLElement>('#dev-feedback')!.textContent = message;
  }
}
