console.log("[Ruleta] app.js cargado");

/* ===== util ===== */
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const LSKEY = "ruleta_gamer_v4"; // <- nueva key para evitar estados viejos

/* ===== state ===== */
let items = [];
let historyWinners = [];
let spinning = false;
let angle = 0;             // ángulo actual (rad)
let winningIndex = -1;

// RAF handlers
let spinRAF = null;
let zoomRAF = null;
let zoomActive = false;

/* ===== elements ===== */
const elCanvas = $("#wheel");
const ctx = elCanvas.getContext("2d");
if (!ctx) console.error("Canvas sin contexto 2D");

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
function parseTextarea(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    .map(l => l.split(/\t+/)[0] || l);
}

// paleta básica sobria
function segmentColor(i) {
  const tri = [
    getComputedStyle(document.documentElement).getPropertyValue('--ring1').trim(),
    getComputedStyle(document.documentElement).getPropertyValue('--ring2').trim(),
    getComputedStyle(document.documentElement).getPropertyValue('--ring3').trim()
  ];
  return tri[i % tri.length] || "#2b3144";
}
function rainbowColor(i, n){ return `hsl(${(i/Math.max(1,n))*360}deg 55% 48%)`; }
function colorFor(i, n){ return (elColorMode?.value === "rainbow") ? rainbowColor(i,n) : segmentColor(i); }

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
  if (ab.length < Math.min(3,maxLen)){
    const base = parts[0] || clean;
    for (let i=1; i<base.length && ab.length<maxLen; i++) ab += base[i];
  }
  return ab.toUpperCase();
}

