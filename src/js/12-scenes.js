// ---------- World map scene ----------
function isUnlocked(id) {
  const n = MAP.nodes[id];
  if (!n) return false;
  if (id === 'r0-town' || id === 'r0-l1') return true;
  if (n.type === 'arena') return !!SAVE.done['r0-boss'];
  return n.adj.some((a) => SAVE.done[a] && MAP.nodes[a].type !== 'arena');
}

function findPath(from, to) {
  if (from === to) return [from];
  const prev = { [from]: null };
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    for (const nb of MAP.nodes[cur].adj) {
      if (nb in prev) continue;
      if (!isUnlocked(nb)) continue;
      prev[nb] = cur;
      if (nb === to) {
        const path = [to];
        let p = cur;
        while (p != null) { path.unshift(p); p = prev[p]; }
        return path;
      }
      q.push(nb);
    }
  }
  return null;
}

function nextGoalNode() {
  for (const n of MAP.list) {
    if ((n.type === 'level' || n.type === 'boss' || n.type === 'town') && !SAVE.done[n.id] && isUnlocked(n.id)) return n.id;
  }
  return null;
}

class MapScene {
  constructor() {
    this.camX = 0;
    this.t = 0;
    this.usesControls = false;
    const n = MAP.nodes[SAVE.at] || MAP.nodes['r0-town'];
    this.walker = { x: n.x, y: n.y, path: null, seg: 0, facing: 1, ph: 0 };
    this.sel = n.id;
    this.drag = null;
    this.dest = null;
    const rng = new RNG(777);
    this.deco = [];
    for (let r = 0; r < 6; r++) {
      const bx = 60 + r * MAP_REGION_W;
      for (let i = 0; i < 26; i++) {
        const x = bx + rng.range(-10, MAP_REGION_W - 10), y = rng.range(60, 320);
        let near = false;
        for (const nd of MAP.list) if (Math.hypot(nd.x - x, nd.y - y) < 30) near = true;
        if (!near) this.deco.push({ r, x, y, s: rng.range(0.7, 1.3), v: rng.next() });
      }
    }
    this.deco.sort((a, b) => a.y - b.y);
    this.coastTop = [];
    this.coastBot = [];
    for (let x = 0; x <= MAP_W; x += 40) {
      this.coastTop.push([x, 38 + Math.sin(x * 0.013) * 10 + rng.range(-5, 5)]);
      this.coastBot.push([x, 330 + Math.sin(x * 0.011 + 2) * 10 + rng.range(-5, 5)]);
    }
    this.clouds = [];
    for (let i = 0; i < 10; i++) this.clouds.push({ x: rng.range(0, MAP_W), y: rng.range(40, 320), s: rng.range(0.6, 1.4) });
  }

  enter() {
    Input.active = false;
    UI.showMap(this);
    Music.play('map');
    this.centerOn(this.walker.x, true);
    this.refresh();
    if (!SAVE.seen.intro) {
      SAVE.seen.intro = true;
      saveGame();
      UI.story('The Journey Begins', REGIONS[0].story, () => { SAVE.seen.story0 = true; saveGame(); this.refresh(); });
    }
  }
  exit() {}

  centerOn(x, snap) {
    const tx = clamp(x - Game.W / 2, 0, Math.max(0, MAP_W - Game.W));
    this.camX = snap ? tx : this.camX + (tx - this.camX) * 0.1;
  }

  refresh() {
    UI.updateMapHud();
    if (!this.walker.path) UI.showNodePanel(this, MAP.nodes[this.sel]);
  }

  update(dt) {
    this.t += dt;
    const w = this.walker;
    if (w.path) {
      const a = w.path[w.seg], b = w.path[w.seg + 1];
      if (!b) { this.arrive(); return; }
      const dx = b.x - w.x, dy = b.y - w.y;
      const d = Math.hypot(dx, dy);
      const step = (w.speed || 190) * dt;
      w.ph += dt * 12;
      if (Math.abs(dx) > 1) w.facing = sign(dx);
      if (d <= step) {
        w.x = b.x; w.y = b.y; w.seg++;
        if (w.seg >= w.path.length - 1) { this.arrive(); return; }
      } else {
        w.x += (dx / d) * step;
        w.y += (dy / d) * step;
      }
      void a;
      this.centerOn(w.x, false);
    }
    for (const c of this.clouds) {
      c.x += 6 * c.s * dt;
      if (c.x > MAP_W + 100) c.x = -100;
    }
  }

