import type { Session } from './session';

export const MAX_DEV_CREDITS = 1_000_000_000;

/** Change the balance without treating development credits as water delivered. */
export function setDevCredits(session: Session, amount: number): boolean {
  if (session.completed || !Number.isFinite(amount) || amount < 0 || amount > MAX_DEV_CREDITS) return false;
  session.devCreditAdjustment += amount - session.tank.credits;
  session.tank.credits = amount;
  return true;
}

/** A visibility override must leave ordinary exploration and the run intact. */
export function setOmniVision(session: Session, enabled: boolean): boolean {
  if (session.completed || typeof enabled !== 'boolean') return false;
  session.options.debugVision = enabled;
  return true;
}
