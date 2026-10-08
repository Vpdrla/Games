# Crown Duel

A real-time card battle game for phones, in the style of arena tower-defense duels.
Build a deck of 8 cards, drop troops, buildings and spells onto the arena, and knock
down your opponent's towers before they knock down yours. Play the AI offline, or duel
a friend's phone online. It is a single HTML file: no downloads, no ads, no accounts.

![icon](icons/icon-192.png)

## Play it on your phone

### Option A: install it like an app (recommended, works offline)

1. Turn on GitHub Pages for this repository: **Settings → Pages → Build and deployment →
   Source: "Deploy from a branch"**, pick the branch that holds this game and the
   `/ (root)` folder, then **Save**.
2. After a minute the game is live at `https://<your-user>.github.io/<repo>/crown-duel/`.
3. Open that link on your phone:
   - **Android (Chrome):** menu ⋮ → **Install app** / **Add to Home screen**
     (or **More → Install app** inside the game).
   - **iPhone (Safari):** **Share → Add to Home Screen**.
4. Launch it from the home-screen icon. It opens full screen and keeps working with no
   connection. A service worker caches everything on first launch.

### Option B: just download the file

`index.html` is completely self-contained (all code, graphics and sound are generated in
the file). Download it and open it in a mobile browser. Progress is saved in the browser.

## Offline and online

| Mode | Needs internet? | What happens |
| --- | --- | --- |
| **Battle** | No | Fight an AI opponent for trophies, gold and chests. The AI gets smarter and stronger as you climb through the 8 arenas. |
| **Training** | No | A relaxed practice match against a passive opponent. No trophies at stake. |
| **Online: Create Room** | Yes | You get a 4-letter room code (and a share link). Your friend types the code, or opens the link, and the duel starts. |
| **Online: Join** | Yes | Enter a friend's room code. |
| **Online: Quick Match** | Yes | Get paired with anyone else searching at the same moment. |

Online battles use tournament rules: every card and tower is level 6 for both players,
so only skill and deck choice matter. You can rematch the same opponent after a battle.

