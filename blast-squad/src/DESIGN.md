# Blast Squad: design contracts

Blast Squad is a Brawl Stars-style 3v3 brawler for phones, played in landscape. This file fixes the
interfaces that the modules build on. Change a contract only together with every module that uses it.

## Build and code conventions

- **Bundling:** `node blast-squad/build.mjs` concatenates `src/js/*.js` in file-name order into one IIFE
  inside `src/index.template.html` (`/*GAME_JS*/`).
  - All files share **one scope**, so a top-level name must be unique across files. Before adding one,
    grep `src/js` for it.
  - Prefer one namespace object or class per module (`View`, `Art`, `Input`, `Meta`, `UI`, `Sound`, ...).
- **Style:** match the other games (`crown-duel/src/js`, `dawnkeeper/src/js`):
  - 2 spaces, single quotes, semicolons
  - short comments that say why
  - no `'use strict'` (only `01-util.js` has it)
  - no external libraries, no network assets
- **Determinism:** files `02-*` to `10-*` (constants, data, maps, geo, sim, modes, AI) must not call
  `Math.random`, `Date`, `performance`, or util's `rand` / `randi` / `choice`.
  - Use `sim.rng` (gameplay) or the bot's own `RNG`.
  - `tools/load.cjs` makes those calls throw in Node tests, and `checkDeterministicSources()` scans
    for them.
- **Units:** world units are tiles. x points right and y points down. Team 0 spawns at the bottom
  (large y), team 1 at the top. Data is written in the original game's units (1 tile = 300) and
  converted with `U()`. Times are in seconds and angles in radians (`Math.atan2` convention).
  Health and damage stay in original units (a brawler has e.g. 3600 HP).
- **Tick:** the sim runs at `SIM_HZ = 30`. The renderer interpolates between `px,py` (previous tick)
  and `x,y`.

## Files and owners

| File | Contents |
|---|---|
| 01-util.js | helpers (copied from Crown Duel + angle/vector helpers) |
| 02-const.js | constants, tiles, entity kinds, events, input word, rarities |
| 03-brawlers.js | `BRAWLERS` data (roster below) |
| 04-maps.js | `MAPS`, `parseMap(key)`, `cloneMap(m)` |
| 05-geo.js | `moveCircle`, `rayHit`, `shotClear`, `walkClear`, `segCircle`, `cameraRect`, `poisonRect`, `flowField`, `flowAt`, `flowDir`, `tileAt` helpers |
| 06-sim.js | `class Sim` |
| 07-modes.js | `MODES` (Gem Rush, Showdown, Blast Ball, Knockout, Bounty) |
| 08-perceive.js | `perceive(sim, slot, out)`: the only way a bot sees the world |
| 09-mind.js | bot brain: memory, utility decisions, squad pins, personality/skill curves |
| 10-motor.js | bot motor model: intent -> input words; `class Bot` (ties 08-10 together) |
| 11-input.js | `Input`: touch twin-stick, keyboard + mouse, gamepad -> input words |
| 12-net.js | WebRTC P2P (from Crown Duel) |
| 13-sync.js | snapshots, guest prediction and interpolation |
| 14-match.js | `class Match`: runs a match offline / as host / as guest |
| 15-art.js | `Art`: procedural sprites (brawlers, tiles, shots, effects, portraits) |
| 16-fx.js | `FX`: particles, damage numbers, screen shake |
| 17-view.js | `View`: camera, world rendering, HUD |
| 18-save.js | `SAVE`, `loadGame`, `saveGame`, migration |
| 19-meta.js | `Meta`: trophies, Trophy Road, upgrades, pass, drops, shop, quests, matchmaking, bot profiles |
| 20-ui.js | `UI`: DOM menus (landscape) |
| 21-audio.js | `Sound`, `Music` |
| 22-main.js | `Game`: loop, scenes, service worker, `window.__BS` test hooks |

## Input word (02-const.js)

One unsigned 30-bit integer per player per tick. Human, bot and remote players all produce the
same word.

