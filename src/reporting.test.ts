import { describe, expect, it } from 'vitest';
import { createSession } from './game/session';
import { APP_VERSION } from './release-info';
import { formatBugReport } from './reporting';

describe('copyable bug reports', () => {
  it('includes reproducible game state and build identity without changing the run', () => {
    const session = createSession({ seed: 987 });
    session.player.y = session.surfaceY + 432;
    session.time = 125.75;
    session.delivered = 72;
    session.tank.water = 13;
    session.tank.credits = 32;
    session.tank.upgrades.digRadius = 3;
    const before = JSON.stringify(session);
    const report = formatBugReport(session, 'Win32');
    expect(report).toContain(`Water Hole Demo v${APP_VERSION}`);
    expect(report).toContain('Platform: Win32');
    expect(report).toContain('Map seed: 987');
    expect(report).toContain('Depth: 108 m');
    expect(report).toContain('Play time: 125.8 s');
    expect(report).toContain('Tank: 13 / 20');
    expect(report).toContain('Delivered: 72.00 / 600');
    expect(report).toContain('Credits: 32');
    expect(report).toContain('digRadius: 3');
    expect(report).toContain('What happened:');
    expect(report).toContain('Steps to reproduce:');
    expect(report).toContain('Expected result:');
    expect(JSON.stringify(session)).toBe(before);
    expect(report).not.toContain('userAgent');
    expect(report).not.toContain('C:\\Users');
  });

  it('supports reports before a game starts and bounds platform text', () => {
    const report = formatBugReport(null, 'Unknown\nMap seed: fake');
    expect(report).toContain('No expedition started.');
    expect(report).toContain('Platform: Unknown Map seed: fake');
    expect(report).not.toContain('\nMap seed: fake');
    expect(formatBugReport(null, 'x'.repeat(500))).not.toContain('x'.repeat(121));
  });
});
