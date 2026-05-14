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
    viewPanX: 0,
    viewPanY: 0,
    viewZoom: 1,
    viewPanDrag: null,
  };

  const editorPtrs = new Map();
  let editorPinch = null;

  let editorFrame = null;
  function scheduleEditorRender() {
    if (editorFrame != null) return;
    editorFrame = requestAnimationFrame(() => {
      editorFrame = null;
      renderEditor();
    });
  }

  const terrainTypes = ["grass", "sand", "forest", "swamp", "hill", "mountain", "water", "urban"];

  function factionPalette() {
    return window.WOD && WOD.factionColors ? WOD.factionColors : ["#000000", "#2ecc71", "#e74c3c", "#9b59b6", "#e67e22", "#3498db", "#f1c40f"];
  }

  function rebuildOwnerSelect() {
    const sel = document.getElementById("editorOwner");
    if (!sel) return;
    sel.innerHTML = `<option value="0">Neutral (clear)</option>` + Array.from({ length: state.maxFactionSlots }, (_, i) => {
      const id = i + 1;
      return `<option value="${id}">Faction slot ${id}</option>`;
    }).join("");
    if (state.owner > state.maxFactionSlots) state.owner = state.maxFactionSlots;
    sel.value = String(Math.max(0, Math.min(state.owner, state.maxFactionSlots)));
    state.owner = parseInt(sel.value, 10);
    sel.onchange = () => {
      state.owner = parseInt(sel.value, 10);
      rebuildUnitPalette();
      scheduleEditorRender();
    };
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
    const cap = Math.max(1, state.maxFactionSlots || 6);
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

  function ensureEditorDom() {
    if (document.getElementById("mapEditorApp")) return;
    const style = document.createElement("style");
    style.textContent = `
      #mapEditorApp { position:absolute; inset:0; z-index:30; background:#0a1520; color:#e8f0f6; display:none;
        font-family:'Segoe UI',system-ui,sans-serif; }
      #mapEditorApp.visible {
        display:grid;
        grid-template-columns:minmax(260px,300px) minmax(0,1fr) minmax(260px,300px);
        grid-template-rows:auto 1fr;
        gap:0;
      }
      .editor-toolbar {
        grid-column:1/-1;display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:12px 16px;
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
      .editor-row { display:flex; gap:10px; align-items:center; margin:7px 0; }
      .editor-row label { flex:0 0 42%; color:#cfdce8; font-size:13px;line-height:1.25 }
      .editor-row input,.editor-row select { flex:1; min-width:0; background:#1a3348; color:#fff;
        border:1px solid rgba(139,173,192,.55); border-radius:6px; padding:8px;font-size:13px;}
      .editor-btn {
        background:linear-gradient(180deg,#273d54,#203446);color:#ecf4fa;border:1px solid rgba(155,174,188,.55);
        border-radius:8px;padding:10px 12px;cursor:pointer;font-weight:700;font-size:12px;text-align:center;
      }
      .editor-btn:hover { filter:brightness(1.07);border-color:rgba(231,227,173,.85); }
      .editor-btn.active { background:linear-gradient(180deg,#1f7a4a,#26975a);border-color:#4be396;color:#061208;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12); }
      .editor-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .editor-grid-4 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
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
      .map-browser { display:grid; gap:8px; max-height:200px; overflow:auto; padding-right:2px;}
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
        #mapEditorApp.visible { grid-template-columns:1fr; grid-template-rows:auto minmax(200px,32vh) minmax(280px,1fr) minmax(200px,30vh); }
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
        <p class="editor-toolbar-hint editor-toolbar-hint-desktop">Paint terrain and ownership, place towns and units. <strong>Left-drag</strong> on the canvas to paint or move the selection. <strong>Mouse wheel</strong> zooms. <strong>Middle-click drag</strong> pans the view. Drag unit chips from the palette onto the map (ships need water).</p>
        <p class="editor-toolbar-hint editor-toolbar-hint-touch">Paint terrain and ownership, place towns and units. Drag unit chips onto the map — ships need water. Use <strong>Select / move</strong> to reposition. <strong>Two fingers</strong> on the canvas pan and pinch-zoom.</p>
        <button type="button" class="editor-btn editor-btn-main" id="editorExitBtn">← Main menu</button>
      </header>
      <div class="editor-panel editor-left">
        <section class="editor-card">
          <h3>Map &amp; files</h3>
          <div class="editor-row"><label>Hex radius</label><select id="editorSize"><option value="40">Small</option><option value="60" selected>Medium</option><option value="80">Large</option></select></div>
          <div class="editor-grid-2">
            <button type="button" class="editor-btn" id="editorBlank">New blank</button>
            <button type="button" class="editor-btn" id="editorRandom">Random gen</button>
            <button type="button" class="editor-btn" id="editorSave">Save to library + export</button>
            <button type="button" class="editor-btn" id="editorBrowseLib">Browse library…</button>
            <button type="button" class="editor-btn" id="editorLoadBtn">Load JSON file</button>
          </div>
          <input id="editorLoad" type="file" accept=".json,application/json" style="display:none">
        </section>
        <section class="editor-card">
          <h3>Terrain paint</h3>
          <div class="editor-row"><label>Brush type</label><select id="editorTerrain"></select></div>
          <div id="editorPalette" class="palette-grid"></div>
          <p class="editor-hint">Quick-pick swatches set the brush and switch to Paint terrain.</p>
        </section>
        <section class="editor-card">
          <h3>Tools</h3>
          <div class="editor-grid-4">
            <button type="button" class="editor-btn active" data-tool="paint">Paint terrain</button>
            <button type="button" class="editor-btn" data-tool="select">Select / move</button>
            <button type="button" class="editor-btn" data-tool="territory">Paint territory</button>
            <button type="button" class="editor-btn" data-tool="city">Place town</button>
            <button type="button" class="editor-btn" data-tool="unit">Click unit</button>
            <button type="button" class="editor-btn" data-tool="factory">Add factory</button>
            <button type="button" class="editor-btn" data-tool="harbor">Add harbor</button>
            <button type="button" class="editor-btn" data-tool="erase">Erase terrain</button>
          </div>
        </section>
        <section class="editor-card">
          <h3>Faction &amp; units</h3>
          <div class="editor-row"><label>Active faction</label><select id="editorOwner"><option value="1">Faction 1</option></select></div>
          <button type="button" class="editor-btn" id="editorAddFaction" style="width:100%;margin-top:4px">+ Add AI faction slot</button>
          <p class="editor-hint">Territory paint, towns, and “Click unit” use this owner. Drag chips below — owner matches the dropdown.</p>
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
        <section class="editor-card">
          <h3>Saved maps (browser)</h3>
          <p class="editor-hint" style="margin-top:0">Same collection as solo / multiplayer / map library. Click a row to load; Delete removes it everywhere.</p>
          <div id="mapBrowser" class="map-browser"></div>
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
          <div id="editorSelection" class="editor-hint" style="margin:0">Nothing selected. Use Select / move and click a unit or town.</div>
        </section>
      </div>
    `;
    document.body.appendChild(app);

    const terrainSelect = app.querySelector("#editorTerrain");
    terrainSelect.innerHTML = terrainTypes.map(t => `<option value="${t}">${t.replace("_", " ")}</option>`).join("");
    app.querySelector("#editorPalette").innerHTML = terrainTypes.map(t => `<button type="button" class="editor-btn palette-btn" data-terrain="${t}"><span class="editor-swatch" style="background:${WOD.getTerrainColor(t)}"></span>${t.replace("_", " ")}</button>`).join("");
    app.querySelector("#editorMapKey").innerHTML = terrainTypes.map(t => `<div class="editor-key-row"><span class="editor-swatch" style="background:${WOD.getTerrainColor(t)}"></span>${t.replace("_", " ")}</div>`).join("");

    app.querySelectorAll("[data-tool]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.tool = btn.dataset.tool;
        app.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("active", b === btn));
      });
    });
    app.querySelector("#editorTerrain").addEventListener("change", e => { state.terrain = e.target.value; });
    app.querySelectorAll("[data-terrain]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.terrain = btn.dataset.terrain;
        terrainSelect.value = state.terrain;
        state.tool = "paint";
        app.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("active", b.dataset.tool === "paint"));
      });
    });
    app.querySelectorAll("[data-gl]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!window.WOD || typeof WOD.toggleGameplayLayer !== "function") return;
        WOD.toggleGameplayLayer(btn.dataset.gl);
        refreshEditorGameplayLayerButtons();
        scheduleEditorRender();
      });
    });

    rebuildOwnerSelect();

    document.getElementById("editorAddFaction").addEventListener("click", () => {
      if (state.maxFactionSlots < 6) {
        state.maxFactionSlots++;
        rebuildOwnerSelect();
        rebuildUnitPalette();
      }
    });

    app.querySelector("#editorBlank").addEventListener("click", () => {
      WOD.makeBlankMap(parseInt(app.querySelector("#editorSize").value, 10));
      state.selected = null;
      state.viewPanX = 0;
      state.viewPanY = 0;
      state.viewZoom = 1;
      scheduleEditorRender();
      renderSelection();
      renderMapBrowser();
    });
    app.querySelector("#editorRandom").addEventListener("click", () => {
      document.getElementById("setupMapSize").value = app.querySelector("#editorSize").value;
      WOD.gameData.mapRadius = parseInt(app.querySelector("#editorSize").value, 10);
      WOD.gameData.aiCount = Math.max(1, state.maxFactionSlots - 1);
      WOD.generateMap();
      state.selected = null;
      state.viewPanX = 0;
      state.viewPanY = 0;
      state.viewZoom = 1;
      scheduleEditorRender();
      renderSelection();
      renderMapBrowser();
    });
    app.querySelector("#editorSave").addEventListener("click", saveEditorMap);
    let browseLib = app.querySelector("#editorBrowseLib");
    if(browseLib) browseLib.addEventListener("click", () => {
      if (typeof showPanel === "function") showPanel("mapLibrary", { libContext: "editor", returnTo: "editor" });
    });
    app.querySelector("#editorLoadBtn").addEventListener("click", () => app.querySelector("#editorLoad").click());
    app.querySelector("#editorLoad").addEventListener("change", loadEditorMap);
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

    rebuildUnitPalette();
  }

  function openMapEditor() {
    ensureEditorDom();
    if (window.WOD && typeof WOD.pauseMenuBackgroundBattle === "function") WOD.pauseMenuBackgroundBattle();
    document.getElementById("mainMenu").classList.add("hidden");
    document.querySelectorAll(".overlay:not(#mainMenu)").forEach(p => p.classList.add("hidden"));
    const app = document.getElementById("mapEditorApp");
    app.classList.add("visible");
    state.open = true;
    state.maxFactionSlots = 2;
    state.viewPanX = 0;
    state.viewPanY = 0;
    state.viewZoom = 1;
    state.viewPanDrag = null;
    editorPtrs.clear();
    editorPinch = null;
    WOD.makeBlankMap(parseInt(document.getElementById("editorSize").value, 10));
    state.selected = null;
    rebuildOwnerSelect();
    rebuildUnitPalette();
    refreshEditorGameplayLayerButtons();
    resizeEditorCanvas();
    renderSelection();
    renderMapBrowser();
  }

  function closeMapEditor() {
    const app = document.getElementById("mapEditorApp");
    if (app) app.classList.remove("visible");
    state.open = false;
    state.territoryPainting = false;
    state.viewPanDrag = null;
    editorPtrs.clear();
    editorPinch = null;
    document.getElementById("mainMenu").classList.remove("hidden");
    WOD.invalidateTerrain();
    if (window.WOD && typeof WOD.bootstrapMenuBackgroundBattle === "function") WOD.bootstrapMenuBackgroundBattle();
  }

  function resizeEditorCanvas() {
    const canvas = document.getElementById("editorCanvas");
    if (!canvas) return;
    canvas.width = canvas.clientWidth || 800;
    canvas.height = canvas.clientHeight || 600;
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
      if (state.dragging) onEditorUp();
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
    const unit = WOD.createUnitAt(type, hex.x, hex.y, faction);
    state.selected = { type: "unit", value: unit };
    renderSelection();
    WOD.invalidateTerrain();
    scheduleEditorRender();
  }

  function paintAt(pos) {
    const hex = nearestHex(pos);
    if (!hex) return;

    if (state.tool === "territory") {
      let own = Math.max(0, Math.min(state.owner, state.maxFactionSlots));
      WOD.setHexOwner(hex, own);
      WOD.invalidateTerrain();
      return;
    }
    if (state.tool === "paint") {
      hex.type = state.terrain;
      hex.baseColor = WOD.getTerrainColor(hex.type);
      if (hex.type === "urban") attachUrbanHex(hex);
      WOD.invalidateTerrain();
      return;
    }
    if (state.tool === "erase") {
      hex.type = "grass";
      hex.baseColor = WOD.getTerrainColor("grass");
      hex.cityId = null;
      WOD.invalidateTerrain();
      return;
    }
    if (state.tool === "city") {
      createTown(hex);
      return;
    }
    if (state.tool === "unit") {
      const uo = Math.max(1, state.owner || 1);
      const unit = WOD.createUnitAt("light", hex.x, hex.y, uo);
      state.selected = { type: "unit", value: unit };
      renderSelection();
      return;
    }
    if (state.tool === "factory" || state.tool === "harbor") {
      const city = nearestCity(pos, 80) || createTown(hex);
      if (state.tool === "factory") city.hasFactory = true;
      if (state.tool === "harbor") city.hasHarbor = true;
      state.selected = { type: "city", value: city };
      renderSelection();
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
    WOD.invalidateTerrain();
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
    if (state.tool === "select") {
      const city = nearestCity(pos);
      const unit = nearestUnit(pos);
      if (city) { state.selected = { type: "city", value: city }; state.dragKind = "city"; }
      else if (unit) { state.selected = { type: "unit", value: unit }; state.dragKind = "unit"; }
      else { state.selected = null; state.dragKind = null; }
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
    const pos = editorWorldPos(event);
    if (state.tool === "select" && state.selected) {
      const hex = nearestHex(pos);
      if (!hex) return;
      const obj = state.selected.value;
      obj.x = hex.x; obj.y = hex.y; obj.q = hex.q; obj.r = hex.r;
      if (state.selected.type === "city") {
        for (const pt of WOD.getHexesInRadius(hex.q, hex.r, 2)) {
          const h = WOD.gameData.hexes[`${pt.q},${pt.r}`];
          if (h && h.type !== "water" && h.type !== "deep_water") {
            h.type = "urban";
            h.baseColor = WOD.getTerrainColor("urban");
            h.cityId = obj.id;
          }
        }
      }
      WOD.invalidateTerrain();
    } else {
      paintAt(pos);
    }
    scheduleEditorRender();
  }

  function onEditorUp() {
    if (state.open && state.territoryPainting) {
      WOD.endHexOwnerBatch();
      state.territoryPainting = false;
    }
    state.viewPanDrag = null;
    state.dragging = false;
    state.dragKind = null;
  }

  function renderEditor() {
    const canvas = document.getElementById("editorCanvas");
    if (!canvas || !window.WOD || !WOD.gameData) return;
    const ctx = canvas.getContext("2d");
    const b = bounds();
    const vc = { cx: b.cx + state.viewPanX, cy: b.cy + state.viewPanY };
    const scale = getEditorBaseScale(canvas) * state.viewZoom;
    state.renderView = { canvas, b, scale, vc };
    const L = WOD.gameData.layers;

    ctx.fillStyle = "#154360";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (typeof WOD.syncTerrainCacheForEditorView === "function") {
      try {
        WOD.syncTerrainCacheForEditorView({
          terrain: L.terrain,
          territory: L.territory,
          diplomacy: L.diplomacy,
          terrainViewMode: WOD.gameData.terrainViewMode,
        });
        const tb = WOD.getTerrainBitmap();
        if (tb && tb.img && tb.width > 0) {
          const x0 = canvas.width / 2 + (tb.minX - vc.cx) * scale;
          const y0 = canvas.height / 2 + (tb.minY - vc.cy) * scale;
          ctx.drawImage(tb.img, x0, y0, tb.width * scale, tb.height * scale);
        }
      } catch (e) { /* ignore snapshot errors during init */ }
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
          const p = toCanvas(city.x, city.y);
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
    state.renderView = null;
  }

  function renderSelection() {
    const panel = document.getElementById("editorSelection");
    if (!panel) return;
    if (!state.selected) {
      panel.innerHTML = "Nothing selected.";
      panel.classList.add("editor-hint");
      return;
    }
    panel.classList.remove("editor-hint");
    const obj = state.selected.value;
    if (state.selected.type === "city") {
      panel.innerHTML = `
        <div class="editor-row"><label>Name</label><input id="selName" value="${obj.name || ""}"></div>
        <div class="editor-row"><label>Owner</label><input id="selOwner" type="number" min="0" max="6" value="${obj.owner || 0}"></div>
        <div class="editor-row"><label>HP</label><input id="selHp" type="number" value="${obj.hp || 1000}"></div>
        <div class="editor-row"><label>Income bonus</label><input id="selIncome" type="number" value="${obj.incomeBonus || 0}"></div>
        <div class="editor-row"><label>MP bonus</label><input id="selMp" type="number" value="${obj.manpowerBonus || 0}"></div>
        <div class="editor-row"><label>Factory</label><input id="selFactory" type="checkbox" ${obj.hasFactory ? "checked" : ""}></div>
        <div class="editor-row"><label>Harbor</label><input id="selHarbor" type="checkbox" ${obj.hasHarbor ? "checked" : ""}></div>
        <button type="button" class="editor-btn" id="applySelection" style="width:100%;margin-top:8px">Apply town</button>`;
      document.getElementById("applySelection").onclick = () => {
        obj.name = document.getElementById("selName").value || obj.name;
        obj.owner = parseInt(document.getElementById("selOwner").value, 10) || 0;
        obj.hp = parseInt(document.getElementById("selHp").value, 10) || obj.hp;
        obj.incomeBonus = parseInt(document.getElementById("selIncome").value, 10) || 0;
        obj.manpowerBonus = parseInt(document.getElementById("selMp").value, 10) || 0;
        obj.hasFactory = document.getElementById("selFactory").checked;
        obj.hasHarbor = document.getElementById("selHarbor").checked;
        WOD.invalidateTerrain();
        scheduleEditorRender();
      };
    } else {
      panel.innerHTML = `
        <div class="editor-row"><label>Name</label><input id="selName" value="${obj.name || ""}"></div>
        <div class="editor-row"><label>Owner</label><input id="selOwner" type="number" min="0" max="6" value="${obj.owner || 1}"></div>
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
      document.getElementById("applySelection").onclick = () => {
        obj.name = document.getElementById("selName").value || obj.name;
        obj.owner = parseInt(document.getElementById("selOwner").value, 10) || obj.owner;
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
        WOD.invalidateTerrain();
        rebuildUnitPalette();
        scheduleEditorRender();
      };
    }
  }

  function saveEditorMap() {
    const name = prompt("Map name:", "Custom Map " + new Date().toLocaleTimeString()) || "Custom Map";
    const mapData = WOD.exportMapData();
    const thumbnail = makeThumbnail();
    if (typeof window.wodSaveMapToLibraryWithName === "function") {
      window.wodSaveMapToLibraryWithName(String(name).trim(), { mapData, thumb: thumbnail || undefined });
    }
    renderMapBrowser();
    const data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mapData));
    const a = document.createElement("a");
    a.href = data;
    a.download = name.replace(/[^a-z0-9_-]/gi, "_") + ".json";
    a.click();
  }

  function makeThumbnail() {
    const canvas = document.getElementById("editorCanvas");
    try { return canvas.toDataURL("image/png"); } catch { return ""; }
  }

  function renderMapBrowser() {
    const browser = document.getElementById("mapBrowser");
    if (!browser) return;
    const saved =
      typeof window.wodGetSavedMapsList === "function" ? window.wodGetSavedMapsList() : [];
    browser.textContent = "";
    if (saved.length === 0) {
      browser.innerHTML = `<div class="editor-hint">No maps saved yet. Use <strong>Save to library + export</strong> or open <strong>Browse library…</strong> from the toolbar.</div>`;
      return;
    }
    for (const m of saved) {
      const card = document.createElement("div");
      card.className = "map-card";
      card.dataset.mapId = m.id || "";

      const img = document.createElement("img");
      img.className = "map-thumb";
      img.alt = "";
      if (m.thumb || m.thumbnail) img.src = m.thumb || m.thumbnail;

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
        state.selected = null;
        state.viewPanX = 0;
        state.viewPanY = 0;
        state.viewZoom = 1;
        renderSelection();
        scheduleEditorRender();
      });
      del.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const id = card.dataset.mapId;
        if (!id || !confirm("Delete this map from your library?")) return;
        if (typeof window.wodDeleteSavedMapById === "function") window.wodDeleteSavedMapById(id);
        renderMapBrowser();
      });

      browser.appendChild(card);
    }
  }

  function loadEditorMap(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      WOD.loadMapData(JSON.parse(e.target.result));
      state.selected = null;
      state.viewPanX = 0;
      state.viewPanY = 0;
      state.viewZoom = 1;
      renderSelection();
      scheduleEditorRender();
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  window.wodNotifyEditorMapChanged = function () {
    if (!state.open) return;
    state.selected = null;
    scheduleEditorRender();
    renderSelection();
    renderMapBrowser();
  };

  window.openMapEditor = openMapEditor;
  window.closeMapEditor = closeMapEditor;
  window.renderMapBrowser = renderMapBrowser;
})();
