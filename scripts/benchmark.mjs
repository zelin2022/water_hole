import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function argument(name, fallback, minimum, maximum) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}.`);
  return value;
}

function markdown(report) {
  const ms = value => value.toFixed(2);
  const mib = value => (value / 1024 ** 2).toFixed(1);
  const text = [
    '# Water Hole calculation stress benchmark', '',
    `Build ${report.version}; ${report.createdAt}; ${report.hardware.platform} ${report.hardware.architecture}; Node ${report.runtime}.`, '',
    `${report.hardware.cpuModel}, ${report.hardware.logicalCores} logical cores, ${mib(report.hardware.totalRamBytes / 1024)} GiB installed RAM.`, '',
    `Four bounded scenarios; ${report.options.iterations} requested iterations each, ${report.options.maxDurationMs} ms work budget each. Total measured run: ${ms(report.wallMs / 1000)} seconds.`, '',
    'This measures game calculations in Node, not rendering, GPU load, whole-machine utilization, Electron startup, or packaged-app compatibility. CPU is this benchmark worker only. Memory is peak observed process usage sampled after setup and each iteration; short-lived allocation peaks can be missed. The compilation process is separate.', '',
    '| Scenario / operation | Samples | Mean ms | p50 ms | p95 ms | Max ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const scenario of report.scenarios) {
    for (const [operation, timing] of Object.entries(scenario.operations)) {
      text.push(`| ${scenario.id}: ${operation} | ${timing.samples} | ${ms(timing.meanMs)} | ${ms(timing.p50Ms)} | ${ms(timing.p95Ms)} | ${ms(timing.maxMs)} |`);
    }
  }
  text.push('', '| Scenario | Iterations | CPU one core / machine capacity | Peak observed RSS / heap MiB | Initial → final active water cells | Absolute water drift |', '| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const scenario of report.scenarios) {
    text.push(`| ${scenario.id} | ${scenario.iterations}${scenario.stoppedAtBudget ? ' (budget cap)' : ''} | ${ms(scenario.cpu.oneCorePercent)}% / ${ms(scenario.cpu.machineCapacityPercent)}% | ${mib(scenario.memory.peakRssBytes)} / ${mib(scenario.memory.peakHeapUsedBytes)} | ${scenario.before.activeWaterCells} → ${scenario.after.activeWaterCells} | ${scenario.water.absoluteDrift.toExponential(3)} |`);
  }
  for (const scenario of report.scenarios) {
    text.push('', `## ${scenario.id}`, '', scenario.description, '',
      `Grid: ${scenario.before.width} × ${scenario.before.height}; active water rows ${scenario.before.activeWaterRows} → ${scenario.after.activeWaterRows}; invalid water cells ${scenario.after.invalidWaterCells}; setup ${ms(scenario.setupMs)} ms; relative volume drift ${scenario.water.relativeDrift.toExponential(3)}.`);
  }
  text.push('', 'Each operation is measured synchronously with performance.now(). Cold-start costs are included, with the first sonar field build reported separately. A 16.67 ms operation already uses a complete 60 Hz frame budget before drawing; compare the combined operations that share a frame. The site-wide sonar and dense water fixture are deliberate adversarial cases beyond ordinary play.', '');
  return text.join('\n');
}

