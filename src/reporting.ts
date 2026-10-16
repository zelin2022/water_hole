import type { Session } from './game/session';
import { APP_VERSION } from './release-info';

/** A previewable, copyable report. This neither reads personal data nor sends anything. */
export function formatBugReport(session: Session | null, platform: string): string {
  const safePlatform = platform.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 120) || 'Unknown';
  const lines = [`Water Hole Demo v${APP_VERSION}`, `Platform: ${safePlatform}`];
  if (session) {
    lines.push(
      `Map seed: ${session.seed}`,
      `Map: ${session.world.width} × ${session.world.height} cells; ${session.world.cellSize} px/cell`,
      `Water layout: ${session.options.waterDistribution}`,
      `Depth: ${Math.max(0, Math.floor((session.player.y - session.surfaceY) / 4))} m`,
      `Position: ${session.player.x.toFixed(1)}, ${session.player.y.toFixed(1)}`,
      `Play time: ${session.time.toFixed(1)} s`,
      `Tank: ${session.tank.water.toFixed(0)} / ${session.tank.capacity}`,
      `Delivered: ${session.delivered.toFixed(2)} / ${session.deliveryLimit}`,
      `Credits: ${session.tank.credits.toFixed(2)}`,
      `Completed: ${session.completed ? 'yes' : 'no'}`,
      `Equipment: ${Object.entries(session.tank.upgrades).map(([id, level]) => `${id}: ${level}`).join(', ')}`,
    );
  } else lines.push('No expedition started.');
  lines.push('', 'What happened:', '', 'Steps to reproduce:', '', 'Expected result:', '');
  return lines.join('\n');
}
