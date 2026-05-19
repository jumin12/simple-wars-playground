(() => {
  const state = {
    open: false,
    tool: "paint",
    terrain: "grass",
    owner: 1,
    maxFactionSlots: 2,
    selected: null,
    dragging: false,
    dragKind: null,
    renderView: null,
    territoryPainting: false,
    territoryPaintOwner: 1,
    brushSize: 1,
    viewPanX: 0,
    viewPanY: 0,
    viewZoom: 1,
    viewPanDrag: null,
    editorTerrainDirty: true,
    /** Procedural random gen */
    genShape: "island",
    genCities: true,
    genTerritory: true,
    genUnits: true,
    /** Undo stack stores JSON snapshots of exportMapData(); index points at current state. */
    historyStack: [],
    historyIndex: 0,
    historyMax: 200,
    editorGestureMutatedMap: false,
    _editorKeyHandler: null,
    editorSaveSelectedId: null,
    /** 0-based pages for saved-map browser (left) and save dialog list. */
    mapBrowserPage: 0,
    editorSaveListPage: 0,
    /** Alternating city vs unit when both hit on successive clicks at the same stack */
    cityUnitStackTap: null,
    /** Shift-drag selection box [ax,ay,bx,by] in canvas pixel coords */
    editorMarquee: null,
    /** City move: terrain hexes linked at drag start */
    cityMoveAttachedHexRefs: null,
    /** While moving a town, draws at this anchor until mouseup commits terrain */
    cityMoveGhostAnchor: null,
    /** Right panel: faction start editor slot (matches editor economy selects). */
    factionEconomySlot: 1,
  };

  const editorPtrs = new Map();
  let editorPinch = null;

  let editorFrame = null;
  function markEditorMapChanged() {
    state.editorTerrainDirty = true;
    if (window.WOD && typeof WOD.invalidateTerrain === "function") WOD.invalidateTerrain();
  }

  function touchEditorMutation() {
    if (!state.open) return;
    state.editorGestureMutatedMap = true;
  }

  function editorCaptureSnapshot() {
    if (!window.WOD || typeof WOD.exportMapData !== "function") return "null";
    try {
      return JSON.stringify(WOD.exportMapData());
    } catch (_) {
      return "null";
    }
  }

  function editorApplySnapshot(json) {
    if (!json || json === "null" || !window.WOD || typeof WOD.loadMapData !== "function") return;
    try {
      WOD.loadMapData(JSON.parse(json));
    } catch (_) {
      return;
    }
    if (WOD.gameData) WOD.gameData.loadedCustomMap = true;
    syncEditorTerritoryOverlayDefault();
    state.selected = null;
    syncBrushScaleControls(document.getElementById("mapEditorApp"));
    markEditorMapChanged();
    state.cityUnitStackTap = null;
    state.editorMarquee = null;
    state.cityMoveAttachedHexRefs = null;
    state.cityMoveGhostAnchor = null;
    renderSelection();
    scheduleEditorRender();
    renderMapBrowser();
  }

  function editorInitHistory() {
    const s = editorCaptureSnapshot();
    state.historyStack = [s];
    state.historyIndex = 0;
    state.cityUnitStackTap = null;
    state.editorMarquee = null;
    state.cityMoveAttachedHexRefs = null;
    state.cityMoveGhostAnchor = null;
    updateUndoRedoButtons();
  }

  function editorPushSnapshot() {
    if (!state.open) return;
    const s = editorCaptureSnapshot();
    if (s === "null") return;
    const st = state.historyStack.slice(0, state.historyIndex + 1);
    st.push(s);
    if (st.length > state.historyMax) st.shift();
    state.historyStack = st;
    state.historyIndex = state.historyStack.length - 1;
    updateUndoRedoButtons();
  }

  function editorUndo() {
    if (state.historyIndex <= 0) return;
    state.historyIndex -= 1;
    editorApplySnapshot(state.historyStack[state.historyIndex]);
    updateUndoRedoButtons();
  }

  function editorRedo() {
    if (state.historyIndex >= state.historyStack.length - 1) return;
    state.historyIndex += 1;
    editorApplySnapshot(state.historyStack[state.historyIndex]);
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    const u = document.getElementById("editorUndoBtn");
    const r = document.getElementById("editorRedoBtn");
    if (u) {
      u.disabled = state.historyIndex <= 0;
      u.toggleAttribute("disabled", state.historyIndex <= 0);
    }
    if (r) {
      const can = state.historyIndex < state.historyStack.length - 1;
      r.disabled = !can;
      r.toggleAttribute("disabled", !can);
    }
  }
  function scheduleEditorRender() {
    if (editorFrame != null) return;
    editorFrame = requestAnimationFrame(() => {
      editorFrame = null;
      if (!state.open) return;
      renderEditor();
    });
  }

  const terrainTypes = ["grass", "sand", "forest", "swamp", "hill", "mountain", "water", "urban"];

  /** Brush scale 1 = clicked hex only; each step adds one full hex ring around the center (max 5). */
  const EDITOR_BRUSH_SCALE_MAX = 5;
  /** Saved map lists: items per page (browser + save dialog). */
  const SAVED_MAPS_PAGE_SIZE = 3;

  function savedMapsPagination(page0, totalItems) {
    const n = Math.max(0, totalItems | 0);
    const totalPages = Math.max(1, Math.ceil(n / SAVED_MAPS_PAGE_SIZE));
    let p = Math.max(0, Math.min(page0 | 0, totalPages - 1));
    const start = p * SAVED_MAPS_PAGE_SIZE;
    return { page: p, totalPages, start, end: Math.min(start + SAVED_MAPS_PAGE_SIZE, n) };
  }

  function editorMaxPlayerSlots() {
    return typeof window !== "undefined" && window.WOD && typeof WOD.maxLobbyPlayers === "number"
      ? WOD.maxLobbyPlayers
      : 4;
  }

  /** Grow faction slot count when map data references higher owner ids (territory, towns, units). */
  function syncMaxFactionSlotsFromGameData() {
    if (!window.WOD || !WOD.gameData) return;
    const cap = editorMaxPlayerSlots();
    let mx = 0;
    const bump = (o) => {
      const n = typeof o === "number" && Number.isFinite(o) ? Math.floor(o) : parseInt(o, 10);
      if (!Number.isFinite(n) || n <= 0) return;
      if (n > mx) mx = n;
    };
    for (const h of WOD.gameData.hexList || []) bump(h && h.owner);
    for (const c of WOD.gameData.cities || []) bump(c && c.owner);
    for (const u of WOD.gameData.entities || []) bump(u && u.owner);
    state.maxFactionSlots = Math.min(cap, Math.max(2, mx));
  }

  function factionPalette() {
    return window.WOD && WOD.factionColors ? WOD.factionColors : ["#000000", "#2ecc71", "#e74c3c", "#9b59b6", "#e67e22", "#3498db", "#f1c40f"];
  }

  function factionSwatchBg(ownerVal) {
    const v = parseInt(ownerVal, 10);
    const n = Number.isFinite(v) ? v : 0;
    return n <= 0 ? "#5c6f82" : factionPalette()[n] || "#cccccc";
  }

  function syncEditorOwnerSwatch() {
    const sel = document.getElementById("editorOwner");
    const sw = document.getElementById("editorOwnerSwatch");
    if (!sw) return;
    const v = sel ? parseInt(sel.value, 10) : state.owner;
    sw.style.background = factionSwatchBg(Number.isFinite(v) ? v : 0);
  }

  function syncTerritoryOwnerSwatch() {
    const sel = document.getElementById("editorTerritoryOwner");
    const sw = document.getElementById("editorTerritoryOwnerSwatch");
    if (!sw) return;
    const v = sel ? parseInt(sel.value, 10) : state.territoryPaintOwner;
    sw.style.background = factionSwatchBg(Number.isFinite(v) ? v : 0);
  }

  function rebuildOwnerSelect() {
    const sel = document.getElementById("editorOwner");
    if (!sel) return;
    if (state.owner > state.maxFactionSlots) state.owner = state.maxFactionSlots;
    const cur = Math.max(0, Math.min(state.owner, state.maxFactionSlots));
    state.owner = cur;
    sel.innerHTML = factionOwnerSelectHtml(cur, { neutralLabel: "Neutral (clear)", factionOptionLabel: (i) => `Faction slot ${i}` });
    sel.value = String(cur);
    state.owner = parseInt(sel.value, 10);
    sel.onchange = () => {
      state.owner = parseInt(sel.value, 10);
      syncEditorOwnerSwatch();
      rebuildUnitPalette();
      scheduleEditorRender();
    };
    syncEditorOwnerSwatch();
    rebuildTerritoryOwnerSelect();
    rebuildEconomyFactionSelect(false);
  }

  function rebuildTerritoryOwnerSelect() {
    const sel = document.getElementById("editorTerritoryOwner");
    if (!sel) return;
    const cap = state.maxFactionSlots;
    let v = state.territoryPaintOwner;
    if (v > cap) v = cap;
    if (v < 0) v = 0;
    state.territoryPaintOwner = v;
    sel.innerHTML = factionOwnerSelectHtml(v, { neutralLabel: "Neutral" });
    sel.value = String(v);
    state.territoryPaintOwner = parseInt(sel.value, 10);
    sel.onchange = () => {
      state.territoryPaintOwner = parseInt(sel.value, 10);
      syncTerritoryOwnerSwatch();
    };
    syncTerritoryOwnerSwatch();
    syncTerritoryOwnerUi();
  }

  function syncTerritoryOwnerUi() {
    const wrap = document.getElementById("editorTerritoryOwnerWrap");
    if (!wrap) return;
    const show = state.tool === "territory";
    wrap.style.display = show ? "flex" : "none";
    wrap.toggleAttribute("hidden", !show);
    wrap.setAttribute("aria-hidden", show ? "false" : "true");
  }

  function editorNormalizeColorForPicker(hex) {
    const fb = "#888888";
    if (!hex || typeof hex !== "string") return fb;
    const h = hex.trim();
    const m6 = h.match(/^#([0-9a-f]{6})$/i);
    if (m6) return `#${m6[1].toLowerCase()}`;
    const m3 = h.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`.toLowerCase();
    return fb;
  }

  function refreshEconomyFactionSelectStyles() {
    const sel = document.getElementById("editorEconomyFaction");
    if (!sel) return;
    const cols = factionPalette();
    Array.from(sel.options).forEach((opt) => {
      const id = parseInt(opt.value, 10);
      if (!Number.isFinite(id) || id < 1) return;
      const c = cols[id] || "#cccccc";
      opt.style.background = c;
      opt.style.color = "#061208";
      opt.style.fontWeight = "700";
    });
  }

  /** Rebuild slot list when faction cap changes; keeps option styling in sync otherwise. */
  function rebuildEconomyFactionSelect(forceRebuild) {
    const sel = document.getElementById("editorEconomyFaction");
    if (!sel || !window.WOD || !WOD.gameData) return;
    const needRebuild = !!forceRebuild || sel.options.length !== state.maxFactionSlots;
    if (!needRebuild) {
      refreshEconomyFactionSelectStyles();
      return;
    }
    const keep = Math.max(1, Math.min((state.factionEconomySlot | 0) || 1, state.maxFactionSlots));
    let html = "";
    const cols = factionPalette();
    for (let i = 1; i <= state.maxFactionSlots; i++) {
      const col = cols[i] || "#cccccc";
      const lbl = i === 1 ? "Faction 1 (player)" : `Faction ${i}`;
      html += `<option value="${i}" style="background:${col};color:#061208;font-weight:700">${lbl}</option>`;
    }
    sel.innerHTML = html;
    state.factionEconomySlot = keep;
    sel.value = String(keep);
    refreshEconomyFactionSelectStyles();
    pullFactionEconomyInputsFromGame();
  }

  function ensureAiEconomyBuckets() {
    if (!window.WOD || !WOD.gameData) return;
    const gd = WOD.gameData;
    if (!gd.aiMoneyByOwner || typeof gd.aiMoneyByOwner !== "object") gd.aiMoneyByOwner = {};
    if (!gd.aiManpowerByOwner || typeof gd.aiManpowerByOwner !== "object") gd.aiManpowerByOwner = {};
  }

  function pullFactionEconomyInputsFromGame() {
    if (!window.WOD || !WOD.gameData) return;
    ensureAiEconomyBuckets();
    const sel = document.getElementById("editorEconomyFaction");
    if (!sel) return;
    const slotRaw = parseInt(sel.value, 10) || 1;
    const slot = Math.max(1, Math.min(slotRaw, state.maxFactionSlots));
    sel.value = String(slot);
    state.factionEconomySlot = slot;
    const col = document.getElementById("editorEconomyColor");
    const cash = document.getElementById("editorEconomyCash");
    const mp = document.getElementById("editorEconomyMp");
    if (col) col.value = editorNormalizeColorForPicker(factionPalette()[slot]);
    let moneyVal;
    let mpVal;
    if (slot === 1) {
      moneyVal = WOD.gameData.money;
      mpVal = WOD.gameData.manpower;
    } else {
      moneyVal = WOD.gameData.aiMoneyByOwner[slot];
      mpVal = WOD.gameData.aiManpowerByOwner[slot];
      if (moneyVal == null) moneyVal = 10000;
      if (mpVal == null) mpVal = 5000;
    }
    if (cash) cash.value = String(Math.max(0, Math.round(Number(moneyVal) || 0)));
    if (mp) mp.value = String(Math.max(0, Math.round(Number(mpVal) || 0)));
  }

  function pushFactionEconomyNumbersToGame() {
    if (!state.open || !window.WOD || !WOD.gameData) return;
    ensureAiEconomyBuckets();
    const slotRaw = parseInt(document.getElementById("editorEconomyFaction").value, 10) || 1;
    const slot = Math.max(1, Math.min(slotRaw, state.maxFactionSlots));
    const cash = document.getElementById("editorEconomyCash");
    const mp = document.getElementById("editorEconomyMp");
    const money = Math.max(0, parseInt(cash && cash.value, 10) || 0);
    const mpx = Math.max(0, parseInt(mp && mp.value, 10) || 0);
    if (slot === 1) {
      WOD.gameData.money = money;
      WOD.gameData.manpower = mpx;
    } else {
      WOD.gameData.aiMoneyByOwner[slot] = money;
      WOD.gameData.aiManpowerByOwner[slot] = mpx;
    }
    WOD.gameData._mapExportHadStartEconomy = true;
    markEditorMapChanged();
  }

  function applyFactionEconomyColorFromPicker() {
    if (!window.WOD || !WOD.gameData) return;
    const sel = document.getElementById("editorEconomyFaction");
    const colEl = document.getElementById("editorEconomyColor");
    if (!sel || !colEl) return;
    const slot = Math.max(1, Math.min(parseInt(sel.value, 10) || 1, state.maxFactionSlots));
    const cols = factionPalette();
    cols[slot] = editorNormalizeColorForPicker(colEl.value);
    WOD.gameData._mapExportHadStartEconomy = true;
    markEditorMapChanged();
  }

  function editorRefreshTradeRoutes() {
    if (window.WOD && typeof WOD.rebuildEditorTradeRoutes === "function") WOD.rebuildEditorTradeRoutes();
    markEditorMapChanged();
    scheduleEditorRender();
  }

  function renderFactionBalanceChart() {
    const host = document.getElementById("editorFactionChart");
    if (!host || !state.open || !window.WOD || typeof WOD.getEditorFactionEconomy !== "function") return;
    let html =
      `<table class="editor-faction-chart"><thead><tr><th>Faction</th><th>Lnd</th><th>$ /s</th>` +
      `<th title="Manpower income from towns">Mp+/s</th><th title="Army manpower (excl. convoys)">Troops</th>` +
      `</tr></thead><tbody>`;
    for (let slot = 1; slot <= state.maxFactionSlots; slot++) {
      const st = WOD.getEditorFactionEconomy(slot);
      const nm = slot === 1 ? "Faction 1" : `Faction ${slot}`;
      const fc = factionPalette()[slot] || "#ccc";
      const inc = (+st.income).toFixed(2);
      const mpInc = (+st.manpowerIncome).toFixed(2);
      html += `<tr><td><span class="efc-dot" style="background:${fc}"></span>${nm}</td><td>${st.territoryHexes}</td><td>${inc}</td>` +
        `<td>${mpInc}</td><td>${Math.round(st.troopManpower)}</td></tr>`;
    }
    html += "</tbody></table>";
    host.innerHTML = html;
    host.classList.remove("editor-hint");
  }

  function wireMapBrowserPager() {
    const prev = document.getElementById("mapBrowserPrev");
    const next = document.getElementById("mapBrowserNext");
    if (prev && !prev.dataset.wiredMapPager) {
      prev.dataset.wiredMapPager = "1";
      prev.addEventListener("click", () => {
        state.mapBrowserPage = Math.max(0, (state.mapBrowserPage | 0) - 1);
        renderMapBrowser();
      });
    }
    if (next && !next.dataset.wiredMapPager) {
      next.dataset.wiredMapPager = "1";
      next.addEventListener("click", () => {
        state.mapBrowserPage = (state.mapBrowserPage | 0) + 1;
        renderMapBrowser();
      });
    }
  }

  function wireFactionEconomyPanel(root) {
    const app = root || document.getElementById("mapEditorApp");
    if (!app || app.dataset.factionEcoWired === "1") return;
    app.dataset.factionEcoWired = "1";
    const fac = document.getElementById("editorEconomyFaction");
    const col = document.getElementById("editorEconomyColor");
    const cash = document.getElementById("editorEconomyCash");
    const mpIn = document.getElementById("editorEconomyMp");
    if (fac) {
      fac.addEventListener("change", () => {
        state.factionEconomySlot = parseInt(fac.value, 10) || 1;
        pullFactionEconomyInputsFromGame();
      });
    }
    if (col) {
      col.addEventListener("input", () => {
        applyFactionEconomyColorFromPicker();
        refreshEconomyFactionSelectStyles();
        syncEditorOwnerSwatch();
        syncTerritoryOwnerSwatch();
        scheduleEditorRender();
      });
      col.addEventListener("change", () => {
        rebuildOwnerSelect();
        scheduleEditorRender();
        editorPushSnapshot();
      });
    }
    const onFundsChange = () => {
      pushFactionEconomyNumbersToGame();
      renderFactionBalanceChart();
      editorPushSnapshot();
    };
    if (cash) cash.addEventListener("change", onFundsChange);
    if (mpIn) mpIn.addEventListener("change", onFundsChange);
  }

  function hexesForBrush(centerHex) {
    if (!centerHex || !WOD.gameData.hexes) return [];
    const scale = Math.max(1, Math.min(EDITOR_BRUSH_SCALE_MAX, state.brushSize | 0));
    const ring = scale - 1;
    const out = [];
    for (const pt of hexesInHexDisk(centerHex.q, centerHex.r, ring)) {
      const h = WOD.gameData.hexes[`${pt.q},${pt.r}`];
      if (h) out.push(h);
    }
    return out.length ? out : [centerHex];
  }

  function paintUsesBrush(tool) {
    return tool === "paint" || tool === "erase" || tool === "territory";
  }

  function syncBrushScaleControls(root) {
    const r = root || document.getElementById("mapEditorApp");
    if (!r) return;
    const scale = Math.max(1, Math.min(EDITOR_BRUSH_SCALE_MAX, state.brushSize | 0));
    state.brushSize = scale;
    const slider = r.querySelector("#editorBrushSize");
    if (slider) {
      slider.value = String(scale);
      slider.setAttribute("aria-valuenow", String(scale));
    }
    r.querySelectorAll("[data-brush-scale]").forEach(btn => {
      const n = parseInt(btn.dataset.brushScale, 10);
      btn.classList.toggle("active", n === scale);
    });
  }

  /** Axial hex disk (hex distance ≤ R); avoids WOD.getHexesInRadius which uses Euclidean dq,dr (wrong on hex grids). */
  function hexesInHexDisk(cq, cr, R) {
    const coords = [];
    for (let dq = -R; dq <= R; dq++) {
      const drMin = Math.max(-R, -dq - R);
      const drMax = Math.min(R, -dq + R);
      for (let dr = drMin; dr <= drMax; dr++) coords.push({ q: cq + dq, r: cr + dr });
    }
    return coords;
  }

  function syncEditorTerritoryOverlayDefault() {
    if (!window.WOD || !WOD.gameData) return;
    if (!WOD.gameData.layers) WOD.gameData.layers = {};
    WOD.gameData.layers.territory = true;
    markEditorMapChanged();
    refreshEditorGameplayLayerButtons();
  }

  function factionOwnerSelectHtml(selectedOwner, opt) {
    const cols = factionPalette();
    const cap = state.maxFactionSlots;
    const neutralLabel = opt && typeof opt.neutralLabel === "string" ? opt.neutralLabel : "Neutral";
    const factionLabel =
      typeof (opt && opt.factionOptionLabel) === "function"
        ? opt.factionOptionLabel
        : (i) => `Faction ${i}`;
    let cur = parseInt(selectedOwner, 10);
    if (!Number.isFinite(cur)) cur = 0;
    cur = Math.max(0, Math.min(cur, cap));
    let html = `<option value="0" style="background:#5c6f82;color:#fff;font-weight:700"${cur === 0 ? " selected" : ""}>${neutralLabel}</option>`;
    for (let i = 1; i <= cap; i++) {
      const col = cols[i] || "#cccccc";
      const label = String(factionLabel(i));
      html += `<option value="${i}" style="background:${col};color:#061208;font-weight:700"${cur === i ? " selected" : ""}>${label}</option>`;
    }
    return html;
  }

  function wireSelectionFactionControls() {
    const fos = document.getElementById("selOwnerFaction");
    const sw = document.getElementById("selOwnerFactionSwatch");
    if (!fos || !sw) return;
    const syncSwatch = () => {
      const v = parseInt(fos.value, 10) || 0;
      sw.style.background = factionSwatchBg(v);
    };
    fos.addEventListener("change", syncSwatch);
    syncSwatch();
  }

  function refreshEditorGameplayLayerButtons() {
    const app = document.getElementById("mapEditorApp");
    if (!app || !window.WOD || !WOD.gameData || !WOD.gameData.layers) return;
    const L = WOD.gameData.layers;
    app.querySelectorAll("[data-gl]").forEach(btn => {
      const key = btn.dataset.gl;
      if (!key || L[key] === undefined) return;
      btn.classList.toggle("active", !!L[key]);
    });
  }

  window.refreshEditorGameplayLayerButtons = refreshEditorGameplayLayerButtons;

  function unitStub(type, owner) {
    const o = Math.max(0, parseInt(owner, 10));
    const cap = Math.max(1, state.maxFactionSlots || editorMaxPlayerSlots());
    const base = {
      type,
      owner: o <= 0 ? 1 : Math.min(o, cap),
      name: "",
      target: null,
      selected: false,
      shake: 0,
    };
    if (type === "light") {
      return { ...base, hp: 100, maxHp: 100, speed: 15, damage: 8, range: 50, manpower: 1000, maxManpower: 1000, tanks: 0, maxTanks: 0, radius: 12 };
    }
    if (type === "marine") {
      return { ...base, hp: 100, maxHp: 100, speed: 15, damage: 8, range: 50, manpower: 1000, maxManpower: 1000, tanks: 0, maxTanks: 0, radius: 12 };
    }
    if (type === "heavy") {
      return { ...base, hp: 300, maxHp: 300, speed: 10, damage: 18, range: 60, manpower: 5000, maxManpower: 5000, tanks: 500, maxTanks: 500, radius: 16 };
    }
    return { ...base, hp: 200, maxHp: 200, speed: 25, damage: 14, range: 80, manpower: 1000, maxManpower: 1000, tanks: 0, maxTanks: 0, radius: 20 };
  }

  function renderUnitChipCanvas(chip, type, owner) {
    if (!window.WOD || typeof WOD.drawEditorUnitAtScreen !== "function") return;
    let c = chip.querySelector(".unit-chip-canvas");
    if (!c) {
      c = document.createElement("canvas");
      c.className = "unit-chip-canvas";
      c.width = 64;
      c.height = 64;
      chip.insertBefore(c, chip.firstChild);
    }
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    const u = unitStub(type, owner);
    WOD.drawEditorUnitAtScreen(ctx, c.width / 2, c.height / 2, 1.45, u);
  }

  function rebuildUnitPalette() {
    const el = document.getElementById("editorUnitPalette");
    if (!el || !window.WOD) return;
    const cols = factionPalette();
    const owner = Math.max(1, Math.min(state.owner || 1, state.maxFactionSlots));
    const types = [
      ["light", "Infantry"],
      ["marine", "Marines"],
      ["heavy", "Armor"],
      ["ship", "Ship"],
    ];
    el.innerHTML = types.map(([t, lab]) => {
      const col = cols[owner] || "#fff";
      return `
      <div class="unit-chip" draggable="true" data-unit-type="${t}" data-unit-owner="${owner}"
           style="--chip-faction:${col}">
        <span class="unit-chip-meta">
          <span class="unit-chip-title">${lab}</span>
          <span class="unit-chip-sub">Drop on map</span>
        </span>
      </div>`;
    }).join("");

    el.querySelectorAll(".unit-chip").forEach(chip => {
      const t = chip.dataset.unitType;
      const o = parseInt(chip.dataset.unitOwner, 10);
      renderUnitChipCanvas(chip, t, o);
      chip.addEventListener("dragstart", ev => {
        const payload = JSON.stringify({ type: t, owner: o });
        ev.dataTransfer.setData("application/x-wod-unit", payload);
        ev.dataTransfer.setData("text/plain", payload);
        ev.dataTransfer.effectAllowed = "copy";
        chip.classList.add("dragging");
      });
      chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
    });
  }

  function renderEditorSaveDialogList() {
    const list = document.getElementById("editorSaveList");
    const overBtn = document.getElementById("editorSaveOverwriteBtn");
    const pager = document.getElementById("editorSavePager");
    const pageLabel = document.getElementById("editorSavePageLabel");
    const prevBtn = document.getElementById("editorSavePagePrev");
    const nextBtn = document.getElementById("editorSavePageNext");
    if (!list) return;
    list.textContent = "";
    state.editorSaveSelectedId = null;
    if (overBtn) {
      overBtn.disabled = true;
      overBtn.setAttribute("disabled", "disabled");
    }
    const maps = typeof window.wodGetSavedMapsList === "function" ? window.wodGetSavedMapsList() : [];
    if (maps.length === 0) {
      if (pager) pager.hidden = true;
      list.innerHTML = `<div class="editor-hint" style="margin:0">No maps in your library yet — use <strong>Save as new</strong> below.</div>`;
      return;
    }
    const pag = savedMapsPagination(state.editorSaveListPage, maps.length);
    state.editorSaveListPage = pag.page;
    const pageMaps = maps.slice(pag.start, pag.end);
    if (pager) {
      pager.hidden = false;
      if (pageLabel) pageLabel.textContent = `Page ${pag.page + 1} / ${pag.totalPages} (${maps.length} saves)`;
      if (prevBtn) {
        prevBtn.disabled = pag.page <= 0;
        prevBtn.toggleAttribute("disabled", pag.page <= 0);
      }
      if (nextBtn) {
        const last = pag.page >= pag.totalPages - 1;
        nextBtn.disabled = last;
        nextBtn.toggleAttribute("disabled", last);
      }
    }
    for (const m of pageMaps) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "editor-save-row";
      row.dataset.mapId = m.id || "";
      const img = document.createElement("img");
      img.alt = "";
      img.src =
        typeof window.wodSavedMapThumbUrl === "function"
          ? window.wodSavedMapThumbUrl(m, 72, 44)
          : m.thumb || m.thumbnail || "";
      const mid = document.createElement("div");
      const t = document.createElement("div");
      t.className = "editor-save-name";
      t.textContent = m.name || "Map";
      const meta = document.createElement("div");
      meta.className = "editor-save-meta";
      meta.textContent = new Date(m.savedAt || m.date || Date.now()).toLocaleString();
      mid.appendChild(t);
      mid.appendChild(meta);
      row.appendChild(img);
      row.appendChild(mid);
      row.addEventListener("click", () => {
        list.querySelectorAll(".editor-save-row").forEach((r) => r.classList.remove("selected"));
        row.classList.add("selected");
        state.editorSaveSelectedId = m.id || null;
        if (overBtn) {
          const ok = !!state.editorSaveSelectedId;
          overBtn.disabled = !ok;
          if (ok) overBtn.removeAttribute("disabled");
          else overBtn.setAttribute("disabled", "disabled");
        }
      });
      list.appendChild(row);
    }
  }

  function showEditorSaveDialog() {
    ensureEditorDom();
    const ov = document.getElementById("editorSaveOverlay");
    const nameIn = document.getElementById("editorSaveNewName");
    if (!ov) return;
    const defTitle = "Custom Map " + new Date().toLocaleTimeString();
    if (nameIn) nameIn.value = defTitle;
    state.editorSaveListPage = 0;
    renderEditorSaveDialogList();
    ov.classList.remove("hidden");
    ov.setAttribute("aria-hidden", "false");
  }

  function hideEditorSaveDialog() {
    const ov = document.getElementById("editorSaveOverlay");
    if (!ov) return;
    ov.classList.add("hidden");
    ov.setAttribute("aria-hidden", "true");
    state.editorSaveSelectedId = null;
  }

  function wireEditorSaveDialog() {
    const cancel = document.getElementById("editorSaveCancelBtn");
    const asNew = document.getElementById("editorSaveAsNewBtn");
    const over = document.getElementById("editorSaveOverwriteBtn");
    if (cancel) cancel.addEventListener("click", () => hideEditorSaveDialog());
    const sp = document.getElementById("editorSavePagePrev");
    const sn = document.getElementById("editorSavePageNext");
    if (sp && !sp.dataset.wiredSavePager) {
      sp.dataset.wiredSavePager = "1";
      sp.addEventListener("click", () => {
        state.editorSaveListPage = Math.max(0, (state.editorSaveListPage | 0) - 1);
        renderEditorSaveDialogList();
      });
    }
    if (sn && !sn.dataset.wiredSavePager) {
      sn.dataset.wiredSavePager = "1";
      sn.addEventListener("click", () => {
        state.editorSaveListPage = (state.editorSaveListPage | 0) + 1;
        renderEditorSaveDialogList();
      });
    }
    const doSavePayload = () => {
      if (!window.WOD || typeof WOD.exportMapData !== "function") return null;
      const mapData = WOD.exportMapData();
      let thumb;
      try {
        if (state.open) {
          const c = document.getElementById("editorCanvas");
          if (c) thumb = c.toDataURL("image/png");
        }
      } catch (_) {
        thumb = undefined;
      }
      if (!thumb && typeof window.wodMapDataToThumbnailDataUrl === "function") {
        try {
          thumb = window.wodMapDataToThumbnailDataUrl(mapData, 280, 168);
        } catch (_) {
          thumb = undefined;
        }
      }
      return { mapData, thumb: thumb || undefined };
    };
    if (asNew) {
      asNew.addEventListener("click", () => {
        const nameIn = document.getElementById("editorSaveNewName");
        const name = (nameIn && nameIn.value.trim()) || "Custom Map " + new Date().toLocaleTimeString();
        const p = doSavePayload();
        if (!p) return;
        if (typeof window.wodSaveMapToLibraryWithName === "function") {
          if (!window.wodSaveMapToLibraryWithName(name, p)) return;
        }
        hideEditorSaveDialog();
        refreshSavedMapsUisAfterNewSave();
        if (typeof window.showNotification === "function") window.showNotification("Map saved to library.");
      });
    }
    if (over) {
      over.addEventListener("click", () => {
        if (!state.editorSaveSelectedId) return;
        const p = doSavePayload();
        if (!p) return;
        const nameIn = document.getElementById("editorSaveNewName");
        const name = nameIn && nameIn.value.trim();
        if (typeof window.wodOverwriteSavedMapById === "function") {
          if (!window.wodOverwriteSavedMapById(state.editorSaveSelectedId, { ...p, name: name || undefined })) return;
        }
        hideEditorSaveDialog();
        refreshSavedMapsUisAfterNewSave();
        if (typeof window.showNotification === "function") window.showNotification("Map updated in library.");
      });
    }
  }

  function wireEditorGenerateStrip(root) {
    const setTab = (name) => {
      root.querySelectorAll("[data-gen-tab]").forEach(b => b.classList.toggle("active", b.dataset.genTab === name));
      root.querySelectorAll("[data-gen-panel]").forEach(p => {
        p.style.display = p.dataset.genPanel === name ? "flex" : "none";
      });
    };
    root.querySelectorAll("[data-gen-tab]").forEach(btn => {
      btn.addEventListener("click", () => setTab(btn.dataset.genTab));
    });
    root.querySelectorAll("[data-ed-shape]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.genShape = btn.dataset.edShape || "island";
        root.querySelectorAll("[data-ed-shape]").forEach(b => b.classList.toggle("active", b === btn));
      });
    });
    const cC = root.querySelector("#editorGenCities");
    const cT = root.querySelector("#editorGenTerritory");
    const cU = root.querySelector("#editorGenUnits");
    const syncFromDom = () => {
      const citiesOn = !!(cC && cC.checked);
      if (cT) {
        cT.disabled = !citiesOn;
        if (!citiesOn) cT.checked = false;
      }
      if (cU) {
        cU.disabled = !citiesOn;
        if (!citiesOn) cU.checked = false;
      }
      state.genCities = citiesOn;
      state.genTerritory = citiesOn && !!(cT && cT.checked);
      state.genUnits = citiesOn && !!(cU && cU.checked);
    };
    [cC, cT, cU].forEach(el => el && el.addEventListener("change", syncFromDom));
    syncFromDom();

    const ex = root.querySelector("#editorExportJson");
    if (ex) {
      ex.addEventListener("click", () => {
        if (!window.WOD || typeof WOD.exportMapData !== "function") return;
        const data = WOD.exportMapData();
        data.format = "simple-wars-map";
        data.version = 1;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "simple_wars_map.json";
        a.click();
        URL.revokeObjectURL(url);
      });
    }
    const fileIn = root.querySelector("#editorImportJsonFile");
    const impBtn = root.querySelector("#editorImportJsonBtn");
    if (impBtn && fileIn) {
      impBtn.addEventListener("click", () => fileIn.click());
      fileIn.addEventListener("change", ev => {
        const f = ev.target.files && ev.target.files[0];
        ev.target.value = "";
        if (!f || !window.WOD || typeof WOD.loadMapData !== "function") return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const o = JSON.parse(String(reader.result || "{}"));
            WOD.loadMapData(o);
            syncEditorTerritoryOverlayDefault();
            const sz = document.getElementById("editorSize");
            if (sz) sz.value = String(WOD.gameData.mapRadius || 60);
            state.selected = null;
            state.viewPanX = 0;
            state.viewPanY = 0;
            state.viewZoom = 1;
            markEditorMapChanged();
            scheduleEditorRender();
            renderSelection();
            renderMapBrowser();
            if (state.open) editorInitHistory();
          } catch (e) {
            console.warn(e);
            alert("Could not import this JSON as a map.");
          }
        };
        reader.readAsText(f);
      });
    }
  }

  function ensureEditorDom() {
    if (document.getElementById("mapEditorApp")) return;
    const style = document.createElement("style");
    style.textContent = `
      #mapEditorApp { position:absolute; inset:0; z-index:30; background:#0a1520; color:#e8f0f6; display:none;
        font-family:'Segoe UI',system-ui,sans-serif; }
      #mapEditorApp.visible {
        display:grid;
        grid-template-columns:minmax(260px,300px) minmax(0,1fr) minmax(260px,300px);
        grid-template-rows:auto auto 1fr;
        gap:0;
      }
      .editor-gen-wrap {
        grid-column:1/-1; grid-row:2;
        background:linear-gradient(180deg,#0f1a28,#0c1520);
        border-bottom:1px solid rgba(201,162,39,.32);
      }
      .editor-gen-head {
        display:flex;
        flex-wrap:wrap;
        align-items:center;
        gap:10px;
        padding:8px 14px 0;
      }
      .editor-gen-head .editor-gen-tabs {
        display:flex;
        gap:6px;
        flex:1 1 200px;
        min-width:0;
        flex-wrap:wrap;
      }
      .editor-gen-undo {
        display:flex;
        gap:6px;
        flex-shrink:0;
        align-items:center;
      }
      .editor-gen-undo .editor-btn {
        padding:7px 12px;
        font-size:12px;
        min-width:72px;
      }
      .editor-gen-undo .editor-btn:disabled,
      #editorUndoBtn:disabled,
      #editorRedoBtn:disabled {
        opacity:0.45;
        cursor:not-allowed;
        filter:grayscale(0.4);
        box-shadow:none;
      }
      .editor-save-overlay {
        position:fixed;
        inset:0;
        z-index:13000;
        background:rgba(6,12,20,.75);
        display:flex;
        align-items:center;
        justify-content:center;
        padding:16px;
      }
      .editor-save-overlay.hidden { display:none; }
      .editor-save-dialog {
        background:linear-gradient(180deg,#152535,#101a28);
        border:1px solid rgba(201,162,39,.45);
        border-radius:12px;
        padding:16px 18px;
        max-width:520px;
        width:100%;
        max-height:88vh;
        overflow:auto;
        box-shadow:0 12px 40px rgba(0,0,0,.55);
      }
      .editor-save-dialog h3 { margin:0 0 8px; font-size:1.05rem; color:#f4e4a6; }
      .editor-save-list {
        display:grid;
        gap:8px;
        max-height:min(36vh, 240px);
        overflow:auto;
        margin:10px 0 8px;
      }
      .editor-save-pager {
        display:flex; align-items:center; justify-content:center; gap:10px; margin:0 0 12px; flex-wrap:wrap;
        flex-shrink:0;
      }
      .editor-save-pager[hidden] { display:none !important; }
      .editor-save-row {
        display:grid;
        grid-template-columns:72px 1fr;
        gap:10px;
        align-items:center;
        padding:8px;
        border:1px solid rgba(201,162,39,.35);
        border-radius:8px;
        background:rgba(255,255,255,.04);
        cursor:pointer;
      }
      .editor-save-row.selected {
        border-color:#4be396;
        box-shadow:inset 0 0 0 1px rgba(75,227,150,.25);
      }
      .editor-save-row img {
        width:72px;
        height:44px;
        object-fit:cover;
        border-radius:6px;
        border:1px solid #000;
      }
      .editor-save-name { font-weight:800; color:#fff; font-size:13px; }
      .editor-save-meta { font-size:11px; color:#93a8b9; }
      .editor-save-new-row {
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        align-items:center;
        margin-bottom:12px;
      }
      .editor-save-new-row input {
        flex:1;
        min-width:160px;
        background:#1a3348;
        color:#fff;
        border:1px solid rgba(139,173,192,.55);
        border-radius:6px;
        padding:8px 10px;
        font-size:13px;
      }
      .editor-save-actions {
        display:flex;
        flex-wrap:wrap;
        gap:10px;
        justify-content:flex-end;
      }
      .editor-gen-tab {
        background:rgba(30,48,66,.9); color:#b8c9d9; border:1px solid rgba(120,150,175,.45);
        border-radius:8px 8px 0 0; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer;
      }
      .editor-gen-tab:hover { filter:brightness(1.08); }
      .editor-gen-tab.active {
        background:rgba(18,32,48,.98); color:#f4e4a6; border-bottom-color:transparent; margin-bottom:-1px;
      }
      .editor-gen-panel {
        padding:10px 16px 12px; display:flex; flex-wrap:wrap; gap:14px; align-items:center;
        border-top:1px solid rgba(201,162,39,.22);
      }
      .editor-gen-hint { font-size:11px; color:#7a92a8; flex:1 1 200px; line-height:1.35; min-width:160px; }
      .editor-gen-shape { display:flex; align-items:flex-start; gap:8px; flex-wrap:wrap; }
      .editor-gen-shape > span { font-size:10px; color:#9db3c7; text-transform:uppercase; letter-spacing:.1em; font-weight:800; flex:0 0 100%; }
      .editor-shape-btns { display:flex; flex-wrap:wrap; gap:5px; }
      .editor-shape-btns .editor-seg-btn { flex:1 1 auto; min-width:72px; font-size:11px; padding:6px 8px; }
      .editor-seg-btn {
        background:#1a3348; color:#dbe8f5; border:1px solid rgba(139,173,192,.5); border-radius:7px;
        padding:7px 12px; font-size:12px; font-weight:700; cursor:pointer;
      }
      .editor-seg-btn:hover { filter:brightness(1.08); }
      .editor-seg-btn.active { background:linear-gradient(180deg,#1f7a4a,#26975a); border-color:#4be396; color:#061208; }
      .editor-gen-tgl { display:flex; align-items:center; gap:7px; font-size:12px; color:#cfdce8; cursor:pointer; user-select:none; }
      .editor-gen-tgl input { width:16px; height:16px; accent-color:#4be396; cursor:pointer; }
      .editor-toolbar {
        grid-column:1/-1;grid-row:1;display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:12px 16px;
        background:linear-gradient(180deg,#122433,#0f1e2e);border-bottom:2px solid #c9a227;
        box-shadow:0 2px 14px rgba(0,0,0,.35);
      }
      .editor-toolbar h1{margin:0;font-size:1.05rem;font-weight:800;color:#f4e4a6;letter-spacing:.02em}
      .editor-toolbar-hint{font-size:12px;color:#9db3c7;flex:1;min-width:180px;line-height:1.35}
      .editor-toolbar .editor-btn-main{margin-left:auto;padding:10px 18px;font-size:13px;border-width:2px}
      .editor-panel {
        background:rgba(12,22,34,.96);border-right:1px solid rgba(201,162,39,.35);
        padding:12px 14px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;
      }
      .editor-right { border-right:none;border-left:1px solid rgba(201,162,39,.35); }
      .editor-card {
        background:rgba(255,255,255,.03);border:1px solid rgba(120,150,175,.35);
        border-radius:10px;padding:11px 12px;
      }
      .editor-card h3 { margin:0 0 10px;font-size:.72rem;text-transform:uppercase;letter-spacing:.12em;color:#c9dcf0;font-weight:800 }
      .editor-faction-chart-wrap {
        margin-top:6px;font-size:12px;color:#dbe8f5;
        overflow-x:auto;max-width:100%;
      }
      .editor-faction-chart {
        width:100%;border-collapse:collapse;font-size:11px;line-height:1.25;
      }
      .editor-faction-chart th,
      .editor-faction-chart td {
        padding:5px 4px;text-align:right;border-bottom:1px solid rgba(120,150,175,.25);
      }
      .editor-faction-chart th:first-child,.editor-faction-chart td:first-child { text-align:left; }
      .editor-faction-chart th { font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#8aa4b8;font-weight:800 }
      .editor-faction-chart .efc-dot {
        display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;
        vertical-align:middle;border:1px solid rgba(0,0,0,.3);
      }
      .editor-economy-hint {
        margin:8px 0 0;font-size:11px;color:#8aa4b8;line-height:1.35;
      }
      .editor-row { display:flex; gap:10px; align-items:center; margin:7px 0; }
      .editor-row label { flex:0 0 42%; color:#cfdce8; font-size:13px;line-height:1.25 }
      .editor-row input,.editor-row select { flex:1; min-width:0; background:#1a3348; color:#fff;
        border:1px solid rgba(139,173,192,.55); border-radius:6px; padding:8px;font-size:13px;}
      .editor-faction-owner-wrap {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .editor-faction-swatch {
        flex: 0 0 28px;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        border: 1px solid rgba(0,0,0,.28);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.12);
      }
      .editor-btn {
        background:linear-gradient(180deg,#273d54,#203446);color:#ecf4fa;border:1px solid rgba(155,174,188,.55);
        border-radius:8px;padding:10px 12px;cursor:pointer;font-weight:700;font-size:12px;text-align:center;
      }
      .editor-btn:hover { filter:brightness(1.07);border-color:rgba(231,227,173,.85); }
      .editor-btn.active { background:linear-gradient(180deg,#1f7a4a,#26975a);border-color:#4be396;color:#061208;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12); }
      .editor-tools-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .editor-territory-inline {
        grid-column: 1 / -1;
        display: flex;
        gap: 8px;
        align-items: stretch;
      }
      .editor-territory-inline > .editor-btn { flex: 1; min-width: 0; }
      .editor-terr-owner-wrap {
        flex: 0 0 min(148px, 42%);
        max-width: 48%;
        display: none;
        align-items: center;
        gap: 6px;
      }
      .editor-territory-owner-select {
        flex: 1;
        min-width: 0;
        background: #1a3348;
        color: #fff;
        border: 1px solid rgba(139,173,192,.55);
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }
      .editor-grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .editor-brush-inner {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .editor-brush-row { touch-action: manipulation; }
      .editor-brush-row input[type="range"] {
        flex: 1;
        min-width: 40px;
        width: 100%;
        height: 28px;
        accent-color: #4be396;
      }
      .editor-brush-presets {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
      }
      .editor-brush-presets span {
        flex: 0 0 100%;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #8aa4b8;
        text-align: center;
      }
      .editor-brush-circle {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
        border: 2px solid rgba(155,174,188,.65);
        background: linear-gradient(180deg,#273d54,#203446);
        color: #ecf4fa;
        flex-shrink: 0;
      }
      .editor-brush-circle:hover { filter: brightness(1.08); border-color: rgba(231,227,173,.85); }
      .editor-brush-circle.active {
        background: linear-gradient(180deg,#1f7a4a,#26975a);
        border-color: #4be396;
        color: #061208;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.12);
      }
      .editor-faction-inline {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .editor-sel-faction-swatch {
        flex-shrink: 0;
      }
      .editor-sel-faction {
        flex: 1;
        min-width: 0;
        background: #1a3348;
        color: #fff;
        border: 1px solid rgba(139,173,192,.55);
        border-radius: 6px;
        padding: 8px;
        font-size: 13px;
        font-weight: 700;
      }
      .palette-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; }
      .palette-btn { text-align:left;font-size:11px;display:flex;align-items:center;gap:8px;padding:10px;}
      #editorCanvasWrap { position:relative; overflow:hidden; background:#154360;display:flex;
        flex-direction:column;min-height:0;border-left:1px solid rgba(0,0,0,.35);border-right:1px solid rgba(0,0,0,.35); }
      #editorCanvas { width:100%; height:100%; display:block; cursor:crosshair; flex:1; touch-action:none; }
      .editor-drop-overlay-hint{
        pointer-events:none;position:absolute;left:50%;bottom:14px;transform:translateX(-50%);
        background:rgba(10,22,34,.82);border:1px solid rgba(201,162,39,.55);padding:8px 14px;border-radius:8px;font-size:12px;color:#dbe8f5;
      }
      .editor-swatch { width:16px;height:16px;border:1px solid #061018;border-radius:4px;display:inline-block;flex-shrink:0; }
      .editor-hint { color:#93a8b9; font-size:12px; line-height:1.45;margin:6px 0 0;font-weight:400; }
      .map-browser-stack { display:flex; flex-direction:column; gap:10px; }
      .map-browser {
        display:grid; gap:8px;
        min-height:min(240px, 42vh);
        overflow:visible;
        padding-right:2px;
      }
      .map-browser-pager {
        display:flex; align-items:center; justify-content:center; gap:10px; margin-top:2px; flex-wrap:wrap;
        flex-shrink:0;
      }
      .map-browser-pager[hidden] { display:none !important; }
      .map-browser-page-label { font-size:12px; color:#9db3c7; min-width:120px; text-align:center; font-weight:700; }
      .map-browser-page-btn { padding:6px 14px; min-width:44px; }
      .map-card { display:grid; grid-template-columns:72px 1fr auto; gap:8px; align-items:center;
        padding:8px;border:1px solid rgba(201,162,39,.4);border-radius:8px;background:rgba(255,255,255,.04);cursor:pointer; }
      .map-card-del { font-size:10px;padding:4px 8px;min-width:0;line-height:1.2;flex-shrink:0;
        background:rgba(120,40,40,.85);border:1px solid rgba(255,120,120,.5);color:#ffecec;border-radius:6px;cursor:pointer;font-weight:700; }
      .map-card-del:hover { filter:brightness(1.12); }
      .map-card:hover { border-color:#4be396; background:rgba(75,227,150,.08); }
      .map-thumb { width:72px;height:48px;background:#154360;border-radius:5px;border:1px solid #000;object-fit:cover; }
      .map-name { font-weight:800;color:#fff;font-size:13px;}
      .map-meta { font-size:11px;color:#93a8b9; }
      .editor-key-row { display:flex;align-items:center;gap:8px;margin:5px 0;color:#cfdce8;font-size:12px;text-transform:capitalize; }
      .editor-unit-palette { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px; }
      .unit-chip {
        display:flex;flex-direction:column;align-items:center;justify-content:flex-start;
        gap:8px;padding:10px 6px 12px;border-radius:12px;
        border:2px solid rgba(230,237,246,.85); background:rgba(17,37,53,.92);
        box-shadow:0 2px 0 rgba(6,14,22,.85), inset 0 0 0 1px rgba(255,255,255,.06);
        cursor:grab;font-size:11px;font-weight:700;color:#ecf4fa;user-select:none;
        outline:2px solid var(--chip-faction, #2ecc71); outline-offset:-2px;
      }
      .unit-chip:active { cursor:grabbing; }
      .unit-chip.dragging { opacity:.65; }
      .unit-chip-canvas { display:block; border-radius:50%; background:rgba(0,0,0,.25); }
      .unit-chip-meta { display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center; }
      .unit-chip-title { font-size:12px;font-weight:800; }
      .unit-chip-sub { font-size:10px;font-weight:600;color:#8aa4b8;text-transform:uppercase;letter-spacing:.04em; }
      .editor-btn-main { background:linear-gradient(180deg,#5b4320,#3d2b12);border-color:#d4af37;color:#fff6d4;font-weight:800; }
      .editor-btn-main:hover { filter:brightness(1.12); }
      .editor-toolbar-hint-touch, .editor-overlay-hint-touch { display: none; }
      @media (pointer: coarse) {
        .editor-toolbar-hint-desktop, .editor-overlay-hint-desktop { display: none; }
        .editor-toolbar-hint-touch { display: block; }
        .editor-overlay-hint-touch { display: block; }
      }
      @media (max-width:1100px) {
        #mapEditorApp.visible {
          grid-template-columns:1fr;
          grid-template-rows:auto auto minmax(200px,32vh) minmax(280px,1fr) minmax(200px,30vh);
        }
        .editor-gen-wrap { grid-row: 2; }
        .editor-panel { max-height:none; border-right:none;border-bottom:1px solid rgba(201,162,39,.25); }
        .editor-right { border-left:none;border-top:1px solid rgba(201,162,39,.25); max-height:none; }
        #editorCanvasWrap { min-height:280px; }
      }
    `;
    document.head.appendChild(style);

    const app = document.createElement("div");
    app.id = "mapEditorApp";
    app.innerHTML = `
      <header class="editor-toolbar">
        <h1>Map editor</h1>
        <p class="editor-toolbar-hint editor-toolbar-hint-desktop">Paint terrain and ownership, place towns and units. <strong>Left-drag</strong> to paint; use <strong>Select</strong> then <strong>Move</strong> to reposition. <strong>Mouse wheel</strong> zooms. <strong>Middle-click drag</strong> pans the view. Drag unit chips from the palette onto the map (ships need water).</p>
        <p class="editor-toolbar-hint editor-toolbar-hint-touch">Paint terrain and ownership, place towns and units. Drag unit chips onto the map — ships need water. Use <strong>Select</strong> then <strong>Move</strong> to reposition. <strong>Two fingers</strong> on the canvas pan and pinch-zoom.</p>
        <button type="button" class="editor-btn editor-btn-main" id="editorExitBtn">← Main menu</button>
      </header>
      <div class="editor-gen-wrap">
        <div class="editor-gen-head">
          <div class="editor-gen-tabs">
            <button type="button" class="editor-gen-tab active" data-gen-tab="generate">Generate</button>
            <button type="button" class="editor-gen-tab" data-gen-tab="files">Import / export JSON</button>
          </div>
          <div class="editor-gen-undo">
            <button type="button" class="editor-btn" id="editorUndoBtn" disabled title="Undo (Ctrl+Z)">Undo</button>
            <button type="button" class="editor-btn" id="editorRedoBtn" disabled title="Redo (Ctrl+Shift+Z / Ctrl+Y)">Redo</button>
          </div>
        </div>
        <div id="editorGenPanelGenerate" class="editor-gen-panel" data-gen-panel="generate">
          <div class="editor-gen-shape">
            <span>Shape</span>
            <div class="editor-shape-btns">
            <button type="button" class="editor-seg-btn active" data-ed-shape="island">Island</button>
            <button type="button" class="editor-seg-btn" data-ed-shape="rectangle">Rectangle</button>
            <button type="button" class="editor-seg-btn" data-ed-shape="ring">Ring</button>
            <button type="button" class="editor-seg-btn" data-ed-shape="archipelago">Archipelago</button>
            <button type="button" class="editor-seg-btn" data-ed-shape="forest">Forest</button>
            <button type="button" class="editor-seg-btn" data-ed-shape="mountain">Mountain</button>
            <button type="button" class="editor-seg-btn" data-ed-shape="desert">Desert</button>
            </div>
          </div>

          <label class="editor-gen-tgl"><input type="checkbox" id="editorGenCities" checked /> Cities during gen</label>
          <label class="editor-gen-tgl"><input type="checkbox" id="editorGenTerritory" checked /> Territory during gen</label>
          <label class="editor-gen-tgl"><input type="checkbox" id="editorGenUnits" checked /> Units during gen</label>
          <p class="editor-gen-hint">Territory and units apply when cities are on. Use <strong>Random gen</strong> in the left panel to run with these settings.</p>
        </div>
        <div id="editorGenPanelFiles" class="editor-gen-panel" data-gen-panel="files" style="display:none">
          <button type="button" class="editor-btn" id="editorExportJson">Export map JSON</button>
          <button type="button" class="editor-btn" id="editorImportJsonBtn">Import map JSON…</button>
          <input type="file" id="editorImportJsonFile" accept=".json,application/json" style="display:none" />
          <p class="editor-gen-hint">JSON includes terrain, towns, roads, units, size, and shape. Import replaces the current editor map.</p>
        </div>
      </div>
      <div class="editor-panel editor-left">
        <section class="editor-card">
          <h3>Map &amp; files</h3>
          <div class="editor-row"><label>Hex radius</label><select id="editorSize"><option value="40">Small</option><option value="60" selected>Medium</option><option value="80">Large</option></select></div>
          <div class="editor-row"><label>Time period</label><select id="editorMapPeriod"><option value="modern" selected>Modern (NATO)</option><option value="napoleonic">Napoleonic</option><option value="medieval">Medieval</option><option value="ancient">Ancient</option></select></div>
          <div class="editor-grid-2">
            <button type="button" class="editor-btn" id="editorBlank">New blank</button>
            <button type="button" class="editor-btn" id="editorRandom">Random gen</button>
            <button type="button" class="editor-btn" id="editorSave">Save to library…</button>
            <button type="button" class="editor-btn" id="editorBrowseLib">Browse library…</button>
          </div>
        </section>
        <section class="editor-card">
          <h3>Terrain paint</h3>
          <div class="editor-row"><label>Brush type</label><select id="editorTerrain"></select></div>
          <div id="editorPalette" class="palette-grid"></div>
          <p class="editor-hint">Quick-pick swatches switch to Paint terrain. Brush scales 1–5: single hex, then each ring preset adds one full hex ring. Use the slider or numbered circles.</p>
          <div class="editor-row editor-brush-row">
            <label for="editorBrushSize">Brush scale</label>
            <div class="editor-brush-inner">
              <input type="range" id="editorBrushSize" min="1" max="5" step="1" value="1" aria-valuetext="brush scale" />
            </div>
          </div>
          <div class="editor-brush-presets">
            <span>Ring presets</span>
            <button type="button" class="editor-brush-circle active" data-brush-scale="1" title="Single hex">1</button>
            <button type="button" class="editor-brush-circle" data-brush-scale="2" title="+1 hex ring">2</button>
            <button type="button" class="editor-brush-circle" data-brush-scale="3" title="+2 hex rings">3</button>
            <button type="button" class="editor-brush-circle" data-brush-scale="4" title="+3 hex rings">4</button>
            <button type="button" class="editor-brush-circle" data-brush-scale="5" title="+4 hex rings">5</button>
          </div>
        </section>
        <section class="editor-card">
          <h3>Tools</h3>
          <div class="editor-tools-grid">
            <button type="button" class="editor-btn active" data-tool="paint">Paint terrain</button>
            <button type="button" class="editor-btn" data-tool="select">Select</button>
            <button type="button" class="editor-btn" data-tool="move">Move</button>
            <button type="button" class="editor-btn" data-tool="city">Place town</button>
            <div class="editor-territory-inline">
              <button type="button" class="editor-btn" data-tool="territory">Paint territory</button>
              <div class="editor-terr-owner-wrap" id="editorTerritoryOwnerWrap" hidden aria-hidden="true">
                <span id="editorTerritoryOwnerSwatch" class="editor-faction-swatch" aria-hidden="true"></span>
                <select id="editorTerritoryOwner" class="editor-territory-owner-select" aria-label="Faction for territory paint"></select>
              </div>
            </div>
            <button type="button" class="editor-btn" data-tool="unit">Click unit</button>
            <button type="button" class="editor-btn" data-tool="factory">Add factory</button>
            <button type="button" class="editor-btn" data-tool="harbor">Add harbor</button>
            <button type="button" class="editor-btn" data-tool="fort">Place fort</button>
            <button type="button" class="editor-btn" data-tool="erase">Erase terrain</button>
          </div>
        </section>
        <section class="editor-card">
          <h3>Faction &amp; units</h3>
          <div class="editor-row"><label>Active faction</label>
            <div class="editor-faction-owner-wrap">
              <span id="editorOwnerSwatch" class="editor-faction-swatch" aria-hidden="true"></span>
              <select id="editorOwner" class="editor-owner-select"></select>
            </div>
          </div>
          <button type="button" class="editor-btn" id="editorAddFaction" style="width:100%;margin-top:4px">+ Add AI faction slot</button>
          <p class="editor-hint">Towns and “Click unit” use this faction. Territory paint uses the player dropdown beside <strong>Paint territory</strong>. Drag chips below — owner matches Active faction.</p>
          <div id="editorUnitPalette" class="editor-unit-palette"></div>
        </section>
        <section class="editor-card">
          <h3>View layers</h3>
          <p class="editor-hint" style="margin-top:0">Same toggles as in-game HUD (Terrain = full color vs white-map; roads appear with Cities).</p>
          <div class="editor-grid-2">
            <button type="button" class="editor-btn active" data-gl="terrain" title="Full-color terrain vs simplified map">Terrain</button>
            <button type="button" class="editor-btn active" data-gl="diplomacy">Diplomacy</button>
            <button type="button" class="editor-btn active" data-gl="territory">Territory</button>
            <button type="button" class="editor-btn active" data-gl="cities">Cities</button>
            <button type="button" class="editor-btn active" data-gl="cityNames">City names</button>
            <button type="button" class="editor-btn active" data-gl="units">Units</button>
          </div>
        </section>
        <section class="editor-card">
          <h3>Legend</h3>
          <div id="editorMapKey"></div>
        </section>
      </div>
      <div id="editorCanvasWrap">
        <canvas id="editorCanvas"></canvas>
        <div class="editor-drop-overlay-hint editor-overlay-hint-desktop">Drop unit chips · wheel = zoom · middle-drag = pan</div>
        <div class="editor-drop-overlay-hint editor-overlay-hint-touch">Drop unit chips · 2 fingers = pan / zoom</div>
      </div>
      <div class="editor-panel editor-right">
        <section class="editor-card">
          <h3>Selection</h3>
          <div id="editorSelection" class="editor-hint" style="margin:0">Nothing selected. <strong>Select</strong> clicks units/towns; <strong>drag a box</strong> on empty map (Select/Move) to grab several units; <strong>Move</strong> repositions.</div>
        </section>
        <section class="editor-card">
          <h3>Faction start (saved map)</h3>
          <p class="editor-hint" style="margin-top:0">Starting cash and manpower for each slot when playing this exported map.</p>
          <div class="editor-row"><label>Faction slot</label>
            <select id="editorEconomyFaction" class="editor-economy-faction-select" aria-label="Faction economy slot"></select>
          </div>
          <div class="editor-row"><label>Color</label>
            <input type="color" id="editorEconomyColor" value="#2ecc71" />
          </div>
          <div class="editor-row"><label title="Faction 1 = human player treasury">Cash</label>
            <input type="number" id="editorEconomyCash" min="0" step="250" />
          </div>
          <div class="editor-row"><label title="Faction 1 = human manpower pool">Manpower</label>
            <input type="number" id="editorEconomyMp" min="0" step="500" />
          </div>
          <p id="editorEconomySlotHint" class="editor-economy-hint">Faction 1 mirrors in-game player resources; AI use the per-slot pools.</p>
        </section>
        <section class="editor-card">
          <h3>Balance preview</h3>
          <p class="editor-hint" style="margin-top:0">Live cash income (territory + towns) vs troop manpower. Updates while you edit.</p>
          <div id="editorFactionChartWrap" class="editor-faction-chart-wrap">
            <div id="editorFactionChart" class="editor-hint" style="margin:0"></div>
          </div>
        </section>
      </div>
      <div id="editorSaveOverlay" class="editor-save-overlay hidden" aria-hidden="true">
        <div class="editor-save-dialog">
          <h3>Save to library</h3>
          <p class="editor-hint" style="margin:0 0 8px">Select a map to overwrite its data, or enter a new name. Saved in this browser only.</p>
          <div id="editorSaveList" class="editor-save-list"></div>
          <div class="editor-save-pager" id="editorSavePager" hidden>
            <button type="button" class="editor-btn map-browser-page-btn" id="editorSavePagePrev" aria-label="Previous page">←</button>
            <span id="editorSavePageLabel" class="map-browser-page-label"></span>
            <button type="button" class="editor-btn map-browser-page-btn" id="editorSavePageNext" aria-label="Next page">→</button>
          </div>
          <div class="editor-save-new-row">
            <input type="text" id="editorSaveNewName" placeholder="New map name" maxlength="96" />
            <button type="button" class="editor-btn" id="editorSaveAsNewBtn">Save as new</button>
          </div>
          <div class="editor-save-actions">
            <button type="button" class="editor-btn" id="editorSaveOverwriteBtn" disabled>Overwrite selected</button>
            <button type="button" class="editor-btn" id="editorSaveCancelBtn">Cancel</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(app);
    const editorSaveOv = document.getElementById("editorSaveOverlay");
    if (editorSaveOv && editorSaveOv.parentElement !== document.body) {
      document.body.appendChild(editorSaveOv);
    }

    const terrainSelect = app.querySelector("#editorTerrain");
    terrainSelect.innerHTML = terrainTypes.map(t => `<option value="${t}">${t.replace("_", " ")}</option>`).join("");
    app.querySelector("#editorPalette").innerHTML = terrainTypes.map(t => `<button type="button" class="editor-btn palette-btn" data-terrain="${t}"><span class="editor-swatch" style="background:${WOD.getTerrainColor(t)}"></span>${t.replace("_", " ")}</button>`).join("");
    app.querySelector("#editorMapKey").innerHTML = terrainTypes.map(t => `<div class="editor-key-row"><span class="editor-swatch" style="background:${WOD.getTerrainColor(t)}"></span>${t.replace("_", " ")}</div>`).join("");

    app.querySelectorAll("[data-tool]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.tool = btn.dataset.tool;
        app.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("active", b === btn));
        syncTerritoryOwnerUi();
        scheduleEditorRender();
      });
    });
    app.querySelector("#editorTerrain").addEventListener("change", e => { state.terrain = e.target.value; });
    app.querySelectorAll("[data-terrain]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.terrain = btn.dataset.terrain;
        terrainSelect.value = state.terrain;
        state.tool = "paint";
        app.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("active", b.dataset.tool === "paint"));
        syncTerritoryOwnerUi();
      });
    });
    app.querySelectorAll("[data-gl]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!window.WOD || typeof WOD.toggleGameplayLayer !== "function") return;
        WOD.toggleGameplayLayer(btn.dataset.gl);
        refreshEditorGameplayLayerButtons();
        state.editorTerrainDirty = true;
        scheduleEditorRender();
      });
    });

    rebuildOwnerSelect();

    wireFactionEconomyPanel(app);

    wireMapBrowserPager();

    const brushEl = app.querySelector("#editorBrushSize");
    if (brushEl) {
      const syncFromBrushDom = () => {
        state.brushSize = Math.max(1, Math.min(EDITOR_BRUSH_SCALE_MAX, parseInt(brushEl.value, 10) || 1));
        syncBrushScaleControls(app);
      };
      brushEl.addEventListener("input", syncFromBrushDom);
      brushEl.addEventListener("change", syncFromBrushDom);
    }
    app.querySelectorAll("[data-brush-scale]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.brushSize = parseInt(btn.dataset.brushScale, 10) || 1;
        syncBrushScaleControls(app);
      });
    });
    syncBrushScaleControls(app);

    const undoB = document.getElementById("editorUndoBtn");
    const redoB = document.getElementById("editorRedoBtn");
    if (undoB) undoB.addEventListener("click", () => editorUndo());
    if (redoB) redoB.addEventListener("click", () => editorRedo());

    document.getElementById("editorAddFaction").addEventListener("click", () => {
      if (state.maxFactionSlots < editorMaxPlayerSlots()) {
        state.maxFactionSlots++;
        rebuildOwnerSelect();
        rebuildUnitPalette();
      }
    });

    app.querySelector("#editorBlank").addEventListener("click", () => {
      WOD.makeBlankMap(parseInt(app.querySelector("#editorSize").value, 10));
      syncEditorTerritoryOverlayDefault();
      syncMaxFactionSlotsFromGameData();
      rebuildOwnerSelect();
      rebuildUnitPalette();
      state.selected = null;
      state.viewPanX = 0;
      state.viewPanY = 0;
      state.viewZoom = 1;
      markEditorMapChanged();
      scheduleEditorRender();
      renderSelection();
      renderMapBrowser();
      if (state.open) editorInitHistory();
    });
    const editorMapPeriod = app.querySelector("#editorMapPeriod");
    const refreshEditorMapKey = () => {
      const mk = app.querySelector("#editorMapKey");
      if (!mk || !WOD || typeof WOD.getTerrainColor !== "function") return;
      mk.innerHTML = terrainTypes
        .map(
          (t) =>
            `<div class="editor-key-row"><span class="editor-swatch" style="background:${WOD.getTerrainColor(t)}"></span>${t.replace("_", " ")}</div>`
        )
        .join("");
    };
    if (editorMapPeriod && window.WOD) {
      editorMapPeriod.addEventListener("change", () => {
        if (typeof WOD.wodApplyGamePeriod === "function") {
          WOD.wodApplyGamePeriod(editorMapPeriod.value, { saveProfile: true, allowAnyPeriod: true });
        }
        refreshEditorMapKey();
      });
      if (typeof WOD.wodRebuildEditorPeriodSelectEl === "function") {
        WOD.wodRebuildEditorPeriodSelectEl(editorMapPeriod);
      } else if (WOD.gameData && WOD.gameData.gamePeriod) {
        editorMapPeriod.value = WOD.gameData.gamePeriod;
      }
    }
    app.querySelector("#editorRandom").addEventListener("click", async () => {
      const edPer = app.querySelector("#editorMapPeriod");
      if (edPer && window.WOD && typeof WOD.wodApplyGamePeriod === "function") {
        WOD.wodApplyGamePeriod(edPer.value, { saveProfile: true, allowAnyPeriod: true });
      }
      document.getElementById("setupMapSize").value = app.querySelector("#editorSize").value;
      WOD.gameData.mapRadius = parseInt(app.querySelector("#editorSize").value, 10);
      WOD.gameData.aiCount = Math.max(1, state.maxFactionSlots - 1);
      WOD.gameData._mapGenOptions = {
        mapShape: state.genShape,
        cities: state.genCities,
        territory: state.genTerritory,
        units: state.genUnits,
      };
      try {
        await WOD.generateMap();
      } catch (e) {
        console.warn(e);
      }
      syncEditorTerritoryOverlayDefault();
      syncMaxFactionSlotsFromGameData();
      rebuildOwnerSelect();
      rebuildUnitPalette();
      state.selected = null;
      state.viewPanX = 0;
      state.viewPanY = 0;
      state.viewZoom = 1;
      markEditorMapChanged();
      scheduleEditorRender();
      renderSelection();
      renderMapBrowser();
      if (state.open) editorInitHistory();
    });
    app.querySelector("#editorSave").addEventListener("click", saveEditorMap);
    let browseLib = app.querySelector("#editorBrowseLib");
    if(browseLib) browseLib.addEventListener("click", () => {
      if (typeof showPanel === "function") showPanel("mapLibrary", { libContext: "editor", returnTo: "editor" });
    });
    app.querySelector("#editorExitBtn").addEventListener("click", closeMapEditor);

    const canvas = app.querySelector("#editorCanvas");
    const wrap = app.querySelector("#editorCanvasWrap");
    canvas.addEventListener("pointerdown", editorPointerDown);
    canvas.addEventListener("pointermove", editorPointerMove);
    canvas.addEventListener("pointerup", editorPointerUp);
    canvas.addEventListener("pointercancel", editorPointerUp);
    wrap.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
    wrap.addEventListener("drop", onCanvasDrop);
    wrap.addEventListener(
      "wheel",
      (e) => {
        if (!state.open) return;
        e.preventDefault();
        const canvas = document.getElementById("editorCanvas");
        if (!canvas) return;
        const z = Math.exp(-e.deltaY * 0.0012);
        state.viewZoom = Math.max(0.35, Math.min(3.2, state.viewZoom * z));
        clampEditorView();
        scheduleEditorRender();
      },
      { passive: false },
    );

    window.addEventListener("resize", resizeEditorCanvas);

    wireEditorGenerateStrip(app);
    rebuildUnitPalette();
    wireEditorSaveDialog();
  }

  function openMapEditor() {
    ensureEditorDom();
    if (window.WOD && typeof WOD.pauseMenuBackgroundBattle === "function") WOD.pauseMenuBackgroundBattle();
    document.getElementById("mainMenu").classList.add("hidden");
    document.querySelectorAll(".overlay:not(#mainMenu)").forEach(p => p.classList.add("hidden"));
    const app = document.getElementById("mapEditorApp");
    app.classList.add("visible");
    state.open = true;
    state.owner = 1;
    state.viewPanX = 0;
    state.viewPanY = 0;
    state.viewZoom = 1;
    state.viewPanDrag = null;
    editorPtrs.clear();
    editorPinch = null;
    state.genShape = "island";
    state.genCities = true;
    state.genTerritory = true;
    state.genUnits = true;
    state.territoryPaintOwner = state.owner;
    state.brushSize = 1;
    const brushReset = document.getElementById("editorBrushSize");
    if (brushReset) brushReset.value = "1";
    syncBrushScaleControls(document.getElementById("mapEditorApp"));
    syncTerritoryOwnerUi();
    const genApp = document.getElementById("mapEditorApp");
    if (genApp) {
      genApp.querySelectorAll("[data-ed-shape]").forEach(b => b.classList.toggle("active", b.dataset.edShape === "island"));
      const gC = genApp.querySelector("#editorGenCities");
      const gT = genApp.querySelector("#editorGenTerritory");
      const gU = genApp.querySelector("#editorGenUnits");
      if (gC) gC.checked = true;
      if (gT) {
        gT.checked = true;
        gT.disabled = false;
      }
      if (gU) {
        gU.checked = true;
        gU.disabled = false;
      }
      genApp.querySelectorAll("[data-gen-tab]").forEach(b => b.classList.toggle("active", b.dataset.genTab === "generate"));
      genApp.querySelectorAll("[data-gen-panel]").forEach(p => {
        p.style.display = p.dataset.genPanel === "generate" ? "flex" : "none";
      });
    }
    WOD.makeBlankMap(parseInt(document.getElementById("editorSize").value, 10));
    syncEditorTerritoryOverlayDefault();
    syncMaxFactionSlotsFromGameData();
    state.selected = null;
    state.cityUnitStackTap = null;
    state.editorMarquee = null;
    state.cityMoveAttachedHexRefs = null;
    state.cityMoveGhostAnchor = null;
    state.editorTerrainDirty = true;
    rebuildOwnerSelect();
    rebuildUnitPalette();
    refreshEditorGameplayLayerButtons();
    resizeEditorCanvas();
    renderSelection();
    renderMapBrowser();
    editorInitHistory();
    if (!state._editorKeyHandler) {
      state._editorKeyHandler = (ev) => {
        if (!state.open) return;
        const el = ev.target;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable))
          return;
        const k = ev.key;
        if (ev.ctrlKey && !ev.shiftKey && (k === "z" || k === "Z")) {
          ev.preventDefault();
          editorUndo();
        } else if (ev.ctrlKey && (k === "y" || k === "Y")) {
          ev.preventDefault();
          editorRedo();
        } else if (ev.ctrlKey && ev.shiftKey && (k === "z" || k === "Z")) {
          ev.preventDefault();
          editorRedo();
        }
      };
      document.addEventListener("keydown", state._editorKeyHandler);
    }
  }

  function closeMapEditor() {
    if (editorFrame != null) {
      cancelAnimationFrame(editorFrame);
      editorFrame = null;
    }
    const app = document.getElementById("mapEditorApp");
    if (app) app.classList.remove("visible");
    state.open = false;
    hideEditorSaveDialog();
    state.editorMarquee = null;
    state.cityMoveAttachedHexRefs = null;
    state.cityMoveGhostAnchor = null;
    if (state._editorKeyHandler) {
      document.removeEventListener("keydown", state._editorKeyHandler);
      state._editorKeyHandler = null;
    }
    state.territoryPainting = false;
    state.viewPanDrag = null;
    editorPtrs.clear();
    editorPinch = null;
    document.getElementById("mainMenu").classList.remove("hidden");
    WOD.invalidateTerrain();
    if (window.WOD && typeof WOD.resumeMenuBackgroundBattle === "function") WOD.resumeMenuBackgroundBattle();
    else if (window.WOD && typeof WOD.bootstrapMenuBackgroundBattle === "function") WOD.bootstrapMenuBackgroundBattle();
  }

  function resizeEditorCanvas() {
    const canvas = document.getElementById("editorCanvas");
    if (!canvas) return;
    if (!state.open) return;
    canvas.width = canvas.clientWidth || 800;
    canvas.height = canvas.clientHeight || 600;
    state.editorTerrainDirty = true;
    renderEditor();
  }

  function getEditorBaseScale(canvas) {
    const b = bounds();
    return Math.min(canvas.width / Math.max(1, b.w), canvas.height / Math.max(1, b.h)) * 0.92;
  }

  function clampEditorView() {
    const b = bounds();
    const lim = Math.max(b.w, b.h) * 0.52;
    state.viewPanX = Math.max(-lim, Math.min(lim, state.viewPanX));
    state.viewPanY = Math.max(-lim, Math.min(lim, state.viewPanY));
    state.viewZoom = Math.max(0.35, Math.min(3.2, state.viewZoom));
  }

  function editorPointerDown(e) {
    if (!state.open) return;
    const canvas = document.getElementById("editorCanvas");
    if (e.target !== canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) { /* ignore */ }
    editorPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (editorPtrs.size === 2) {
      if (state.dragging) {
        state.cityMoveGhostAnchor = null;
        state.cityMoveAttachedHexRefs = null;
        state.editorMarquee = null;
        onEditorUp();
      }
      const pts = [...editorPtrs.values()];
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const dist = Math.max(28, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      editorPinch = { lastDist: dist, lastMidX: midX, lastMidY: midY };
      e.preventDefault();
      return;
    }
    editorPinch = null;
    onEditorDown(e);
  }

  function editorPointerMove(e) {
    if (!state.open) return;
    if (editorPtrs.has(e.pointerId))
      editorPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const canvas = document.getElementById("editorCanvas");
    if (editorPtrs.size >= 2 && editorPinch && canvas) {
      const pts = [...editorPtrs.values()];
      if (pts.length < 2) return;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const dist = Math.max(28, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      const base = getEditorBaseScale(canvas);
      const oldZ = state.viewZoom;
      const newZ = Math.max(0.35, Math.min(3.2, oldZ * (dist / editorPinch.lastDist)));
      const s = base * oldZ;
      state.viewPanX += (editorPinch.lastMidX - midX) / s;
      state.viewPanY += (editorPinch.lastMidY - midY) / s;
      state.viewZoom = newZ;
      clampEditorView();
      editorPinch.lastDist = dist;
      editorPinch.lastMidX = midX;
      editorPinch.lastMidY = midY;
      scheduleEditorRender();
      e.preventDefault();
      return;
    }
    if (editorPtrs.size === 1 && !editorPinch)
      onEditorMove(e);
  }

  function editorPointerUp(e) {
    editorPtrs.delete(e.pointerId);
    if (editorPtrs.size < 2) editorPinch = null;
    if (editorPtrs.size === 0) onEditorUp();
  }

  function editorWorldPos(event) {
    const canvas = document.getElementById("editorCanvas");
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const b = bounds();
    const vc = { cx: b.cx + state.viewPanX, cy: b.cy + state.viewPanY };
    const scale = getEditorBaseScale(canvas) * state.viewZoom;
    return {
      x: (x - canvas.width / 2) / scale + vc.cx,
      y: (y - canvas.height / 2) / scale + vc.cy,
    };
  }

  function bounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const h of WOD.gameData.hexList) {
      minX = Math.min(minX, h.x); maxX = Math.max(maxX, h.x);
      minY = Math.min(minY, h.y); maxY = Math.max(maxY, h.y);
    }
    if (!isFinite(minX)) return { cx: 0, cy: 0, w: 1000, h: 800 };
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX + 80, h: maxY - minY + 80 };
  }

  function toCanvas(x, y) {
    const canvas = document.getElementById("editorCanvas");
    if (state.renderView && state.renderView.canvas === canvas) {
      const { vc, scale } = state.renderView;
      return { x: canvas.width / 2 + (x - vc.cx) * scale, y: canvas.height / 2 + (y - vc.cy) * scale, scale };
    }
    const b = bounds();
    const vc = { cx: b.cx + state.viewPanX, cy: b.cy + state.viewPanY };
    const scale = getEditorBaseScale(canvas) * state.viewZoom;
    return { x: canvas.width / 2 + (x - vc.cx) * scale, y: canvas.height / 2 + (y - vc.cy) * scale, scale };
  }

  function canvasPixelToWorld(px, py) {
    const canvas = document.getElementById("editorCanvas");
    if (!canvas || !window.WOD) return { x: 0, y: 0 };
    const b = bounds();
    const vc = { cx: b.cx + state.viewPanX, cy: b.cy + state.viewPanY };
    const scale = getEditorBaseScale(canvas) * state.viewZoom;
    return {
      x: (px - canvas.width / 2) / scale + vc.cx,
      y: (py - canvas.height / 2) / scale + vc.cy,
    };
  }

  function hexUrbanableDry(h) {
    return !!(h && h.type !== "water" && h.type !== "deep_water");
  }

  function collectCityLinkedHexRefs(cityId) {
    const refs = [];
    for (const k of Object.keys(WOD.gameData.hexes || {})) {
      const h = WOD.gameData.hexes[k];
      if (h.cityId === cityId) refs.push(h);
    }
    return refs;
  }

  function stripUrbanLinksFromHexRefs(hexRefs, cityId) {
    for (const h of hexRefs) {
      if (!h || h.cityId !== cityId) continue;
      h.cityId = null;
      if (h.type === "urban") {
        h.type = "grass";
        h.baseColor = WOD.getTerrainColor("grass");
      }
      delete h.urbanVariant;
    }
  }

  function applyUrbanSprawlAtAnchor(city, anchorHex) {
    for (const pt of WOD.getHexesInRadius(anchorHex.q, anchorHex.r, 2)) {
      const h = WOD.gameData.hexes[`${pt.q},${pt.r}`];
      if (hexUrbanableDry(h)) {
        h.type = "urban";
        h.baseColor = WOD.getTerrainColor("urban");
        h.cityId = city.id;
        h.urbanVariant = Math.floor(Math.random() * 5);
      }
    }
  }

  /** After ghost-move: strip old suburb, move city centroid, repaint ring once. */
  function commitCityRelocationIfNeeded() {
    const g = state.cityMoveGhostAnchor;
    if (!g || state.selected?.type !== "city") {
      state.cityMoveGhostAnchor = null;
      state.cityMoveAttachedHexRefs = null;
      return false;
    }
    const city = state.selected.value;
    const target = g.hex;
    if (!target || city.id !== g.cityId) {
      state.cityMoveGhostAnchor = null;
      state.cityMoveAttachedHexRefs = null;
      return false;
    }
    if (city.q === target.q && city.r === target.r) {
      state.cityMoveGhostAnchor = null;
      state.cityMoveAttachedHexRefs = null;
      return false;
    }
    let attached = state.cityMoveAttachedHexRefs;
    if (!attached || !attached.length) attached = collectCityLinkedHexRefs(city.id);
    stripUrbanLinksFromHexRefs(attached, city.id);
    city.q = target.q;
    city.r = target.r;
    city.x = target.x;
    city.y = target.y;
    applyUrbanSprawlAtAnchor(city, target);
    touchEditorMutation();
    editorRefreshTradeRoutes();
    state.cityMoveGhostAnchor = null;
    state.cityMoveAttachedHexRefs = null;
    return true;
  }

  function finalizeEditorMarquee() {
    const m = state.editorMarquee;
    if (!m) return false;
    const dx = Math.abs(m.bx - m.ax);
    const dy = Math.abs(m.by - m.ay);
    state.editorMarquee = null;
    if (dx < 8 && dy < 8) return false;
    let ax = Math.min(m.ax, m.bx);
    let ay = Math.min(m.ay, m.by);
    let bx = Math.max(m.ax, m.bx);
    let by = Math.max(m.ay, m.by);
    const w0 = canvasPixelToWorld(ax, ay);
    const w1 = canvasPixelToWorld(bx, ay);
    const w2 = canvasPixelToWorld(bx, by);
    const w3 = canvasPixelToWorld(ax, by);
    const wl = Math.min(w0.x, w1.x, w2.x, w3.x);
    const wr = Math.max(w0.x, w1.x, w2.x, w3.x);
    const wt = Math.min(w0.y, w1.y, w2.y, w3.y);
    const wb = Math.max(w0.y, w1.y, w2.y, w3.y);
    const picked = [];
    for (const u of WOD.gameData.entities || []) {
      if (!u || u.hp <= 0) continue;
      if (u.x >= wl && u.x <= wr && u.y >= wt && u.y <= wb) picked.push(u);
    }
    if (picked.length === 0) {
      state.selected = null;
      renderSelection();
      return true;
    }
    if (picked.length === 1) state.selected = { type: "unit", value: picked[0] };
    else state.selected = { type: "units", values: picked };
    renderSelection();
    return true;
  }

  function nearestHex(pos) {
    const coord = WOD.pixelToHex(pos.x, pos.y);
    return WOD.gameData.hexes[`${coord.q},${coord.r}`];
  }

  function nearestCity(pos, maxDist = 55) {
    let best = null, bestD = maxDist * maxDist;
    for (const city of WOD.gameData.cities) {
      const dx = city.x - pos.x, dy = city.y - pos.y, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = city; }
    }
    return best;
  }

  function nearestUnit(pos, maxDist = 35) {
    let best = null, bestD = maxDist * maxDist;
    for (const unit of WOD.gameData.entities) {
      const dx = unit.x - pos.x, dy = unit.y - pos.y, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = unit; }
    }
    return best;
  }

  /**
   * Unit stacks visually on cities. Prefer the unit on first click at an overlap;
   * a second click on the same stack selects the city. Clicks that hit only the city
   * ring (not the unit) select the city directly.
   */
  function pickCityOrUnitAt(pos, maxCityDist = 55, maxUnitDist = 35) {
    const maxC = maxCityDist * maxCityDist;
    const maxU = maxUnitDist * maxUnitDist;
    let bestCity = null;
    let bestCityD = maxC;
    for (const city of WOD.gameData.cities) {
      const dx = city.x - pos.x;
      const dy = city.y - pos.y;
      const d = dx * dx + dy * dy;
      if (d < bestCityD) {
        bestCityD = d;
        bestCity = city;
      }
    }
    let bestUnit = null;
    let bestUnitD = maxU;
    for (const unit of WOD.gameData.entities) {
      const dx = unit.x - pos.x;
      const dy = unit.y - pos.y;
      const d = dx * dx + dy * dy;
      if (d < bestUnitD) {
        bestUnitD = d;
        bestUnit = unit;
      }
    }
    const hasCity = bestCity != null;
    const hasUnit = bestUnit != null;
    if (hasCity && hasUnit) {
      const unitUid = bestUnit.uid;
      const cityId = bestCity.id;
      const st = state.cityUnitStackTap;
      const sameStack =
        st &&
        st.cityId === cityId &&
        st.unitUid === unitUid &&
        (pos.x - st.x) * (pos.x - st.x) + (pos.y - st.y) * (pos.y - st.y) < 900;
      if (sameStack) {
        if (st.lastPick === "unit") {
          state.cityUnitStackTap = { cityId, unitUid, x: pos.x, y: pos.y, lastPick: "city" };
          return { kind: "city", value: bestCity };
        }
        state.cityUnitStackTap = { cityId, unitUid, x: pos.x, y: pos.y, lastPick: "unit" };
        return { kind: "unit", value: bestUnit };
      }
      state.cityUnitStackTap = { cityId, unitUid, x: pos.x, y: pos.y, lastPick: "unit" };
      return { kind: "unit", value: bestUnit };
    }
    state.cityUnitStackTap = null;
    if (hasUnit) return { kind: "unit", value: bestUnit };
    if (hasCity) return { kind: "city", value: bestCity };
    return null;
  }

  function findSpawnHexForType(type, pos) {
    let h = nearestHex(pos);
    if (type === "ship") {
      if (h && WOD.isWaterHex(h)) return h;
      const coord = WOD.pixelToHex(pos.x, pos.y);
      for (let R = 1; R < 14; R++) {
        for (const pt of WOD.getHexesInRadius(coord.q, coord.r, R)) {
          const hx = WOD.gameData.hexes[`${pt.q},${pt.r}`];
          if (hx && WOD.isWaterHex(hx)) return hx;
        }
      }
      return null;
    }
    return h;
  }

  function onCanvasDrop(ev) {
    ev.preventDefault();
    if (!state.open) return;
    const raw =
      ev.dataTransfer.getData("application/x-wod-unit") ||
      ev.dataTransfer.getData("text/plain") ||
      "";
    if (!raw.trim()) return;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    const type = data.type;
    if (!type || !["light", "marine", "heavy", "ship"].includes(type)) return;
    let faction = parseInt(data.owner, 10);
    if (!Number.isFinite(faction) || faction < 1) faction = 1;
    faction = Math.min(faction, state.maxFactionSlots);
    const pos = editorWorldPos(ev);
    const hex = findSpawnHexForType(type, pos);
    if (!hex) return;
    if (type === "ship" && !WOD.isWaterHex(hex)) return;
    touchEditorMutation();
    const unit = WOD.createUnitAt(type, hex.x, hex.y, faction);
    state.selected = { type: "unit", value: unit };
    renderSelection();
    markEditorMapChanged();
    scheduleEditorRender();
    editorPushSnapshot();
    state.editorGestureMutatedMap = false;
  }

  function paintAt(pos) {
    const hex = nearestHex(pos);
    if (!hex) return;

    const brushTargets = paintUsesBrush(state.tool) ? hexesForBrush(hex) : [hex];

    if (state.tool === "territory") {
      touchEditorMutation();
      const own = Math.max(0, Math.min(state.territoryPaintOwner | 0, state.maxFactionSlots));
      for (const h of brushTargets) WOD.setHexOwner(h, own);
      markEditorMapChanged();
      return;
    }
    if (state.tool === "paint") {
      touchEditorMutation();
      for (const h of brushTargets) {
        h.type = state.terrain;
        h.baseColor = WOD.getTerrainColor(h.type);
        if (h.type === "urban") attachUrbanHex(h);
      }
      markEditorMapChanged();
      return;
    }
    if (state.tool === "erase") {
      touchEditorMutation();
      for (const h of brushTargets) {
        h.type = "grass";
        h.baseColor = WOD.getTerrainColor("grass");
        h.cityId = null;
        if (WOD.gameData.forts && WOD.gameData.forts.length) {
          const idx = WOD.gameData.forts.findIndex(f => f.q === h.q && f.r === h.r);
          if (idx >= 0) WOD.gameData.forts.splice(idx, 1);
        }
      }
      markEditorMapChanged();
      return;
    }
    if (state.tool === "city") {
      touchEditorMutation();
      createTown(hex);
      return;
    }
    if (state.tool === "unit") {
      touchEditorMutation();
      const uo = Math.max(1, state.owner || 1);
      const unit = WOD.createUnitAt("light", hex.x, hex.y, uo);
      state.selected = { type: "unit", value: unit };
      renderSelection();
      markEditorMapChanged();
      return;
    }
    if (state.tool === "factory" || state.tool === "harbor") {
      touchEditorMutation();
      const city = nearestCity(pos, 80) || createTown(hex);
      if (state.tool === "factory") city.hasFactory = true;
      if (state.tool === "harbor") city.hasHarbor = true;
      state.selected = { type: "city", value: city };
      renderSelection();
      markEditorMapChanged();
      return;
    }
    if (state.tool === "fort") {
      touchEditorMutation();
      const uo = Math.max(1, state.owner || 1);
      if (hex.owner !== uo && typeof WOD.setHexOwner === "function") WOD.setHexOwner(hex, uo);
      if (typeof WOD.placeFortAtHex === "function") WOD.placeFortAtHex(hex, uo, { editor: true, suppressNotes: true });
      markEditorMapChanged();
    }
  }

  function attachUrbanHex(hex) {
    let city = nearestCity(hex, 120);
    if (!city) city = createTown(hex);
    hex.cityId = city.id;
    hex.urbanVariant = Math.floor(Math.random() * 5);
  }

  function createTown(hex) {
    let city = {
      id: "city_editor_" + Date.now() + "_" + Math.floor(Math.random() * 999),
      name: WOD.cityName(),
      x: hex.x, y: hex.y, q: hex.q, r: hex.r,
      owner: Math.max(0, state.owner), hasFactory: false, hasHarbor: false,
      hp: 1000, maxHp: 1000,
      urbanStyle: Math.floor(Math.random() * 4),
      incomeBonus: 0,
      manpowerBonus: 0,
    };
    touchEditorMutation();
    WOD.gameData.cities.push(city);
    for (const pt of WOD.getHexesInRadius(hex.q, hex.r, 2)) {
      const h = WOD.gameData.hexes[`${pt.q},${pt.r}`];
      if (h && h.type !== "water" && h.type !== "deep_water") {
        h.type = "urban";
        h.baseColor = WOD.getTerrainColor("urban");
        h.cityId = city.id;
        h.urbanVariant = Math.floor(Math.random() * 5);
      }
    }
    state.selected = { type: "city", value: city };
    editorRefreshTradeRoutes();
    renderSelection();
    return city;
  }

  function onEditorDown(event) {
    if (!state.open) return;
    if (event.button === 1) {
      state.viewPanDrag = { lx: event.clientX, ly: event.clientY };
      state.dragging = true;
      try {
        event.preventDefault();
      } catch (_) {}
      return;
    }
    state.viewPanDrag = null;
    const pos = editorWorldPos(event);
    state.dragging = true;
    if (state.tool === "territory" && !state.territoryPainting) {
      state.territoryPainting = true;
      WOD.beginHexOwnerBatch();
    }
    if (state.tool === "select" || state.tool === "move") {
      const canvas = document.getElementById("editorCanvas");
      const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
      state.editorMarquee = null;
      const pick = pickCityOrUnitAt(pos);
      if (pick) {
        if (pick.kind === "city") state.selected = { type: "city", value: pick.value };
        else state.selected = { type: "unit", value: pick.value };
        state.dragKind = pick.kind;
      } else {
        state.dragKind = null;
        state.selected = null;
        const ax = event.clientX - rect.left;
        const ay = event.clientY - rect.top;
        state.editorMarquee = { ax, ay, bx: ax, by: ay };
      }
      renderSelection();
    } else {
      paintAt(pos);
    }
    scheduleEditorRender();
  }

  function onEditorMove(event) {
    if (!state.open || !state.dragging) return;
    if (state.viewPanDrag) {
      const dx = event.clientX - state.viewPanDrag.lx;
      const dy = event.clientY - state.viewPanDrag.ly;
      state.viewPanDrag.lx = event.clientX;
      state.viewPanDrag.ly = event.clientY;
      const canvas = document.getElementById("editorCanvas");
      if (!canvas) return;
      const scale = getEditorBaseScale(canvas) * state.viewZoom;
      state.viewPanX -= dx / scale;
      state.viewPanY -= dy / scale;
      clampEditorView();
      scheduleEditorRender();
      return;
    }
    const canvasMid = document.getElementById("editorCanvas");
    if (!canvasMid) return;
    const posMid = editorWorldPos(event);
    if (state.editorMarquee) {
      const rectM = canvasMid.getBoundingClientRect();
      state.editorMarquee.bx = event.clientX - rectM.left;
      state.editorMarquee.by = event.clientY - rectM.top;
      scheduleEditorRender();
      return;
    }
    if (state.tool === "move" && state.selected) {
      if (state.selected.type === "units") {
        scheduleEditorRender();
        return;
      }
      const hex = nearestHex(posMid);
      if (!hex) return;
      if (state.selected.type === "city") {
        if (!state.cityMoveAttachedHexRefs) {
          state.cityMoveAttachedHexRefs = collectCityLinkedHexRefs(state.selected.value.id).slice();
        }
        state.cityMoveGhostAnchor = {
          cityId: state.selected.value.id,
          hex,
          x: hex.x,
          y: hex.y,
        };
        scheduleEditorRender();
        return;
      }
      touchEditorMutation();
      const obj = state.selected.value;
      obj.x = hex.x;
      obj.y = hex.y;
      obj.q = hex.q;
      obj.r = hex.r;
      markEditorMapChanged();
    } else if (state.tool !== "select") {
      paintAt(posMid);
    }
    scheduleEditorRender();
  }

  function onEditorUp() {
    if (state.open && state.editorMarquee) finalizeEditorMarquee();
    if (state.open && state.territoryPainting) {
      WOD.endHexOwnerBatch();
      state.territoryPainting = false;
    }
    if (state.open && state.cityMoveGhostAnchor && state.selected?.type === "city") commitCityRelocationIfNeeded();
    else {
      state.cityMoveGhostAnchor = null;
      state.cityMoveAttachedHexRefs = null;
    }
    if (state.open && state.editorGestureMutatedMap) {
      editorPushSnapshot();
      state.editorGestureMutatedMap = false;
    }
    state.viewPanDrag = null;
    state.dragging = false;
    state.dragKind = null;
  }

  function renderEditor() {
    const canvas = document.getElementById("editorCanvas");
    if (!canvas || !window.WOD || !WOD.gameData) return;
    if (!state.open) {
      editorFrame = null;
      return;
    }
    const ctx = canvas.getContext("2d");
    const b = bounds();
    const vc = { cx: b.cx + state.viewPanX, cy: b.cy + state.viewPanY };
    const scale = getEditorBaseScale(canvas) * state.viewZoom;
    state.renderView = { canvas, b, scale, vc };
    const L = WOD.gameData.layers;

    ctx.fillStyle = "#154360";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const needHeavyTerrainSync = state.editorTerrainDirty;
    if (needHeavyTerrainSync) state.editorTerrainDirty = false;

    if (needHeavyTerrainSync && typeof WOD.syncTerrainCacheForEditorView === "function") {
      try {
        WOD.syncTerrainCacheForEditorView({
          terrain: L.terrain,
          territory: L.territory,
          diplomacy: L.diplomacy,
          terrainViewMode: WOD.gameData.terrainViewMode,
        });
      } catch (e) { /* ignore snapshot errors during init */ }
    }
    if (typeof WOD.getTerrainBitmap === "function") {
      try {
        const tb = WOD.getTerrainBitmap();
        if (tb && tb.img && tb.width > 0) {
          const x0 = canvas.width / 2 + (tb.minX - vc.cx) * scale;
          const y0 = canvas.height / 2 + (tb.minY - vc.cy) * scale;
          ctx.drawImage(tb.img, x0, y0, tb.width * scale, tb.height * scale);
        }
      } catch (e) { /* ignore */ }
    }

    if (L.cities) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = Math.max(2, scale * 1.8);
      ctx.setLineDash([5, 5]);
      for (const road of WOD.gameData.roads) {
        const pa = toCanvas(road.from.x, road.from.y);
        const pb = toCanvas(road.to.x, road.to.y);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      if (typeof WOD.drawEditorCityAtScreen === "function") {
        for (const city of WOD.gameData.cities) {
          let wx = city.x;
          let wy = city.y;
          if (state.cityMoveGhostAnchor && state.cityMoveGhostAnchor.cityId === city.id) {
            wx = state.cityMoveGhostAnchor.x;
            wy = state.cityMoveGhostAnchor.y;
          }
          const p = toCanvas(wx, wy);
          WOD.drawEditorCityAtScreen(ctx, p.x, p.y, p.scale, city);
        }
      }
    }
    if (L.units && typeof WOD.drawEditorUnitAtScreen === "function") {
      for (const unit of WOD.gameData.entities) {
        const p = toCanvas(unit.x, unit.y);
        WOD.drawEditorUnitAtScreen(ctx, p.x, p.y, p.scale, unit);
      }
    } else if (L.units) {
      for (const unit of WOD.gameData.entities) {
        const p = toCanvas(unit.x, unit.y);
        ctx.fillStyle = unit.colorOverride || factionPalette()[unit.owner] || "#fff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#050505";
        ctx.stroke();
      }
    }
    if (L.structures !== false && WOD.gameData.forts && typeof WOD.drawEditorFortAtScreen === "function") {
      for (const fort of WOD.gameData.forts) {
        const p = toCanvas(fort.x, fort.y);
        WOD.drawEditorFortAtScreen(ctx, p.x, p.y, p.scale, fort);
      }
    }

    if (state.editorMarquee) {
      const mm = state.editorMarquee;
      const ax = Math.min(mm.ax, mm.bx);
      const ay = Math.min(mm.ay, mm.by);
      const nw = Math.abs(mm.bx - mm.ax);
      const nh = Math.abs(mm.by - mm.ay);
      ctx.save();
      ctx.fillStyle = "rgba(75, 227, 150, 0.08)";
      ctx.strokeStyle = "rgba(75, 227, 150, 0.6)";
      ctx.lineWidth = 1.35;
      ctx.setLineDash([4, 3]);
      ctx.fillRect(ax, ay, nw, nh);
      ctx.strokeRect(ax, ay, nw, nh);
      ctx.setLineDash([]);
      ctx.restore();
    }

    const hlTool = state.tool === "select" || state.tool === "move";
    if (hlTool && state.selected) {
      const sel = state.selected;
      ctx.save();
      if (sel.type === "units" && L.units && sel.values && sel.values.length) {
        for (const u of sel.values) {
          const p = toCanvas(u.x, u.y);
          const ur = Math.max(8, (u.radius || 10) * p.scale);
          ctx.strokeStyle = "#f1c40f";
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, ur + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else if (sel.type === "city" && L.cities && sel.value) {
        const c = sel.value;
        const gx = state.cityMoveGhostAnchor && state.cityMoveGhostAnchor.cityId === c.id ? state.cityMoveGhostAnchor.x : c.x;
        const gy = state.cityMoveGhostAnchor && state.cityMoveGhostAnchor.cityId === c.id ? state.cityMoveGhostAnchor.y : c.y;
        const p = toCanvas(gx, gy);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 35 * p.scale, 0, Math.PI * 2);
        ctx.strokeStyle = "#f1c40f";
        ctx.lineWidth = Math.max(2.5, p.scale * 4);
        ctx.stroke();
      } else if (sel.type === "unit" && L.units && sel.value) {
        const u = sel.value;
        const p = toCanvas(u.x, u.y);
        const ur = Math.max(8, (u.radius || 10) * p.scale);
        ctx.strokeStyle = "#f1c40f";
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, ur + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
    renderFactionBalanceChart();
    state.renderView = null;
  }

  function renderSelection() {
    const panel = document.getElementById("editorSelection");
    if (!panel) return;
    if (!state.selected) {
      panel.innerHTML = "Nothing selected. Use <strong>Select</strong> for a town/unit, <strong>drag a box</strong> on empty map (Select or Move) to grab several units, or <strong>Move</strong> to reposition.";
      panel.classList.add("editor-hint");
      return;
    }
    panel.classList.remove("editor-hint");
    if (state.selected.type === "units") {
      const vals = state.selected.values;
      if (!vals.length) {
        panel.innerHTML = "";
        panel.classList.add("editor-hint");
        return;
      }
      const refOwner = typeof vals[0].owner === "number" ? vals[0].owner : 1;
      panel.innerHTML = `
        <p class="editor-hint" style="margin:0 0 10px">${vals.length} units selected.</p>
        <div class="editor-row"><label>Faction</label>
          <div class="editor-faction-inline">
            <span class="editor-swatch editor-sel-faction-swatch" id="selOwnerFactionSwatch" title="Faction color"></span>
            <select id="selOwnerFaction" class="editor-sel-faction">${factionOwnerSelectHtml(refOwner)}</select>
          </div>
        </div>
        <p class="editor-hint" style="margin:8px 0 0;font-size:12px">Change faction applies to every selected regiment. Drag-move is unavailable until you leave a single selection.</p>
        <button type="button" class="editor-btn" id="bulkApplyFaction" style="width:100%;margin-top:12px">Apply faction to all</button>
        <button type="button" class="editor-btn" id="bulkDeleteUnits" style="width:100%;margin-top:8px">Delete selected units</button>`;
      wireSelectionFactionControls();
      document.getElementById("bulkApplyFaction").onclick = () => {
        const fv = Math.max(0, Math.min(parseInt(document.getElementById("selOwnerFaction").value, 10) || 0, state.maxFactionSlots));
        for (const u of vals) u.owner = fv;
        markEditorMapChanged();
        rebuildUnitPalette();
        scheduleEditorRender();
        editorPushSnapshot();
        state.editorGestureMutatedMap = false;
      };
      document.getElementById("bulkDeleteUnits").onclick = () => {
        const ents = WOD.gameData.entities;
        for (const u of [...vals]) {
          const ix = ents.indexOf(u);
          if (ix >= 0) ents.splice(ix, 1);
        }
        state.selected = null;
        markEditorMapChanged();
        rebuildUnitPalette();
        renderSelection();
        scheduleEditorRender();
        editorPushSnapshot();
        state.editorGestureMutatedMap = false;
      };
      return;
    }
    const obj = state.selected.value;
    const factionRow = `
        <div class="editor-row"><label>Faction</label>
          <div class="editor-faction-inline">
            <span class="editor-swatch editor-sel-faction-swatch" id="selOwnerFactionSwatch" title="Faction color"></span>
            <select id="selOwnerFaction" class="editor-sel-faction">${factionOwnerSelectHtml(obj.owner)}</select>
          </div>
        </div>`;
    if (state.selected.type === "city") {
      panel.innerHTML = `
        <div class="editor-row"><label>Name</label><input id="selName" value="${obj.name || ""}"></div>
        ${factionRow}
        <div class="editor-row"><label>HP</label><input id="selHp" type="number" value="${obj.hp || 1000}"></div>
        <div class="editor-row"><label>Income bonus</label><input id="selIncome" type="number" value="${obj.incomeBonus || 0}"></div>
        <div class="editor-row"><label>MP bonus</label><input id="selMp" type="number" value="${obj.manpowerBonus || 0}"></div>
        <div class="editor-row"><label>Factory</label><input id="selFactory" type="checkbox" ${obj.hasFactory ? "checked" : ""}></div>
        <div class="editor-row"><label>Harbor</label><input id="selHarbor" type="checkbox" ${obj.hasHarbor ? "checked" : ""}></div>
        <button type="button" class="editor-btn" id="applySelection" style="width:100%;margin-top:8px">Apply town</button>`;
      wireSelectionFactionControls();
      document.getElementById("applySelection").onclick = () => {
        obj.name = document.getElementById("selName").value || obj.name;
        obj.owner = Math.max(0, Math.min(parseInt(document.getElementById("selOwnerFaction").value, 10) || 0, state.maxFactionSlots));
        obj.hp = parseInt(document.getElementById("selHp").value, 10) || obj.hp;
        obj.incomeBonus = parseInt(document.getElementById("selIncome").value, 10) || 0;
        obj.manpowerBonus = parseInt(document.getElementById("selMp").value, 10) || 0;
        obj.hasFactory = document.getElementById("selFactory").checked;
        obj.hasHarbor = document.getElementById("selHarbor").checked;
        markEditorMapChanged();
        scheduleEditorRender();
        editorPushSnapshot();
        state.editorGestureMutatedMap = false;
      };
    } else {
      panel.innerHTML = `
        <div class="editor-row"><label>Name</label><input id="selName" value="${obj.name || ""}"></div>
        ${factionRow}
        <div class="editor-row"><label>Type</label><select id="selType"><option value="light">Infantry</option><option value="marine">Marines</option><option value="heavy">Armor</option><option value="ship">Ship</option></select></div>
        <div class="editor-row"><label>HP</label><input id="selHp" type="number" value="${obj.hp || 100}"></div>
        <div class="editor-row"><label>Speed</label><input id="selSpeed" type="number" value="${obj.speed || 10}"></div>
        <div class="editor-row"><label>Damage</label><input id="selDamage" type="number" value="${obj.damage || 10}"></div>
        <div class="editor-row"><label>Range</label><input id="selRange" type="number" value="${obj.range || 50}"></div>
        <div class="editor-row"><label>Manpower</label><input id="selManpower" type="number" value="${obj.manpower || 1000}"></div>
        <div class="editor-row"><label>Tanks</label><input id="selTanks" type="number" value="${obj.tanks || 0}"></div>
        <div class="editor-row"><label>Color override</label><input id="selColor" type="color" value="${obj.colorOverride || "#2ecc71"}"></div>
        <p class="editor-hint">Owner 1 uses your unit skin; other owners use the AI skin (same as in-game shop).</p>
        <button type="button" class="editor-btn" id="applySelection" style="width:100%;margin-top:8px">Apply unit</button>`;
      document.getElementById("selType").value = obj.type || "light";
      wireSelectionFactionControls();
      document.getElementById("applySelection").onclick = () => {
        obj.name = document.getElementById("selName").value || obj.name;
        let ov = parseInt(document.getElementById("selOwnerFaction").value, 10);
        if (!Number.isFinite(ov)) ov = typeof obj.owner === "number" ? obj.owner : 1;
        obj.owner = Math.max(0, Math.min(ov, state.maxFactionSlots));
        obj.type = document.getElementById("selType").value;
        obj.hp = parseInt(document.getElementById("selHp").value, 10) || obj.hp;
        obj.maxHp = Math.max(obj.maxHp || obj.hp, obj.hp);
        obj.speed = parseFloat(document.getElementById("selSpeed").value) || obj.speed;
        obj.damage = parseFloat(document.getElementById("selDamage").value) || obj.damage;
        obj.range = parseFloat(document.getElementById("selRange").value) || obj.range;
        obj.manpower = parseInt(document.getElementById("selManpower").value, 10) || obj.manpower;
        obj.maxManpower = Math.max(obj.maxManpower || obj.manpower, obj.manpower);
        obj.tanks = parseInt(document.getElementById("selTanks").value, 10) || 0;
        obj.maxTanks = Math.max(obj.maxTanks || obj.tanks, obj.tanks);
        obj.colorOverride = document.getElementById("selColor").value;
        markEditorMapChanged();
        rebuildUnitPalette();
        scheduleEditorRender();
        editorPushSnapshot();
        state.editorGestureMutatedMap = false;
      };
    }
  }

  function saveEditorMap() {
    showEditorSaveDialog();
  }

  function makeThumbnail() {
    const canvas = document.getElementById("editorCanvas");
    try { return canvas.toDataURL("image/png"); } catch { return ""; }
  }

  function renderMapBrowser() {
    const browser = document.getElementById("mapBrowser");
    if (!browser) return;
    const pager = document.getElementById("mapBrowserPager");
    const pageLabel = document.getElementById("mapBrowserPageLabel");
    const prevBtn = document.getElementById("mapBrowserPrev");
    const nextBtn = document.getElementById("mapBrowserNext");
    const saved =
      typeof window.wodGetSavedMapsList === "function" ? window.wodGetSavedMapsList() : [];
    browser.textContent = "";
    if (saved.length === 0) {
      state.mapBrowserPage = 0;
      if (pager) pager.hidden = true;
      browser.innerHTML = `<div class="editor-hint">No maps saved yet. Press <strong>Save to library…</strong> or open <strong>Browse library…</strong>.</div>`;
      return;
    }
    const pag = savedMapsPagination(state.mapBrowserPage, saved.length);
    state.mapBrowserPage = pag.page;
    const pageItems = saved.slice(pag.start, pag.end);
    if (pager) {
      pager.hidden = false;
      if (pageLabel) pageLabel.textContent = `Page ${pag.page + 1} / ${pag.totalPages} (${saved.length} saves)`;
      if (prevBtn) {
        prevBtn.disabled = pag.page <= 0;
        prevBtn.toggleAttribute("disabled", pag.page <= 0);
      }
      if (nextBtn) {
        const last = pag.page >= pag.totalPages - 1;
        nextBtn.disabled = last;
        nextBtn.toggleAttribute("disabled", last);
      }
    }
    for (const m of pageItems) {
      const card = document.createElement("div");
      card.className = "map-card";
      card.dataset.mapId = m.id || "";

      const img = document.createElement("img");
      img.className = "map-thumb";
      img.alt = "";
      img.src =
        typeof window.wodSavedMapThumbUrl === "function"
          ? window.wodSavedMapThumbUrl(m, 120, 72)
          : m.thumb || m.thumbnail || "";

      const mid = document.createElement("div");
      const title = document.createElement("div");
      title.className = "map-name";
      title.textContent = m.name || "Map";
      const meta = document.createElement("div");
      meta.className = "map-meta";
      meta.textContent = new Date(m.savedAt || m.date || Date.now()).toLocaleString();
      mid.appendChild(title);
      mid.appendChild(meta);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "map-card-del";
      del.title = "Remove from library";
      del.textContent = "Del";

      card.appendChild(img);
      card.appendChild(mid);
      card.appendChild(del);

      card.addEventListener("click", (ev) => {
        if (ev.target.closest(".map-card-del")) return;
        const id = card.dataset.mapId;
        const map = saved.find((x) => String(x.id) === String(id));
        if (!map || !map.data) return;
        WOD.loadMapData(map.data);
        syncEditorTerritoryOverlayDefault();
        state.selected = null;
        state.viewPanX = 0;
        state.viewPanY = 0;
        state.viewZoom = 1;
        markEditorMapChanged();
        renderSelection();
        scheduleEditorRender();
        if (state.open) editorInitHistory();
      });
      del.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const id = card.dataset.mapId;
        if (!id || !confirm("Delete this map from your library?")) return;
        if (typeof window.wodDeleteSavedMapById === "function") window.wodDeleteSavedMapById(id);
        const after =
          typeof window.wodGetSavedMapsList === "function" ? window.wodGetSavedMapsList() : [];
        const newPag = savedMapsPagination(state.mapBrowserPage, after.length);
        state.mapBrowserPage = newPag.page;
        renderMapBrowser();
      });

      browser.appendChild(card);
    }
  }

  function refreshSavedMapsUisAfterNewSave() {
    state.mapBrowserPage = 0;
    state.editorSaveListPage = 0;
    renderMapBrowser();
  }

  window.wodNotifySavedMapsChanged = refreshSavedMapsUisAfterNewSave;

  window.wodNotifyEditorMapChanged = function () {
    if (!state.open) return;
    syncEditorTerritoryOverlayDefault();
    syncMaxFactionSlotsFromGameData();
    rebuildOwnerSelect();
    rebuildUnitPalette();
    state.selected = null;
    state.cityUnitStackTap = null;
    state.editorMarquee = null;
    state.cityMoveAttachedHexRefs = null;
    state.cityMoveGhostAnchor = null;
    state.editorTerrainDirty = true;
    scheduleEditorRender();
    renderSelection();
    renderMapBrowser();
    editorInitHistory();
  };

  window.wodEditorAfterLoadMapData = function () {
    if (!state.open) return;
    syncMaxFactionSlotsFromGameData();
    rebuildOwnerSelect();
    rebuildUnitPalette();
  };

  window.openMapEditor = openMapEditor;
  window.closeMapEditor = closeMapEditor;
  window.renderMapBrowser = renderMapBrowser;
  window.wodEnsureMapEditorDom = ensureEditorDom;
  window.wodShowEditorSaveToLibraryDialog = function () {
    ensureEditorDom();
    showEditorSaveDialog();
  };
})();
