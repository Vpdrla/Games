// ---------- DOM user interface (menus, shop, dialogs) ----------
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
  }
  return e;
}
const $ = (id) => document.getElementById(id);

function btn(label, fn, cls, disabled) {
  return el('button', {
    class: 'btn ' + (cls || ''),
    disabled: disabled ? 'disabled' : null,
    onclick: (e) => {
      e.stopPropagation();
      Sound.init();
      Sound.play('select');
      fn && fn(e);
    },
  }, label);
}

const RANK_COLORS = { S: '#ffd740', A: '#69f0ae', B: '#40c4ff', C: '#e0e0e0' };

const UI = {
  modalOpen: false,
  shopTab: 'weapons',
  rotateDismissed: false,

  init() {
    this.titleEl = $('title');
    this.maphud = $('maphud');
    this.modalEl = $('modal');
    this.panel = $('modal-panel');
    this.toastEl = $('toast');
    this.rotateEl = $('rotate');
    this.nodePanel = $('nodepanel');
    $('mh-gear').addEventListener('click', () => { Sound.init(); Sound.play('select'); this.showGear(); });
    $('mh-set').addEventListener('click', () => { Sound.init(); Sound.play('select'); this.showSettings(); });
    $('mh-menu').addEventListener('click', () => { Sound.init(); Sound.play('select'); Game.setScene(new TitleScene()); });
    $('rotate-ok').addEventListener('click', () => { this.rotateDismissed = true; this.rotateEl.classList.remove('show'); });
    this.modalEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  },

  hideAll() {
    this.titleEl.classList.remove('show');
    this.maphud.classList.remove('show');
    this.closeModal();
  },

  setPortrait(p) {
    if (p && !this.rotateDismissed) this.rotateEl.classList.add('show');
    else this.rotateEl.classList.remove('show');
  },

  // ----- title -----
  showTitle() {
    this.hideAll();
    this.titleEl.classList.add('show');
    const menu = $('title-menu');
    menu.innerHTML = '';
    if (SAVE.started) {
      menu.appendChild(btn('CONTINUE', () => { Game.tryFullscreen(); Game.toMap(); }, 'big green'));
      menu.appendChild(btn('NEW GAME', () => {
        this.dialog('Start a new game?', 'Your current progress (Lv ' + SAVE.lvl + ', ' + Object.keys(SAVE.done).length + ' places visited) will be erased.', [
          { label: 'ERASE & START', cls: 'red', fn: () => { newGame(); Game.tryFullscreen(); Game.toMap(); } },
          { label: 'CANCEL', fn: () => this.closeModal() },
        ]);
      }));
    } else {
      menu.appendChild(btn('START ADVENTURE', () => { newGame(); Game.tryFullscreen(); Game.toMap(); }, 'big green'));
    }
    const row = el('div', { class: 'row' },
      btn('HOW TO PLAY', () => this.showHelp()),
      btn('SETTINGS', () => this.showSettings()));
    menu.appendChild(row);
    this.refreshTitleFoot();
  },

  refreshTitleFoot() {
    const foot = $('title-foot');
    if (!foot) return;
    foot.innerHTML = '';
    if (Game.installPrompt) {
      foot.appendChild(btn('INSTALL APP', () => {
        const p = Game.installPrompt;
        Game.installPrompt = null;
        p.prompt();
        p.userChoice.finally(() => this.refreshTitleFoot());
      }, 'small gold'));
    } else if (Game.isIOS() && !Game.isStandalone() && !Game.isEmbedded()) {
      foot.appendChild(el('div', { class: 'hint' }, 'Tip: tap Share, then "Add to Home Screen" to install & play offline.'));
    }
    const status = Game.offlineReady ? 'Offline ready' : location.protocol === 'file:' ? 'Running from file - works offline' : '';
    foot.appendChild(el('div', { class: 'ver' }, 'v1.0' + (status ? '  ·  ' + status : '')));
  },

  // ----- map HUD -----
  showMap() {
    this.hideAll();
    this.maphud.classList.add('show');
    this.updateMapHud();
  },
  updateMapHud() {
    const need = xpNeed(SAVE.lvl);
    $('mh-lvl').innerHTML = '';
    $('mh-lvl').appendChild(el('span', { class: 'lv' }, 'Lv ' + SAVE.lvl));
    $('mh-lvl').appendChild(el('span', { class: 'xpbar' }, el('i', { style: 'width:' + Math.round((SAVE.xp / need) * 100) + '%' })));
    $('mh-coins').textContent = fmtNum(SAVE.coins);
    $('mh-pot').textContent = SAVE.potions + '/' + playerStats(SAVE).potMax;
  },
  hideNodePanel() { this.nodePanel.classList.remove('show'); },
  showNodePanel(scene, n) {
    const p = this.nodePanel;
    p.innerHTML = '';
    if (!n) return;
    const here = SAVE.at === n.id;
    const R = REGIONS[n.region];
    const stars = n.type === 'town' || n.type === 'arena' ? '' : '★'.repeat(Math.min(6, n.region + 1));
    const info = el('div', { class: 'np-info' },
      el('div', { class: 'np-name' }, n.name),
      el('div', { class: 'np-sub' }, (n.type === 'arena' ? 'Endless waves · Best: ' + SAVE.arenaBest : NODE_TYPE_LABEL[n.type] + ' · ' + R.name) + (stars ? '  ' : ''), stars ? el('span', { class: 'stars' }, stars) : null));
    const extra = [];
    if (SAVE.ranks[n.id]) extra.push(el('span', { class: 'rank', style: 'color:' + RANK_COLORS[SAVE.ranks[n.id]] }, 'Best rank ' + SAVE.ranks[n.id]));
    if (n.type === 'boss' && !SAVE.done[n.id] && BOSS_REWARD[n.region]) extra.push(el('span', { class: 'reward' }, 'Reward: ' + SKILLS[BOSS_REWARD[n.region]].name));
    if (n.type === 'treasure') extra.push(el('span', { class: 'reward' }, 'Loads of loot!'));
    if (n.type === 'challenge') extra.push(el('span', { class: 'reward' }, '5 tough waves · big reward'));
    if (n.type === 'town') extra.push(el('span', { class: 'reward' }, 'Shop: weapons, upgrades, potions'));
    if (extra.length) info.appendChild(el('div', { class: 'np-extra' }, extra));
    p.appendChild(info);
    let action;
    if (!here) action = btn('TRAVEL', () => scene.select(n.id), 'gold');
    else if (n.type === 'town') action = btn('SHOP', () => scene.enterNode(n), 'gold');
    else if (n.type === 'boss') action = btn(SAVE.done[n.id] ? 'REMATCH' : 'FIGHT!', () => scene.enterNode(n), 'red');
    else action = btn(SAVE.done[n.id] ? 'REPLAY' : 'PLAY', () => scene.enterNode(n), 'green');
    p.appendChild(el('div', { class: 'np-actions' }, action));
    p.classList.add('show');
  },

  // ----- modal plumbing -----
  modal(content, cls) {
    this.panel.innerHTML = '';
    this.panel.className = 'panel ' + (cls || '');
    this.panel.appendChild(content);
    this.panel.scrollTop = 0;
    this.modalEl.classList.add('show');
    this.modalOpen = true;
  },
  closeModal() {
    this.modalEl.classList.remove('show');
    this.modalOpen = false;
    this.panel.innerHTML = '';
  },
  toast(msg) {
    const t = el('div', { class: 'toast' }, msg);
    this.toastEl.appendChild(t);
    setTimeout(() => t.classList.add('out'), 1800);
    setTimeout(() => t.remove(), 2300);
  },
  dialog(title, text, buttons) {
    const c = el('div', { class: 'dialog' },
      el('h2', null, title),
      el('p', null, text),
      el('div', { class: 'btns' }, buttons.map((b) => btn(b.label, () => { this.closeModal(); b.fn && b.fn(); }, b.cls))));
    this.modal(c, 'narrow');
  },
  story(title, text, cb) {
    this.dialog(title, text, [{ label: 'CONTINUE', cls: 'gold', fn: cb }]);
  },

  // ----- in-level overlays -----
  showPause(scene) {
    const P = scene.player;
    const c = el('div', { class: 'dialog' },
      el('h2', null, 'PAUSED'),
      el('p', { class: 'muted' }, scene.def.name + ' · HP ' + Math.ceil(P.hp) + '/' + P.maxHp + ' · Potions ' + SAVE.potions),
      el('div', { class: 'btns col' },
        btn('RESUME', () => { this.closeModal(); scene.resume(); }, 'green'),
        btn('RESTART STAGE', () => { this.closeModal(); Game.startLevel(scene.def); }),
        btn('SETTINGS', () => this.showSettings(() => this.showPause(scene))),
        btn('HOW TO PLAY', () => this.showHelp(() => this.showPause(scene))),
        btn('QUIT TO MAP', () => { this.closeModal(); saveGame(); Game.toMap(); }, 'red')));
    this.modal(c, 'narrow');
  },

  showResult(scene) {
    const r = scene.result;
    const st = r.stats;
    const title = r.final ? 'THE SHADOW FALLS!' : r.kind === 'boss' ? 'BOSS DEFEATED!' : r.kind === 'ambush' ? 'AMBUSH REPELLED!' : r.kind === 'challenge' ? 'CHALLENGE COMPLETE!' : 'STAGE CLEAR!';
    const cell = (k, v) => el('div', { class: 'cell' }, el('b', null, v), el('span', null, k));
    const c = el('div', { class: 'result' },
      el('h2', null, title),
      el('div', { class: 'rankrow' },
        el('div', { class: 'rankbig', style: 'color:' + RANK_COLORS[r.rank] }, r.rank),
        el('div', { class: 'grid' },
          cell('Time', fmtTime(st.time)), cell('KOs', st.kills), cell('Max combo', st.maxCombo),
          cell('Damage taken', st.dmgTaken), cell('Coins', '+' + st.coins), cell('XP', '+' + st.xp))),
      el('p', { class: 'reward' }, 'Clear bonus: +' + r.rewardCoins + ' coins, +' + r.rewardXp + ' XP'),
      r.newSkill ? el('div', { class: 'newskill' },
        el('b', null, 'NEW SKILL: ' + SKILLS[r.newSkill].name),
        el('span', null, SKILLS[r.newSkill].desc + ' (Equipped to skill slot ' + (SAVE.slots.indexOf(r.newSkill) + 1 || '-') + ' · change it in GEAR)')) : null,
      el('div', { class: 'btns' }, btn('CONTINUE', () => { this.closeModal(); Game.finishLevel(scene); }, 'gold big')));
    this.modal(c);
  },

  showDefeat(scene) {
    const c = el('div', { class: 'dialog' },
      el('h2', { class: 'bad' }, 'DEFEATED'),
      el('p', null, 'Every hero falls sometimes. Get back up!'),
      el('p', { class: 'muted' }, 'Tip: ' + choice(TIPS)),
      el('div', { class: 'btns col' },
        btn('RETRY FROM CHECKPOINT', () => { this.closeModal(); scene.retry(); }, 'green'),
        btn('RESTART STAGE', () => { this.closeModal(); Game.startLevel(scene.def); }),
        btn('RETURN TO MAP', () => { this.closeModal(); Game.toMap(); }, 'red')));
    this.modal(c, 'narrow');
  },

  showEndless(scene) {
    const r = scene.result;
    const c = el('div', { class: 'dialog' },
      el('h2', null, 'ARENA OVER'),
      el('p', null, 'Waves survived: ' + r.waves + (r.best ? '  -  NEW RECORD!' : '  (best ' + SAVE.arenaBest + ')')),
      el('p', { class: 'reward' }, '+' + r.reward + ' coins · ' + r.stats.kills + ' KOs · max combo ' + r.stats.maxCombo),
      el('div', { class: 'btns col' },
        btn('FIGHT AGAIN', () => { this.closeModal(); Game.startLevel(levelDefFor(MAP.nodes.arena)); }, 'green'),
        btn('RETURN TO MAP', () => { this.closeModal(); Game.toMap(); })));
    this.modal(c, 'narrow');
  },

  // ----- shop -----
  showShop(node) {
    const render = () => {
      const region = node.region;
      const tabs = el('div', { class: 'tabs' },
        ['weapons', 'upgrades', 'items'].map((t) => btn(t.toUpperCase(), () => { this.shopTab = t; render(); }, this.shopTab === t ? 'tab on' : 'tab')));
      const list = el('div', { class: 'list' });
      const buy = (price, apply) => {
        if (SAVE.coins < price) { Sound.play('error'); this.toast('Not enough coins!'); return; }
        SAVE.coins -= price;
        apply();
        Sound.play('buy');
        saveGame();
        render();
        this.updateMapHud();
      };
      if (this.shopTab === 'weapons') {
        for (const id of WEAPON_ORDER) {
          const w = WEAPONS[id];
          if (w.region > region) continue;
          const owned = SAVE.weapons.includes(id);
          const eq = SAVE.weapon === id;
          const action = owned
            ? btn(eq ? 'EQUIPPED' : 'EQUIP', () => { SAVE.weapon = id; saveGame(); render(); }, eq ? 'small on' : 'small', eq)
            : btn(w.price + ' c', () => buy(w.price, () => { SAVE.weapons.push(id); SAVE.weapon = id; }), 'small gold', SAVE.coins < w.price);
          list.appendChild(el('div', { class: 'item' },
            weaponIcon(id),
            el('div', { class: 'it-body' },
              el('b', null, w.name),
              el('span', null, w.desc),
              el('span', { class: 'stats' }, 'Power x' + w.dmg + ' · Speed ' + Math.round(w.speed * 100) + '% · Reach ' + w.reach + (w.heavy ? ' · Guard-break' : ''))),
            action));
        }
        const hidden = WEAPON_ORDER.filter((id) => WEAPONS[id].region > region);
        if (hidden.length) list.appendChild(el('p', { class: 'muted small' }, 'Stronger weapons are sold in towns further along your journey.'));
      } else if (this.shopTab === 'upgrades') {
        for (const u of UPGRADES) {
          const lvl = SAVE.up[u.id];
          const max = lvl >= u.max;
          const price = upgradePrice(u, lvl);
          list.appendChild(el('div', { class: 'item' },
            el('div', { class: 'it-icon up' }, u.name[0]),
            el('div', { class: 'it-body' }, el('b', null, u.name + '  ', el('small', null, 'Lv ' + lvl + '/' + u.max)), el('span', null, u.desc)),
            max ? btn('MAX', null, 'small', true) : btn(price + ' c', () => buy(price, () => { SAVE.up[u.id]++; }), 'small gold', SAVE.coins < price)));
        }
      } else {
        const max = playerStats(SAVE).potMax;
        const price = potionPrice(region);
        list.appendChild(el('div', { class: 'item' },
          el('div', { class: 'it-icon pot' }, '+'),
          el('div', { class: 'it-body' }, el('b', null, 'Healing Potion  ', el('small', null, SAVE.potions + '/' + max)), el('span', null, 'Restores 50% HP. Use it any time during a stage.')),
          SAVE.potions >= max ? btn('FULL', null, 'small', true) : btn(price + ' c', () => buy(price, () => { SAVE.potions++; }), 'small gold', SAVE.coins < price)));
        list.appendChild(el('p', { class: 'muted small' }, 'Tip: HP is fully restored at the start of every stage, and on each level up.'));
      }
      const c = el('div', { class: 'shop' },
        el('div', { class: 'shop-head' }, el('h2', null, node.name), el('div', { class: 'coins' }, fmtNum(SAVE.coins) + ' coins')),
        tabs, list,
        el('div', { class: 'btns' }, btn('GEAR', () => this.showGear(() => this.showShop(node))), btn('LEAVE', () => { this.closeModal(); Game.scene.refresh && Game.scene.refresh(); }, 'red')));
      this.modal(c, 'wide');
    };
    render();
  },

  // ----- gear -----
  showGear(back) {
    const render = () => {
      const st = playerStats(SAVE);
      const w = WEAPONS[SAVE.weapon];
      const statCell = (k, v) => el('div', { class: 'cell' }, el('b', null, v), el('span', null, k));
      const weapons = el('div', { class: 'chips' }, WEAPON_ORDER.filter((id) => SAVE.weapons.includes(id)).map((id) =>
        btn(WEAPONS[id].name, () => { SAVE.weapon = id; saveGame(); render(); }, SAVE.weapon === id ? 'chip on' : 'chip')));
      const skills = el('div', { class: 'list' });
      for (const id of SKILL_ORDER) {
        const sk = SKILLS[id];
        if (!SAVE.skills.includes(id)) {
          const bi = BOSS_REWARD.indexOf(id);
          skills.appendChild(el('div', { class: 'item locked' },
            el('div', { class: 'it-icon', style: 'background:#333' }, '?'),
            el('div', { class: 'it-body' }, el('b', null, '???'), el('span', null, 'Defeat the boss of ' + REGIONS[bi].name + ' to learn this skill.'))));
          continue;
        }
        const slotBtn = (i) => btn('S' + (i + 1), () => {
          const other = 1 - i;
          if (SAVE.slots[other] === id) SAVE.slots[other] = SAVE.slots[i];
          SAVE.slots[i] = id;
          saveGame();
          render();
        }, SAVE.slots[i] === id ? 'small on' : 'small');
        const ic = el('div', { class: 'it-icon' });
        const cv = el('canvas', { width: 64, height: 64 });
        const cx = cv.getContext('2d');
        cx.scale(2, 2);
        drawSkillGlyph(cx, id, 16, 16, 10, sk.color);
        ic.appendChild(cv);
        skills.appendChild(el('div', { class: 'item' }, ic,
          el('div', { class: 'it-body' }, el('b', null, sk.name + '  ', el('small', null, sk.cost + ' EN')), el('span', null, sk.desc)),
          el('div', { class: 'slotbtns' }, slotBtn(0), slotBtn(1))));
      }
      const c = el('div', { class: 'gear' },
        el('h2', null, 'GEAR & STATS'),
        el('div', { class: 'grid' },
          statCell('Level', SAVE.lvl), statCell('XP', SAVE.xp + '/' + xpNeed(SAVE.lvl)), statCell('Max HP', st.maxHp),
          statCell('Attack', st.atk), statCell('Defense', Math.round(st.def * 100) + '%'), statCell('Energy', st.maxEn)),
        el('h3', null, 'Weapon: ' + w.name),
        weapons,
        el('h3', null, 'Skills (assign to S1 / S2 buttons)'),
        skills,
        el('p', { class: 'muted small' }, 'KOs: ' + SAVE.stats.kills + ' · Best combo: ' + SAVE.stats.bestCombo + ' · Arena best: ' + SAVE.arenaBest + ' waves'),
        el('div', { class: 'btns' }, btn('CLOSE', () => { if (back) back(); else { this.closeModal(); if (Game.scene.refresh) Game.scene.refresh(); } }, 'gold')));
      this.modal(c, 'wide');
    };
    render();
  },

  // ----- settings -----
  showSettings(back) {
    const render = () => {
      const s = SAVE.settings;
      const seg = (label, opts, cur, set) => el('div', { class: 'setrow' }, el('span', null, label),
        el('div', { class: 'seg' }, opts.map(([v, name]) => btn(name, () => { set(v); applySettings(); saveGame(); render(); }, cur === v ? 'small on' : 'small'))));
      const c = el('div', { class: 'dialog' },
        el('h2', null, 'SETTINGS'),
        seg('Sound effects', [[true, 'ON'], [false, 'OFF']], s.sfx, (v) => (s.sfx = v)),
        seg('Music', [[true, 'ON'], [false, 'OFF']], s.music, (v) => (s.music = v)),
        seg('Screen shake', [[true, 'ON'], [false, 'OFF']], s.shake, (v) => (s.shake = v)),
        seg('Button size', [[0.85, 'S'], [1, 'M'], [1.15, 'L']], s.ctrl, (v) => (s.ctrl = v)),
        seg('Button opacity', [[0.3, 'LOW'], [0.5, 'MID'], [0.75, 'HIGH']], s.alpha, (v) => (s.alpha = v)),
        seg('Touch controls', [['auto', 'AUTO'], ['on', 'ON'], ['off', 'OFF']], s.touch || 'auto', (v) => (s.touch = v)),
        el('div', { class: 'btns' },
          document.fullscreenEnabled || document.webkitFullscreenEnabled ? btn('FULLSCREEN', () => Game.toggleFullscreen()) : null,
          btn('RESET PROGRESS', () => this.dialog('Erase all progress?', 'This cannot be undone.', [
            { label: 'ERASE', cls: 'red', fn: () => { newGame(); SAVE.started = false; saveGame(); Game.setScene(new TitleScene()); } },
            { label: 'CANCEL', fn: () => this.showSettings(back) }]), 'red')),
        el('div', { class: 'btns' }, btn('BACK', () => { if (back) back(); else this.closeModal(); }, 'gold')));
      this.modal(c, 'narrow');
    };
    render();
  },

  // ----- help -----
  showHelp(back) {
    const row = (k, v) => el('tr', null, el('td', null, k), el('td', null, v));
    const c = el('div', { class: 'help' },
      el('h2', null, 'HOW TO PLAY'),
      el('p', null, 'Travel across six lands, fight through stages, defeat each boss to win a Crystal Shard and a new skill. Visit towns to buy weapons, upgrades and potions.'),
      el('h3', null, 'Touch controls'),
      el('table', null,
        row('Left side', 'Drag anywhere to move (joystick). Push up/down for special moves.'),
        row('ATTACK (big)', 'Tap repeatedly for a 3-hit combo. Up + Attack = uppercut launcher.'),
        row('JUMP', 'Tap again in mid-air to double jump. Down + Jump drops through planks.'),
        row('DASH (>>)', 'Quick dodge - invincible while dashing. Dash + Attack = dash strike.'),
        row('S1 / S2', 'Special skills. They cost energy (blue bar).'),
        row('Flask (top-left)', 'Drink a potion: heals 50% HP.')),
      el('h3', null, 'Keyboard'),
      el('table', null,
        row('Arrows / WASD', 'Move · Up/Down modifiers'),
        row('Space / K', 'Jump'),
        row('J / X', 'Attack'),
        row('L / Shift', 'Dash'),
        row('I / O', 'Skill 1 / Skill 2'),
        row('Q', 'Potion  ·  Esc = Pause')),
      el('h3', null, 'Combat tips'),
      el('ul', null, TIPS.map((t) => el('li', null, t))),
      el('div', { class: 'btns' }, btn('GOT IT', () => { if (back) back(); else this.closeModal(); }, 'gold')));
    this.modal(c, 'wide');
  },

  ending() {
    this.dialog('THE LIGHT RETURNS', 'With the Shadow Lord defeated, the six Crystal Shards fuse back into the Crystal of Light. Dawn breaks over every land you crossed - the meadows, the woods, the dunes, the peaks, the volcano and the citadel.', [
      { label: 'CONTINUE', cls: 'gold', fn: () => this.dialog('THANK YOU FOR PLAYING!', 'You are a true Stickman legend. Keep playing: replay stages for S ranks, hunt treasure, and test yourself in the Grand Colosseum (next to Oakvale Village). How many waves can you survive?', [{ label: 'BACK TO THE MAP', cls: 'green', fn: () => Game.scene.refresh && Game.scene.refresh() }]) },
    ]);
  },
};

