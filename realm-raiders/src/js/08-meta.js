// ---------- Progression: save, heroes, gear, camp upgrades, achievements, daily quests ----------

const SAVE_KEY = 'realm-raiders-save-v1';
const MAX_LVL = 30;
const INV_MAX = 150;

function freshSave() {
  const s = {
    v: 1, name: 'Raider', gold: 200, sel: 'brand', items: [], uid: 1, talents: {}, ach: {}, realms: { 1: 0 },
    heroes: {}, daily: { day: '', quests: [], chest: '', bonus: false },
    stats: { kills: 0, boss: {}, heroicClears: 0, mythicClears: 0, abyssBest: 0, bestRar: 0, maxUp: 0, flawless: 0, bossNoDown: 0, bestCombo: 0,
      bestMulti: 0, ults: 0, revives: 0, maxBless: 0, legBless: 0, goldEarned: 0, fastClear: 0, coopRuns: 0, onlineGames: 0, arenaWins: 0,
      bestStreak: 0, quests: 0, runs: 0, rooms: 0, wins: 0 },
    settings: { sfx: 0.8, music: 0.45, shake: 1, nums: 1, botSkill: 1, bots: 2, autoSalvage: false, lang: 'auto', btnAlpha: 0.35 },
    created: Date.now(), savedAt: 0, tutorial: false,
  };
  for (const h of HEROES) s.heroes[h.id] = { unlocked: h.unlock.gold === 0, lvl: 1, xp: 0, gear: { weapon: null, armor: null, charm: null }, runs: 0, kills: 0, best: 0 };
  return s;
}

function normalizeSave(s) {
  const f = freshSave();
  if (!s || typeof s !== 'object') return f;
  for (const k in f) if (s[k] == null) s[k] = f[k];
  for (const k in f.stats) if (s.stats[k] == null) s.stats[k] = f.stats[k];
  for (const k in f.settings) if (s.settings[k] == null) s.settings[k] = f.settings[k];
  for (const h of HEROES) {
    if (!s.heroes[h.id]) s.heroes[h.id] = f.heroes[h.id];
    const hh = s.heroes[h.id];
    for (const k in f.heroes[h.id]) if (hh[k] == null) hh[k] = f.heroes[h.id][k];
  }
  if (!HERO_BY_ID[s.sel] || !s.heroes[s.sel].unlocked) s.sel = 'brand';
  if (!Array.isArray(s.items)) s.items = [];
  return s;
}

