# Water Hole development

- v0 is a small playable test map. Its completion loop is dig, collect water, climb back, sell water, buy the capacity upgrade, then carry more water.
- Use test-driven development: write a meaningful failing test, run it and confirm the expected failure, implement the smallest working change, then refactor with tests passing.
- Keep terrain, liquid simulation, movement, and economy independent of rendering and Electron so they can be tested deterministically.
- Water must remain accounted for across the world, tank, and machine. Selling must not duplicate credits.
- The character auto-attaches to walls on airborne side contact. Detachment and wall jumps must not immediately reattach to the same wall.
- v0 uses full visibility. Hidden resources, procedural generation, artifact searching, additional upgrades, saving, and polished art belong to later milestones.
- Before finishing a change, run `npm test` and `npm run build`. Playtest changes to controls or rendering in the browser or Electron.
