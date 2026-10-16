# Short calculation stress benchmark

Run `npm run benchmark` on the development machine. This performs four bounded calculation scenarios rather than a long soak test. The default is 120 iterations per case, capped at 4.5 seconds of scenario work each. The initial run on the current Windows development PC finished in about four seconds including compilation. A slow machine can stop at its work budget and still produce a useful report. An individual synchronous operation finishes before the budget is checked again.

The runner compiles the existing TypeScript model with Vite into a temporary directory, then starts a separate Node worker. The compiler's CPU and memory do not contaminate the measured worker. It does not start Electron, modify player saves, or require additional dependencies. Reports are local and gitignored:

- `benchmark-results/latest.md`: readable results from the last run.
- `benchmark-results/latest.json`: full precision metrics for scripts or comparison.
- A dated JSON and Markdown pair for each run, so previous measurements remain available.

Optional bounded overrides: `npm run benchmark -- --iterations 240 --budget-ms 6000`. Iterations must be 1–10,000 and the per-scenario work budget 100–10,000 milliseconds. Defaults are sufficient for a release check.

## Cases

1. **Normal demo:** an actual seeded 384 × 2053 site, movement/fluid/session updates at 60 Hz, and normal vision updates.
2. **Deep tunnel:** a narrow connected shaft through the complete map depth, with side galleries, maximum lamps, and a cold then cached sonar query. The sonar pulse deliberately spans the whole site, exceeding the normal viewing-range pulse to exercise propagation work.
3. **Many water bodies:** roughly 98,000 starting water units in separated falling bodies distributed through the full depth, with staggered ledges. After release, falling, landing, spreading, and reconnecting water activates almost every map row. This is considerably more water than a generated demo site.
4. **Maximum mining:** maximum radius and damage against granite at changing depths, with three strikes per location and maximum-lamp vision after each impact. Breaking terrain invalidates the daylight cache.

The fixtures use production model functions. Rendering, GPU work, sound, browser frame scheduling, and packaging are outside this command; browser and packaged-app smoke checks remain separate.

## Reading the metrics

Every operation reports sample count, mean, nearest-rank p50/p95, and maximum milliseconds. Cold-start work is included; the first sonar field build is reported separately from cached queries. A calculation taking 16.67 ms already uses the whole 60 Hz frame budget before drawing. Add the operations that occur together in a real frame, and compare spikes as well as averages. The command reports timings without hardcoded hardware pass/fail thresholds.

CPU load comes from the worker's `process.cpuUsage()` during the measured scenario, divided by the same elapsed interval. **One-core percentage** is aggregate worker CPU time compared with one logical core; concurrent runtime/GC helper threads can take it above 100%. **Machine-capacity percentage** divides that number by the logical-core count. Neither number is the whole machine's observed utilization, and a low machine percentage does not imply that a single-threaded game has spare frame budget.

Memory includes peak observed RSS, JavaScript heap, external allocations, and array buffers sampled after setup and each iteration. Array buffers are included in external memory, so do not add those two figures. These are process-level observations, not an exact allocation high-water mark; brief peaks between samples can be missed. RSS can retain previously reserved memory between cases even after explicit garbage collection.

Each case records dimensions, initial/final active water cells and rows, invalid liquid cells, and absolute/relative world-water drift. These scenarios neither collect nor sell water, so world volume alone must be conserved. Float32 transfer rounding allows very small drift in the extreme liquid case. The command exits unsuccessfully if liquid becomes non-finite, exceeds cell capacity, appears in solid terrain, or total drift exceeds the larger of 0.01 water and one part per million of the initial volume. This is a correctness bound, not a performance threshold.

Hardware metadata is limited to CPU model, logical cores, installed RAM, operating-system family, architecture, and Node version. Reports contain no hostname, username, device identifier, player save, or network address.

For comparisons, close avoidable heavy applications and run the command twice, keeping both reports. Record meaningful changes rather than treating small scheduler or garbage-collection differences as regressions. Browser playtests are still needed to judge the combined rendering and calculation cost.

## Initial development-machine observation

On the 32-thread Ryzen 9 9950X3D development machine, the initial run of this suite completed 120 iterations per case in 3.38 measured seconds. Normal session updates had p95 2.18 ms and normal vision p95 1.36 ms. The deliberately site-wide sonar's first build took 31.66 ms; cached queries were below 0.02 ms. Extreme liquid reached p95 16.74 ms, and maximum digging plus vision/cache work reached p95 0.98 ms and 8.91 ms respectively. Peak observed worker RSS was about 125 MiB. The extreme liquid fixture's drift was 0.003894 out of 97,812 water, with no invalid liquid cells. These are local baseline observations, not minimum hardware specifications or a guarantee of browser frame rate.

The v0.1.23 candidate repeat completed in 3.54 measured seconds: normal session/vision p95 2.18/1.41 ms, extreme water p95 17.46 ms, maximum impact/vision p95 1.03/8.62 ms, and site-wide cold sonar 32.64 ms. Peak observed worker RSS was 124.7 MiB. Extreme liquid used approximately one core (99.9% one-core / 3.12% of this 32-thread machine's capacity). The dense liquid case is the main calculation pressure point; these deliberately excessive fixtures do not establish a minimum supported CPU.

Separate browser profiling at 1280 × 800 in headless Edge sampled 90 renders per scene. Render CPU work p95 was 1.0 ms at the surface, 1.1 ms in a full-depth tunnel, and 1.7 ms with dense falling water. Request-animation-frame intervals stayed near 31.25 ms in all three scenes due to this host's headless scheduling; they do not establish native gameplay frame rate or GPU utilization. The local observation is saved as `benchmark-results/browser-render.json`.