**How online works:** the two phones connect directly to each other (WebRTC). A free
public [PeerJS](https://peerjs.com/) signaling server only introduces them using the room
code; the battle itself travels directly between the phones. One phone (the room creator)
runs the battle simulation and streams it to the other. If you want to use your own
signaling server, run [peerjs-server](https://github.com/peers/peerjs-server) and open the
game with `?signal=your.server:9000` added to the URL (both players need the same setting).

If the connection fails, both phones may be behind strict mobile-carrier networks.
Connecting one or both phones to Wi-Fi usually fixes it.

## How to play

- **Drag a card** from your hand onto your half of the arena, or tap a card and then tap
  the arena. The drop point is shown a little above your finger so you can see it.
- Cards cost **elixir** (the pink bar), which refills over time. In the **last minute**
  elixir comes twice as fast.
- Destroy a side tower for **1 crown**. The middle **king tower** wakes up when it takes
  damage or loses a side tower; destroying it wins instantly with **3 crowns**.
- After a side tower falls, you may deploy troops deeper into that lane.
- Tied after 3 minutes? **Overtime**: the next crown wins. Still tied after overtime:
  the player whose weakest tower has fewer hit points loses.
- A win gives **trophies**, gold and a **chest** that unlocks automatically, two at a time,
  in the order you won them (even while the game is closed). When all 4 slots are full a
  win pays **Instant Loot** on the spot instead, so no win is wasted.
- Losses still pay gold and XP, and a loss never drops you out of an arena you reached.
  After two losses in a row the next opponent is a slightly easier **Comeback match**.
- Collect copies of a card and spend gold to **upgrade** it (+10% hit points and damage per
  level). Upgrades and battles give XP that raises your **king level**, which makes your
  towers stronger.
- The **Crown Road** gives a reward every 1-3 wins (cards, chests, Deck Packs, gold, gems)
  and hands over each arena's cards at its gate, ready to play at your level. Above 2,600
  trophies the **Legend Road** pays a reward every 100 trophies.
- A **Free Chest** arrives every 3 hours (up to 3 wait for you), every 8 crowns earn a
  **Crown Chest**, and the shop has a free **Deck Pack** every day plus **Card Requests**
  for copies of your deck cards.
- Counter smartly: splash damage beats swarms, swarms and big hitters beat tanks,
  and buildings pull building-hunters away from your towers.

## What's in the game

- **35 cards**: 23 troops, 4 buildings and 8 spells across four rarities, including
  Knight, Archers, Goblins, Giant, Musketeer, Shieldmaiden, Boar Rider, Berserker,
  Drakeling, Lancer (charge attack), Bomb Balloon, Necromancer, Juggernaut,
  Stone Golem (splits on death), Storm Mage (chain stun), Tunneler (deploys anywhere),
  Frost Mage (slows), Cannon, Inferno Tower (ramping beam), Tombstone, Elixir Pump,
  Arrows, Fireball, Zap, Freeze, Poison and the rolling Log.
- **8 arenas** with their own look (meadow, bone pit, barbarian bowl, frozen peak,
  jungle temple, lava forge, storm summit, royal crown); each unlocks new cards.
- **Real battle mechanics**: ground/air targeting, building-only attackers, splash,
  knockback, stun, freeze and slow, death damage and death spawns, bridge pathing,
  river jumping, crowd collisions, king tower activation, double elixir and overtime.
- **AI opponent** that defends lanes, counters with the right card type, uses spells
  for value, builds pushes and supports its tanks.
- **Progression**: trophies and the Crown Road, 3 deck slots, card upgrades, king levels,
  8 chest types with a two-lane automatic unlock queue, a daily shop with a free Deck Pack
  and Card Requests, emotes and battle stats.
- Synthesized sound effects and music, vibration on big hits, and a portrait layout that
  fits small and large phones (it also works on tablets and desktops with a mouse).

## Development

The source lives in `src/` and is bundled into the single-file `index.html`:

```bash
node crown-duel/build.mjs   # bundle src/ -> index.html and stamp sw.js
```

- `src/index.template.html`: page shell and CSS
- `src/js/*.js`: game modules, concatenated in file-name order
  (`03-sim.js` is the battle simulation, `04-ai.js` the opponent, `08-net.js` the
  online layer, `07-view.js` the battle renderer)
- `src/sw.template.js`: offline service worker template

Tests and tools (Playwright with Chromium; the online test also needs the `peer` package):

```bash
node crown-duel/tools/sim-test.cjs 200                                      # AI-vs-AI battles in Node: crashes, stalemates, card win rates
node crown-duel/tools/career-sim.cjs 300 0.55 1,2,3,4,5,6,7,8 spec 0 attentive --assert   # simulated careers: progression pacing check
node crown-duel/tools/migrate-test.cjs                                                    # old saves upgrade without losing anything
NODE_PATH=$(npm root -g) node crown-duel/tools/smoke-test.cjs [shots-dir]   # menus, a full battle, Crown Road, chests, upgrades, drag & drop
npm install --prefix /tmp/peer peer
NODE_PATH=$(npm root -g):/tmp/peer/node_modules node crown-duel/tools/net-test.cjs   # two phones: room code, battle, rematch, quick match
NODE_PATH=$(npm root -g) node crown-duel/tools/make-icons.cjs               # regenerates the app icons
```

---

## 한국어 안내

**Crown Duel(크라운 듀얼)** 은 휴대폰으로 즐기는 실시간 카드 대전 게임입니다.
카드 8장으로 덱을 만들고, 병력·건물·주문을 아레나에 내려 상대의 타워를 먼저 부수면 이깁니다.

- **오프라인:** 인터넷 없이 AI와 대전(트로피·골드·상자 획득), 연습 모드도 있습니다.
- **성장:** 이기면 트로피·골드와 상자를 받고, 상자는 두 개씩 자동으로 열립니다(슬롯이 가득 차면 즉시 보상).
  **크라운 로드**는 1~3승마다 카드·상자·덱 팩·골드·젬을 주고, 아레나 관문에서 그 아레나의 카드를 바로 쓸 수 있는 레벨로 줍니다.
  져도 골드와 경험치를 받으며, 연패하면 조금 쉬운 **컴백 매치**가 나옵니다.
- **온라인:** 인터넷이 연결된 두 휴대폰이 직접 연결됩니다.
  **방 만들기**를 누르면 4자리 코드가 나오고, 친구가 **참가**에 코드를 입력(또는 공유 링크를 열기)하면 바로 대전이 시작됩니다.
  **빠른 대전**은 같은 시간에 찾는 사람과 자동으로 매칭합니다. 온라인 대전은 모든 카드가 6레벨로 공정하게 맞춰집니다.
- **설치해서 하기 (추천):** 저장소 **Settings → Pages** 에서 이 게임이 있는 브랜치와 `/ (root)` 를 선택해 저장하면
  `https://<사용자명>.github.io/<저장소>/crown-duel/` 주소가 생깁니다. 휴대폰으로 열고
  안드로이드는 **앱 설치**, 아이폰은 **공유 → 홈 화면에 추가** 를 누르면 인터넷 없이도 실행됩니다.
- **조작:** 아래 손패의 카드를 끌어서 내 진영(아래쪽)에 놓거나, 카드를 누른 뒤 아레나를 누르세요.
  엘릭서(분홍색 막대)가 차오르면 카드를 낼 수 있고, 마지막 1분은 엘릭서가 두 배로 찹니다.
- 연결이 안 되면 한쪽 또는 양쪽 휴대폰을 와이파이에 연결해 보세요.