- **Packing:** `packIn(mvA, mvM, aimA, aimD, act, auto)` and `unpackIn(w, out)`.
  - `out` gets `mvA, mvM, mx, my, aimA, aimD, ax, ay, act, auto`.
  - `mvM` is 0..1, quantised to 7 steps; 0 means stand still.
  - `aimD` is the share of the attack's range (0..1). Lobs land at that distance; straight shots
    ignore it.
- **Action:** `act` is `ACT.NONE`, `ACT.ATTACK`, `ACT.SUPER` or `ACT.GADGET`. It is an edge: the action
  happens on the tick the word is applied.
  - If the action can't happen (no ammo, super not charged), it is ignored. Inputs don't queue
    actions.
  - The input layer sends at most one action per tick.
- **Auto-aim:** with `auto = 1` the sim aims for the shooter. It picks the nearest enemy that the
  shooter's team can see, inside the attack's range plus 1 tile, and aims at its current position
  (no lead), as the original does. With no target it fires the way the brawler faces.
- **Flip:** `flipIn(w)` rotates both angles by 180°. The view and input of team 1 are turned upside
  down, so its words are flipped once, in `Input`, before they are used.
- **Helpers:** `inAct(w)`, `withAct(w, act, auto)`, `noAct(w)`.

## Sim (06-sim.js)

```js
const sim = new Sim({
  mode: 'gem',                 // MODE.*
  map: 'crystal_cove',         // MAPS key (the sim parses and clones it)
  seed: 12345,                 // sim.rng = new RNG(seed)
  slots: [                     // 6 slots in 3v3 (0-2 team 0, 3-5 team 1), 10 in Showdown (team = slot)
    { team: 0, bk: 'nova', lvl: 7, gadget: 0, star: 0 },   // gadget/star: index or -1 if not unlocked
    ...
  ],
});
sim.setInput(slot, word);      // before step(); the last word set for a slot is used
sim.step();                    // advances one tick (SIM_DT)
sim.events                     // array of [EV.x, ...] produced by the last step(); the caller empties it
sim.tick, sim.t                // ticks / seconds since the start
sim.over, sim.result           // result: see below
sim.map                        // the match's own MapGrid (tiles change when walls break)
sim.brawlers                   // array by slot
sim.shots, sim.areas, sim.pickups, sim.deploys   // live entities (creation order)
sim.ball                       // Blast Ball only, else null
sim.ms                         // mode state (owned by the mode)
sim.hud()                      // plain object for the HUD, from the mode (see Modes)
sim.visibleTo(team, e)         // (e.vis >> team) & 1, for brawlers; other entities are always visible
sim.rng                        // RNG for gameplay randomness
```

**Phase order of `step()`:**
1. Apply inputs: movement, then fire (main attack, super or gadget).
2. Deploys (turrets, pets).
3. Shots: move, hit walls, brawlers, boxes and deploys.
4. Areas.
5. Pickups.
6. The mode's `tick`.
7. Timers: regen, reload, statuses, respawn.
8. Poison.
9. Deaths.
10. Vision bits.
11. `checkEnd`.

**Entities** are plain objects with one fixed shape per kind. Every entity has
`id, kind, team, x, y, px, py, r, dead`. Ids are increasing integers.

- **Brawler (`K.BRAWLER`):**
  - `slot, bk, lvl, gadget, star, name`
  - `hp, maxHp, alive, respawnT, face`
  - `ammo` (float 0..3), `reload` (s per ammo), `sup` (0..1), `supReady`, `gadLeft`, `gadT` (cooldown)
  - `cubes`, `carry` (gems held), `bounty` (stars on the head)
  - `vis` (bit per team that can see it), `inBush`, `revealT`, `quietT` (s since it last attacked or
    was hit), `shieldT`
  - `stunT, slowT, slowF, kbT, kbx, kby, dashT`
  - `invisT` (invisible to enemies; they still see it within 1.6 tiles), `speedT, speedF`
  - `mvx, mvy` (velocity last tick, tiles/s, for animation)
  - `lastSeq` (the remote input sequence applied, set by the match)
  - `st` (stats: `{ kills, deaths, dmg, heal, gems, goals, stars }`)
  - `alive` false means dead (waiting to respawn, or out in Knockout/Showdown). `dead` is only for
    removed entities and is always false for brawlers.