  onPointer(type, p, e) {
    if (type === 'down') {
      this.drag = { x: p.x, y: p.y, cx: this.camX, moved: false, id: e.pointerId };
    } else if (type === 'move') {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const dx = p.x - this.drag.x;
      if (Math.abs(dx) > 8 || Math.abs(p.y - this.drag.y) > 8) this.drag.moved = true;
      if (this.drag.moved) this.camX = clamp(this.drag.cx - dx, 0, Math.max(0, MAP_W - Game.W));
    } else if (type === 'up') {
      if (this.drag && !this.drag.moved) this.tap(p.x + this.camX, p.y);
      this.drag = null;
    }
  }

  tap(mx, my) {
    let best = null, bd = 32;
    for (const n of MAP.list) {
      const d = Math.hypot(n.x - mx, n.y - my);
      if (d < bd) { best = n; bd = d; }
    }
    if (best) this.select(best.id);
  }

  select(id) {
    if (this.walker.path) return;
    if (!isUnlocked(id)) {
      UI.toast('Locked - clear the stages before it first!');
      Sound.play('error');
      return;
    }
    Sound.play('select');
    this.sel = id;
    if (id !== SAVE.at) this.travelTo(id);
    else UI.showNodePanel(this, MAP.nodes[id]);
  }

  travelTo(id) {
    const path = findPath(SAVE.at, id);
    if (!path) return;
    this.walker.path = path.map((i) => MAP.nodes[i]);
    this.walker.seg = 0;
    let len = 0;
    for (let i = 1; i < this.walker.path.length; i++) len += Math.hypot(this.walker.path[i].x - this.walker.path[i - 1].x, this.walker.path[i].y - this.walker.path[i - 1].y);
    this.walker.speed = Math.max(190, len / 3.5);
    this.dest = id;
    this.edges = path.length - 1;
    UI.hideNodePanel();
  }

  arrive() {
    const id = this.dest;
    this.walker.path = null;
    SAVE.at = id;
    this.sel = id;
    const n = MAP.nodes[id];
    if (n.type === 'town') SAVE.done[id] = true;
    saveGame();
    if (this.edges > 0 && SAVE.done['r0-l1'] && n.type !== 'town' && Math.random() < 0.22) {
      this.roadEvent(n);
      return;
    }
    this.afterArrive();
  }

  afterArrive() {
    const n = MAP.nodes[SAVE.at];
    this.refresh();
    if (n.type === 'town' && !SAVE.seen['story' + n.region]) {
      SAVE.seen['story' + n.region] = true;
      saveGame();
      UI.story(REGIONS[n.region].name, REGIONS[n.region].story, () => this.refresh());
    }
  }

  roadEvent(n) {
    const r = n.region;
    const roll = Math.random();
    if (roll < 0.5) {
      UI.dialog('AMBUSH!', 'Enemies leap out onto the road ahead! Fight them off to continue your journey.', [
        { label: 'FIGHT!', cls: 'red', fn: () => Game.startLevel(ambushDef(r)) },
        { label: 'Flee (lose 10% coins)', fn: () => { const lost = Math.floor(SAVE.coins * 0.1); SAVE.coins -= lost; saveGame(); UI.toast('You escaped, but dropped ' + lost + ' coins.'); this.afterArrive(); } },
      ]);
    } else if (roll < 0.75) {
      const c = Math.round(rand(15, 40) * (1 + r * 0.8));
      SAVE.coins += c;
      saveGame();
      Sound.play('chest');
      UI.dialog('Hidden Stash!', 'You spot something glinting beside the road... ' + c + ' coins!', [{ label: 'Nice!', fn: () => this.afterArrive() }]);
    } else if (roll < 0.9) {
      const price = Math.round(potionPrice(r) * 0.6);
      const max = playerStats(SAVE).potMax;
      UI.dialog('Wandering Merchant', `"Psst, traveler! A healing potion for just ${price} coins?"  (You have ${SAVE.potions}/${max})`, [
        { label: 'Buy (' + price + ')', cls: 'gold', fn: () => {
          if (SAVE.coins >= price && SAVE.potions < max) { SAVE.coins -= price; SAVE.potions++; saveGame(); Sound.play('buy'); UI.toast('Bought a potion!'); }
          else { Sound.play('error'); UI.toast(SAVE.potions >= max ? 'Potion bag is full!' : 'Not enough coins!'); }
          this.afterArrive();
        } },
        { label: 'No thanks', fn: () => this.afterArrive() },
      ]);
    } else {
      const xp = Math.round(30 * (1 + r));
      const lv = grantXp(xp);
      Sound.play('levelup');
      UI.dialog('Ancient Shrine', 'A glowing shrine fills you with courage. +' + xp + ' XP' + (lv ? ' - LEVEL UP!' : ''), [{ label: 'Onward!', fn: () => this.afterArrive() }]);
    }
  }

