# Water Hole

A small 2D excavation game made with TypeScript, Canvas, Vite, and Electron. Dig into reservoirs, collect water in a tank, climb back to a machine, and trade water for a capacity upgrade.

This repository starts with **v0**, a handcrafted test site with full visibility. The intended game will use a finite procedural map and an artifact-finding objective.

## Run

Use Node.js 24 and npm.

```sh
npm ci
npm start
```

`npm start` builds the game and opens its Electron window. The first desktop launch downloads the Electron runtime if it is not already installed. For browser development:

```sh
npm run dev
```

Open the local URL Vite prints. To use the Electron window with that running development server, run `npm run desktop:dev` in another terminal.

## Controls

| Input | Action |
| --- | --- |
| A / D | Move, including air steering |
| W / S | Climb up/down while attached to a wall |
| Space | Small ground jump or wall jump |
| Direction away from wall | Detach |
| Mouse + hold left click | Aim and dig within reach |
| Hold E | Collect nearby exposed water |
| F near hopper | Sell all carried water |
| B near machine | Buy the larger tank for 60 credits |
| R | Restart the test site |

Airborne side contact attaches the character to a wall automatically. Climbing is unlimited. Water is harmless. The tank starts at 20 units and upgrades to 40. One water unit earns one credit.

The v0 loop is complete after buying the upgrade and carrying more than 20 water on the next trip. You can keep experimenting afterward.

## Development

```sh
npm test
npm run build
```

Development follows test-driven development: failing behavior tests first, implementation second, refactoring with tests passing. Terrain, water, movement, economy, and the complete loop are tested independently of Canvas and Electron. Controls and rendering also receive browser/Electron playtests.

See [docs/V0.md](docs/V0.md) for the scope and acceptance criteria.