- **Shot (`K.SHOT`):**
  - `owner` (slot), `pk` (visual key, e.g. `'nova.atk'`), `x0, y0`, `ang`, `spd`, `range`, `trav`
  - `dmg, r, pierce, hitMask` (bits of slots already hit), `sup` (from a super), `breaks`
  - `lob`: `{ tx, ty, T, t }` for lobs, else null. They fly over everything and only act on landing.
- **Area (`K.AREA`):** `owner, ak` (visual key), `r, t, T` (time left / total), `dmg` (per second
  vs enemies), `heal` (per second for allies), `slow`.
- **Pickup (`K.PICKUP`):** `pick` (`PICK.GEM` / `PICK.CUBE` / `PICK.STAR`), `n` (count), `vx, vy`
  (pop-out motion), `t`.
- **Deploy (`K.DEPLOY`):** `owner, dk` (visual key, e.g. `'gizmo.turret'`), `hp, maxHp`, `face`, `t`.
- **Ball (`K.BALL`):** `holder` (slot or -1), `vx, vy`, `z` (height, for lobbed passes).

**Combat rules (as in the original):**
- Each attack uses 1 of 3 ammo bars. Bars reload continuously.
- Main-attack hits on brawlers charge the super. The amount per hit is in the data.
- Health regenerates at `REGEN_RATE` × max per second after `REGEN_DELAY` s without attacking or being
  hit.
- Brawlers don't collide with each other.
- Straight shots stop at the first `TF_SHOT` tile (DDA on the centre line). Shots hitting a Showdown
  box damage it; at 0 HP it drops a power cube and turns to floor (`EV.TILE`).
- Lobs ignore walls. Beams and melee are resolved instantly and clip at the first wall.
- Supers flagged `breaks` turn `WALL` / `BOX` tiles they touch into `FLOOR` (`EV.TILE`).
- Spawn protection lasts `SPAWN_SHIELD_T`.

**Vision:** walls never block sight.
- A brawler in a bush is seen only by its own team, plus any team that has a living member within
  `REVEAL_R`.
- Attacking or being hit reveals it for `REVEAL_T`.
- Invisible brawlers are seen by enemies only within 1.6 tiles.
- `vis` bits are recomputed every tick, and vision is shared within a team.

**Result** (`sim.result` when `sim.over`):
```js
{ winner: 0 | 1 | -1,               // team; -1 draw (3v3 modes)
  rank: [slot, ...],                // Showdown: placement order, 1st first (others: optional)
  mvp: slot, reason: 'gems' | 'goals' | 'stars' | 'rounds' | 'time' | 'last' ,
  score: [a, b], stats: [ per slot copy of st ] }
```

## Modes (07-modes.js)

`MODES[key]` is an object with hooks. The sim calls them, and the mode keeps its state in `sim.ms`.

```js
{ init(sim), spawnPoint(sim, b) -> {x, y}, tick(sim), onKill(sim, victim, killer /* brawler|null */),
  onPickup(sim, b, p) -> bool (true = picked), canRespawn(sim, b) -> bool, checkEnd(sim) -> result|null,
  onAction(sim, b, act, input) -> bool (true = the mode used the press, no attack), thaw(sim),
  hud(sim) -> object, poison: sched|null }
```

**Freeze.** A mode may set `sim.freezeT` (seconds). While it runs the world stands still: inputs are
ignored and nothing moves. Goal celebrations and the pause between Knockout rounds use it. When it
runs out, the sim calls `thaw(sim)`.

`sim.playT` is the time spent playing, excluding frozen time. Mode clocks use it.