  enterNode(n) {
    Sound.play('select');
    if (n.type === 'town') { UI.showShop(n); return; }
    const def = levelDefFor(n);
    if (def) Game.startLevel(def);
  }

  // ----- drawing -----
  draw(ctx) {
    const W = Game.W, H = Game.H;
    const cx = Math.round(this.camX * Game.pxScale) / Game.pxScale;
    const t = this.t;
    const sea = ctx.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0, '#1d5a85');
    sea.addColorStop(1, '#123b5c');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      const y = 10 + i * 26;
      const ox = ((i * 97 - cx * 0.5 + t * 10) % 120 + 120) % 120;
      for (let x = -ox; x < W; x += 120) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 8, y - 4, x + 16, y); ctx.stroke();
      }
    }
    ctx.save();
    ctx.translate(-cx, 0);
    // land mass
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(this.coastTop[0][0], this.coastTop[0][1]);
    for (const p of this.coastTop) ctx.lineTo(p[0], p[1]);
    for (let i = this.coastBot.length - 1; i >= 0; i--) ctx.lineTo(this.coastBot[i][0], this.coastBot[i][1]);
    ctx.closePath();
    ctx.fillStyle = '#e8d8a8';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.stroke();
    ctx.clip();
    for (let r = 0; r < 6; r++) {
      const x0 = r === 0 ? 0 : 60 + r * MAP_REGION_W;
      const x1 = r === 5 ? MAP_W : 60 + (r + 1) * MAP_REGION_W;
      ctx.fillStyle = REGIONS[r].mapColor;
      ctx.fillRect(x0, 0, x1 - x0 + 1, MAP_H);
      if (r > 0) {
        const g = ctx.createLinearGradient(x0 - 40, 0, x0 + 40, 0);
        g.addColorStop(0, REGIONS[r - 1].mapColor);
        g.addColorStop(1, REGIONS[r].mapColor);
        ctx.fillStyle = g;
        ctx.fillRect(x0 - 40, 0, 80, MAP_H);
      }
    }
    for (const d of this.deco) {
      if (d.x < cx - 60 || d.x > cx + W + 60) continue;
      this.drawDeco(ctx, d, t);
    }
    ctx.restore();
    // region names
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 13px system-ui,sans-serif';
    for (let r = 0; r < 6; r++) {
      const x = 60 + r * MAP_REGION_W + MAP_REGION_W / 2;
      if (x < cx - 200 || x > cx + W + 200) continue;
      const y = r % 2 === 1 ? 318 : 58;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.strokeText(REGIONS[r].name.toUpperCase(), x, y);
      ctx.fillStyle = '#fff8e1';
      ctx.fillText(REGIONS[r].name.toUpperCase(), x, y);
    }
    // paths
    ctx.lineCap = 'round';
    for (const n of MAP.list) {
      for (const id of n.adj) {
        const m = MAP.nodes[id];
        if (n.id > m.id) continue;
        const open = isUnlocked(n.id) && isUnlocked(m.id);
        ctx.strokeStyle = open ? 'rgba(90,60,30,0.85)' : 'rgba(0,0,0,0.18)';
        ctx.lineWidth = open ? 4 : 3;
        ctx.setLineDash(open ? [7, 6] : [3, 7]);
        ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(m.x, m.y); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    // nodes
    const goal = nextGoalNode();
    for (const n of MAP.list) {
      if (n.x < cx - 40 || n.x > cx + W + 40) continue;
      this.drawNode(ctx, n, t, n.id === goal);
    }
    // walker
    this.drawWalker(ctx);
    // clouds
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (const c of this.clouds) {
      const x = c.x;
      if (x < cx - 100 || x > cx + W + 100) continue;
      ctx.beginPath();
      ctx.ellipse(x, c.y, 30 * c.s, 10 * c.s, 0, 0, TAU);
      ctx.ellipse(x + 16 * c.s, c.y - 7 * c.s, 18 * c.s, 10 * c.s, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    // edge hints
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    if (this.camX > 5) { ctx.beginPath(); ctx.moveTo(8, H / 2); ctx.lineTo(18, H / 2 - 10); ctx.lineTo(18, H / 2 + 10); ctx.fill(); }
    if (this.camX < MAP_W - W - 5) { ctx.beginPath(); ctx.moveTo(W - 8, H / 2); ctx.lineTo(W - 18, H / 2 - 10); ctx.lineTo(W - 18, H / 2 + 10); ctx.fill(); }
  }

  drawDeco(ctx, d, t) {
    const x = d.x, y = d.y, s = d.s;
    switch (d.r) {
      case 0:
        if (d.v < 0.6) {
          ctx.fillStyle = '#3e8f2a';
          ctx.beginPath(); ctx.arc(x, y - 8 * s, 7 * s, 0, TAU); ctx.fill();
          ctx.fillStyle = '#6d4c41'; ctx.fillRect(x - 1.5, y - 3 * s, 3, 5 * s);
        } else {
          ctx.fillStyle = '#8bd06f';
          ctx.beginPath(); ctx.ellipse(x, y, 16 * s, 6 * s, 0, Math.PI, 0); ctx.fill();
        }
        break;
      case 1:
        ctx.fillStyle = d.v < 0.5 ? '#1b4d2c' : '#235f37';
        ctx.beginPath(); ctx.moveTo(x - 7 * s, y); ctx.lineTo(x, y - 20 * s); ctx.lineTo(x + 7 * s, y); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 5 * s, y - 8 * s); ctx.lineTo(x, y - 25 * s); ctx.lineTo(x + 5 * s, y - 8 * s); ctx.fill();
        break;
      case 2:
        if (d.v < 0.15) {
          ctx.fillStyle = '#d4a45c';
          ctx.beginPath(); ctx.moveTo(x - 18 * s, y); ctx.lineTo(x, y - 20 * s); ctx.lineTo(x + 18 * s, y); ctx.fill();
          ctx.fillStyle = '#b8863f';
          ctx.beginPath(); ctx.moveTo(x, y - 20 * s); ctx.lineTo(x + 18 * s, y); ctx.lineTo(x + 5 * s, y); ctx.fill();
        } else if (d.v < 0.5) {
          ctx.fillStyle = '#6a9a3a';
          ctx.fillRect(x - 1.5 * s, y - 12 * s, 3 * s, 12 * s);
          ctx.fillRect(x - 5 * s, y - 8 * s, 2.5 * s, 5 * s);
          ctx.fillRect(x + 2.5 * s, y - 10 * s, 2.5 * s, 5 * s);
        } else {
          ctx.strokeStyle = 'rgba(160,110,50,0.5)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y + 10 * s, 14 * s, -2.4, -0.7); ctx.stroke();
        }
        break;
      case 3:
        ctx.fillStyle = '#9fb3c8';
        ctx.beginPath(); ctx.moveTo(x - 16 * s, y); ctx.lineTo(x, y - 24 * s); ctx.lineTo(x + 16 * s, y); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(x - 6 * s, y - 15 * s); ctx.lineTo(x, y - 24 * s); ctx.lineTo(x + 6 * s, y - 15 * s); ctx.fill();
        break;
      case 4:
        if (d.v < 0.2) {
          ctx.fillStyle = '#4a2018';
          ctx.beginPath(); ctx.moveTo(x - 20 * s, y); ctx.lineTo(x - 5 * s, y - 24 * s); ctx.lineTo(x + 5 * s, y - 24 * s); ctx.lineTo(x + 20 * s, y); ctx.fill();
          ctx.fillStyle = `rgba(255,111,0,${0.6 + Math.sin(t * 3 + d.v * 20) * 0.3})`;
          ctx.beginPath(); ctx.ellipse(x, y - 24 * s, 5 * s, 2 * s, 0, 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = '#2a1512';
          ctx.beginPath(); ctx.ellipse(x, y, 8 * s, 5 * s, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = `rgba(255,87,34,${0.4 + Math.sin(t * 2 + d.v * 9) * 0.2})`;
          ctx.fillRect(x - 2, y - 3, 4, 2);
        }
        break;
      case 5:
        ctx.fillStyle = '#2b2140';
        ctx.fillRect(x - 5 * s, y - 20 * s, 10 * s, 20 * s);
        ctx.beginPath(); ctx.moveTo(x - 7 * s, y - 20 * s); ctx.lineTo(x, y - 30 * s); ctx.lineTo(x + 7 * s, y - 20 * s); ctx.fill();
        ctx.fillStyle = 'rgba(234,128,252,0.6)';
        ctx.fillRect(x - 1.5, y - 15 * s, 3, 4);
        break;
    }
  }

  drawNode(ctx, n, t, isGoal) {
    const un = isUnlocked(n.id);
    const done = !!SAVE.done[n.id];
    const r = n.type === 'boss' ? 16 : n.type === 'town' ? 15 : 13;
    const x = n.x, y = n.y;
    if (n.id === this.sel) {
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + Math.sin(t * 5) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r + 6 + Math.sin(t * 5) * 1.5, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.8, r, r * 0.35, 0, 0, TAU); ctx.fill();
    const col = !un ? '#8a8a8a' : { town: '#8d6e63', level: '#fafafa', boss: '#c62828', treasure: '#ffca28', challenge: '#7e57c2', arena: '#ff7043' }[n.type];
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = done ? '#43a047' : un ? '#3e2723' : '#555';
    ctx.stroke();
    ctx.fillStyle = !un ? '#555' : n.type === 'level' ? '#3e2723' : '#ffffff';
    ctx.strokeStyle = ctx.fillStyle;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!un) {
      ctx.fillRect(x - 5, y - 1, 10, 8);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y - 2, 3.5, Math.PI, 0); ctx.stroke();
    } else {
      switch (n.type) {
        case 'town':
          ctx.beginPath(); ctx.moveTo(x - 8, y - 1); ctx.lineTo(x, y - 9); ctx.lineTo(x + 8, y - 1); ctx.fill();
          ctx.fillRect(x - 6, y - 1, 12, 8);
          ctx.fillStyle = '#8d6e63'; ctx.fillRect(x - 2, y + 2, 4, 5);
          break;
        case 'level':
          ctx.font = '900 12px system-ui,sans-serif';
          ctx.fillText(String(n.region + 1) + '-' + String(n.idx + 1), x, y + 1);
          break;
        case 'boss':
          ctx.beginPath(); ctx.arc(x, y - 2, 8, 0, TAU); ctx.fill();
          ctx.fillRect(x - 5, y + 3, 10, 6);
          ctx.fillStyle = '#c62828';
          ctx.fillRect(x - 5, y - 4, 3.5, 3.5); ctx.fillRect(x + 1.5, y - 4, 3.5, 3.5);
          ctx.fillRect(x - 3, y + 5, 1.5, 4); ctx.fillRect(x + 1.5, y + 5, 1.5, 4);
          break;
        case 'treasure':
          ctx.fillStyle = '#6d4c41';
          ctx.fillRect(x - 8, y - 3, 16, 10);
          ctx.fillStyle = '#8d6e63';
          ctx.beginPath(); ctx.ellipse(x, y - 3, 8, 5, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#ffeb3b'; ctx.fillRect(x - 2, y - 3, 4, 4);
          break;
        case 'challenge':
        case 'arena':
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7); ctx.stroke();
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(x - 7, y + 3); ctx.lineTo(x - 3, y + 7); ctx.moveTo(x + 7, y + 3); ctx.lineTo(x + 3, y + 7); ctx.stroke();
          break;
      }
    }
    const rank = SAVE.ranks[n.id];
    if (rank) {
      const rc = { S: '#ffd740', A: '#69f0ae', B: '#40c4ff', C: '#e0e0e0' }[rank];
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(x + r * 0.8, y - r * 0.8, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = rc;
      ctx.font = '900 9px system-ui,sans-serif';
      ctx.fillText(rank, x + r * 0.8, y - r * 0.8 + 0.5);
    } else if (done && n.type !== 'town') {
      ctx.fillStyle = '#43a047';
      ctx.beginPath(); ctx.arc(x + r * 0.8, y - r * 0.8, 6, 0, TAU); ctx.fill();
    }
    if (isGoal && !this.walker.path) {
      const by = y - r - 14 + Math.sin(t * 5) * 3;
      ctx.fillStyle = '#ffd740';
      ctx.beginPath(); ctx.moveTo(x - 7, by - 6); ctx.lineTo(x + 7, by - 6); ctx.lineTo(x, by + 3); ctx.fill();
      ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  drawWalker(ctx) {
    const w = this.walker;
    const moving = !!w.path;
    const pose = moving ? runPose(w.ph, 0.25) : idlePose(this.t);
    const bob = moving ? 0 : 0;
    const k = skel(w.x, w.y - 8 + bob, w.facing, 0.62, pose, true);
    drawShadowEllipse(ctx, w.x, w.y - 7, 8, 0.3);
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(k.headX - w.facing * 2, k.headY);
    ctx.lineTo(k.headX - w.facing * 10, k.headY + 2 + Math.sin(this.t * 10) * 1.5);
    ctx.stroke();
    drawStick(ctx, k, '#141414', { outline: 'rgba(255,255,255,0.7)' });
    drawWeapon(ctx, k, SAVE.weapon, this.t);
  }
}

// ---------- Title scene ----------
class TitleScene {
  constructor() {
    this.t = 0;
    this.usesControls = false;
    this.backdrop = new Backdrop(REGIONS[0], 4242);
    this.camX = 0;
    this.scarf = [];
    for (let i = 0; i < 7; i++) this.scarf.push({ x: 0, y: 0 });
  }
  enter() {
    Input.active = false;
    UI.showTitle();
    Music.play('title');
  }
  exit() {}
  update(dt) {
    this.t += dt;
    this.camX += 70 * dt;
  }
  draw(ctx) {
    const W = Game.W, H = Game.H, t = this.t;
    this.backdrop.draw(ctx, this.camX, 40, W, H, t);
    const gy = H - 44;
    ctx.fillStyle = REGIONS[0].ground;
    ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = REGIONS[0].top;
    ctx.fillRect(0, gy, W, 8);
    ctx.fillStyle = REGIONS[0].topDark;
    ctx.fillRect(0, gy + 8, W, 3);
    const off = (this.camX * 1.0) % 40;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = -off; x < W; x += 40) ctx.fillRect(x, gy + 18, 10, 4);
    // hero running, with a jump + flip every few seconds
    const hx = W * 0.3;
    const cyc = t % 4;
    let hy = gy, rot = 0, pose = runPose(t * 13, 0.3);
    if (cyc > 3 && cyc < 3.7) {
      const p = (cyc - 3) / 0.7;
      hy = gy - Math.sin(p * Math.PI) * 70;
      rot = p * TAU;
      pose = PZ.jump;
    }
    const k = skel(hx, hy, 1, 1.35, pose, hy >= gy);
    // scarf
    const ax = k.headX - 5, ay = k.headY + 1;
    this.scarf[0].x = ax; this.scarf[0].y = ay;
    for (let i = 1; i < this.scarf.length; i++) {
      const p = this.scarf[i], q = this.scarf[i - 1];
      p.x += -3 + Math.sin(t * 12 + i) * 0.6;
      p.y += 0.3 + Math.cos(t * 9 + i) * 0.4;
      const d = Math.hypot(p.x - q.x, p.y - q.y) || 1;
      p.x = q.x + ((p.x - q.x) / d) * 6;
      p.y = q.y + ((p.y - q.y) / d) * 6;
    }
    drawShadowEllipse(ctx, hx, gy, 16, 0.3);
    ctx.save();
    if (rot) { ctx.translate(hx, hy - 30); ctx.rotate(rot); ctx.translate(-hx, -(hy - 30)); }
    ctx.strokeStyle = '#e53935';
    ctx.lineCap = 'round';
    for (let i = 1; i < this.scarf.length; i++) {
      ctx.lineWidth = 5 - i * 0.5;
      ctx.beginPath(); ctx.moveTo(this.scarf[i - 1].x, this.scarf[i - 1].y); ctx.lineTo(this.scarf[i].x, this.scarf[i].y); ctx.stroke();
    }
    drawStick(ctx, k, '#141414', { outline: 'rgba(255,255,255,0.6)', back: '#3b3b3b' });
    drawWeapon(ctx, k, 'sword', t);
    ctx.restore();
    // chasing grunts
    for (let i = 0; i < 3; i++) {
      const ex = hx - 110 - i * 55 + Math.sin(t * 2 + i) * 8;
      const ek = skel(ex, gy, 1, 1.1 + i * 0.05, runPose(t * 12 + i * 2, 0.35), true);
      drawShadowEllipse(ctx, ex, gy, 12, 0.25);
      drawStick(ctx, ek, ['#e53935', '#fb8c00', '#8e24aa'][i], { outline: 'rgba(0,0,0,0.35)', eye: '#fff', angry: true });
      if (i === 1) drawWeapon(ctx, ek, 'esword', t);
    }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}
