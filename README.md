# Water Hole

A finite 2D excavation game built with TypeScript, Canvas, Vite, and Electron. Break earth and stone with deliberate pickaxe strikes, collect exposed water, climb back to the exchange, and improve your equipment.

The **provisional demo** implements the agreed systems for playtesting and balance. Artifact searching belongs to the full game. The demo ends at a cumulative delivery limit with a thank-you screen; that limit is not presented as a mission.

## Run

Use Node.js 24 and npm.

```sh
npm ci
npm test
npm start
```

`npm start` builds and opens the desktop game. The first desktop launch downloads Electron if necessary. For browser development:

```sh
npm run dev
```

Open the local URL Vite prints. Run `npm run desktop:dev` in a second terminal to use Electron with that development server.

## Playtest options

New Game offers independent comparisons for dim remembered cave outlines versus sonar-dependent darkness, and character-facing versus mouse-directed headlamps. Mouse aim visibly rotates the worker's head. The seed reproduces the same finite site; choices are retained by save/load. Provisional builds also offer a full-visibility checkbox for testing.

The underground starter shaft is beside the exchange. Airborne wall contact attaches only while falling. Hold S to descend after attaching, then work from the shaft floor to reach the first reservoir. Digging while attached is disabled until the work-harness upgrade is purchased.

Grounded walking automatically steps up and follows down small terrain changes, up to two cells (8 pixels) by default. Stepping requires clear space above the character. Larger ledges and drops retain the normal jumping, climbing, and falling controls.

Clinging needs hand/torso contact backed by connected wall terrain. Uneven dug faces remain climbable: held grips follow shallow recesses and ledges, while foot-level bumps and isolated cells do not catch the character. The attached pose grips the wall with both hands before the harness upgrade, then visibly wields the pickaxe after installation. Underground darkness conceals the environment. Pale moonlight enters exposed openings and weakens in narrow shafts; warm head/torso lights reveal the nearby surroundings. Player lamps dim in strong ambient light and recover in darkness, including when aimed from the surface into a dark tunnel. Remembered mode keeps a faint explored outline, while sonar mode needs light or a ping to reveal it.

Detached dirt islands of up to three cells fall away and disappear on landing. The fragments do not block movement or displace water. Larger islands and stone stay intact.

## Default controls

| Input | Action |
| --- | --- |
| A / D | Move, including air steering |
| W / S | Climb up/down while attached |
| Space | Ground jump or wall jump |
| Direction away from the wall | Detach |
| Mouse + hold left click | Aim and repeat pickaxe strikes |
| Hold E | Collect nearby exposed water |
| F near the hopper | Start/stop gradual unloading |
| B near the exchange | Open the equipment shop |
| Q after installing sonar | Send a cave-outline pulse |
| Escape | Pause / return from menus |

Climbing is unlimited and water is harmless. The shop offers pick radius, pick damage, climb speed, tank capacity, water detection/range, wall digging, and sonar. Numerical balance is provisional. Settings include display presets/fullscreen, music/SFX volume, and keybindings. Escape remains reserved for pause/menu navigation.

Unavailable and fully installed upgrades are hidden. Eligible upgrades without enough credits show their price in red; the install button becomes available when funded. Buying a water detector reveals its range upgrades.

## Developer panel

Press the backtick key (`` ` ``) during an expedition to open the provisional developer panel. It also opens from pause or the equipment shop. Gameplay pauses while the panel is open; backtick, Escape, or Close panel returns to the previous screen.

The panel lets you toggle omni vision, set the current credit balance to a nonnegative amount up to 1 billion, and compare one-cell versus two-cell walking steps. Changes are saved with the expedition. Development credits do not count as delivered water or advance the demo cutoff, and omni vision does not permanently explore the whole map.

The build flag `VITE_DEV_TOOLS=true` in `.env` enables these tools for current browser, desktop, and packaged playtests. `.env.release` disables them for `npm run build:release` and the release packaging commands below. A disabled build excludes the panel and hotkey, ignores saved omni-vision overrides, and uses the two-cell walking-step default. Restart the development server after changing the flag. Environment overrides take precedence over the `.env` files.

## Saving

One local slot supports manual Save/Load, Continue, autosaving every 30 seconds, and saving when returning to the menu or quitting. New Game confirms before replacing an expedition. Terrain, partial damage, water, equipment, exploration, comparison choices, and sonar/cutoff state are preserved. Browser development and the packaged desktop game use separate local storage.

## Standalone packages

```sh
npm run package:win
npm run package:mac
npm run package:mac:x64
```

For public release candidates with developer tools disabled:

```sh
npm run package:win:release
npm run package:mac:release
npm run package:mac:x64:release
```

Outputs are under `release/`: Windows x64, macOS Apple Silicon, and macOS Intel respectively. Copy the whole Windows folder, then launch `Water Hole.exe`; Node and npm are not needed to run a package. Build macOS packages on the Mac. Current packages are unsigned and macOS signing/notarization remains release work. macOS packaging and playtesting have not been verified on this Windows host.

## Development

```sh
npm test
npm run build
```

Development follows TDD: confirm a failing behaviour test, implement, then refactor with tests passing. Terrain, water, movement, progression, saving, lighting, sonar, and detection remain independent of Canvas/Electron. `npm test` also checks the desktop bridge/display contract and verifies that actual release JavaScript excludes developer tools. Controls and rendering receive browser/desktop playtests.

See [the demo scope](docs/DEMO.md), [art direction](docs/ART_DIRECTION.md), and [Steam release preparation](docs/STEAM_DEMO_RELEASE.md). The original [v0 scope](docs/V0.md) remains as milestone history.