| Mode | Rules |
|---|---|
| Showdown `sd` | 10 solo players with spawn order shuffled by `sim.rng`. No respawn. Boxes and fallen brawlers drop their power cubes. Poison `{start 30, shrink 100, minHalf 0.5}`. `rankNow(sim)` lists the living by health, then the fallen with the last one down first. |
| Blast Ball `ball` | While holding the ball, attack kicks it (auto-aim kicks at the enemy goal) and super lobs a pass over walls. A ball entering a goal rect scores; own goals count, without credit. Each goal triggers a 2.5 s freeze, then `resetRound({})`. First to 2 wins. A 150 s clock; a tie goes to 60 s of sudden-death overtime with every breakable wall removed, then a draw. |
| Knockout `ko` | No respawn. A wiped team loses the round: `EV.ROUND`, a 3 s freeze, then `resetRound({tiles: true})`. First to 2 rounds, at most 5. Poison after 45 s. At 120 s, the team with more brawlers standing (then more health) takes the round. |
| Bounty `bounty` | Brawlers carry 2 to 7 stars (+1 per takedown). A takedown scores the victim's stars for the killer's team and resets the victim to 2. The centre star at `O` is worth 1. 120 s on `playT`. |

Shape of `hud(sim)`:

| Mode | Fields |
|---|---|
| Gem | `{ mode:'gem', time, gems:[a,b], count: secondsLeft|0, countTeam: -1|0|1 }` |
| Showdown | `{ mode:'sd', time, alive: n, poison: rect }` |
| Ball | `{ mode:'ball', time, goals:[a,b], ot: bool }` |
| Knockout | `{ mode:'ko', time, round, rounds:[a,b], alive:[a,b], poison: rect|null }` |
| Bounty | `{ mode:'bounty', time, stars:[a,b] }` |

`time` counts down where the mode has a clock (Showdown and Gem Rush count up).

## Bot perception (08-perceive.js)

`perceive(sim, slot, out)` fills `out` (pooled, reused) with what that player sees: the camera
rectangle (`cameraRect`, which also drives the view) plus the HUD. Bots never touch `sim`; the
`Bot` gets only percepts.

```js
{ tick, t, mode, map /* read-only */, cam: {x0,y0,x1,y1},
  me: { slot, team, bk, x, y, hp, maxHp, ammo, sup, supReady, gadLeft, gadReady, carry, cubes, alive,
        respawnT, inBush, invis, stunned, face },
  allies:  [{ slot, bk, x, y, hp, maxHp, alive, carry, inBush, supReady }],           // always known
  enemies: [{ slot, bk, x, y, hp, maxHp, carry, cubes, inBush }], // visible to my team AND on my screen
  shots:   [{ x, y, ang, spd, r, team, lob: {tx, ty, tLeft}|null }],      // enemy shots on my screen
  areas:   [{ x, y, r, team, harm: bool }],
  pickups: [{ pick, x, y, n }],
  deploys: [{ team, dk, x, y, hp }],
  ball:    { x, y, holderSlot, holderTeam } | null,
  cues:    [{ x, y }],         // unseen enemy shots fired within 7 tiles, position jittered +-1.5 tiles
  hud:     sim.hud() copy, poison rect when there is poison,
  frozen:  bool,               // a goal / round banner is up and nothing moves (players see it too)
  pins:    [{ slot, id, age }] }  // teammates' quick-chat pins
```

Percepts carry **no velocities**. Bots estimate motion from successive sightings.

## Bot (`class Bot` in 10-motor.js, with 09-mind.js)

```js
const bot = new Bot(slot, profile, seed);   // profile from Meta.botProfile()
bot.tick(sim) -> word                       // called once per sim tick, before sim.step()
bot.telemetry                               // counters for tools/ai-test.cjs
```

`bot.tick` calls `perceive(sim, slot, P)` at its own perception rate (about 15 Hz, staggered by
slot) and uses only `P`.

