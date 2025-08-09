console.log("[Ruleta] app.js cargado");

/* ===== util ===== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const LSKEY = "ruleta_gamer_v3";

/* ===== state ===== */
let items = [];          // array de strings (juegos actuales)
let historyWinners = []; // ganadores (para excluir si se elige)
let spinning = false;
let angle = 0;           // ángulo actual de la rueda (radianes)
let targetAngle = 0;     // destino de la animación (no usado en este modelo)
let spinStartTime = 0;
let winningIndex = -1;

/* ===== elements ===== */
const elCanvas = $("#wheel");

const ctx = elCanvas.getContext("2d");
console.log("[Ruleta] canvas:", elCanvas, "ctx ok:", !!ctx);
if (!ctx) console.error("Canvas no encontrado o sin contexto 2D");

const elInput = $("#gamesInput");
const elCount = $("#countBadge");
const elWinner = $("#winnerText");
const elLast = $("#lastWinner");
const elBtnLoad = $("#btnLoad");
const elBtnShuffle = $("#btnShuffle");
const elBtnClear = $("#btnClear");
const elBtnSpin = $("#btnSpin");
const elBtnAlt = $("#btnAlt");
const elBtnReset = $("#btnReset");
const elChkDedup = $("#chkDedup");
const elChkExclude = $("#chkExcludeWinner");
const elColorMode = $("#colorMode");
const elLabelMode = $("#labelMode");
const elTip = $("#wheelTooltip");

/* ===== helpers ===== */

// extrae "nombre" de cada línea pegada (si viene con columnas, toma antes del primer tab)
function parseTextarea(text) {
  return text.split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.split(/\t+/)[0] || l); // todo antes del primer \t
}

// paleta sobria de 3 tonos alternados (fallback)
function segmentColor(i) {
  const tri = [
    getComputedStyle(document.documentElement).getPropertyValue('--ring1').trim(),
    getComputedStyle(document.documentElement).getPropertyValue('--ring2').trim(),
    getComputedStyle(document.documentElement).getPropertyValue('--ring3').trim()
  ];
  return tri[i % tri.length] || "#2b3144";
}

function rainbowColor(i, n){
  const h = (i / Math.max(1, n)) * 360;
  return `hsl(${h}deg 55% 48%)`;
}
function triadColor(i){ return segmentColor(i); }
function colorFor(i, n){
  const mode = elColorMode?.value || "triad";
  return mode === "rainbow" ? rainbowColor(i, n) : triadColor(i);
}