function dedup(arr){
  const seen = new Set();
  return arr.filter(x => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
function shuffle(arr){
  for (let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  return arr;
}

function saveState(){
  localStorage.setItem(LSKEY, JSON.stringify({
    historyWinners,
    opts:{
      dedup: elChkDedup.checked,
      exclude: elChkExclude.checked
    },
    colorMode: elColorMode?.value || "triad",
    labelMode: elLabelMode?.value || "none"
    // NO guardamos items ni textarea para evitar “precargas”
  }));
}
function loadState(){
  try{
    const raw = localStorage.getItem(LSKEY);
    if (!raw){ updateCount(); drawWheel(); return; }
    const data = JSON.parse(raw);
    if (data?.opts){
      elChkDedup.checked = !!data.opts.dedup;
      elChkExclude.checked = !!data.opts.exclude;
    }
    if (data?.colorMode && elColorMode) elColorMode.value = data.colorMode;
    if (data?.labelMode && elLabelMode) elLabelMode.value = data.labelMode;
    // items y textarea vacíos
    items = [];
    elInput.value = "";
    updateCount(); drawWheel();
  }catch(e){ console.warn(e); }
}

function updateCount(){ elCount.textContent = String(items.length); }
const TAU = Math.PI*2;
const POINTER_ANGLE = Math.PI*1.5;
function normAngle(a){ a = a % TAU; return a<0 ? a+TAU : a; }
function sectorStep(){ return items.length ? (TAU/items.length) : TAU; }
function currentIndexAt(angleNow = angle){
  if (!items.length) return -1;
  const step = sectorStep();
  const rel = normAngle(POINTER_ANGLE - normAngle(angleNow));
  return Math.floor(rel/step);
}

/* ===== drawing ===== */
function drawWheel(highlightIdx = -1){
  const W = elCanvas.width, H = elCanvas.height;
  const cx = W/2, cy = H/2;
  const outer = Math.min(W,H)*0.48;
  const inner = outer*0.18;

  ctx.clearRect(0,0,W,H);

  if (!items.length){
    ctx.beginPath();
    ctx.arc(cx,cy,outer,0,TAU);
    ctx.fillStyle = "#222738";
    ctx.fill();
    return;
  }

  const step = TAU/items.length;

  for (let i=0;i<items.length;i++){
    const start = angle + i*step;
    const end = start + step;

    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,outer,start,end);
    ctx.closePath();
    ctx.fillStyle = colorFor(i, items.length);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // etiquetas
    const mode = elLabelMode?.value || "none";
    if (mode!=="none"){
      const mid = (start+end)/2;
      const rText = outer*0.80;
      let text = "";
      if (mode==="index") text = String(i+1);
      if (mode==="abbr")  text = abbrFromName(items[i],4);

      if (text){
        ctx.save();
        ctx.translate(cx,cy);
        ctx.rotate(mid);
        ctx.textAlign="center";
        ctx.textBaseline="middle";
        ctx.font = `${Math.max(10, Math.floor(outer*0.06))}px ui-monospace, monospace`;
        ctx.fillStyle="rgba(0,0,0,.45)";
        ctx.fillText(text, rText, 1.5);
        ctx.fillStyle="#e9eef7";
        ctx.fillText(text, rText, 0);
        ctx.restore();
      }
    }
  }

  // hueco
  ctx.beginPath();
  ctx.arc(cx,cy,inner,0,TAU);
  ctx.fillStyle="#0d111a";
  ctx.fill();

  // highlight básico
  if (highlightIdx>=0){
    const step = TAU/items.length;
    const start = angle + highlightIdx*step;
    const end   = start + step;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,outer*1.04,start,end);
    ctx.closePath();
    ctx.fillStyle="rgba(125,211,252,0.22)";
    ctx.fill();
    ctx.restore();
  }
}

/* ===== zoom ganador (overlay, after-stop) ===== */
function animateWinnerZoom(idx){
  if (idx<0 || idx>=items.length) return;

  const W = elCanvas.width, H = elCanvas.height;
  const cx = W/2, cy = H/2;
  const outer = Math.min(W,H)*0.48;
  const inner = outer*0.18;
  const step = TAU/items.length;
  const start = angle + idx*step;
  const end   = start + step;

  const easeOutBack = t => { const c1=1.70158, c3=c1+1; return 1 + c3*Math.pow(t-1,3) + c1*Math.pow(t-1,2); };
  const dur = 950;
  const t0 = performance.now();

  // cancelar overlay anterior
  zoomActive = false;
  if (zoomRAF) cancelAnimationFrame(zoomRAF);
  zoomActive = true;

  function frame(now){
    if (!zoomActive) return;
    const u = Math.min(1, (now-t0)/dur);
    const e = easeOutBack(u);

    drawWheel(idx);

    const grow = 1 + 0.14*e;
    const glow = Math.floor(6 + 10*e);
    const rOuter = outer*grow;
    const rInner = inner*Math.max(0.85, 1-0.15*e);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,rOuter,start,end);
    ctx.closePath();
    ctx.fillStyle="rgba(125,211,252,0.24)";
    ctx.fill();

    ctx.strokeStyle="rgba(125,211,252,0.55)";
    ctx.lineWidth = glow;
    ctx.stroke();

    const grad = ctx.createRadialGradient(cx,cy,rInner*0.2, cx,cy,rInner*1.05);
    grad.addColorStop(0,"rgba(125,211,252,0.25)");
    grad.addColorStop(1,"rgba(125,211,252,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx,cy,rInner*1.05,0,TAU);
    ctx.fill();
    ctx.restore();

    if (u<1) zoomRAF = requestAnimationFrame(frame);
    else { zoomActive=false; zoomRAF=null; }
  }
  zoomRAF = requestAnimationFrame(frame);
}

/* ===== audio tick: sin AbortError ===== */
const tickSound = new Audio('tick.wav');
tickSound.preload = 'auto';
tickSound.volume = 0.35;
function playTick(){
  const click = tickSound.cloneNode(true);
  click.currentTime = 0.15;
  click.volume = tickSound.volume;
  const p = click.play();
  if (p && p.catch) p.catch(()=>{});
  setTimeout(()=>{ click.pause(); click.src=""; }, 140);
}

/* ===== spin (perfil coseno + wobble amortiguado visible) ===== */
function stopAndAnnounce(){
  if (!items.length) return;
  const idx = currentIndexAt(angle);
  winningIndex = Math.max(0, Math.min(items.length-1, idx));
  const name = items[winningIndex] || "—";

  drawWheel(winningIndex);

  // anuncio central con anim pop SIEMPRE
  elWinner.textContent = name;
  elWinner.classList.remove('pop');
  void elWinner.offsetWidth; // reflow
  elWinner.classList.add('pop');

  elLast.textContent = `Ganador: ${name}`;
  if (name && !historyWinners.includes(name.toLowerCase())){
    historyWinners.push(name.toLowerCase());
    saveState();
  }

  // zoom visual
  animateWinnerZoom(winningIndex);
}

function spin(){
  if (spinning || items.length===0) return;

  // cancelar overlays/anim previas
  zoomActive = false;
  if (zoomRAF) { cancelAnimationFrame(zoomRAF); zoomRAF=null; }

  // reset ganador visible
  elWinner.textContent = "…";
  elWinner.classList.remove('pop');

  // pool con exclusión (solo para elegir qué puede salir – la física manda la parada)
  const pool = elChkExclude.checked
    ? items.filter(x => !historyWinners.includes(x.toLowerCase()))
    : items.slice();
  if (pool.length === 0) return;

  spinning = true;

  const minRevs=16, maxRevs=26;
  const totalRevs = minRevs + Math.random()*(maxRevs-minRevs);
  const theta = totalRevs * TAU;

  const minDur=16.0, maxDur=30.0;
  const T = minDur + Math.random()*(maxDur-minDur);

  const omega0 = (2*theta)/T;

  let t0 = performance.now();
  let last = t0;

  // limpiar contador de sector previo para el tick
  spin.tickLastSector = undefined;

  // wobble params
  let wobblePhase = false;
  let wobbleStart = 0;
  let baseAngle = 0;
  let wobbleAmp0 = 0;

  const stepAng = sectorStep();
  const W = elCanvas.width, H = elCanvas.height;
  const outer = Math.min(W,H)*0.48;
  const px2rad = px => px/outer;

  // wobble visible
  const WOBBLE_DUR  = 1400;
  const WOBBLE_FREQ = 4.8;
  const WOBBLE_MIN_PX = 60;  // bien visible

  function tick(now){
    const dt = Math.min(0.05, (now-last)/1000);
    last = now;

    if (!wobblePhase){
      const t = (now - t0)/1000;
      const u = Math.min(1, t/T);
      const omega = omega0 * 0.5 * (1 + Math.cos(Math.PI * u)); // ω -> 0 suave
      angle += omega * dt;

      // ticks
      if (items.length>0){
        const step = stepAng;
        const rel = normAngle(POINTER_ANGLE - normAngle(angle));
        const currentSector = Math.floor(rel/step);
        if (typeof spin.tickLastSector === "undefined") spin.tickLastSector = currentSector;
        if (currentSector !== spin.tickLastSector){ playTick(); spin.tickLastSector = currentSector; }
      }

      drawWheel();

      if (u>=1){
        // pasa a wobble
        wobblePhase = true;
        wobbleStart = now;
        baseAngle = angle;

        // amplitude base en rad (convertida desde px sobre el borde)
        const maxAmpByPixels = px2rad(WOBBLE_MIN_PX);
        const hardLimit = stepAng*0.49;  // dejamos que “casi cruce”
        let baseAmp = Math.min(hardLimit, maxAmpByPixels);

        // recorte para no “salirse” demasiado del sector
        const idx = currentIndexAt(baseAngle);
        const rel = normAngle(POINTER_ANGLE - normAngle(baseAngle));
        const posInSector = rel - idx*stepAng; // 0..step
        const margin = Math.max(px2rad(2), stepAng*0.06);
        wobbleAmp0 = Math.max(0, Math.min(baseAmp, Math.min(posInSector, stepAng-posInSector) - margin));

        if (wobbleAmp0 < 1e-4){
          // si no hay margen real, terminamos prolijo
          spinning = false;
          drawWheel();
          stopAndAnnounce();
          return;
        }
      }else{
        spinRAF = requestAnimationFrame(tick);
      }
      return;
    }

    // fase wobble: seno amortiguado
    const tw = (now - wobbleStart)/WOBBLE_DUR; // 0..1
    if (tw >= 1){
      spinning = false;
      angle = baseAngle;
      drawWheel();
      stopAndAnnounce();
      return;
    }

    const amp = wobbleAmp0 * Math.exp(-0.9 * tw); // cola visible
    const phase = 2*Math.PI*WOBBLE_FREQ * ((now - wobbleStart)/1000);
    angle = baseAngle + amp * Math.sin(phase);

    drawWheel();
    spinRAF = requestAnimationFrame(tick);
  }

  spinRAF = requestAnimationFrame(tick);
}

/* ===== tooltip ===== */
elCanvas.addEventListener("mousemove",(e)=>{
  if (!items.length || !elTip){ if (elTip) elTip.hidden=true; return; }

  const wrap = elCanvas.parentElement;
  const rectWrap = wrap.getBoundingClientRect();
  const rectCanvas = elCanvas.getBoundingClientRect();

  let left = e.clientX - rectWrap.left + 14;
  let top  = e.clientY - rectWrap.top  - 14;

  const scaleX = elCanvas.width / rectCanvas.width;
  const scaleY = elCanvas.height/ rectCanvas.height;
  const cx = elCanvas.width/2, cy = elCanvas.height/2;
  const dx = ((e.clientX - rectCanvas.left)*scaleX) - cx;
  const dy = ((e.clientY - rectCanvas.top )*scaleY) - cy;
  const r  = Math.hypot(dx,dy);

  const outer = Math.min(elCanvas.width, elCanvas.height)*0.48;
  const inner = outer*0.18;

  if (r<inner || r>outer){
    elTip.hidden = true; elTip.classList.remove('show'); return;
  }

  const mouseAngle = Math.atan2(dy,dx);
  const rel = normAngle(mouseAngle - angle);
  const idx = Math.floor(rel / (TAU/items.length));
  elTip.textContent = items[idx] || "";

  elTip.hidden = false; elTip.classList.add('show');
  elTip.style.left = left + "px";
  elTip.style.top  = top  + "px";

  const pad=8;
  const maxLeft = wrap.clientWidth  - elTip.offsetWidth  - pad;
  const maxTop  = wrap.clientHeight - elTip.offsetHeight - pad;
  if (left>maxLeft) left=maxLeft;
  if (top >maxTop)  top =maxTop;
  if (left<pad)     left=pad;
  if (top <pad)     top =pad;
  elTip.style.left = left + "px";
  elTip.style.top  = top  + "px";
});
elCanvas.addEventListener("mouseleave",()=>{
  if (!elTip) return;
  elTip.classList.remove('show');
  elTip.hidden = true;
});

/* ===== events ===== */
(function bindEvents(){
  elBtnLoad?.addEventListener("click", ()=>{
    let list = parseTextarea(elInput.value);
    if (elChkDedup.checked) list = dedup(list);
    items = list;
    updateCount(); drawWheel(); saveState();
  });

  elBtnShuffle?.addEventListener("click", ()=>{
    if (items.length===0) return;
    shuffle(items);
    drawWheel(); saveState();
  });

  elBtnClear?.addEventListener("click", ()=>{
    items = [];
    elInput.value = "";
    updateCount(); drawWheel(); saveState();
  });

  elBtnSpin?.addEventListener("click", ()=>{
    if (items.length===0 && elInput.value.trim()){
      let list = parseTextarea(elInput.value);
      if (elChkDedup.checked) list = dedup(list);
      items = list; updateCount(); drawWheel(); saveState();
    }
    spin();
  });

  elBtnAlt?.addEventListener("click", ()=>{
    if (items.length===0) return;
    shuffle(items); drawWheel(); spin();
  });

  elBtnReset?.addEventListener("click", ()=>{
    historyWinners = []; saveState();
    elLast.textContent = "Historial de ganadores reiniciado.";
  });

  [elChkDedup, elChkExclude, elColorMode, elLabelMode]
    .forEach(el => el?.addEventListener("change", ()=>{ saveState(); drawWheel(); }));

  console.log("[Ruleta] eventos ligados");
})();

/* ===== init ===== */
loadState();
drawWheel();
console.log("[Ruleta] listo");
