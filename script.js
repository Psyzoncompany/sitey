/* ============================================
   ElectroLab — Motor de Simulação de Circuitos
   ============================================ */

(function () {
  "use strict";

  /* ──────────────── CONSTANTES ──────────────── */
  const GRID_SIZE = 20;
  const TERMINAL_RADIUS = 5;
  const SNAP = GRID_SIZE;
  const WIRE_COLOR = "#58a6ff";
  const WIRE_ACTIVE_COLOR = "#3fb950";
  const SELECT_COLOR = "#58a6ff";
  const GRID_COLOR = "rgba(48,54,61,0.45)";
  const COMPONENT_W = 80;
  const COMPONENT_H = 50;

  /* ──────────────── ESTADO GLOBAL ──────────────── */
  const state = {
    components: [],
    wires: [],
    selectedComponent: null,
    dragging: null,
    dragOffset: { x: 0, y: 0 },
    wiring: null,          // { fromComp, fromTerm, x, y }
    wiringMouse: null,
    simRunning: false,
    simPaused: false,
    simInterval: null,
    simTime: 0,
    graphData: { voltage: [], current: [], charge: [] },
    nextId: 1,
    mode: "explore",
    solderTool: "iron",
    solderPoints: [],
    solderJoints: [],
  };

  /* ──────────────── REFERÊNCIAS DOM ──────────────── */
  let canvas, ctx, graphCanvas, graphCtx, solderCanvas, solderCtx;

  /* ──────────────── DEFINIÇÕES DE COMPONENTES ──────────────── */
  const COMP_DEFS = {
    battery:        { label: "Bateria DC",       cat: "sources",     defaultValue: 9,   unit: "V",  color: "#3fb950", terminals: 2 },
    ground:         { label: "Terra (GND)",      cat: "sources",     defaultValue: 0,   unit: "V",  color: "#8b949e", terminals: 1 },
    switch:         { label: "Chave",            cat: "sources",     defaultValue: 0,   unit: "",   color: "#d29922", terminals: 2, togglable: true },
    pushbutton:     { label: "Botão Pulsador",   cat: "sources",     defaultValue: 0,   unit: "",   color: "#d29922", terminals: 2, togglable: true },
    resistor:       { label: "Resistor",         cat: "passive",     defaultValue: 1000, unit: "Ω", color: "#db6d28", terminals: 2 },
    potentiometer:  { label: "Potenciômetro",    cat: "passive",     defaultValue: 10000, unit: "Ω", color: "#db6d28", terminals: 3 },
    capacitor:      { label: "Capacitor",        cat: "passive",     defaultValue: 100, unit: "µF", color: "#bc8cff", terminals: 2 },
    capacitor_pol:  { label: "Cap. Polarizado",  cat: "passive",     defaultValue: 470, unit: "µF", color: "#bc8cff", terminals: 2 },
    fuse:           { label: "Fusível",          cat: "passive",     defaultValue: 1,   unit: "A",  color: "#f85149", terminals: 2 },
    led:            { label: "LED",              cat: "semi",        defaultValue: 2,   unit: "V",  color: "#3fb950", terminals: 2 },
    lamp:           { label: "Lâmpada",          cat: "semi",        defaultValue: 12,  unit: "V",  color: "#d29922", terminals: 2 },
    diode:          { label: "Diodo",            cat: "semi",        defaultValue: 0.7, unit: "V",  color: "#8b949e", terminals: 2 },
    transistor_npn: { label: "Transistor NPN",   cat: "semi",        defaultValue: 100, unit: "β",  color: "#bc8cff", terminals: 3 },
    transistor_pnp: { label: "Transistor PNP",   cat: "semi",        defaultValue: 100, unit: "β",  color: "#bc8cff", terminals: 3 },
    relay:          { label: "Relé",             cat: "electro",     defaultValue: 5,   unit: "V",  color: "#39d2c0", terminals: 4 },
    buzzer:         { label: "Buzzer",           cat: "electro",     defaultValue: 5,   unit: "V",  color: "#39d2c0", terminals: 2 },
    gate_and:       { label: "AND",              cat: "logic",       defaultValue: 0,   unit: "",   color: "#58a6ff", terminals: 3 },
    gate_or:        { label: "OR",               cat: "logic",       defaultValue: 0,   unit: "",   color: "#58a6ff", terminals: 3 },
    gate_not:       { label: "NOT",              cat: "logic",       defaultValue: 0,   unit: "",   color: "#58a6ff", terminals: 2 },
    voltmeter:      { label: "Voltímetro",       cat: "instruments", defaultValue: 0,   unit: "V",  color: "#58a6ff", terminals: 2 },
    ammeter:        { label: "Amperímetro",      cat: "instruments", defaultValue: 0,   unit: "A",  color: "#58a6ff", terminals: 2 },
  };

  /* ──────────────── UTILIDADES ──────────────── */
  function snap(v) { return Math.round(v / SNAP) * SNAP; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function uid() { return state.nextId++; }
  function now() { const d = new Date(); return d.toLocaleTimeString("pt-BR"); }

  function logMessage(text, type) {
    type = type || "info";
    const log = document.getElementById("messages-log");
    if (!log) return;
    const el = document.createElement("div");
    el.className = "msg-item " + type;
    el.innerHTML = '<span class="msg-time">' + now() + '</span><span class="msg-text">' + text + "</span>";
    log.prepend(el);
  }

  /* ──────────────── TERMINAL POSITIONS ──────────────── */
  function getTerminals(comp) {
    var def = COMP_DEFS[comp.type];
    var cx = comp.x + COMPONENT_W / 2;
    var cy = comp.y + COMPONENT_H / 2;
    var terms = [];
    if (def.terminals === 1) {
      terms.push({ id: 0, x: cx, y: comp.y, label: "GND" });
    } else if (def.terminals === 2) {
      terms.push({ id: 0, x: comp.x, y: cy, label: "A" });
      terms.push({ id: 1, x: comp.x + COMPONENT_W, y: cy, label: "B" });
    } else if (def.terminals === 3) {
      terms.push({ id: 0, x: comp.x, y: cy, label: "A" });
      terms.push({ id: 1, x: comp.x + COMPONENT_W, y: cy, label: "B" });
      terms.push({ id: 2, x: cx, y: comp.y + COMPONENT_H, label: "C" });
    } else if (def.terminals === 4) {
      terms.push({ id: 0, x: comp.x, y: comp.y + 15, label: "A" });
      terms.push({ id: 1, x: comp.x + COMPONENT_W, y: comp.y + 15, label: "B" });
      terms.push({ id: 2, x: comp.x, y: comp.y + COMPONENT_H - 15, label: "C" });
      terms.push({ id: 3, x: comp.x + COMPONENT_W, y: comp.y + COMPONENT_H - 15, label: "D" });
    }
    return terms;
  }

  function findTerminalAt(mx, my, excludeComp, excludeTerm) {
    for (var i = 0; i < state.components.length; i++) {
      var c = state.components[i];
      var terms = getTerminals(c);
      for (var j = 0; j < terms.length; j++) {
        if (excludeComp && c.id === excludeComp && terms[j].id === excludeTerm) continue;
        if (dist({ x: mx, y: my }, terms[j]) < TERMINAL_RADIUS + 8) {
          return { comp: c, term: terms[j] };
        }
      }
    }
    return null;
  }

  function findComponentAt(mx, my) {
    for (var i = state.components.length - 1; i >= 0; i--) {
      var c = state.components[i];
      if (mx >= c.x && mx <= c.x + COMPONENT_W && my >= c.y && my <= c.y + COMPONENT_H) {
        return c;
      }
    }
    return null;
  }

  /* ──────────────── CRIAR COMPONENTE ──────────────── */
  function createComponent(type, x, y) {
    var def = COMP_DEFS[type];
    if (!def) return null;
    var comp = {
      id: uid(),
      type: type,
      x: snap(x),
      y: snap(y),
      value: def.defaultValue,
      on: type === "switch" || type === "pushbutton" ? false : true,
      reading: 0,
      charge: 0,
      brightness: 0,
    };
    state.components.push(comp);
    logMessage("Componente adicionado: " + def.label, "info");
    return comp;
  }

  /* ──────────────── DESENHO ──────────────── */
  function drawGrid() {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    for (var x = 0; x < canvas.width; x += GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (var y = 0; y < canvas.height; y += GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
  }

  function drawComponent(comp) {
    var def = COMP_DEFS[comp.type];
    var x = comp.x, y = comp.y;
    var w = COMPONENT_W, h = COMPONENT_H;
    var cx = x + w / 2, cy = y + h / 2;
    var selected = state.selectedComponent && state.selectedComponent.id === comp.id;

    // Background
    ctx.fillStyle = selected ? "rgba(88,166,255,0.12)" : "rgba(33,38,45,0.85)";
    ctx.strokeStyle = selected ? SELECT_COLOR : "#30363d";
    ctx.lineWidth = selected ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();

    // Component-specific symbol
    ctx.save();
    ctx.fillStyle = def.color;
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    switch (comp.type) {
      case "battery":
        // Battery symbol: + and - lines
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy - 12); ctx.lineTo(cx - 8, cy + 12); ctx.lineWidth = 3; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 8, cy - 6); ctx.lineTo(cx + 8, cy + 6); ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = "bold 10px sans-serif";
        ctx.fillText("+" , cx - 16, cy - 8);
        ctx.fillText("−", cx + 18, cy - 8);
        ctx.fillStyle = "#e6edf3";
        ctx.font = "10px sans-serif";
        ctx.fillText(comp.value + "V", cx, cy + 18);
        break;
      case "ground":
        ctx.beginPath();
        ctx.moveTo(cx, y + 5); ctx.lineTo(cx, cy);
        ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy);
        ctx.moveTo(cx - 8, cy + 5); ctx.lineTo(cx + 8, cy + 5);
        ctx.moveTo(cx - 4, cy + 10); ctx.lineTo(cx + 4, cy + 10);
        ctx.stroke();
        break;
      case "switch":
      case "pushbutton":
        ctx.beginPath();
        ctx.moveTo(x + 10, cy); ctx.lineTo(cx - 8, cy); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 8, cy); ctx.lineTo(x + w - 10, cy); ctx.stroke();
        if (comp.on) {
          ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy); ctx.strokeStyle = WIRE_ACTIVE_COLOR; ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 4, cy - 12); ctx.stroke();
        }
        ctx.fillStyle = "#e6edf3"; ctx.font = "9px sans-serif";
        ctx.fillText(comp.on ? "ON" : "OFF", cx, y + h - 5);
        break;
      case "resistor":
        ctx.beginPath();
        ctx.moveTo(x + 10, cy); ctx.lineTo(cx - 18, cy);
        var zigzag = [[-18,0],[-14,-8],[-6,8],[2,-8],[10,8],[18,0]];
        for (var i = 0; i < zigzag.length; i++) {
          ctx.lineTo(cx + zigzag[i][0], cy + zigzag[i][1]);
        }
        ctx.lineTo(x + w - 10, cy);
        ctx.stroke();
        ctx.fillStyle = "#e6edf3"; ctx.font = "9px sans-serif";
        ctx.fillText(formatValue(comp.value, "Ω"), cx, cy + 18);
        break;
      case "potentiometer":
        ctx.beginPath();
        ctx.moveTo(x + 10, cy); ctx.lineTo(x + w - 10, cy);
        ctx.stroke();
        ctx.beginPath(); ctx.rect(cx - 14, cy - 6, 28, 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, y + h - 5);
        ctx.moveTo(cx - 4, y + h - 9); ctx.lineTo(cx, y + h - 5); ctx.lineTo(cx + 4, y + h - 9);
        ctx.stroke();
        ctx.fillStyle = "#e6edf3"; ctx.font = "9px sans-serif";
        ctx.fillText(formatValue(comp.value, "Ω"), cx, cy - 14);
        break;
      case "capacitor":
      case "capacitor_pol":
        ctx.beginPath();
        ctx.moveTo(x + 10, cy); ctx.lineTo(cx - 4, cy); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 4, cy - 12); ctx.lineTo(cx - 4, cy + 12); ctx.lineWidth = 2.5; ctx.stroke();
        ctx.lineWidth = 2;
        if (comp.type === "capacitor_pol") {
          ctx.beginPath(); ctx.arc(cx + 4, cy, 12, -Math.PI / 2, Math.PI / 2); ctx.stroke();
          ctx.font = "bold 9px sans-serif"; ctx.fillText("+", cx - 14, cy - 10);
        } else {
          ctx.beginPath();
          ctx.moveTo(cx + 4, cy - 12); ctx.lineTo(cx + 4, cy + 12); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(cx + (comp.type === "capacitor_pol" ? 16 : 4), cy);
        ctx.lineTo(x + w - 10, cy); ctx.stroke();
        ctx.fillStyle = "#e6edf3"; ctx.font = "9px sans-serif";
        ctx.fillText(comp.value + "µF", cx, cy + 20);
        break;
      case "fuse":
        ctx.beginPath();
        ctx.moveTo(x + 10, cy); ctx.lineTo(cx - 12, cy);
        ctx.moveTo(cx + 12, cy); ctx.lineTo(x + w - 10, cy);
        ctx.stroke();
        ctx.beginPath(); ctx.rect(cx - 12, cy - 6, 24, 12); ctx.stroke();
        ctx.fillStyle = "#e6edf3"; ctx.font = "9px sans-serif";
        ctx.fillText(comp.value + "A", cx, cy + 18);
        break;
      case "led":
        var glow = state.simRunning && comp.brightness > 0;
        if (glow) {
          ctx.shadowColor = def.color; ctx.shadowBlur = 12;
        }
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy - 10); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx - 8, cy + 10); ctx.closePath();
        ctx.stroke();
        if (glow) ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(cx + 8, cy - 10); ctx.lineTo(cx + 8, cy + 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 10, cy); ctx.lineTo(cx - 8, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 8, cy); ctx.lineTo(x + w - 10, cy); ctx.stroke();
        // arrows for LED
        ctx.beginPath(); ctx.moveTo(cx + 4, cy - 14); ctx.lineTo(cx + 12, cy - 20); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 10, cy - 14); ctx.lineTo(cx + 18, cy - 20); ctx.stroke();
        ctx.fillStyle = "#e6edf3"; ctx.font = "9px sans-serif";
        ctx.fillText("LED", cx, cy + 20);
        break;
      case "lamp":
        var glowL = state.simRunning && comp.brightness > 0;
        if (glowL) { ctx.shadowColor = "#d29922"; ctx.shadowBlur = 15; }
        ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
        if (glowL) { ctx.fillStyle = "rgba(210,153,34,0.4)"; ctx.fill(); }
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(cx - 8, cy - 8); ctx.lineTo(cx + 8, cy + 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 8, cy - 8); ctx.lineTo(cx - 8, cy + 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 10, cy); ctx.lineTo(cx - 12, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 12, cy); ctx.lineTo(x + w - 10, cy); ctx.stroke();
        break;
      case "diode":
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy - 10); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx - 8, cy + 10); ctx.closePath();
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 8, cy - 10); ctx.lineTo(cx + 8, cy + 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 10, cy); ctx.lineTo(cx - 8, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 8, cy); ctx.lineTo(x + w - 10, cy); ctx.stroke();
        break;
      case "transistor_npn":
      case "transistor_pnp":
        ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 5, cy - 10); ctx.lineTo(cx - 5, cy + 10); ctx.lineWidth = 3; ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - 5, cy - 5); ctx.lineTo(cx + 10, cy - 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 5, cy + 5); ctx.lineTo(cx + 10, cy + 12); ctx.stroke();
        // E, B, C labels
        ctx.fillStyle = "#e6edf3"; ctx.font = "8px sans-serif";
        ctx.fillText("B", x + 3, cy + 3);
        ctx.fillText(comp.type === "transistor_npn" ? "C" : "E", x + w - 12, cy - 14);
        ctx.fillText(comp.type === "transistor_npn" ? "E" : "C", x + w - 12, cy + 18);
        break;
      case "relay":
        ctx.beginPath(); ctx.rect(cx - 16, cy - 16, 32, 32); ctx.stroke();
        ctx.fillStyle = "#e6edf3"; ctx.font = "10px sans-serif";
        ctx.fillText("Relé", cx, cy);
        ctx.font = "8px sans-serif";
        ctx.fillText(comp.value + "V", cx, cy + 10);
        break;
      case "buzzer":
        var buzzActive = state.simRunning && comp.brightness > 0;
        if (buzzActive) { ctx.shadowColor = "#39d2c0"; ctx.shadowBlur = 10; }
        ctx.beginPath(); ctx.arc(cx, cy, 13, -Math.PI / 2, Math.PI / 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - 13); ctx.lineTo(cx - 10, cy - 13);
        ctx.lineTo(cx - 10, cy + 13); ctx.lineTo(cx, cy + 13); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(x + 10, cy); ctx.lineTo(cx - 10, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 13, cy); ctx.lineTo(x + w - 10, cy); ctx.stroke();
        if (buzzActive) {
          ctx.fillStyle = "#39d2c0"; ctx.font = "10px sans-serif";
          ctx.fillText("♪", cx + 18, cy - 10);
        }
        break;
      case "gate_and":
      case "gate_or":
      case "gate_not":
        ctx.beginPath(); ctx.rect(cx - 16, cy - 14, 32, 28); ctx.stroke();
        ctx.fillStyle = def.color; ctx.font = "bold 11px sans-serif";
        ctx.fillText(comp.type.replace("gate_", "").toUpperCase(), cx, cy);
        break;
      case "voltmeter":
        ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = def.color; ctx.font = "bold 14px sans-serif";
        ctx.fillText("V", cx, cy);
        ctx.fillStyle = "#e6edf3"; ctx.font = "9px sans-serif";
        if (state.simRunning) ctx.fillText(comp.reading.toFixed(2) + "V", cx, cy + 20);
        break;
      case "ammeter":
        ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = def.color; ctx.font = "bold 14px sans-serif";
        ctx.fillText("A", cx, cy);
        ctx.fillStyle = "#e6edf3"; ctx.font = "9px sans-serif";
        if (state.simRunning) ctx.fillText(comp.reading.toFixed(2) + "mA", cx, cy + 20);
        break;
    }
    ctx.restore();

    // Draw terminals
    var terms = getTerminals(comp);
    for (var t = 0; t < terms.length; t++) {
      ctx.beginPath();
      ctx.arc(terms[t].x, terms[t].y, TERMINAL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = state.wiring && state.wiring.fromComp === comp.id && state.wiring.fromTerm === terms[t].id
        ? "#3fb950" : "#58a6ff";
      ctx.fill();
    }
  }

  function formatValue(val, unit) {
    if (unit === "Ω") {
      if (val >= 1e6) return (val / 1e6).toFixed(1) + "MΩ";
      if (val >= 1e3) return (val / 1e3).toFixed(1) + "kΩ";
      return val + "Ω";
    }
    return val + unit;
  }

  function drawWires() {
    for (var i = 0; i < state.wires.length; i++) {
      var w = state.wires[i];
      var fromComp = state.components.find(function (c) { return c.id === w.from.comp; });
      var toComp = state.components.find(function (c) { return c.id === w.to.comp; });
      if (!fromComp || !toComp) continue;
      var fromTerms = getTerminals(fromComp);
      var toTerms = getTerminals(toComp);
      var ft = fromTerms.find(function (t) { return t.id === w.from.term; });
      var tt = toTerms.find(function (t) { return t.id === w.to.term; });
      if (!ft || !tt) continue;

      ctx.beginPath();
      ctx.moveTo(ft.x, ft.y);
      // Route wire with right angles
      var midX = (ft.x + tt.x) / 2;
      ctx.lineTo(midX, ft.y);
      ctx.lineTo(midX, tt.y);
      ctx.lineTo(tt.x, tt.y);
      ctx.strokeStyle = state.simRunning ? WIRE_ACTIVE_COLOR : WIRE_COLOR;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Current flow animation
      if (state.simRunning && !state.simPaused && w.current > 0) {
        var phase = (Date.now() / 200) % 20;
        ctx.setLineDash([4, 12]);
        ctx.lineDashOffset = -phase;
        ctx.strokeStyle = "rgba(63,185,80,0.6)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ft.x, ft.y);
        ctx.lineTo(midX, ft.y);
        ctx.lineTo(midX, tt.y);
        ctx.lineTo(tt.x, tt.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  function drawWiringPreview() {
    if (!state.wiring || !state.wiringMouse) return;
    var fromComp = state.components.find(function (c) { return c.id === state.wiring.fromComp; });
    if (!fromComp) return;
    var terms = getTerminals(fromComp);
    var ft = terms.find(function (t) { return t.id === state.wiring.fromTerm; });
    if (!ft) return;

    ctx.beginPath();
    ctx.moveTo(ft.x, ft.y);
    ctx.lineTo(state.wiringMouse.x, state.wiringMouse.y);
    ctx.strokeStyle = "rgba(88,166,255,0.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function render() {
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawWires();
    drawWiringPreview();
    for (var i = 0; i < state.components.length; i++) {
      drawComponent(state.components[i]);
    }
    if (state.simRunning && !state.simPaused) {
      requestAnimationFrame(render);
    }
  }

  /* ──────────────── SIMULAÇÃO ──────────────── */
  function simulate() {
    if (!state.simRunning || state.simPaused) return;
    state.simTime += 0.05;

    // Build adjacency: find all connected nodes
    var totalVoltage = 0;
    var totalResistance = 0;
    var hasSource = false;
    var hasClosed = true;

    // Simple series circuit analysis
    var batteries = state.components.filter(function (c) { return c.type === "battery"; });
    var resistors = state.components.filter(function (c) { return c.type === "resistor"; });
    var capacitors = state.components.filter(function (c) { return c.type === "capacitor" || c.type === "capacitor_pol"; });
    var leds = state.components.filter(function (c) { return c.type === "led"; });
    var lamps = state.components.filter(function (c) { return c.type === "lamp"; });
    var buzzers = state.components.filter(function (c) { return c.type === "buzzer"; });
    var switches = state.components.filter(function (c) { return c.type === "switch" || c.type === "pushbutton"; });
    var voltmeters = state.components.filter(function (c) { return c.type === "voltmeter"; });
    var ammeters = state.components.filter(function (c) { return c.type === "ammeter"; });

    // Sum voltages from batteries
    batteries.forEach(function (b) { totalVoltage += b.value; hasSource = true; });

    // Check if switches are open
    switches.forEach(function (s) { if (!s.on) hasClosed = false; });

    // Sum resistances
    resistors.forEach(function (r) { totalResistance += r.value; });

    // LED forward voltage drop
    leds.forEach(function (l) { totalResistance += 100; }); // implicit current-limiting
    lamps.forEach(function (l) { totalResistance += l.value * 10; });
    buzzers.forEach(function (b) { totalResistance += 100; });

    if (totalResistance < 1) totalResistance = 1;

    var current = 0;
    if (hasSource && hasClosed && state.wires.length > 0) {
      current = (totalVoltage / totalResistance) * 1000; // mA
    }

    // Update component states
    leds.forEach(function (l) {
      l.brightness = current > 0 && totalVoltage >= l.value ? 1 : 0;
    });
    lamps.forEach(function (l) {
      l.brightness = current > 0 ? Math.min(1, current / 100) : 0;
    });
    buzzers.forEach(function (b) {
      b.brightness = current > 0 ? 1 : 0;
    });

    // Capacitor charging simulation
    capacitors.forEach(function (cap) {
      var tau = (totalResistance * cap.value) / 1e6; // RC in seconds
      if (tau < 0.001) tau = 0.001;
      if (current > 0) {
        cap.charge += (totalVoltage - cap.charge) * (1 - Math.exp(-0.05 / tau)) ;
      } else {
        cap.charge *= 0.999;
      }
    });

    // Voltmeter/ammeter readings
    voltmeters.forEach(function (v) { v.reading = hasSource && hasClosed ? totalVoltage : 0; });
    ammeters.forEach(function (a) { a.reading = current; });

    // Update wire current
    state.wires.forEach(function (w) { w.current = current; });

    // Update multimeter
    updateMultimeter(totalVoltage, current, totalResistance, capacitors);

    // Update graph data
    state.graphData.voltage.push({ t: state.simTime, v: hasSource ? totalVoltage : 0 });
    state.graphData.current.push({ t: state.simTime, v: current });
    var totalCharge = 0;
    capacitors.forEach(function (c) { totalCharge += c.charge; });
    state.graphData.charge.push({ t: state.simTime, v: totalCharge });

    // Limit data points
    if (state.graphData.voltage.length > 200) state.graphData.voltage.shift();
    if (state.graphData.current.length > 200) state.graphData.current.shift();
    if (state.graphData.charge.length > 200) state.graphData.charge.shift();

    drawGraph();
  }

  function updateMultimeter(voltage, current, resistance, capacitors) {
    var el = function (id) { return document.getElementById(id); };
    el("meter-voltage").textContent = voltage.toFixed(2) + " V";
    el("meter-current").textContent = current.toFixed(2) + " mA";
    el("meter-resistance").textContent = formatValue(resistance, "Ω");
    el("meter-power").textContent = (voltage * current / 1000).toFixed(4) + " W";

    var totalCap = 0, totalCharge = 0, totalEnergy = 0;
    capacitors.forEach(function (c) {
      totalCap += c.value;
      totalCharge += c.charge * c.value;
      totalEnergy += 0.5 * (c.value / 1e6) * c.charge * c.charge;
    });
    el("meter-capacitance").textContent = totalCap.toFixed(2) + " µF";
    el("meter-charge").textContent = (totalCharge).toFixed(2) + " µC";
    el("meter-energy").textContent = (totalEnergy * 1e6).toFixed(2) + " µJ";

    var tau = capacitors.length > 0 ? (resistance * totalCap / 1e6) * 1000 : 0;
    el("meter-tau").textContent = tau.toFixed(2) + " ms";
  }

  /* ──────────────── GRÁFICOS ──────────────── */
  function drawGraph() {
    if (!graphCanvas || !graphCtx) return;
    var gc = graphCtx;
    var w = graphCanvas.width, h = graphCanvas.height;
    gc.clearRect(0, 0, w, h);

    // Background
    gc.fillStyle = "#0d1117";
    gc.fillRect(0, 0, w, h);

    // Grid
    gc.strokeStyle = "rgba(48,54,61,0.6)";
    gc.lineWidth = 0.5;
    for (var i = 0; i < w; i += 40) { gc.beginPath(); gc.moveTo(i, 0); gc.lineTo(i, h); gc.stroke(); }
    for (var j = 0; j < h; j += 20) { gc.beginPath(); gc.moveTo(0, j); gc.lineTo(w, j); gc.stroke(); }

    var type = document.querySelector('input[name="graph-type"]:checked');
    var dataKey = type ? type.value : "voltage";
    var data = state.graphData[dataKey];
    if (!data || data.length < 2) return;

    var maxV = 1;
    data.forEach(function (d) { if (Math.abs(d.v) > maxV) maxV = Math.abs(d.v); });
    maxV *= 1.2;

    var colors = { voltage: "#58a6ff", current: "#3fb950", charge: "#bc8cff" };
    var labels = { voltage: "Tensão (V)", current: "Corrente (mA)", charge: "Carga (µC)" };

    gc.beginPath();
    gc.strokeStyle = colors[dataKey] || "#58a6ff";
    gc.lineWidth = 2;
    for (var k = 0; k < data.length; k++) {
      var px = (k / (data.length - 1)) * (w - 20) + 10;
      var py = h - 10 - ((data[k].v / maxV) * (h - 30));
      if (k === 0) gc.moveTo(px, py); else gc.lineTo(px, py);
    }
    gc.stroke();

    // Label
    gc.fillStyle = colors[dataKey];
    gc.font = "11px sans-serif";
    gc.fillText(labels[dataKey], 10, 14);
    gc.fillText("Max: " + maxV.toFixed(2), w - 80, 14);
  }

  /* ──────────────── PROPRIEDADES ──────────────── */
  function showProperties(comp) {
    var placeholder = document.querySelector("#panel-properties .placeholder-text");
    var details = document.getElementById("prop-details");
    var nameEl = document.getElementById("prop-name");
    var fieldsEl = document.getElementById("prop-fields");

    if (!comp) {
      if (placeholder) placeholder.classList.remove("hidden");
      if (details) details.classList.add("hidden");
      return;
    }

    var def = COMP_DEFS[comp.type];
    if (placeholder) placeholder.classList.add("hidden");
    if (details) details.classList.remove("hidden");
    if (nameEl) nameEl.textContent = def.label + " (ID: " + comp.id + ")";
    if (!fieldsEl) return;
    fieldsEl.innerHTML = "";

    // Value field
    if (def.unit) {
      var field = document.createElement("div");
      field.className = "prop-field";
      var label = document.createElement("label");
      label.textContent = "Valor (" + def.unit + ")";
      var input = document.createElement("input");
      input.type = "number";
      input.value = comp.value;
      input.step = def.unit === "Ω" ? 100 : 0.1;
      input.addEventListener("change", function () {
        comp.value = parseFloat(input.value) || 0;
        render();
        logMessage("Valor de " + def.label + " alterado para " + comp.value + def.unit, "info");
      });
      field.appendChild(label);
      field.appendChild(input);
      fieldsEl.appendChild(field);
    }

    // Toggle for switches
    if (def.togglable) {
      var toggleField = document.createElement("div");
      toggleField.className = "prop-field";
      var toggleLabel = document.createElement("label");
      toggleLabel.textContent = "Estado";
      var toggleSelect = document.createElement("select");
      var optOn = document.createElement("option"); optOn.value = "true"; optOn.textContent = "Ligado (ON)";
      var optOff = document.createElement("option"); optOff.value = "false"; optOff.textContent = "Desligado (OFF)";
      toggleSelect.appendChild(optOn);
      toggleSelect.appendChild(optOff);
      toggleSelect.value = String(comp.on);
      toggleSelect.addEventListener("change", function () {
        comp.on = toggleSelect.value === "true";
        render();
      });
      toggleField.appendChild(toggleLabel);
      toggleField.appendChild(toggleSelect);
      fieldsEl.appendChild(toggleField);
    }

    // Position info
    var posField = document.createElement("div");
    posField.className = "prop-field";
    var posInfo = document.createElement("div");
    posInfo.className = "prop-info";
    posInfo.textContent = "Posição: (" + comp.x + ", " + comp.y + ") | Tipo: " + comp.type;
    posField.appendChild(posInfo);
    fieldsEl.appendChild(posField);

    // Connections info
    var connWires = state.wires.filter(function (w) {
      return w.from.comp === comp.id || w.to.comp === comp.id;
    });
    var connField = document.createElement("div");
    connField.className = "prop-field";
    var connInfo = document.createElement("div");
    connInfo.className = "prop-info";
    connInfo.textContent = "Conexões: " + connWires.length + " fio(s)";
    connField.appendChild(connInfo);
    fieldsEl.appendChild(connField);
  }

  /* ──────────────── TEORIA ──────────────── */
  var THEORY = {
    current: {
      title: "Corrente Elétrica",
      content: '<h5>Corrente Elétrica (I)</h5><p>A corrente elétrica é o fluxo ordenado de cargas elétricas (elétrons) através de um condutor. É medida em Ampères (A).</p><div class="formula">I = Q / t<br>I = Corrente (A) | Q = Carga (C) | t = Tempo (s)</div><div class="example"><strong>Exemplo:</strong> Se 2 Coulombs de carga passam por um fio em 1 segundo, a corrente é de 2A.</div><p>A corrente convencional flui do terminal positivo (+) para o negativo (−), enquanto os elétrons fluem na direção oposta.</p>'
    },
    voltage: {
      title: "Tensão",
      content: '<h5>Tensão Elétrica (V)</h5><p>A tensão é a diferença de potencial elétrico entre dois pontos. É a "pressão" que empurra os elétrons pelo circuito. Medida em Volts (V).</p><div class="formula">V = W / Q<br>V = Tensão (V) | W = Trabalho (J) | Q = Carga (C)</div><div class="example"><strong>Exemplo:</strong> Uma bateria de 9V fornece 9 Joules de energia para cada Coulomb de carga que passa por ela.</div>'
    },
    resistance: {
      title: "Resistência",
      content: '<h5>Resistência Elétrica (R)</h5><p>A resistência é a oposição ao fluxo de corrente elétrica. Medida em Ohms (Ω).</p><div class="formula">Lei de Ohm: V = I × R<br>R = V / I</div><div class="example"><strong>Exemplo:</strong> Um resistor de 1kΩ com 9V aplicados terá uma corrente de 9mA passando por ele.</div><p>Os resistores são identificados por faixas coloridas que indicam seu valor.</p>'
    },
    capacitance: {
      title: "Capacitância",
      content: '<h5>Capacitância (C)</h5><p>Capacitância é a capacidade de um componente armazenar carga elétrica. Medida em Farads (F).</p><div class="formula">C = Q / V<br>C = Capacitância (F) | Q = Carga (C) | V = Tensão (V)</div><div class="example"><strong>Exemplo:</strong> Um capacitor de 100µF carregado a 5V armazena 500µC de carga.</div><p>Capacitores polarizados devem ser conectados respeitando a polaridade (+/−).</p>'
    },
    power: {
      title: "Potência",
      content: '<h5>Potência Elétrica (P)</h5><p>Potência é a taxa de transferência de energia elétrica. Medida em Watts (W).</p><div class="formula">P = V × I<br>P = I² × R<br>P = V² / R</div><div class="example"><strong>Exemplo:</strong> Um LED com 2V e 20mA consome 40mW de potência.</div>'
    },
    timeconstant: {
      title: "Constante de Tempo",
      content: '<h5>Constante de Tempo (τ)</h5><p>Em circuitos RC, a constante de tempo determina a velocidade de carga/descarga do capacitor.</p><div class="formula">τ = R × C</div><div class="example"><strong>Exemplo:</strong> R = 1kΩ, C = 100µF → τ = 0.1s. Após 5τ (0.5s), o capacitor estará ~99% carregado.</div><p>Após 1τ, o capacitor atinge ~63% da tensão final.</p>'
    },
    polarity: {
      title: "Polaridade",
      content: '<h5>Polaridade</h5><p>Muitos componentes eletrônicos têm polaridade, significando que devem ser conectados em uma orientação específica:</p><p>• <strong>LEDs:</strong> Ânodo (+) e Cátodo (−)<br>• <strong>Capacitores eletrolíticos:</strong> Terminal + e −<br>• <strong>Diodos:</strong> Ânodo e Cátodo<br>• <strong>Baterias:</strong> Terminal + e −</p><div class="example"><strong>Atenção:</strong> Conectar componentes polarizados ao contrário pode danificá-los!</div>'
    },
    series_parallel: {
      title: "Série e Paralelo",
      content: '<h5>Circuitos Série e Paralelo</h5><p><strong>Série:</strong> Componentes conectados em sequência. A corrente é a mesma, as tensões se somam.</p><div class="formula">R_total = R1 + R2 + R3...<br>C_total = 1/(1/C1 + 1/C2 + 1/C3...)</div><p><strong>Paralelo:</strong> Componentes conectados nos mesmos pontos. A tensão é a mesma, as correntes se somam.</p><div class="formula">1/R_total = 1/R1 + 1/R2 + 1/R3...<br>C_total = C1 + C2 + C3...</div>'
    },
    transistor_func: {
      title: "Função do Transistor",
      content: '<h5>Transistores</h5><p>Transistores são semicondutores que podem amplificar sinais ou funcionar como chaves eletrônicas.</p><p><strong>NPN:</strong> Conduz quando a base recebe tensão positiva em relação ao emissor.<br><strong>PNP:</strong> Conduz quando a base recebe tensão negativa em relação ao emissor.</p><div class="formula">Ic = β × Ib<br>β = Ganho de corrente do transistor</div><div class="example"><strong>Exemplo:</strong> Com β = 100 e Ib = 0.1mA, a corrente do coletor será Ic = 10mA.</div>'
    },
    relay_func: {
      title: "Função do Relé",
      content: '<h5>Relés</h5><p>Relés são interruptores eletromecânicos acionados por uma bobina. Quando a bobina é energizada, o contato fecha (ou abre, dependendo do tipo).</p><div class="example"><strong>Uso típico:</strong> Controlar circuitos de alta potência com sinais de baixa potência. Ex: Usar 5V de um microcontrolador para acionar uma lâmpada de 220V.</div>'
    },
    soldering_func: {
      title: "Soldagem",
      content: '<h5>Soldagem Eletrônica</h5><p>A soldagem é o processo de unir componentes eletrônicos a uma placa de circuito impresso (PCB) usando solda derretida.</p><p><strong>Dicas:</strong></p><p>• Aqueça o terminal/pad, não a solda diretamente<br>• Uma boa junta de solda é brilhante e cônica<br>• Evite solda fria (aspecto opaco e granulado)<br>• Use flux para melhorar o fluxo da solda<br>• Cuidado com pontes de solda entre trilhas</p>'
    },
    digital_logic: {
      title: "Lógica Digital",
      content: '<h5>Portas Lógicas</h5><p>Portas lógicas são os blocos fundamentais da eletrônica digital:</p><p><strong>AND:</strong> Saída HIGH apenas quando TODAS as entradas são HIGH<br><strong>OR:</strong> Saída HIGH quando QUALQUER entrada é HIGH<br><strong>NOT:</strong> Inverte a entrada (HIGH → LOW, LOW → HIGH)</p><div class="formula">AND: A · B = Y<br>OR: A + B = Y<br>NOT: Ā = Y</div><div class="example"><strong>Exemplo:</strong> Uma porta AND com entradas 1 e 0 produz saída 0. Com entradas 1 e 1, produz saída 1.</div>'
    },
    computers: {
      title: "Eletrônica & Computadores",
      content: '<h5>Eletrônica e Computadores</h5><p>Os computadores modernos são construídos com bilhões de transistores organizados em circuitos integrados:</p><p>• <strong>CPU:</strong> Processador central, feito de portas lógicas<br>• <strong>RAM:</strong> Memória volátil usando capacitores e transistores<br>• <strong>SSD:</strong> Armazenamento usando células de memória flash<br>• <strong>GPU:</strong> Processamento gráfico massivamente paralelo</p><div class="example"><strong>Curiosidade:</strong> Um processador moderno pode ter mais de 10 bilhões de transistores em um chip menor que uma unha!</div>'
    },
  };

  /* ──────────────── PROJETOS ──────────────── */
  var PROJECTS = [
    {
      name: "💡 LED Simples",
      desc: "Circuito básico com bateria, resistor e LED em série.",
      components: [
        { type: "battery", x: 100, y: 160 },
        { type: "resistor", x: 260, y: 160 },
        { type: "led", x: 420, y: 160 },
      ],
      wires: [[0, 1, 1, 0], [1, 1, 2, 0]],
    },
    {
      name: "🔀 Divisor de Tensão",
      desc: "Dois resistores em série para dividir a tensão.",
      components: [
        { type: "battery", x: 100, y: 140 },
        { type: "resistor", x: 260, y: 140 },
        { type: "resistor", x: 420, y: 140 },
        { type: "voltmeter", x: 420, y: 260 },
      ],
      wires: [[0, 1, 1, 0], [1, 1, 2, 0]],
    },
    {
      name: "⏱ Circuito RC",
      desc: "Resistor e capacitor demonstrando carga/descarga.",
      components: [
        { type: "battery", x: 100, y: 160 },
        { type: "switch", x: 260, y: 160 },
        { type: "resistor", x: 420, y: 160 },
        { type: "capacitor", x: 580, y: 160 },
      ],
      wires: [[0, 1, 1, 0], [1, 1, 2, 0], [2, 1, 3, 0]],
    },
    {
      name: "🔺 Chave com Transistor",
      desc: "Transistor NPN usado como chave eletrônica para acionar um LED.",
      components: [
        { type: "battery", x: 100, y: 100 },
        { type: "resistor", x: 260, y: 100 },
        { type: "transistor_npn", x: 420, y: 100 },
        { type: "led", x: 420, y: 240 },
      ],
      wires: [[0, 1, 1, 0], [1, 1, 2, 0]],
    },
    {
      name: "⚙ Controle com Relé",
      desc: "Relé controlando um circuito de potência a partir de um sinal de baixa tensão.",
      components: [
        { type: "battery", x: 100, y: 120 },
        { type: "switch", x: 260, y: 120 },
        { type: "relay", x: 420, y: 120 },
        { type: "lamp", x: 420, y: 260 },
      ],
      wires: [[0, 1, 1, 0], [1, 1, 2, 0]],
    },
    {
      name: "🧠 Portas Lógicas",
      desc: "Demonstração de portas AND, OR e NOT combinadas.",
      components: [
        { type: "gate_and", x: 140, y: 120 },
        { type: "gate_or", x: 300, y: 120 },
        { type: "gate_not", x: 460, y: 120 },
        { type: "led", x: 460, y: 260 },
      ],
      wires: [[0, 1, 1, 0], [1, 1, 2, 0]],
    },
    {
      name: "🔔 Alarme Simples",
      desc: "Buzzer acionado por um botão pulsador.",
      components: [
        { type: "battery", x: 100, y: 160 },
        { type: "pushbutton", x: 260, y: 160 },
        { type: "buzzer", x: 420, y: 160 },
      ],
      wires: [[0, 1, 1, 0], [1, 1, 2, 0]],
    },
    {
      name: "📏 Medição de Circuito",
      desc: "Circuito com voltímetro e amperímetro para medir grandezas.",
      components: [
        { type: "battery", x: 100, y: 140 },
        { type: "resistor", x: 260, y: 140 },
        { type: "ammeter", x: 420, y: 140 },
        { type: "voltmeter", x: 260, y: 280 },
      ],
      wires: [[0, 1, 1, 0], [1, 1, 2, 0]],
    },
  ];

  /* ──────────────── DESAFIOS ──────────────── */
  var CHALLENGES = [
    {
      name: "Acenda o LED",
      difficulty: "⭐ Iniciante",
      desc: "Monte um circuito para acender um LED usando uma bateria e um resistor.",
      hint: "Conecte: Bateria → Resistor → LED",
      check: function () {
        var has = { battery: false, resistor: false, led: false };
        state.components.forEach(function (c) { if (has.hasOwnProperty(c.type)) has[c.type] = true; });
        return has.battery && has.resistor && has.led && state.wires.length >= 2;
      },
    },
    {
      name: "Divisor de Tensão",
      difficulty: "⭐ Iniciante",
      desc: "Crie um divisor de tensão com dois resistores para obter metade da tensão da bateria.",
      hint: "Use dois resistores de mesmo valor em série",
      check: function () {
        var resistors = state.components.filter(function (c) { return c.type === "resistor"; });
        return resistors.length >= 2 && state.components.some(function (c) { return c.type === "battery"; });
      },
    },
    {
      name: "Circuito com Chave",
      difficulty: "⭐ Iniciante",
      desc: "Monte um circuito com uma chave que liga e desliga uma lâmpada.",
      hint: "Bateria → Chave → Lâmpada",
      check: function () {
        return state.components.some(function (c) { return c.type === "switch"; }) &&
               state.components.some(function (c) { return c.type === "lamp"; }) &&
               state.components.some(function (c) { return c.type === "battery"; });
      },
    },
    {
      name: "Proteção com Fusível",
      difficulty: "⭐⭐ Intermediário",
      desc: "Adicione um fusível ao circuito para proteger contra sobrecorrente.",
      hint: "Coloque o fusível em série com o circuito",
      check: function () {
        return state.components.some(function (c) { return c.type === "fuse"; }) &&
               state.components.some(function (c) { return c.type === "battery"; }) &&
               state.wires.length >= 2;
      },
    },
    {
      name: "Carga do Capacitor",
      difficulty: "⭐⭐ Intermediário",
      desc: "Monte um circuito RC e observe o capacitor carregando no gráfico.",
      hint: "Use Bateria → Resistor → Capacitor e observe o gráfico de carga",
      check: function () {
        return state.components.some(function (c) { return c.type === "capacitor" || c.type === "capacitor_pol"; }) &&
               state.components.some(function (c) { return c.type === "resistor"; }) &&
               state.components.some(function (c) { return c.type === "battery"; });
      },
    },
    {
      name: "Transistor como Chave",
      difficulty: "⭐⭐⭐ Avançado",
      desc: "Use um transistor NPN para controlar um LED com um sinal de baixa corrente.",
      hint: "Aplique tensão na base do transistor para ativar o LED no coletor",
      check: function () {
        return state.components.some(function (c) { return c.type === "transistor_npn"; }) &&
               state.components.some(function (c) { return c.type === "led"; }) &&
               state.components.some(function (c) { return c.type === "battery"; });
      },
    },
    {
      name: "Lógica Digital",
      difficulty: "⭐⭐⭐ Avançado",
      desc: "Combine portas AND e NOT para criar uma função lógica NAND.",
      hint: "Conecte a saída de uma porta AND à entrada de uma porta NOT",
      check: function () {
        return state.components.some(function (c) { return c.type === "gate_and"; }) &&
               state.components.some(function (c) { return c.type === "gate_not"; }) &&
               state.wires.length >= 1;
      },
    },
  ];

  /* ──────────────── AULAS ──────────────── */
  var LESSONS = [
    { title: "📖 Introdução à Eletricidade", desc: "Entenda os conceitos fundamentais: tensão, corrente e resistência." },
    { title: "🔋 Fontes de Energia", desc: "Aprenda sobre baterias, fontes DC e como elas fornecem energia." },
    { title: "⊟ Resistores e Lei de Ohm", desc: "Domine a lei V = I × R e entenda o papel dos resistores." },
    { title: "💡 LEDs e Diodos", desc: "Componentes semicondutores: como LEDs emitem luz e diodos direcionam corrente." },
    { title: "⊞ Capacitores", desc: "Armazenamento de energia: como capacitores carregam e descarregam." },
    { title: "🔺 Transistores", desc: "Amplificação e chaveamento: o componente mais importante da eletrônica." },
    { title: "🧠 Lógica Digital", desc: "Portas AND, OR, NOT: os blocos fundamentais dos computadores." },
    { title: "🔧 Soldagem", desc: "Técnicas práticas de soldagem para montar seus próprios circuitos." },
  ];

  /* ──────────────── SOLDAGEM ──────────────── */
  function initSoldering() {
    if (!solderCanvas) return;
    var w = solderCanvas.width = solderCanvas.parentElement ? solderCanvas.parentElement.clientWidth - 260 : 600;
    var h = solderCanvas.height = solderCanvas.parentElement ? solderCanvas.parentElement.clientHeight : 400;
    solderCtx = solderCanvas.getContext("2d");

    // Create solder points (PCB pads)
    state.solderPoints = [];
    state.solderJoints = [];
    var rows = 8, cols = 12;
    var padW = w / (cols + 2), padH = h / (rows + 2);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        state.solderPoints.push({
          x: padW * (c + 1.5),
          y: padH * (r + 1.5),
          row: r,
          col: c,
          soldered: false,
          quality: 0,
          hasComponent: (r === 2 || r === 5) && c >= 2 && c <= 9,
        });
      }
    }
    drawSolderBoard();
  }

  function drawSolderBoard() {
    if (!solderCtx) return;
    var sc = solderCtx;
    var w = solderCanvas.width, h = solderCanvas.height;

    // PCB background
    sc.fillStyle = "#1a5c2a";
    sc.fillRect(0, 0, w, h);

    // Traces
    sc.strokeStyle = "#c0883090";
    sc.lineWidth = 3;
    for (var i = 0; i < state.solderPoints.length - 1; i++) {
      var p = state.solderPoints[i];
      var next = state.solderPoints[i + 1];
      if (next && p.row === next.row) {
        sc.beginPath();
        sc.moveTo(p.x, p.y);
        sc.lineTo(next.x, next.y);
        sc.stroke();
      }
    }

    // Pads
    state.solderPoints.forEach(function (p) {
      sc.beginPath();
      sc.arc(p.x, p.y, 8, 0, Math.PI * 2);

      if (p.soldered) {
        // Solder quality visualization
        if (p.quality > 0.7) {
          sc.fillStyle = "#c0c0c0"; // Good solder - shiny
        } else if (p.quality > 0.3) {
          sc.fillStyle = "#808080"; // Cold solder
        } else {
          sc.fillStyle = "#505050"; // Poor solder
        }
      } else {
        sc.fillStyle = "#c08830"; // Copper pad
      }
      sc.fill();
      sc.strokeStyle = "#906020";
      sc.lineWidth = 1;
      sc.stroke();

      // Component indicator
      if (p.hasComponent) {
        sc.fillStyle = "#333";
        sc.fillRect(p.x - 4, p.y - 4, 8, 8);
      }
    });

    // Labels
    sc.fillStyle = "#fff";
    sc.font = "12px sans-serif";
    sc.fillText("PCB — Placa de Circuito Impresso", 10, 20);

    var toolNames = { iron: "🔧 Ferro", solder: "🪛 Solda", cutter: "✂ Cortador", inspect: "🔍 Inspecionar" };
    sc.fillText("Ferramenta: " + (toolNames[state.solderTool] || state.solderTool), 10, h - 10);
  }

  function handleSolderClick(e) {
    if (!solderCanvas) return;
    var rect = solderCanvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    var closest = null, minD = Infinity;
    state.solderPoints.forEach(function (p) {
      var d = dist({ x: mx, y: my }, p);
      if (d < minD && d < 20) { minD = d; closest = p; }
    });

    if (!closest) return;
    var statusEl = document.getElementById("solder-status");

    switch (state.solderTool) {
      case "iron":
        if (statusEl) statusEl.textContent = "Aquecendo pad na posição (" + closest.row + "," + closest.col + ")...";
        closest.heated = true;
        break;
      case "solder":
        if (closest.heated) {
          closest.soldered = true;
          closest.quality = 0.5 + Math.random() * 0.5;
          if (statusEl) statusEl.textContent = "Solda aplicada! Qualidade: " + (closest.quality * 100).toFixed(0) + "%";
        } else {
          closest.soldered = true;
          closest.quality = 0.1 + Math.random() * 0.2;
          if (statusEl) statusEl.textContent = "⚠ Solda fria! Aqueça primeiro com o ferro.";
        }
        break;
      case "cutter":
        if (closest.soldered) {
          closest.soldered = false;
          closest.quality = 0;
          closest.heated = false;
          if (statusEl) statusEl.textContent = "Solda removida do pad (" + closest.row + "," + closest.col + ")";
        }
        break;
      case "inspect":
        var info = "Pad (" + closest.row + "," + closest.col + "): ";
        if (closest.soldered) {
          info += "Soldado — Qualidade: " + (closest.quality * 100).toFixed(0) + "%" +
                  (closest.quality > 0.7 ? " ✅ Boa" : closest.quality > 0.3 ? " ⚠ Média" : " ❌ Ruim");
        } else {
          info += "Não soldado";
        }
        if (closest.hasComponent) info += " | Tem componente";
        if (statusEl) statusEl.textContent = info;
        break;
    }
    drawSolderBoard();
  }

  /* ──────────────── INICIALIZAÇÃO ──────────────── */
  function init() {
    canvas = document.getElementById("circuit-canvas");
    graphCanvas = document.getElementById("graph-canvas");
    solderCanvas = document.getElementById("solder-canvas");

    if (canvas) {
      ctx = canvas.getContext("2d");
      resizeCanvas();
    }
    if (graphCanvas) {
      graphCtx = graphCanvas.getContext("2d");
      resizeGraphCanvas();
    }

    setupDragDrop();
    setupCanvasEvents();
    setupUI();
    setupTheory();
    setupProjects();
    setupChallenges();
    setupLessons();
    setupSoldering();
    render();
    logMessage("ElectroLab inicializado! Arraste componentes para começar.", "success");
  }

  function resizeCanvas() {
    if (!canvas) return;
    var parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }
  }

  function resizeGraphCanvas() {
    if (!graphCanvas) return;
    var parent = graphCanvas.parentElement;
    if (parent) {
      graphCanvas.width = parent.clientWidth - 140;
      graphCanvas.height = parent.clientHeight;
    }
  }

  /* ──────────────── DRAG & DROP ──────────────── */
  function setupDragDrop() {
    var items = document.querySelectorAll(".comp-item");
    items.forEach(function (item) {
      item.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", item.getAttribute("data-type"));
        e.dataTransfer.effectAllowed = "copy";
      });
    });

    if (canvas) {
      canvas.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      });

      canvas.addEventListener("drop", function (e) {
        e.preventDefault();
        var type = e.dataTransfer.getData("text/plain");
        if (!type || !COMP_DEFS[type]) return;
        var rect = canvas.getBoundingClientRect();
        var x = e.clientX - rect.left - COMPONENT_W / 2;
        var y = e.clientY - rect.top - COMPONENT_H / 2;
        createComponent(type, x, y);
        // Hide welcome overlay
        var overlay = document.getElementById("welcome-overlay");
        if (overlay) overlay.classList.add("hidden");
        render();
      });
    }
  }

  /* ──────────────── CANVAS EVENTS ──────────────── */
  function setupCanvasEvents() {
    if (!canvas) return;

    canvas.addEventListener("mousedown", function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;

      // Check terminal click first (for wiring)
      var termHit = findTerminalAt(mx, my);
      if (termHit) {
        if (state.wiring) {
          // Complete wire
          if (state.wiring.fromComp !== termHit.comp.id || state.wiring.fromTerm !== termHit.term.id) {
            state.wires.push({
              from: { comp: state.wiring.fromComp, term: state.wiring.fromTerm },
              to: { comp: termHit.comp.id, term: termHit.term.id },
              current: 0,
            });
            logMessage("Fio conectado!", "success");
          }
          state.wiring = null;
          state.wiringMouse = null;
        } else {
          // Start wire
          state.wiring = { fromComp: termHit.comp.id, fromTerm: termHit.term.id };
          state.wiringMouse = { x: mx, y: my };
        }
        render();
        return;
      }

      // Cancel wiring if clicking elsewhere
      if (state.wiring) {
        state.wiring = null;
        state.wiringMouse = null;
        render();
        return;
      }

      // Check component click
      var comp = findComponentAt(mx, my);
      if (comp) {
        // Toggle switch/pushbutton on click during simulation
        if (state.simRunning && (comp.type === "switch" || comp.type === "pushbutton")) {
          comp.on = !comp.on;
          logMessage(COMP_DEFS[comp.type].label + " " + (comp.on ? "ligado" : "desligado"), "info");
          render();
          return;
        }

        state.selectedComponent = comp;
        state.dragging = comp;
        state.dragOffset = { x: mx - comp.x, y: my - comp.y };
        showProperties(comp);
        render();
      } else {
        state.selectedComponent = null;
        state.dragging = null;
        showProperties(null);
        render();
      }
    });

    canvas.addEventListener("mousemove", function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;

      if (state.wiring) {
        state.wiringMouse = { x: mx, y: my };
        render();
        return;
      }

      if (state.dragging) {
        state.dragging.x = snap(mx - state.dragOffset.x);
        state.dragging.y = snap(my - state.dragOffset.y);
        render();
      }

      // Tooltip on hover
      var comp = findComponentAt(mx, my);
      var tooltip = document.getElementById("tooltip");
      if (comp && tooltip) {
        var def = COMP_DEFS[comp.type];
        tooltip.innerHTML = "<strong>" + def.label + "</strong><br>Valor: " + comp.value + " " + def.unit;
        if (state.simRunning && comp.reading) {
          tooltip.innerHTML += "<br>Leitura: " + comp.reading.toFixed(2);
        }
        tooltip.style.left = (mx + 15) + "px";
        tooltip.style.top = (my + 15) + "px";
        tooltip.classList.remove("hidden");
      } else if (tooltip) {
        tooltip.classList.add("hidden");
      }
    });

    canvas.addEventListener("mouseup", function () {
      state.dragging = null;
    });

    // Right-click context menu
    canvas.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var comp = findComponentAt(mx, my);
      if (comp) {
        state.selectedComponent = comp;
        showProperties(comp);

        // Delete via custom inline prompt
        deleteComponent(comp);
        logMessage("Componente excluído via menu de contexto", "warning");
        render();
      }
    });

    // Keyboard
    document.addEventListener("keydown", function (e) {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selectedComponent && document.activeElement.tagName !== "INPUT") {
          deleteComponent(state.selectedComponent);
        }
      }
      if (e.key === "Escape") {
        state.selectedComponent = null;
        state.wiring = null;
        state.wiringMouse = null;
        showProperties(null);
        render();
      }
    });

    // Resize
    window.addEventListener("resize", function () {
      resizeCanvas();
      resizeGraphCanvas();
      render();
      drawGraph();
    });
  }

  function deleteComponent(comp) {
    state.components = state.components.filter(function (c) { return c.id !== comp.id; });
    state.wires = state.wires.filter(function (w) { return w.from.comp !== comp.id && w.to.comp !== comp.id; });
    if (state.selectedComponent && state.selectedComponent.id === comp.id) {
      state.selectedComponent = null;
    }
    showProperties(null);
    logMessage("Componente removido: " + COMP_DEFS[comp.type].label, "warning");
    render();
  }

  /* ──────────────── UI SETUP ──────────────── */
  function setupUI() {
    // Welcome close
    var welcomeClose = document.getElementById("welcome-close");
    if (welcomeClose) {
      welcomeClose.addEventListener("click", function () {
        var overlay = document.getElementById("welcome-overlay");
        if (overlay) overlay.classList.add("hidden");
      });
    }

    // Simulation controls
    var btnStart = document.getElementById("btn-sim-start");
    var btnPause = document.getElementById("btn-sim-pause");
    var btnReset = document.getElementById("btn-sim-reset");
    var btnClear = document.getElementById("btn-clear");

    if (btnStart) {
      btnStart.addEventListener("click", function () {
        if (state.components.length === 0) {
          logMessage("Adicione componentes antes de iniciar a simulação!", "warning");
          return;
        }
        state.simRunning = true;
        state.simPaused = false;
        btnStart.disabled = true;
        btnPause.disabled = false;
        if (state.simInterval) clearInterval(state.simInterval);
        state.simInterval = setInterval(simulate, 50);
        logMessage("▶ Simulação iniciada!", "success");
        render();
      });
    }

    if (btnPause) {
      btnPause.addEventListener("click", function () {
        state.simPaused = !state.simPaused;
        btnPause.textContent = state.simPaused ? "▶ Continuar" : "⏸ Pausar";
        logMessage(state.simPaused ? "⏸ Simulação pausada" : "▶ Simulação continuada", "info");
        if (!state.simPaused) render();
      });
    }

    if (btnReset) {
      btnReset.addEventListener("click", function () {
        state.simRunning = false;
        state.simPaused = false;
        state.simTime = 0;
        if (state.simInterval) { clearInterval(state.simInterval); state.simInterval = null; }
        btnStart.disabled = false;
        btnPause.disabled = true;
        btnPause.textContent = "⏸ Pausar";
        // Reset component states
        state.components.forEach(function (c) {
          c.brightness = 0;
          c.reading = 0;
          c.charge = 0;
        });
        state.wires.forEach(function (w) { w.current = 0; });
        state.graphData = { voltage: [], current: [], charge: [] };
        updateMultimeter(0, 0, 0, []);
        logMessage("🔄 Simulação resetada", "info");
        render();
        drawGraph();
      });
    }

    if (btnClear) {
      btnClear.addEventListener("click", function () {
        if (state.components.length === 0) return;
        state.components = [];
        state.wires = [];
        state.selectedComponent = null;
        state.simRunning = false;
        state.simPaused = false;
        state.simTime = 0;
        if (state.simInterval) { clearInterval(state.simInterval); state.simInterval = null; }
        btnStart.disabled = false;
        btnPause.disabled = true;
        btnPause.textContent = "⏸ Pausar";
        state.graphData = { voltage: [], current: [], charge: [] };
        updateMultimeter(0, 0, 0, []);
        showProperties(null);
        logMessage("🗑 Bancada limpa!", "warning");
        render();
        drawGraph();
      });
    }

    // Mode buttons
    document.querySelectorAll(".mode-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".mode-btn").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        state.mode = btn.getAttribute("data-mode");
        handleModeChange(state.mode);
      });
    });

    // Panel tabs
    document.querySelectorAll(".panel-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".panel-tab").forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        document.querySelectorAll("#right-panel .panel-content").forEach(function (p) { p.classList.add("hidden"); });
        var target = document.getElementById("panel-" + tab.getAttribute("data-panel"));
        if (target) target.classList.remove("hidden");
      });
    });

    // Bottom tabs
    document.querySelectorAll(".bottom-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".bottom-tab").forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        document.querySelectorAll("#bottom-panel .bottom-content").forEach(function (p) { p.classList.add("hidden"); });
        var target = document.getElementById("btab-" + tab.getAttribute("data-btab"));
        if (target) target.classList.remove("hidden");
      });
    });

    // Graph controls
    document.querySelectorAll('input[name="graph-type"]').forEach(function (radio) {
      radio.addEventListener("change", function () { drawGraph(); });
    });
    var graphClear = document.getElementById("graph-clear");
    if (graphClear) {
      graphClear.addEventListener("click", function () {
        state.graphData = { voltage: [], current: [], charge: [] };
        drawGraph();
        logMessage("Gráfico limpo", "info");
      });
    }

    // Component search
    var searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        var query = searchInput.value.toLowerCase().trim();
        document.querySelectorAll(".comp-item").forEach(function (item) {
          var text = item.textContent.toLowerCase();
          var type = item.getAttribute("data-type").toLowerCase();
          if (query === "" || text.indexOf(query) !== -1 || type.indexOf(query) !== -1) {
            item.classList.remove("hidden");
          } else {
            item.classList.add("hidden");
          }
        });
      });
    }

    // Modal close buttons
    document.querySelectorAll(".modal-close").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.closest(".modal").classList.add("hidden");
      });
    });

    // Close modals on backdrop click
    document.querySelectorAll(".modal").forEach(function (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) modal.classList.add("hidden");
      });
    });
  }

  function handleModeChange(mode) {
    // Close all modals first
    document.querySelectorAll(".modal").forEach(function (m) { m.classList.add("hidden"); });

    switch (mode) {
      case "lessons":
        document.getElementById("modal-lessons").classList.remove("hidden");
        break;
      case "challenges":
        document.getElementById("modal-challenges").classList.remove("hidden");
        break;
      case "projects":
        document.getElementById("modal-projects").classList.remove("hidden");
        break;
      case "soldering":
        document.getElementById("modal-soldering").classList.remove("hidden");
        initSoldering();
        break;
      case "explore":
      default:
        // Just stay on the workspace
        break;
    }
  }

  /* ──────────────── THEORY SETUP ──────────────── */
  function setupTheory() {
    document.querySelectorAll(".theory-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var topic = btn.getAttribute("data-topic");
        var display = document.getElementById("theory-display");
        if (display && THEORY[topic]) {
          display.innerHTML = THEORY[topic].content;
        }
      });
    });
  }

  /* ──────────────── PROJECTS SETUP ──────────────── */
  function setupProjects() {
    var grid = document.getElementById("projects-grid");
    if (!grid) return;

    PROJECTS.forEach(function (proj, idx) {
      var card = document.createElement("div");
      card.className = "project-card";
      card.innerHTML = "<h4>" + proj.name + "</h4><p>" + proj.desc + "</p>";
      card.addEventListener("click", function () {
        loadProject(idx);
        document.getElementById("modal-projects").classList.add("hidden");
        // Switch mode back to explore
        document.querySelectorAll(".mode-btn").forEach(function (b) { b.classList.remove("active"); });
        var exploreBtn = document.querySelector('.mode-btn[data-mode="explore"]');
        if (exploreBtn) exploreBtn.classList.add("active");
        state.mode = "explore";
      });
      grid.appendChild(card);
    });
  }

  function loadProject(idx) {
    var proj = PROJECTS[idx];
    if (!proj) return;

    // Clear current
    state.components = [];
    state.wires = [];
    state.selectedComponent = null;
    state.nextId = 1;

    // Add components
    var compMap = {};
    proj.components.forEach(function (def, i) {
      var comp = createComponent(def.type, def.x, def.y);
      if (comp) compMap[i] = comp.id;
    });

    // Add wires
    if (proj.wires) {
      proj.wires.forEach(function (w) {
        if (compMap[w[0]] !== undefined && compMap[w[2]] !== undefined) {
          state.wires.push({
            from: { comp: compMap[w[0]], term: w[1] },
            to: { comp: compMap[w[2]], term: w[3] },
            current: 0,
          });
        }
      });
    }

    // Hide welcome overlay
    var overlay = document.getElementById("welcome-overlay");
    if (overlay) overlay.classList.add("hidden");

    logMessage("📁 Projeto carregado: " + proj.name, "success");
    render();
  }

  /* ──────────────── CHALLENGES SETUP ──────────────── */
  function setupChallenges() {
    var grid = document.getElementById("challenges-grid");
    if (!grid) return;

    CHALLENGES.forEach(function (ch, idx) {
      var card = document.createElement("div");
      card.className = "challenge-card";
      card.innerHTML = '<div class="difficulty">' + ch.difficulty + '</div><h4>' + ch.name + '</h4><p>' + ch.desc + '</p><p style="margin-top:6px;font-size:10px;color:#6e7681">💡 Dica: ' + ch.hint + '</p>';
      card.addEventListener("click", function () {
        startChallenge(idx);
        document.getElementById("modal-challenges").classList.add("hidden");
        document.querySelectorAll(".mode-btn").forEach(function (b) { b.classList.remove("active"); });
        var exploreBtn = document.querySelector('.mode-btn[data-mode="explore"]');
        if (exploreBtn) exploreBtn.classList.add("active");
        state.mode = "explore";
      });
      grid.appendChild(card);
    });
  }

  function startChallenge(idx) {
    var ch = CHALLENGES[idx];
    if (!ch) return;

    // Clear workspace
    state.components = [];
    state.wires = [];
    state.selectedComponent = null;
    state.nextId = 1;

    var overlay = document.getElementById("welcome-overlay");
    if (overlay) overlay.classList.add("hidden");

    logMessage("🏆 Desafio iniciado: " + ch.name, "info");
    logMessage("📋 Objetivo: " + ch.desc, "info");
    logMessage("💡 Dica: " + ch.hint, "info");

    // Set up periodic check
    state.currentChallenge = ch;
    if (state.challengeCheckInterval) clearInterval(state.challengeCheckInterval);
    state.challengeCheckInterval = setInterval(function () {
      if (state.currentChallenge && state.currentChallenge.check()) {
        logMessage("🎉 Parabéns! Desafio '" + state.currentChallenge.name + "' completado!", "success");
        clearInterval(state.challengeCheckInterval);
        state.currentChallenge = null;
      }
    }, 2000);

    render();
  }

  /* ──────────────── LESSONS SETUP ──────────────── */
  function setupLessons() {
    var content = document.getElementById("lessons-content");
    if (!content) return;

    var html = "<h3>Aulas de Eletrônica</h3><p>Selecione uma aula para aprender os fundamentos:</p>";
    LESSONS.forEach(function (lesson, idx) {
      html += '<div class="lesson-card" data-lesson="' + idx + '"><h4>' + lesson.title + '</h4><p>' + lesson.desc + '</p></div>';
    });
    content.innerHTML = html;

    content.querySelectorAll(".lesson-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var idx = parseInt(card.getAttribute("data-lesson"));
        var lesson = LESSONS[idx];
        // Map lesson index to theory topic
        var topicMap = ["current", "voltage", "resistance", "polarity", "capacitance", "transistor_func", "digital_logic", "soldering_func"];
        var topic = topicMap[idx] || "current";
        if (THEORY[topic]) {
          content.innerHTML = '<button id="lessons-back" style="background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-secondary);padding:6px 12px;border-radius:4px;cursor:pointer;margin-bottom:12px;font-size:12px">← Voltar às Aulas</button>' +
            '<h3>' + lesson.title + '</h3>' + THEORY[topic].content;
          document.getElementById("lessons-back").addEventListener("click", function () {
            setupLessons();
          });
        }
      });
    });
  }

  /* ──────────────── SOLDERING SETUP ──────────────── */
  function setupSoldering() {
    // Tool buttons
    document.querySelectorAll(".solder-tool").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".solder-tool").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        state.solderTool = btn.getAttribute("data-tool");
        drawSolderBoard();
      });
    });

    // Canvas click
    if (solderCanvas) {
      solderCanvas.addEventListener("click", handleSolderClick);
    }

    // Reset
    var resetBtn = document.getElementById("solder-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        state.solderPoints.forEach(function (p) {
          p.soldered = false;
          p.quality = 0;
          p.heated = false;
        });
        drawSolderBoard();
        var statusEl = document.getElementById("solder-status");
        if (statusEl) statusEl.textContent = "Placa resetada! Comece novamente.";
      });
    }

    // Check
    var checkBtn = document.getElementById("solder-check");
    if (checkBtn) {
      checkBtn.addEventListener("click", function () {
        var total = state.solderPoints.filter(function (p) { return p.hasComponent; }).length;
        var soldered = state.solderPoints.filter(function (p) { return p.hasComponent && p.soldered; }).length;
        var goodQuality = state.solderPoints.filter(function (p) { return p.hasComponent && p.soldered && p.quality > 0.7; }).length;

        var statusEl = document.getElementById("solder-status");
        if (total === 0) {
          if (statusEl) statusEl.textContent = "Nenhum componente para verificar.";
          return;
        }

        const coverage = (soldered / total * 100).toFixed(0);
        const quality = soldered > 0 ? (goodQuality / soldered * 100).toFixed(0) : 0;

        let grade = "❌ Ainda faltam pads para soldar.";
        if (coverage === "100" && parseInt(quality) > 70) {
          grade = "🎉 Excelente trabalho!";
        } else if (coverage === "100") {
          grade = "⚠ Todos soldados, mas melhore a qualidade!";
        }

        const msg = `📊 Resultado:\nCobertura: ${coverage}% (${soldered}/${total} pads)\nQualidade: ${quality}% dos pads com boa solda\n${grade}`;
        if (statusEl) statusEl.textContent = msg;
      });
    }
  }

  /* ──────────────── START ──────────────── */
  document.addEventListener("DOMContentLoaded", init);

})();