const TIPS = [
  'Guards (blue) block attacks from the front - hit them from behind, or use a combo finisher, dash strike or slam to break their guard.',
  'Launch enemies with UP + ATTACK, then chase them into the air for juggle combos.',
  'Dashing makes you invincible for a moment. Dash straight through big attacks!',
  'Attack arrows, orbs and shurikens to destroy them. Hit a bomb to knock it back!',
  'A red flash and "!" mean an enemy is about to strike. Dodge or interrupt it.',
  'Bosses get STAGGERED after taking enough damage - that is your moment to go all-out.',
  'Combos of 10+ hits pay out bonus coins.',
  'Skill energy refills over time and every time you land a hit.',
  'Big enemies have super armor: only heavy attacks make them flinch.',
  'The War Hammer breaks every guard. The Long Spear keeps enemies at a distance.',
];

function weaponIcon(id) {
  const cv = el('canvas', { width: 64, height: 64 });
  const c = cv.getContext('2d');
  c.scale(2, 2);
  if (id === 'fists') {
    c.fillStyle = '#ffd54f';
    c.beginPath(); c.arc(16, 16, 8, 0, TAU); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 3; i++) c.fillRect(11 + i * 3.5, 10, 1.5, 6);
  } else {
    const span = { sword: [-5, 33], katana: [-7, 40], cosmic: [-6, 44], spear: [-24, 52], hammer: [-6, 38] }[id] || [-5, 33];
    const s = 26 / (span[1] - span[0]);
    const ang = 2.36;
    const dx = Math.sin(ang), dy = Math.cos(ang);
    const mid = (span[0] + span[1]) / 2;
    const hx = 16 - dx * mid * s, hy = 16 - dy * mid * s;
    drawWeapon(c, { fa: [0, 0, hx, hy, ang], f: 1, s: s * 1.25, wAng: ang }, id, 0);
  }
  return el('div', { class: 'it-icon' }, cv);
}

function applySettings() {
  const s = SAVE.settings;
  Sound.setSfx(!!s.sfx);
  Sound.setMusic(!!s.music);
  Input.size = s.ctrl || 1;
  Input.alpha = s.alpha || 0.5;
  if (s.touch === 'on') Input.touchMode = true;
  else if (s.touch === 'off') Input.touchMode = false;
  else Input.touchMode = Input.detectedTouch;
  Input.layout(Game.W, Game.H);
}
