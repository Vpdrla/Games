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
  vs enemies), `heal` (per second for allies), `slow`. Like a blast, it reaches every body that overlaps
  it (`r + BRAWLER_R` from the centre), not only those whose centre is inside.
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
| Gem Rush `gem` | A gem every 7 s from the mine, which waits while 15 gems lie on the ground. 10+ gems held and more than the other team: a 15 s countdown. Respawn 5 s. |
| Showdown `sd` | 10 solo players with spawn order shuffled by `sim.rng`. No respawn. Boxes drop a power cube; a fallen brawler drops 1 + a third of theirs (at most 5). Poison `{start 30, shrink 100, minHalf 0.5}`. `rankNow(sim)` lists the living by health, then the fallen with the last one down first. |
| Blast Ball `ball` | While holding the ball, attack kicks it (auto-aim kicks at the enemy goal) and super lobs a pass over walls. A ball entering a goal rect scores; own goals count, without credit. Each goal triggers a 2.5 s freeze, then `resetRound({})`. First to 2 wins. A 150 s clock; a tie goes to 60 s of sudden-death overtime with every breakable wall removed, then a draw. Respawn 5 s. |
| Knockout `ko` | No respawn. A wiped team loses the round: `EV.ROUND`, a 3 s freeze, then `resetRound({tiles: true})`. First to 2 rounds, at most 5. Poison after 45 s. At 120 s, the team with more brawlers standing (then more health) takes the round. |
| Bounty `bounty` | Brawlers carry 2 to 7 stars (+1 per takedown). A takedown scores the victim's stars for the killer's team and resets the victim to 2. The centre star at `O` is worth 1. First to 20 stars wins, else the most after 120 s on `playT`. Respawn 3 s. |

The poison gas (Showdown, Knockout) works as in the original: 20% of max health a second (`pct`),
5% more for every second after the first 5 in it, and all healing halved while in it.

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
  me: { slot, team, bk, x, y, hp, maxHp, ammo, sup, supReady, gadLeft, gadReady, gadget, carry, cubes, alive,
        respawnT, inBush, invis, stunned, face },
  allies:  [{ slot, bk, x, y, hp, maxHp, alive, carry, inBush, supReady, seen }], // alive/respawn from the HUD;
           //   position and health as last seen on screen (seen: false while off screen)
  enemies: [{ slot, bk, x, y, hp, maxHp, carry, cubes, inBush }], // visible to my team AND on my screen
  shots:   [{ x, y, ang, spd, r, team, lob: {tx, ty, tLeft}|null }],      // enemy shots on my screen; a lob's
           //   landing spot is an estimate (judged from the shadow, closer as it comes down)
  areas:   [{ id, x, y, r, team, harm: bool }],  // a bot steps out of a harmful one only after a reaction
  pickups: [{ pick, x, y, n }],
  deploys: [{ team, dk, x, y, hp }],
  ball:    { x, y, holderSlot, holderTeam, seen } | null,  // as last seen; its spot at kickoff and after goals
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

## Roster (03-brawlers.js keys; our names, each copying one original brawler)

Each brawler copies one of the original game's, with its numbers at power 1 as of the September
2026 balance update: health, movement speed (750 normal / 800 fast / 855 very fast), damage, range,
reload, super charge per hit (`chg`), gadgets with their cooldowns and star powers. Sources: the
Brawl Stars wiki, Liquipedia and Brawl Time Ninja (the last lists gadget and star numbers at power
11; those are halved here). Scaled by `LEVEL_MULT(lvl)` (+10% a level). Gadgets unlock at power 7
and star powers at power 9; most brawlers have two of each to pick from.

| Key | Copies | Rarity | Kit (main / super / gadgets / star powers) |
|---|---|---|---|
| nova | Shelly | start | 5 shells, 27° / 9 shells, knockback, breaks walls / dash + full reload; 3 narrow long shots / super slows; heal when low |
| dax | Colt | rare | 6-bullet burst 9 tiles / 12 piercing bullets 11 tiles, breaks walls / 2 slowing shots; piercing wall-breaker / +13% speed; +1 range |
| brick | El Primo | rare | 4 punches 3 tiles / leap 9 tiles, breaks walls / dash that throws enemies behind; 1 s projectile block / burn on landing; speed after landing |
| bramble | Nita | rare | wide piercing shockwave 6 tiles / bear pet (4300 hp, 400 every 0.6 s) / bear stun pulse; bear shield / heal each other on hits; faster swipes |
| melody | Poco | rare | 65° wave that also heals / heal wave 9.33 tiles / heal pulse; cleanse + 4 s stun/slow immunity / more attack healing; super also hurts |
| sizzle | Barley | rare | lobbed puddle / 5 puddles in a fan / slowing puddle; healing puddle / heal per attack; stronger puddle |
| pip | Dynamike | super | 2 dynamite sticks / barrel, knockback, breaks walls / spin + dynamite ring; next attack stuns / flung by his own blast; +800 super |
| gizmo | Jessie | super | orb bouncing to 2 more (-25% each) / turret (5 tiles, 0.3 s) / turret slow pulse; turret fires 2x / hits repair the turret; turret shots bounce |
| volt | Rico | super | 5 bolts that ricochet off walls / 12 piercing ricochet bolts / box bursting into bolts; splitting bolt / +damage after a bounce; speed when low |
| hawk | Piper | epic | 360 near to 1800 far / leap away dropping 4 grenades / knock-back shot at the nearest enemy; one longer shot / bonus from bushes; ammo on hit |
| frost | Gale | epic | 6 snowballs / wide push-back gust / twister / stun when pushed into a wall; snowballs slow |
| shade | Mortis | mythic | lunge 2.67 tiles (4.67 after 4.5 s without attacking) / life-steal bats / spin; untouchable bat dash / 20% heal on takedown; long lunge sooner |
| zip | Max | mythic | 4 fast bullets / team +35% speed 4 s / untouchable dash / hits extend the super; reload faster while moving |
| specter | Leon | legend | 4 blades, stronger up close / invisible 6 s / decoy clone / faster while invisible; heal while invisible |
| thorn | Spike | legend | ball bursting into 6 fixed-pattern spikes / slowing spike field / spike ring; cactus that heals on breaking / heal in his own field |

Kit mechanics added for these (see 03-brawlers.js): `ricochet` shots, `long` dash charge,
`burn`, `throwBack`, `wallStun`, `seek`, `ambush`, `bounceDmg`, `bounce.mul`, `split.fixed`, area
`push`, pulses `at: 'unit'` and `cleanse`, buffs `unitShield` / `block` / `nextAtk`, deploy units
`'plant'` with `life` and `burst`, and the passives `speedMul`, `lowSpeed`, `invisSpeed`,
`lowHeal`, `killHealF`, `dashCharge`, `supExtend`, `dynaJump`. Not copied: hypercharges, Spring
Ejector, Sneaky Sneakers, Lollipop Drop and Curveball.
