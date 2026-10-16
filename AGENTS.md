# Water Hole development

- Work on `main` and push completed, tested changes to `origin/main` by default.
- The current milestone is the provisional demo in `docs/DEMO.md`, with visual direction in `docs/ART_DIRECTION.md`. `docs/V0.md` records the completed prototype.
- Use test-driven development: write a meaningful failing test, run it and confirm the expected failure, implement the smallest working change, then refactor with tests passing.
- Keep terrain, liquid simulation, movement, and economy independent of rendering and Electron so they can be tested deterministically.
- Water must remain accounted for across the world, tank, and machine. Selling must not duplicate credits.
- The character auto-attaches on side contact only while falling. Detachment and wall jumps must not immediately reattach to the same wall. Digging while attached requires the purchased work harness.
- Keep cave-memory and water-pocket distribution comparisons selectable before a run, and preserve choices in saves. The headlamp and visible head follow mouse aim. Sonar uses tunable two-second travel and half-second per-outline appearance/fade.
- Cave sonar travels through connected open space and traces only its adjacent wall faces. Terrain blocks it, including diagonal corner gaps; sealed water pockets stay hidden. The original penetrating scan is retained as the hidden Subsurface scanner.
- The demo ends at its cumulative delivery limit with a thank-you screen; do not present the limit as a mission or continue simulation after it. Artifact searching remains outside the demo.
- The generated reference image defines visual style only. Its depicted content does not define gameplay, infrastructure, or HUD requirements.
- Before finishing a change, run `npm test` and `npm run build`. Playtest changes to controls or rendering in the browser or Electron.
