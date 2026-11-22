# Runebound: Card Duels

A fantasy card-battle game for phones and desktop. Duel rival mages, climb the ranked
ladder from Bronze to Legend, defeat six bosses, open card packs and build your own decks.
It is a single HTML file with no downloads, no ads and no internet needed once it's on
your device. Play in **Korean or English** (toggle on the first screen).

판타지 카드 대전 게임입니다. 라이벌 마법사와 대결하고, 브론즈에서 레전드까지 랭크를
올리고, 보스 6명을 쓰러뜨리고, 카드팩을 열어 나만의 덱을 만드세요. 첫 화면에서
**한국어 / English**를 고를 수 있어요.

![icon](icons/icon-192.png)

## Play it on your phone / 폰에서 하기

### Option A — install it like an app (recommended, works offline)

1. Turn on GitHub Pages for this repository: **Settings → Pages → Build and deployment →
   Source: "Deploy from a branch"**, pick the branch that holds this game and the
   `/ (root)` folder, then **Save**.
2. After a minute the game is live at `https://<your-user>.github.io/<repo>/runebound/`.
3. Open that link on your phone:
   - **Android (Chrome):** menu ⋮ → **Install app** / **Add to Home screen**.
   - **iPhone (Safari):** **Share → Add to Home Screen**.
4. Launch it from the home-screen icon. It opens full screen and keeps working with no
   connection. A service worker caches everything on first launch.

### Option B — just download the file

`index.html` is self-contained (all code, card art and sound are generated in the file).
Download it and open it in any browser.

## Saving / 저장

- **Guest (게스트):** enter a nickname and play. Progress is saved in your browser.
- **Sign in with Claude (Claude 계정으로 로그인):** only works when the game is opened as an
  artifact on claude.ai, where progress syncs to your Claude account across devices.
  Everywhere else (GitHub Pages, a downloaded file) the game uses guest mode automatically.

## Modes / 모드

| Mode | What happens |
| --- | --- |
| **Ranked Duel / 랭크 대전** | Fight AI rivals for stars. Bronze → Silver → Gold → Platinum → Diamond → Legend. Win 3 in a row for bonus stars; every new rank gives a pack. Rivals get smarter and get better decks as you climb. |
| **Boss Trials / 보스 도전** | Six bosses with their own hero powers, beaten in order. The last, Vyrmoth the Ashen, drops his legendary card. |
| **Hotseat PvP / 2인 대전** | Two players on one device, with a pass screen so nobody sees the other hand. |
| **Packs / 카드팩** | 5 cards, at least one Rare. Legendary guaranteed within 10 packs; no useless duplicates until you own every card of a rarity. |
| **Decks / 덱 관리** | Edit a 20-card deck for each class, or auto-build one. |

## How to play / 게임 방법

- Each turn you gain one mana crystal (max 10). Tap a glowing card to play it. On phones,
  tap a card to read it, then press **Play / 내기**.
- Minions can attack the turn after they're played: tap a glowing minion, then an enemy.
- The round button beside your hero is your Hero Power, once per turn.
- Keywords: **Taunt** must be attacked first · **Ward** blocks one hit · **Charge** attacks
  immediately · **Rush** attacks minions immediately · **Venom** kills what it damages ·
  **Lifesteal** heals your hero · **Windfury** attacks twice.
- Reduce the enemy hero to 0 Health to win.

## What's in the game

- 68 collectible cards across 4 classes — Arcanist, Lightbringer, Necromancer,
  Beastwarden — plus neutral cards. Two classes unlock as you level up.
- Progression: XP and levels (a pack every level), gold, three daily quests, a first-win
  bonus each day.
- Card animations, particle effects, damage numbers, screen shake, synthesized sound and
  rival trash talk (you can send emotes back).

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole game |
| `manifest.webmanifest`, `sw.js`, `icons/` | Home-screen install and offline play |
| `tools/make-icons.cjs` | Re-renders the icons: `NODE_PATH=$(npm root -g) node runebound/tools/make-icons.cjs` |