if (args[0] === '--worker') {
  const { benchmarkDefinitions, cpuLoadPercent, executeScenario } = await import(pathToFileURL(args[1]).href);
  const options = { iterations: argument('--iterations', 120, 1, 10_000), maxDurationMs: argument('--budget-ms', 4500, 100, 10_000) };
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const processors = cpus();
  const report = {
    version: manifest.version, createdAt: new Date().toISOString(), runtime: process.version,
    hardware: { cpuModel: processors[0]?.model ?? 'unknown', logicalCores: processors.length,
      totalRamBytes: totalmem(), platform: process.platform, architecture: process.arch },
    options, scenarios: [], wallMs: 0,
  };
  const beginning = performance.now();
  for (const definition of benchmarkDefinitions) {
    global.gc?.();
    const setupStart = performance.now();
    let scenario = definition.create();
    const setupMs = performance.now() - setupStart;
    const memory = { peakRssBytes: 0, peakHeapUsedBytes: 0, peakExternalBytes: 0, peakArrayBufferBytes: 0 };
    const sampleMemory = () => {
      const usage = process.memoryUsage();
      memory.peakRssBytes = Math.max(memory.peakRssBytes, usage.rss);
      memory.peakHeapUsedBytes = Math.max(memory.peakHeapUsedBytes, usage.heapUsed);
      memory.peakExternalBytes = Math.max(memory.peakExternalBytes, usage.external);
      memory.peakArrayBufferBytes = Math.max(memory.peakArrayBufferBytes, usage.arrayBuffers);
    };
    sampleMemory();
    const cpuBefore = process.cpuUsage(), measuredStart = performance.now();
    const result = executeScenario(scenario, { ...options, sampleMemory });
    const cpu = process.cpuUsage(cpuBefore), measuredWallMs = performance.now() - measuredStart;
    sampleMemory();
    report.scenarios.push({ id: definition.id, setupMs, ...result, measuredWallMs,
      cpu: { userMicroseconds: cpu.user, systemMicroseconds: cpu.system,
        ...cpuLoadPercent(cpu.user + cpu.system, measuredWallMs, processors.length) }, memory });
    console.log(`${definition.id}: ${result.iterations} iterations${result.stoppedAtBudget ? ' (budget cap)' : ''}; `
      + `peak observed RSS ${(memory.peakRssBytes / 1024 ** 2).toFixed(1)} MiB; water drift ${result.water.absoluteDrift.toExponential(3)}`);
    scenario = null;
  }
  report.wallMs = performance.now() - beginning;
  const destination = path.join(root, 'benchmark-results');
  await mkdir(destination, { recursive: true });
  const stem = `benchmark-${report.createdAt.replace(/[:.]/g, '-')}`;
  const json = `${JSON.stringify(report, null, 2)}\n`, md = markdown(report);
  await Promise.all([
    writeFile(path.join(destination, `${stem}.json`), json), writeFile(path.join(destination, `${stem}.md`), md),
    writeFile(path.join(destination, 'latest.json'), json), writeFile(path.join(destination, 'latest.md'), md),
  ]);
  console.log(`Reports: ${path.join(destination, 'latest.md')} and latest.json`);
  if (report.scenarios.some(scenario => scenario.after.invalidWaterCells > 0
    || scenario.water.absoluteDrift > Math.max(0.01, scenario.water.initial * 1e-6))) {
    process.exitCode = 1;
    console.error('Benchmark found invalid liquid or excessive water-accounting drift.');
  }
} else {
  // Validate before compilation. Keep the compiler out of memory/CPU samples.
  argument('--iterations', 120, 1, 10_000);
  argument('--budget-ms', 4500, 100, 10_000);
  const temporaryParent = path.resolve(tmpdir());
  const directory = await mkdtemp(path.join(temporaryParent, 'water-hole-benchmark-'));
  try {
    const { build } = await import('vite');
    await build({ configFile: false, root, logLevel: 'silent', build: {
      ssr: path.join(root, 'scripts/benchmark-scenarios.ts'), outDir: directory, emptyOutDir: false,
      rollupOptions: { output: { entryFileNames: 'scenarios.mjs' } },
    } });
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), '--worker', path.join(directory, 'scenarios.mjs'), ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
      child.once('error', reject);
      child.once('exit', (code, signal) => signal ? reject(new Error(`Benchmark interrupted (${signal}).`)) : resolve(code ?? 1));
    });
    process.exitCode = exitCode;
  } finally {
    if (path.dirname(path.resolve(directory)) !== temporaryParent || !path.basename(directory).startsWith('water-hole-benchmark-')) throw new Error('Unexpected benchmark temporary path.');
    await rm(directory, { recursive: true, force: true });
  }
}