`profile` fields:
- `{ name, icon, skill: 0..1, traits: { aggr, patience, greed, teamwork, tilt } /* 0..1 */, fav: [bk] }`

## Match (14-match.js)

```js
const m = new Match(cfg, { net: 'offline' | 'host', link });      // runs the Sim
const g = new GuestMatch(cfg, { net: 'guest', link });            // 13-sync.js: no sim, no AI
// Game.startMatch(cfg, opts) picks GuestMatch when opts.net === 'guest'.
// cfg: { mode, map, seed, slots:[{ team, bk, lvl, gadget, star, name, icon, tro, ctrl:'local'|'bot'|'remote', profile }],
//        localSlot, guestSlot?, friendly? }
m.update(dt) / m.draw(ctx)
m.state     // what View draws (the sim itself offline/host; a mirror with the same entity shapes on the guest)
m.onEnd = (result) => {}
```

- Offline Showdown ends for the player 2.5 s after they are knocked out. Their placement comes from
  `MODES.sd.rankNow(sim)`.
- Each tick the match sets `Input.ball` (the local brawler holds the ball), so the buttons show kick
  and pass.

**Friendly battle (12-net.js, 13-sync.js).**
- The host runs the `Match`; `SyncHost` hooks `onTick`.
- Snapshots go out at 15 Hz on the unreliable channel, filtered by the guest team's vision.
  Events ride 5 snapshots in a row.
- Tile changes, goals, rounds and the result go on the reliable channel.
- Projectiles go as one record per volley, and the guest flies them itself.
- The guest predicts its own movement and reconciles against `brawler.lastSeq`, the last input
  the host applied. Other brawlers are interpolated with a 70-200 ms delay.
- The host wraps `sim.spawnShot` to stream new shots. It fast-forwards the guest's own shots with
  `sim.stepStraight` / `sim.stepLob` by half the round trip, at most 100 ms.
- Disconnects:
  - after 2 s of silence an AI holds the guest's brawler
  - after 12 s the link drops
  - if the host leaves, the guest's match is void

## View (17-view.js), Art (15-art.js), FX (16-fx.js)

- **View:** `View.draw(ctx, state, localSlot, alpha)`.
  - `state` has the Sim's fields: `map, brawlers, shots, areas, pickups, deploys, ball, hud()`, and
    `tick`.
  - Brawlers the local team can't see are not drawn: `(b.vis >> team) & 1`, or the guest mirror
    leaves them out.
  - The camera comes from `cameraRect(map, x, y, flip, sd)`, with `flip = localTeam === 1 && mode !== 'sd'`.
    The visible width follows the device's aspect ratio; the height is always `CAM_H` tiles.
  - The view also draws the HUD: timer, mode score, ammo bars under the player, super charge, and
    names/HP bars over brawlers.
  - Input buttons are drawn by `Input.draw(ctx)`.
- **Art:**
  - `Art.brawler(ctx, bk, x, y, scale, face, anim, team, flags)` draws a brawler.
  - `Art.portrait(bk, px)` returns a cached canvas for menus.
  - `Art.tileLayer(map, px)` pre-renders the map.
  - It also draws shots, areas, pickups and deploys by key, with team colours: blue = own team,
    red = enemies (Showdown: red for everyone else).
- **FX:** `FX.onEvent(ev, state)` turns sim events into particles, damage numbers and shake.

## Meta (19-meta.js) and Save (18-save.js), used by UI and Match

**Save:** `SAVE` with versioned `defaultSave()`, `loadGame()` and `saveGame()` (as in the other games).

**`Meta` API** (all synchronous):

