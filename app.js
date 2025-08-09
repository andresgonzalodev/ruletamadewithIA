console.log("[Ruleta] app.js cargado");

/* ===== util ===== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const LSKEY = "ruleta_gamer_v2";

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
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.items)) items = data.items;
    if (Array.isArray(data.historyWinners)) historyWinners = data.historyWinners;
    if (data?.opts) {
      elChkDedup.checked = !!data.opts.dedup;
      elChkExclude.checked = !!data.opts.exclude;
    }
    if (data?.colorMode && elColorMode) elColorMode.value = data.colorMode;
    if (data?.labelMode && elLabelMode) elLabelMode.value = data.labelMode;
    if (typeof data.text === "string") elInput.value = data.text;
    updateCount(); drawWheel();
  } catch {}
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
  const idx = currentIndexAt(angle);
  winningIndex = idx;
  drawWheel(winningIndex);
  announceWinner(items[idx]);
}

// Giro con perfil coseno (suave, larga cola, sin imán)
function spin(){
  if (spinning || items.length === 0) return;

  // Excluir ganadores previos si está activo (lista, no física)
  const pool = elChkExclude.checked
    ? items.filter(x => !historyWinners.includes(x.toLowerCase()))
    : items.slice();
  if (pool.length === 0) return;

  spinning = true;
  elWinner.textContent = "…";

  // --- Sensación de giro (ajustá a gusto) ---
  const minRevs = 16;             // vueltas mínimas
  const maxRevs = 26;             // vueltas máximas
  const totalRevs = minRevs + Math.random() * (maxRevs - minRevs);
  const theta = totalRevs * TAU;  // ángulo total

  const minDur = 16.0;            // segundos mínimos
  const maxDur = 30.0;            // segundos máximos
  const T = minDur + Math.random() * (maxDur - minDur);

  // Con desaceleración coseno: θ = ω0 * T / 2  =>  ω0 = 2θ / T
  const omega0 = (2 * theta) / T;

  let t0 = performance.now();
  let last = t0;

  function tick(now){
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const t = (now - t0) / 1000;
    const u = Math.min(1, t / T); // 0..1
    const omega = omega0 * 0.5 * (1 + Math.cos(Math.PI * u)); // cae de ω0 -> 0

    angle += omega * dt;

    // 🔊 Tick por sector
    if (items.length > 0) {
      const step = sectorStep();
      const rel = normAngle(POINTER_ANGLE - normAngle(angle));
      const currentSector = Math.floor(rel / step);
      if (typeof tick.lastSector === 'undefined') tick.lastSector = currentSector;
      if (currentSector !== tick.lastSector) {
        playTick();
        tick.lastSector = currentSector;
      }
    }

    drawWheel();

    if (u >= 1) {
      spinning = false;
      drawWheel();
      stopAndAnnounce(); // SIN imán: queda donde terminó
      return;
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function announceWinner(name) {
  elWinner.textContent = name;
  elLast.textContent = `Ganador: ${name}`;
  if (!historyWinners.includes(name.toLowerCase())) {
    historyWinners.push(name.toLowerCase());
    saveState();
  }
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