function abbrFromName(name, maxLen = 4){
  const clean = name.replace(/\(.*?\)|\[.*?\]/g, "").trim();
  const parts = clean.split(/[\s:\-_/]+/).filter(Boolean);
  let ab = "";
  for (const p of parts){
    const word = p.replace(/[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/g,"");
    if (!word) continue;
    ab += word[0];
    if (ab.length >= maxLen) break;
  }
  if (ab.length < Math.min(3, maxLen)){
    const base = parts[0] || clean;
    for (let i=1; i<base.length && ab.length<maxLen; i++) ab += base[i];
  }
  return ab.toUpperCase();
}

function dedup(arr) {
  const seen = new Set();
  return arr.filter(x => {
    const key = x.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function saveState() {
  localStorage.setItem(LSKEY, JSON.stringify({
    items,
    historyWinners,
    opts: {
      dedup: elChkDedup.checked,
      exclude: elChkExclude.checked
    },
    colorMode: elColorMode?.value || "triad",
    labelMode: elLabelMode?.value || "none",
    text: elInput.value
  }));
}

function loadState() {
  try {
    const raw = localStorage.getItem(LSKEY);
    if (!raw) { updateCount(); drawWheel(); return; }
    const data = JSON.parse(raw);

    // Restauramos SOLO opciones visuales/checkboxes
    if (data?.opts) {
      elChkDedup.checked = !!data.opts.dedup;
      elChkExclude.checked = !!data.opts.exclude;
    }
    if (data?.colorMode && elColorMode) elColorMode.value = data.colorMode;
    if (data?.labelMode && elLabelMode) elLabelMode.value = data.labelMode;

    // 👇 NO restauramos items ni el texto del textarea
    items = [];
    elInput.value = ""; // el placeholder del HTML queda visible

    updateCount();
    drawWheel();
  } catch (e) {
    console.warn(e);
  }
}


function updateCount() {
  elCount.textContent = String(items.length);
}

/* ===== drawing ===== */
function drawWheel(highlightIdx = -1) {
  const W = elCanvas.width, H = elCanvas.height;
  const cx = W / 2, cy = H / 2;
  const outer = Math.min(W, H) * 0.48;
  const inner = outer * 0.18; // hueco central

  ctx.clearRect(0, 0, W, H);

  if (items.length === 0) {
    // círculo vacío
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.fillStyle = "#222738";
    ctx.fill();
    return;
  }

  const step = (Math.PI * 2) / items.length;

  // sectores
  for (let i = 0; i < items.length; i++) {
    const start = angle + i * step;
    const end = start + step;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outer, start, end);
    ctx.closePath();

    // color según modo
    ctx.fillStyle = colorFor(i, items.length);
    ctx.fill();

    // líneas divisorias (sutiles)
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Etiqueta (índice o abreviada)
    const labelMode = elLabelMode?.value || "none";
    if (labelMode !== "none") {
      const mid = (start + end) / 2;
      const rText = outer * 0.80;
      let text = "";
      if (labelMode === "index") text = String(i + 1);
      if (labelMode === "abbr")  text = abbrFromName(items[i], 4);

      if (text) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(mid);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `${Math.max(10, Math.floor(outer*0.06))}px ui-monospace, monospace`;
        ctx.fillStyle = "rgba(0,0,0,.45)";
        ctx.fillText(text, rText, 1.5);
        ctx.fillStyle = "#e9eef7";
        ctx.fillText(text, rText, 0);
        ctx.restore();
      }
    }
  }

  // Zoom animado del sector ganador (overlay, no cambia la física)
function animateWinnerZoom(idx){
  if (idx < 0 || idx >= items.length) return;

  const W = elCanvas.width, H = elCanvas.height;
  const cx = W / 2, cy = H / 2;
  const outer = Math.min(W, H) * 0.48;
  const inner = outer * 0.18;
  const step = (Math.PI * 2) / items.length;
  const start = angle + idx * step;
  const end = start + step;

  const easeOutBack = t => { const c1=1.70158, c3=c1+1; return 1 + c3*Math.pow(t-1,3) + c1*Math.pow(t-1,2); };

  const dur = 950; // ms
  const t0 = performance.now();

  function frame(now){
    const u = Math.min(1, (now - t0) / dur);
    const e = easeOutBack(u);

    // redibuja rueda normal con highlight
    drawWheel(idx);

    // overlay del ganador con "zoom"
    const grow = 1 + 0.14 * e;             // hasta +14% del radio
    const glow = Math.floor(6 + 10*e);     // borde que crece
    const rOuter = outer * grow;
    const rInner = inner * Math.max(0.85, 1 - 0.15*e);

    ctx.save();
    // sector agrandado
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rOuter, start, end);
    ctx.closePath();
    ctx.fillStyle = "rgba(125,211,252,0.24)";
    ctx.fill();

    // borde brillante
    ctx.strokeStyle = "rgba(125,211,252,0.55)";
    ctx.lineWidth = glow;
    ctx.stroke();

    // halo central
    const grad = ctx.createRadialGradient(cx, cy, rInner*0.2, cx, cy, rInner*1.05);
    grad.addColorStop(0, "rgba(125,211,252,0.25)");
    grad.addColorStop(1, "rgba(125,211,252,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rInner*1.05, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    if (u < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

  // hueco central
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fillStyle = "#0d111a";
  ctx.fill();

  // resaltar ganador (zoom)
  if (highlightIdx >= 0) {
    const start = angle + highlightIdx * step;
    const end = start + step;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outer * 1.04, start, end);
    ctx.closePath();
    ctx.fillStyle = "rgba(125, 211, 252, 0.22)"; // cian translúcido
    ctx.fill();
    ctx.restore();
  }
}

/* ===== spin logic (física + tick) ===== */

// Audio para el tick
const tickSound = new Audio('tick.wav');
tickSound.volume = 0.35; // volumen (0.0 a 1.0)
function playTick() {
  tickSound.currentTime = 0.15; // ajusta según dónde esté el “tick” en tu wav
  tickSound.play();
  setTimeout(() => { tickSound.pause(); }, 80);
}

let omega = 0;           // velocidad angular (rad/s)
let alpha = 0;           // (no se usa en este modelo, pero lo dejamos)
let animId = null;

const TAU = Math.PI * 2;
const POINTER_ANGLE = Math.PI * 1.5; // flecha arriba

function normAngle(a){ a = a % TAU; return a < 0 ? a + TAU : a; }
function sectorStep(){ return items.length ? (TAU / items.length) : TAU; }

// Índice del sector bajo la flecha dada la rotación actual de la rueda
function currentIndexAt(angleNow = angle){
  if (!items.length) return -1;
  const step = sectorStep();
  const rel = normAngle(POINTER_ANGLE - normAngle(angleNow));
  return Math.floor(rel / step);
}

function stopAndAnnounce(){
  if (!items.length) return;
  const idx = currentIndexAt(angle);
  winningIndex = Math.max(0, Math.min(items.length - 1, idx));
  const name = items[winningIndex] || "—";
  drawWheel(winningIndex);
  announceWinner(name);
}

function announceWinner(name) {
  elWinner.textContent = name;                 // texto grande al centro
  elLast.textContent = `Ganador: ${name}`;     // pie
  if (name && !historyWinners.includes(name.toLowerCase())) {
    historyWinners.push(name.toLowerCase());
    saveState();
  }
}


// Giro con perfil coseno + wobble visible (por px) al final
function spin(){
  if (spinning || items.length === 0) return;

  const pool = elChkExclude.checked
    ? items.filter(x => !historyWinners.includes(x.toLowerCase()))
    : items.slice();
  if (pool.length === 0) return;

  spinning = true;
  elWinner.textContent = "…";

  // giro base
  const minRevs = 16, maxRevs = 26;
  const totalRevs = minRevs + Math.random() * (maxRevs - minRevs);
  const theta = totalRevs * TAU;

  const minDur = 16.0, maxDur = 30.0;
  const T = minDur + Math.random() * (maxDur - minDur);

  const omega0 = (2 * theta) / T;

  let t0 = performance.now();
  let last = t0;

  // wobble
  let wobblePhase = false;
  let wobbleStart = 0;
  let baseAngle = 0;
  let wobbleAmp0 = 0;

  const stepAng = sectorStep();
  const W = elCanvas.width, H = elCanvas.height;
  const outer = Math.min(W, H) * 0.48;
  const px2rad = px => px / outer;

  const WOBBLE_DUR  = 1400;  // ms (más largo)
  const WOBBLE_FREQ = 5.5;   // Hz
  const WOBBLE_MIN_PX = 18;  // ≈ recorrido visible en el borde

  function tick(now){
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (!wobblePhase){
      // fase principal (coseno)
      const t = (now - t0) / 1000;
      const u = Math.min(1, t / T);
      const omega = omega0 * 0.5 * (1 + Math.cos(Math.PI * u));
      angle += omega * dt;

      // ticks
      if (items.length > 0) {
        const step = sectorStep();
        const rel = normAngle(POINTER_ANGLE - normAngle(angle));
        const currentSector = Math.floor(rel / step);
        if (typeof tick.lastSector === 'undefined') tick.lastSector = currentSector;
        if (currentSector !== tick.lastSector) { playTick(); tick.lastSector = currentSector; }
      }

      drawWheel();

      if (u >= 1) {
        // iniciar wobble visible y **dentro** del sector
        wobblePhase = true;
        wobbleStart = now;
        baseAngle = angle;

        const baseAmpPx = WOBBLE_MIN_PX;
        const maxAmpByPixels = px2rad(baseAmpPx);        // en rad
        const hardLimit = stepAng * 0.45;                // no más del 45% del sector
        let baseAmp0 = Math.min(hardLimit, maxAmpByPixels);

        // recorte para no cruzar los bordes del sector ganador
        const idx = currentIndexAt(baseAngle);
        const rel = normAngle(POINTER_ANGLE - normAngle(baseAngle));
        const posInSector = rel - idx * stepAng;         // 0..stepAng
        const margin = Math.max(px2rad(3), stepAng * 0.08);
        wobbleAmp0 = Math.max(0, Math.min(baseAmp0, Math.min(posInSector, stepAng - posInSector) - margin));

        // si no hay margen, terminamos directo
        if (wobbleAmp0 < 1e-4){
          spinning = false;
          drawWheel();
          stopAndAnnounce();
          return;
        }
      } else {
        requestAnimationFrame(tick);
      }
      return;
    }

    // fase wobble: oscilación amortiguada
    const tw = (now - wobbleStart) / WOBBLE_DUR; // 0..1
    if (tw >= 1) {
      spinning = false;
      angle = baseAngle; // fijamos exactamente
      drawWheel();
      stopAndAnnounce();
      animateWinnerZoom(winningIndex); // <-- zoom visual
      return;
    }

    const amp = wobbleAmp0 * Math.exp(-2.2 * tw);
    const phase = 2 * Math.PI * WOBBLE_FREQ * ((now - wobbleStart) / 1000);
    angle = baseAngle + amp * Math.sin(phase);

    drawWheel();
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

/* ===== tooltip sobre el lienzo ===== */
elCanvas.addEventListener("mousemove", (e) => {
  if (!items.length || !elTip) { if (elTip) elTip.hidden = true; return; }

  const wrap = elCanvas.parentElement;                      // .canvas-wrap
  const rectWrap = wrap.getBoundingClientRect();
  const rectCanvas = elCanvas.getBoundingClientRect();

  // Posición del mouse relativa AL WRAPPER (no a la ventana)
  let left = e.clientX - rectWrap.left + 14;  // +14px para despegar del cursor
  let top  = e.clientY - rectWrap.top  - 14;  // -14px hacia arriba

  // Calcular sector bajo el mouse (igual que antes)
  const scaleX = elCanvas.width / rectCanvas.width;
  const scaleY = elCanvas.height / rectCanvas.height;
  const cx = elCanvas.width / 2, cy = elCanvas.height / 2;
  const dx = ((e.clientX - rectCanvas.left) * scaleX) - cx;
  const dy = ((e.clientY - rectCanvas.top)  * scaleY) - cy;
  const r = Math.hypot(dx, dy);

  const outer = Math.min(elCanvas.width, elCanvas.height) * 0.48;
  const inner = outer * 0.18;

  if (r < inner || r > outer){
    elTip.hidden = true;
    elTip.classList.remove('show');
    return;
  }

  // Determinar índice y texto
  const mouseAngle = Math.atan2(dy, dx);
  const rel = normAngle(mouseAngle - angle);
  const idx = Math.floor(rel / ((Math.PI*2)/items.length));
  elTip.textContent = items[idx] || "";

  // Mostrar y CLAMP dentro del wrapper
  elTip.hidden = false;
  elTip.classList.add('show');

  // Primero asignamos para obtener tamaño real
  elTip.style.left = left + "px";
  elTip.style.top  = top  + "px";

  const pad = 8;
  const maxLeft = wrap.clientWidth  - elTip.offsetWidth  - pad;
  const maxTop  = wrap.clientHeight - elTip.offsetHeight - pad;
  if (left > maxLeft) left = maxLeft;
  if (top  > maxTop)  top  = maxTop;
  if (left < pad)     left = pad;
  if (top  < pad)     top  = pad;

  elTip.style.left = left + "px";
  elTip.style.top  = top  + "px";
});

elCanvas.addEventListener("mouseleave", () => {
  if (!elTip) return;
  elTip.classList.remove('show');
  elTip.hidden = true;
});

/* ===== events ===== */
(function bindEvents(){
  // Cargar / Actualizar
  elBtnLoad?.addEventListener("click", () => {
    let list = parseTextarea(elInput.value);
    if (elChkDedup.checked) list = dedup(list);
    items = list;
    updateCount(); drawWheel(); saveState();
    console.log("[Ruleta] cargados:", items.length, "items");
  });

  // Mezclar
  elBtnShuffle?.addEventListener("click", () => {
    if (items.length === 0) return;
    shuffle(items);
    drawWheel(); saveState();
  });

  // Vaciar
  elBtnClear?.addEventListener("click", () => {
    items = [];
    elInput.value = "";
    updateCount(); drawWheel(); saveState();
  });

  // Girar (autocarga si te olvidaste de apretar “Cargar”)
  elBtnSpin?.addEventListener("click", () => {
    if (items.length === 0 && elInput.value.trim()){
      let list = parseTextarea(elInput.value);
      if (elChkDedup.checked) list = dedup(list);
      items = list; updateCount(); drawWheel(); saveState();
      console.log("[Ruleta] autocarga antes de girar:", items.length);
    }
    spin();
  });

  // Otra opción (mezcla y gira)
  elBtnAlt?.addEventListener("click", () => {
    if (items.length === 0) return;
    shuffle(items);
    drawWheel();
    spin();
  });

  // Reiniciar historial
  elBtnReset?.addEventListener("click", () => {
    historyWinners = [];
    saveState();
    elLast.textContent = "Historial de ganadores reiniciado.";
  });

  // Cambios de opciones visuales
  [elChkDedup, elChkExclude, elColorMode, elLabelMode]
    .forEach(el => el?.addEventListener("change", () => { saveState(); drawWheel(); }));

  console.log("[Ruleta] eventos ligados");
})();

/* ===== init ===== */
loadState();
drawWheel();
console.log("[Ruleta] drawWheel -> items:", items.length);