const Meta = {
  s: null,
  toasts: [],
  cloud: null,
  pending: [],

  load() {
    let s = null;
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) s = JSON.parse(raw); } catch (e) { s = null; }
    this.s = normalizeSave(s);
    if (!s) { this.s.items.push(this.makeItem(1, 0, 0, 'weapon', 1)); this.equip('brand', this.s.items[0].uid); }
    this.daily();
    return this.s;
  },

  save() {
    const s = this.s;
    s.savedAt = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ }
    if (this.cloud) {
      clearTimeout(this.cloudT);
      this.cloudT = setTimeout(() => this.pushCloud(), 4000);
    }
  },

  // Cloud save inside the claude.ai artifact viewer (when the page is served there).
  async connectCloud() {
    try {
      let n = 0;
      while (!(window.claude && typeof window.claude.use === 'function') && n++ < 20) await new Promise((r) => setTimeout(r, 100));
      if (!(window.claude && typeof window.claude.use === 'function')) return false;
      const to = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
      const [db, user] = await to(Promise.all([window.claude.use('db'), window.claude.use('user')]));
      if (!db || !user) return false;
      const id = await to(user.id());
      if (!id) return false;
      const ref = db.doc('data/users/' + id + '/save');
      const snap = await to(ref.get());
      const d = snap && snap.exists ? snap.data() : null;
      this.cloud = { ref };
      if (d && d.json) {
        const remote = normalizeSave(JSON.parse(d.json));
        if ((remote.savedAt || 0) > (this.s.savedAt || 0)) { this.s = remote; this.daily(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(remote)); } catch (e) { /* ignore */ } return 'loaded'; }
      }
      this.pushCloud();
      return true;
    } catch (e) { return false; }
  },

  async pushCloud() {
    if (!this.cloud) return;
    try { await this.cloud.ref.set({ json: JSON.stringify(this.s), at: Date.now() }); } catch (e) { /* offline */ }
  },

  exportCode() {
    const j = JSON.stringify(this.s);
    return 'RR1' + btoa(unescape(encodeURIComponent(j)));
  },

  importCode(code) {
    code = String(code || '').trim();
    if (!code.startsWith('RR1')) return false;
    try {
      const s = JSON.parse(decodeURIComponent(escape(atob(code.slice(3)))));
      if (!s || !s.heroes) return false;
      this.s = normalizeSave(s);
      this.daily();
      this.save();
      return true;
    } catch (e) { return false; }
  },

  reset() { this.s = freshSave(); this.s.items.push(this.makeItem(1, 0, 0, 'weapon', 1)); this.equip('brand', this.s.items[0].uid); this.daily(); this.save(); },

  // ---------- heroes ----------
  hero(id) { return this.s.heroes[id]; },
  xpNeed(lvl) { return Math.round(70 * Math.pow(lvl, 1.42)); },

  addXp(id, xp) {
    const h = this.hero(id);
    const before = h.lvl;
    h.xp += Math.round(xp);
    while (h.lvl < MAX_LVL && h.xp >= this.xpNeed(h.lvl)) { h.xp -= this.xpNeed(h.lvl); h.lvl++; }
    if (h.lvl >= MAX_LVL) h.xp = 0;
    return { before, after: h.lvl };
  },

  canUnlock(id) {
    const d = HERO_BY_ID[id];
    return !this.hero(id).unlocked && d.unlock.gold != null && this.s.gold >= d.unlock.gold;
  },

  unlock(id) {
    if (!this.canUnlock(id)) return false;
    this.s.gold -= HERO_BY_ID[id].unlock.gold;
    this.hero(id).unlocked = true;
    this.checkAch();
    this.save();
    return true;
  },

  // A hero's power: what level and gear add, as the sim expects it.
  loadout(id) {
    const h = this.hero(id);
    const mods = {};
    const uniq = [];
    for (const slot of SLOTS) {
      const it = this.item(h.gear[slot]);
      if (!it) continue;
      for (const [k, v] of this.itemStats(it)) mods[k] = (mods[k] || 0) + v / 100;
      if (it.uniq) uniq.push(it.uniq);
    }
    const t = this.s.talents;
    mods.dmg = (mods.dmg || 0) + (t.might || 0) * TALENT_BY_ID.might.per;
    mods.hp = (mods.hp || 0) + (t.vital || 0) * TALENT_BY_ID.vital.per;
    return { mods, uniq };
  },

  power(id) {
    const h = this.hero(id), L = this.loadout(id), m = L.mods;
    const lv = h.lvl - 1;
    const off = (1 + 0.06 * lv) * (1 + (m.dmg || 0)) * (1 + (m.as || 0) * 0.8) * (1 + (m.crit || 0) * 0.6);
    const def = (1 + 0.07 * lv) * (1 + (m.hp || 0)) / (1 - Math.min(0.6, m.armor || 0));
    return Math.round(Math.sqrt(off * def) * 100 + (L.uniq.length * 15));
  },

  playerInfo(id) {
    const t = this.s.talents;
    return { hero: id, lvl: this.hero(id).lvl, load: this.loadout(id), luck: t.luck || 0, rerolls: t.reroll || 0, ankh: !!t.revive, name: this.s.name };
  },

  botInfo(id, refId) {
    const ref = this.hero(refId || this.s.sel);
    const own = this.hero(id);
    const lvl = own.unlocked ? Math.max(own.lvl, ref.lvl - 2) : Math.max(1, ref.lvl - 1);
    const L = this.loadout(refId || this.s.sel);
    const mods = {};
    for (const k in L.mods) mods[k] = L.mods[k] * 0.7;
    return { hero: id, lvl: clamp(lvl, 1, MAX_LVL), load: { mods, uniq: [] }, luck: 0, rerolls: 0, ankh: false };
  },

  // ---------- gear ----------
  item(uid) { return uid ? this.s.items.find((i) => i.uid === uid) : null; },

  rollRarity(rng, boost, luck, ilvl) {
    const lk = 1 + luck * 0.25 + Math.min(1.5, ilvl / 30);
    const w = [60, 28 * lk, 9 * lk * (1 + boost * 0.8), 2.4 * lk * (1 + boost * 1.5), 0.35 * lk * (1 + boost * 2) * (ilvl >= 12 ? 1 : 0.2)];
    let r = rng.weighted(w.map((x, i) => [i, x]));
    if (boost >= 1 && r < 1) r = 1;
    if (boost >= 2 && r < 2) r = 2;
    return r;
  },

  makeItem(ilvl, boost, luck, slot, forceRar) {
    const rng = new RNG((Math.random() * 1e9) | 0);
    const rar = forceRar != null ? forceRar - 1 + 1 : this.rollRarity(rng, boost || 0, luck || 0, ilvl);
    slot = slot || rng.pick(SLOTS);
    const it = { uid: this.s ? this.s.uid++ : 1, slot, rar: clamp(rar, 0, 4), ilvl: Math.max(1, Math.round(ilvl)), up: 0, base: rng.pick(GEAR_BASES[slot]), stats: [], uniq: null, isNew: true, lock: false };
    const val = (k, mainK) => {
      const g = GEAR_STATS[k];
      let v = (g[1] + g[2] * it.ilvl) * RAR_MULT[it.rar] * (mainK ? 1.6 : rng.range(0.7, 1.15));
      return Math.round(v * 10) / 10;
    };
    const main = MAIN_STAT[slot] || rng.pick(['crit', 'as', 'cdr', 'ult', 'critDmg']);
    it.stats.push([main, val(main, true)]);
    const keys = Object.keys(GEAR_STATS).filter((k) => k !== main);
    rng.shuffle(keys);
    const nAff = Math.min(4, it.rar + (it.rar >= 3 ? 0 : 0));
    for (let i = 0; i < nAff; i++) it.stats.push([keys[i], val(keys[i])]);
    if (it.rar >= 3) {
      const u = rng.pick(UNIQUES.filter((x) => x.slot === slot));
      it.uniq = u.id;
      it.name = u.name;
    } else {
      const top = it.stats.length > 1 ? it.stats[1][0] : main;
      it.name = PREFIX[top] + ' ' + it.base + (it.rar >= 2 ? ' ' + rng.pick(SUFFIX) : '');
    }
    return it;
  },

  itemStats(it) {
    const m = 1 + 0.1 * (it.up || 0);
    return it.stats.map(([k, v]) => [k, Math.round(v * m * 10) / 10]);
  },

  itemScore(it) {
    let s = 0;
    const w = { dmg: 3, hp: 2, as: 3, crit: 3, critDmg: 1, cdr: 2, ms: 2, ls: 4, ult: 1.5, armor: 4, gold: 0.5, regen: 12 };
    for (const [k, v] of this.itemStats(it)) s += v * (w[k] || 1);
    if (it.uniq) s += 60;
    return Math.round(s);
  },

  upCost(it) { return Math.round((40 + it.ilvl * 9) * RAR_MULT[it.rar] * Math.pow(1.38, it.up)); },
  salvageValue(it) { return Math.round((10 + it.ilvl * 3) * [1, 2, 4, 10, 25][it.rar] * (1 + 0.25 * it.up)); },

  upgrade(uid) {
    const it = this.item(uid);
    if (!it || it.up >= 10) return false;
    const c = this.upCost(it);
    if (this.s.gold < c) return false;
    this.s.gold -= c;
    it.up++;
    this.s.stats.maxUp = Math.max(this.s.stats.maxUp, it.up);
    this.checkAch();
    this.save();
    return true;
  },

  equippedBy(uid) {
    for (const h of HEROES) { const g = this.hero(h.id).gear; for (const s of SLOTS) if (g[s] === uid) return h.id; }
    return null;
  },

  equip(heroId, uid) {
    const it = this.item(uid);
    if (!it) return;
    const other = this.equippedBy(uid);
    if (other) this.hero(other).gear[it.slot] = null;
    this.hero(heroId).gear[it.slot] = uid;
    it.isNew = false;
    this.save();
  },

  unequip(heroId, slot) { this.hero(heroId).gear[slot] = null; this.save(); },

  salvage(uid) {
    const it = this.item(uid);
    if (!it || it.lock) return 0;
    const by = this.equippedBy(uid);
    if (by) this.hero(by).gear[it.slot] = null;
    this.s.items = this.s.items.filter((i) => i.uid !== uid);
    const v = this.salvageValue(it);
    this.s.gold += v;
    this.save();
    return v;
  },

  salvageBelow(rar) {
    let g = 0, n = 0;
    for (const it of this.s.items.slice()) if (it.rar <= rar && !it.lock && !this.equippedBy(it.uid)) { g += this.salvage(it.uid); n++; }
    return { g, n };
  },

  addItem(it) {
    this.s.stats.bestRar = Math.max(this.s.stats.bestRar, it.rar);
    if (this.s.items.length >= INV_MAX) {
      const worst = this.s.items.filter((i) => !i.lock && !this.equippedBy(i.uid)).sort((a, b) => this.itemScore(a) - this.itemScore(b))[0];
      if (worst && this.itemScore(worst) < this.itemScore(it)) this.salvage(worst.uid); else { this.s.gold += this.salvageValue(it); return false; }
    }
    if (this.s.settings.autoSalvage && it.rar === 0) { this.s.gold += this.salvageValue(it); return false; }
    this.s.items.push(it);
    return true;
  },

  // ---------- camp upgrades ----------
  talentCost(id) { const t = TALENT_BY_ID[id], l = this.s.talents[id] || 0; return l >= t.max ? null : t.cost(l); },
  buyTalent(id) {
    const c = this.talentCost(id);
    if (c == null || this.s.gold < c) return false;
    this.s.gold -= c;
    this.s.talents[id] = (this.s.talents[id] || 0) + 1;
    this.checkAch();
    this.save();
    return true;
  },

  // ---------- realms ----------
  realmUnlocked(id) { return id === 1 || (this.s.realms[id - 1] || 0) >= 1; },
  diffUnlocked(id, d) { return this.realmUnlocked(id) && (d === 0 || (this.s.realms[id] || 0) >= d); },
  abyssUnlocked() { return (this.s.realms[1] || 0) >= 1; },

  // ---------- run results ----------
  // res: mode result; ws: world stats; heroId: the local player's hero; ctx: { coop, online, items }
  applyRun(res, ws, heroId, ctx) {
    const s = this.s, st = s.stats, t = s.talents;
    const out = { gold: 0, xp: 0, items: ctx.items || [], lvl: null, ach: [], realmUnlock: null };
    let gold = res.gold || 0;
    if (res.kind === 'arena') {
      const won = ctx.won;
      gold += won ? 90 : 35;
      out.xp = won ? 80 : 40;
      if (won) st.arenaWins++;
      st.bestStreak = Math.max(st.bestStreak, ws.bestStreak || 0);
    } else {
      const dm = [1, 1.6, 2.4][res.diff || 0];
      if (res.win && res.kind === 'adventure') gold += 120 * res.realm * DIFFS[res.diff].gold;
      out.xp = ((ws.kills || 0) * 1.1 + (ws.rooms || 0) * 22 + (res.win ? 180 : 0) + (res.floor || 0) * 18) * dm;
      st.rooms += ws.rooms || 0;
      if (res.kind === 'abyss') st.abyssBest = Math.max(st.abyssBest, res.floor || 0);
      if (res.win && res.kind === 'adventure') {
        st.wins++;
        const prev = s.realms[res.realm] || 0;
        if (res.diff + 1 > prev) {
          s.realms[res.realm] = res.diff + 1;
          if (res.diff === 0 && res.realm < 5) out.realmUnlock = res.realm + 1;
        }
        if (res.diff === 1) st.heroicClears++;
        if (res.diff === 2) st.mythicClears++;
        if (!st.fastClear || res.time < st.fastClear) st.fastClear = Math.round(res.time);
      }
      if (ctx.bossKilled) st.boss[ctx.bossKilled] = (st.boss[ctx.bossKilled] || 0) + 1;
    }
    gold = Math.round(gold * (1 + (t.fortune || 0) * TALENT_BY_ID.fortune.per));
    out.gold = gold;
    s.gold += gold;
    st.goldEarned += gold;
    out.xp = Math.round(out.xp * (1 + (t.wisdom || 0) * TALENT_BY_ID.wisdom.per));
    out.lvl = this.addXp(heroId, out.xp);
    const hh = this.hero(heroId);
    hh.runs++;
    hh.kills += ws.kills || 0;
    st.runs++;
    st.kills += ws.kills || 0;
    st.ults += ws.ults || 0;
    st.revives += ws.revives || 0;
    st.flawless += ws.flawless || 0;
    st.bossNoDown += ws.bossNoDown || 0;
    st.bestCombo = Math.max(st.bestCombo, ws.bestCombo || 0);
    st.bestMulti = Math.max(st.bestMulti, ws.bestMulti || 0);
    st.maxBless = Math.max(st.maxBless, ws.maxBless || 0);
    st.legBless += ws.legBless || 0;
    if (ctx.coop) st.coopRuns++;
    if (ctx.online) st.onlineGames++;
    for (const it of out.items) this.addItem(it);
    this.questProgress({ kills: ws.kills, rooms: ws.rooms, elites: ws.elites, bosses: ws.bosses, ults: ws.ults, gold: ws.gold, chests: ws.chests, arenaWins: res.kind === 'arena' && ctx.won ? 1 : 0, blessings: ws.blessings, abyss: ws.abyss });
    out.ach = this.checkAch();
    this.save();
    return out;
  },

  // ---------- achievements ----------
  checkAch() {
    const got = [];
    for (const a of ACHIEVEMENTS) {
      if (this.s.ach[a.id]) continue;
      let ok = false;
      try { ok = a.test(this.s); } catch (e) { ok = false; }
      if (!ok) continue;
      this.s.ach[a.id] = Date.now();
      this.s.gold += a.gold || 0;
      if (a.hero && this.hero(a.hero)) this.hero(a.hero).unlocked = true;
      got.push(a);
      this.toasts.push({ kind: 'ach', a });
    }
    if (got.length) this.save();
    return got;
  },

  // ---------- daily ----------
  today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); },

  daily() {
    const s = this.s, day = this.today();
    if (s.daily.day === day) return;
    const rng = new RNG(hashStr(day + ':rr'));
    const pool = QUESTS.slice();
    rng.shuffle(pool);
    s.daily = { day, quests: pool.slice(0, 3).map((q) => { const tier = rng.int(0, 2); return { id: q.id, n: q.n[tier], prog: 0, claimed: false, gold: Math.round(q.gold * (1 + tier * 0.5)) }; }), chest: s.daily.chest || '', bonus: false };
  },

  questProgress(add) {
    this.daily();
    for (const q of this.s.daily.quests) {
      const d = QUESTS.find((x) => x.id === q.id);
      q.prog = Math.min(q.n, q.prog + (add[d.stat] || 0));
    }
  },

  claimQuest(i) {
    const q = this.s.daily.quests[i];
    if (!q || q.claimed || q.prog < q.n) return false;
    q.claimed = true;
    this.s.gold += q.gold;
    this.s.stats.quests++;
    this.checkAch();
    this.save();
    return q.gold;
  },

  canBonus() { const d = this.s.daily; return !d.bonus && d.quests.length && d.quests.every((q) => q.claimed); },
  claimBonus() {
    if (!this.canBonus()) return null;
    this.s.daily.bonus = true;
    const it = this.makeItem(this.bestIlvl(), 1, this.s.talents.luck || 0);
    this.addItem(it);
    this.save();
    return it;
  },

  chestReady() { return this.s.daily.chest !== this.today(); },
  claimChest() {
    if (!this.chestReady()) return null;
    this.s.daily.chest = this.today();
    const gold = 80 + 40 * this.highestRealm();
    this.s.gold += gold;
    const it = this.makeItem(this.bestIlvl(), 0, this.s.talents.luck || 0);
    this.addItem(it);
    this.save();
    return { gold, item: it };
  },

  highestRealm() { let r = 1; for (let i = 1; i <= 5; i++) if ((this.s.realms[i] || 0) >= 1) r = Math.min(5, i + 1); return r; },
  bestIlvl() { return (this.highestRealm() - 1) * 6 + 3; },
};

// Display settings read by the renderer and effects (kept in sync by applySettings).
const Settings = { nums: 1, shake: 1, btnAlpha: 0.35 };