| Area | Functions |
|---|---|
| Brawlers | `owned(bk)`, `bState(bk) -> {tro, best, lvl, pp, gadget, star}`, `upgradeCost(bk) -> {coins, pp}|null`, `upgrade(bk) -> bool`, `setGear(bk, gadget, star)` |
| Trophies | `totalTrophies()`, `ROAD` (Trophy Road nodes `{t, reward}`), `roadState() -> {claimed, next}`, `claimRoad() -> [rewards]` |
| Events | `events(now) -> [{ id, mode, map, endsAt }]` (4 slots, rotating) |
| Matchmaking | `matchCfg(event, bk, now) -> cfg` (Match cfg with bots chosen for the trophy band; `localSlot` included) |
| Results | `applyResult(cfg, result, localSlot) -> summary` (trophy change, tokens/XP, drops earned, quests, road unlocks, level-ups) |
| Pass | `PASS` tiers, `passState()`, `claimPass(tier) -> reward` |
| Drops | `pendingDrops()`, `openDrop() -> { rarity, steps: [rarity...], reward }` (Starr-Drop-style upgrade roll) |
| Shop | `shop(now) -> offers`, `buy(offerId) -> reward|null` |
| Quests | `quests() -> [{ id, text, n, goal, reward }]` |
| Bots | `botProfile(rng, tro, mode) -> profile` (names, skill from trophies, traits, favourite brawlers) |
| Friend matches | `friendlyCfg(opts) -> cfg` (no trophies) |

Currencies: coins, power points (per brawler), gems, credits. Progression follows the original. Below
1,000 total trophies, trophy gains are tripled and there is no trophy loss under 100 brawler trophies.

## Roster (03-brawlers.js keys; original names, archetypes like the original)

| Key | Name | Rarity | Role | Kit (main / super / gadget / star) |
|---|---|---|---|---|
| nova | Nova | start | fighter | 5-pellet shotgun 7.7 tiles / wide 9-pellet blast, knockback, breaks walls / dash 2.5 tiles / super slows |
| dax | Dax | rare | sharp | 6-bullet line burst 9 tiles / 12-bullet piercing burst 11 tiles, breaks walls / reload 2 ammo / +range |
| brick | Brick | rare | tank | 4 quick punches 3 tiles / leap to a point 9 tiles, area slam, breaks walls / 3 s damage shield / heal on landing |
| bramble | Bramble | rare | fighter | piercing shockwave 6.3 tiles / summons a bear pet / pet stuns on next hit / heals when the pet hits |
| pip | Pip | rare | thrower | 2 lobbed bombs 7 tiles / big lobbed barrel, breaks walls / next attack stuns / +super damage |
| melody | Melody | rare | support | wide piercing sound wave 7 tiles / heal wave for allies 9.7 tiles / heal pulse around her / hits heal nearby allies |
| sizzle | Sizzle | super | thrower | lobbed bottle leaves a burning puddle / 5 bottles in a fan / next puddle slows / heals herself per attack |
| gizmo | Gizmo | super | support | bouncing orb (jumps to 2 more enemies) 9 tiles / deploys a turret / turret fires faster / attacks heal the turret |
| volt | Volt | super | control | instant piercing beam 8 tiles / storm area that slows / stun pulse around him / beam chains once |
| hawk | Hawk | epic | sharp | long shot 10 tiles, more damage far away / leaps away dropping grenades / knocks back nearby enemies / ammo back on hit |
| frost | Frost | epic | control | 6 snowballs in a wide fan 8 tiles / wind wave that pushes back / slowing frost ring / snowballs slow |
| shade | Shade | mythic | assassin | dash strike 3 tiles / life-steal wave 8 tiles / instant reload of 1 ammo / heals on takedown |
| zip | Zip | mythic | fighter | 4 fast bullets 8.7 tiles / team speed boost / short invulnerable dash / reloads faster while moving |
| specter | Specter | legend | assassin | 4 blades in a fan, stronger up close / invisibility 6 s / speed burst / heals while invisible |
| thorn | Thorn | legend | sharp | cactus ball that bursts into 6 spikes / lobbed slowing spike field / self-heal / heals in his own field |

Stats follow the matching originals (health 2400-6000, speed 720 normal / 770 fast / 820 very fast,
reload 0.9-2.4 s), scaled by `LEVEL_MULT(lvl)`. Gadgets unlock at power 7 and star powers at power 9.
