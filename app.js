/* ===================================================================
   Mundial 2026 — app.js
   Vistas, conversión de zona horaria, tablas de grupos, cuadro de
   eliminatorias y capa de resultados en vivo.
   =================================================================== */

/* ---- CONFIGURACIÓN de actualización en tiempo real --------------------
   results.json (en este mismo repositorio) es la fuente que controlas tú:
   edítalo, haz commit y GitHub Pages mostrará los marcadores y recalculará
   tablas y cruces. Si quieres una fuente automática, pon su URL en
   liveApiUrl (formato en el README).                                     */
const CONFIG = {
  liveApiUrl: null,        // p.ej. "https://tu-feed.com/wc2026.json" o null
  resultsFile: "results.json",
  refreshSeconds: 60,
};

const WC = window.WC;
const T  = code => (WC.teams[code] || code);
const flag = code => `https://flagcdn.com/w40/${code}.png`;
const GROUP_LETTERS = Object.keys(WC.groups);
const byNum = {}; WC.matches.forEach(m => byNum[m.n] = m);

/* ---------- preferencias persistentes (con respaldo seguro) ---------- */
function load(k, d){ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v);}catch(e){return d;} }
function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

const state = {
  view: "hoy",
  tz: load("wc26_tz", "local"),            // 'local' | 'cdmx'
  favs: new Set(load("wc26_favs", [])),
  filter: { mode: "all", group: "", team: "" },
};

/* ---------- formato de fecha/hora según zona elegida ---------- */
function tzOpt(o){ const x={...o}; if(state.tz==="cdmx") x.timeZone="America/Mexico_City"; return x; }
function fTime(iso){ return new Intl.DateTimeFormat("es-MX", tzOpt({hour:"2-digit",minute:"2-digit",hour12:false})).format(new Date(iso)); }
function fDayKey(iso){ return new Intl.DateTimeFormat("en-CA", tzOpt({year:"numeric",month:"2-digit",day:"2-digit"})).format(new Date(iso)); }
function fDayLabel(iso){ const s=new Intl.DateTimeFormat("es-MX", tzOpt({weekday:"long",day:"numeric",month:"long"})).format(new Date(iso)); return s.charAt(0).toUpperCase()+s.slice(1); }
function fShortDate(iso){ return new Intl.DateTimeFormat("es-MX", tzOpt({day:"numeric",month:"short"})).format(new Date(iso)); }
function todayKey(){ return new Intl.DateTimeFormat("en-CA", tzOpt({year:"numeric",month:"2-digit",day:"2-digit"})).format(new Date()); }

/* ---------- capa de resultados ---------- */
let RESULTS = {};   // { "1": {h:2,a:1,status:"FT"}, ... }
let lastUpdate = null;

function normalizeResults(raw){
  const out = {};
  if(!raw) return out;
  const put = (k,r) => { r=r||{}; out[k]={h:num(r.h),a:num(r.a),status:r.status,ht:r.ht||null,at:r.at||null,ph:num(r.ph),pa:num(r.pa)}; };
  if(Array.isArray(raw)){ raw.forEach(r => { if(r && r.n!=null) put(r.n,r); }); }
  else { Object.keys(raw).forEach(k => put(k,raw[k])); }
  return out;
}
function num(v){ return (v===""||v==null||isNaN(v))?null:Number(v); }

/* Orienta el marcador a un equipo local dado (homeCode). Si el resultado trae
   ht/at (códigos reales tal como los reportó la API), reordena h/a según quién
   sea realmente el local en nuestra ficha; si no, los deja como están. */
function scoreFor(r, homeCode){
  if(r && r.ht && r.at && homeCode){
    if(r.ht===homeCode) return {h:r.h, a:r.a};
    if(r.at===homeCode) return {h:r.a, a:r.h};
  }
  return {h:r?r.h:null, a:r?r.a:null};
}

async function refreshResults(){
  let merged = {};
  if(window.RESULTS) merged = {...merged, ...normalizeResults(window.RESULTS)};
  // results.json del repositorio
  try{
    const r = await fetch(CONFIG.resultsFile + "?t=" + Date.now(), {cache:"no-store"});
    if(r.ok){ merged = {...merged, ...normalizeResults(await r.json())}; }
  }catch(e){}
  // fuente automática opcional
  if(CONFIG.liveApiUrl){
    try{
      const r = await fetch(CONFIG.liveApiUrl + (CONFIG.liveApiUrl.includes("?")?"&":"?") + "t=" + Date.now(), {cache:"no-store"});
      if(r.ok){ merged = {...merged, ...normalizeResults(await r.json())}; }
    }catch(e){}
  }
  RESULTS = merged;
  lastUpdate = new Date();
  renderCurrent();
  updateStatusBadge();
}

/* ---------- estado de un partido ---------- */
const LIVE_MS = 140*60*1000;
function statusOf(m, codes){
  const r = RESULTS[m.n];
  const start = new Date(m.utc).getTime();
  const now = Date.now();
  const hasScore = r && r.h!=null && r.a!=null;
  if(r && (r.status==="FT" || (hasScore && now > start+LIVE_MS))) return {state:"ft", h:r.h, a:r.a};
  if(r && (r.status==="LIVE" || hasScore)) return {state:"live", h:r.h, a:r.a};
  // sin datos -> inferir por reloj (solo si conocemos los equipos)
  const known = codes && codes.h && codes.a;
  if(!known) return {state:"pre"};
  if(now < start) return {state:"pre"};
  if(now < start+LIVE_MS) return {state:"live"};
  return {state:"ft"};
}

/* ===================================================================
   TABLAS DE GRUPOS
   =================================================================== */
function groupMatches(letter){ return WC.matches.filter(m => m.stage===letter); }
function groupComplete(letter){ return groupMatches(letter).every(m => { const r=RESULTS[m.n]; return r && (r.status==="FT" || (r.h!=null&&r.a!=null && Date.now()>new Date(m.utc).getTime())); }); }

function computeStandings(letter){
  const rows = {};
  WC.groups[letter].forEach(c => rows[c]={code:c,pj:0,pg:0,pe:0,pp:0,gf:0,gc:0,pts:0});
  groupMatches(letter).forEach(m => {
    const r = RESULTS[m.n];
    if(!r || r.h==null || r.a==null) return;
    const s = scoreFor(r, m.home);
    const H=rows[m.home], A=rows[m.away];
    H.pj++; A.pj++; H.gf+=s.h; H.gc+=s.a; A.gf+=s.a; A.gc+=s.h;
    if(s.h>s.a){ H.pg++; A.pp++; H.pts+=3; }
    else if(s.h<s.a){ A.pg++; H.pp++; A.pts+=3; }
    else { H.pe++; A.pe++; H.pts++; A.pts++; }
  });
  const arr = Object.values(rows).map(x => ({...x, dif:x.gf-x.gc}));
  arr.sort(cmpTeams);
  return arr;
}
function cmpTeams(a,b){
  if(b.pts!==a.pts) return b.pts-a.pts;
  if(b.dif!==a.dif) return b.dif-a.dif;
  if(b.gf!==a.gf)   return b.gf-a.gf;
  return T(a.code).localeCompare(T(b.code));
}
function bestThirds(){
  const thirds = [];
  GROUP_LETTERS.forEach(L => { const s=computeStandings(L); if(s[2]) thirds.push({...s[2], grp:L}); });
  thirds.sort(cmpTeams);
  return thirds;
}

/* ===================================================================
   RESOLUCIÓN DEL CUADRO (winners/runners-up + propagación de ganadores)
   =================================================================== */
function teamFromSlot(token){
  // "1A"/"2A"
  let m = /^([12])([A-L])$/.exec(token);
  if(m){ if(!groupComplete(m[2])) return null; const s=computeStandings(m[2]); return s[+m[1]-1] ? s[+m[1]-1].code : null; }
  // "G74" ganador / "P101" perdedor del partido N
  m = /^([GP])(\d+)$/.exec(token);
  if(m){ const res=resolveKO(+m[2]); if(!res||!res.h||!res.a) return null; const r=RESULTS[m[2]];
    if(!r||r.h==null||r.a==null||r.status==="LIVE") { if(!(r&&r.status==="FT")) return null; }
    if(!r||r.h==null||r.a==null) return null;
    // Empate en tiempo reglamentario -> se decide por penales (ph/pa) si existen.
    const byPen = (cH,cA) => (r.ph!=null&&r.pa!=null) ? (r.ph>r.pa?cH : r.pa>r.ph?cA : null) : null;
    let win;
    if(r.ht && r.at){            // marcador con códigos reales: no depende de la orientación de slots
      win = r.h>r.a ? r.ht : r.a>r.h ? r.at : byPen(r.ht, r.at);
      if(win!==res.h && win!==res.a) win = null;   // seguridad: debe ser uno de los resueltos
    } else {                     // marcador h=local / a=visitante de nuestra ficha
      win = r.h>r.a ? res.h : r.a>r.h ? res.a : byPen(res.h, res.a);
    }
    if(win==null) return null;
    const lose = win===res.h?res.a:res.h;
    return m[1]==="G"?win:lose;
  }
  return null; // "3(...)" u otro -> etiqueta
}
const _koCache = {};
function resolveKO(n){
  if(_koCache[n]) return _koCache[n];
  const m = byNum[n];
  const res = { h: teamFromSlot(m.home), a: teamFromSlot(m.away), hTok:m.home, aTok:m.away };
  _koCache[n]=res; return res;
}
function clearKOCache(){ for(const k in _koCache) delete _koCache[k]; }

function slotLabel(token){
  let m=/^([12])([A-L])$/.exec(token); if(m) return (m[1]==="1"?"1º ":"2º ")+"Grupo "+m[2];
  m=/^3\((.+)\)$/.exec(token); if(m) return "3º ("+m[1]+")";
  m=/^G(\d+)$/.exec(token); if(m) return "Ganador P"+m[1];
  m=/^P(\d+)$/.exec(token); if(m) return "Perdedor P"+m[1];
  return token;
}

/* ===================================================================
   COMPONENTES DE RENDER
   =================================================================== */
function flagImg(code, cls){
  return `<img class="${cls||''}" src="${flag(code)}" alt="${T(code)}" loading="lazy"
    onerror="this.outerHTML='<span class=&quot;flag-fallback&quot;>${code.slice(0,3).toUpperCase()}</span>'">`;
}
function stageBadge(m){
  if(m.stage.length===1) return `<span class="badge grp">Grupo ${m.stage}</span>`;
  const names={R32:"Dieciseisavos",R16:"Octavos",QF:"Cuartos",SF:"Semifinal","3P":"3.er lugar",F:"Final"};
  return `<span class="badge ko">${names[m.stage]||m.stage}</span>`;
}

function matchCard(m){
  // equipos resueltos (grupo: directos; KO: por slot)
  let hc, ac;
  if(m.stage.length===1){ hc=m.home; ac=m.away; }
  else { const r=resolveKO(m.n); hc=r.h; ac=r.a; }
  const st = statusOf(m, {h:hc,a:ac});
  const sc = scoreFor(RESULTS[m.n], hc);
  const live = st.state==="live";
  const ft = st.state==="ft";
  const showScore = (sc.h!=null && sc.a!=null);

  const hWin = showScore && sc.h>sc.a, aWin = showScore && sc.a>sc.h;

  function side(code, token, isWin, isLose){
    const nm = code ? T(code) : slotLabel(token);
    const fl = code ? flagImg(code) : `<span class="flag-fallback">?</span>`;
    return `<div class="row-team ${isWin?'win':''} ${showScore&&isLose?'lose':''}">
      ${fl}<span class="tn">${nm}</span></div>`;
  }

  const tags = [];
  if(live) tags.push(`<span class="badge live"><span class="ld"></span>EN VIVO</span>`);
  tags.push(stageBadge(m));
  if(m.mxFree) tags.push(`<span class="badge free">Gratis MX</span>`);
  else tags.push(`<span class="badge vix">ViX</span>`);

  const favCode = hc||ac;
  const isFav = (hc&&state.favs.has(hc))||(ac&&state.favs.has(ac));

  const side2 = showScore
    ? `<div class="scorebox">${sc.h}<span class="sc-sep">·</span>${sc.a}</div>`
    : `<div class="match-time">${fTime(m.utc)}<span class="ds">${fShortDate(m.utc)}</span></div>`;

  const footState = live?`<b style="color:var(--live)">En juego</b> · ` : ft&&showScore?`Finalizado · ` : "";

  return `<div class="match ${live?'live-card':''}">
    <div class="match-main">
      <div class="match-top">${tags.join("")}<span class="match-num">#${m.n}</span></div>
      ${side(hc, m.home, hWin, aWin)}
      ${side(ac, m.away, aWin, hWin)}
      <div class="match-foot">${footState}${m.venue} · ${m.city}</div>
    </div>
    <div class="match-side">
      ${side2}
      <button class="fav ${isFav?'on':''}" data-fav="${hc||''}|${ac||''}" aria-label="Favorito">★</button>
    </div>
  </div>`;
}

function groupByDay(matches){
  const map = new Map();
  matches.forEach(m => { const k=fDayKey(m.utc); if(!map.has(k)) map.set(k,[]); map.get(k).push(m); });
  return [...map.entries()].sort((a,b)=>a[0]<b[0]?-1:1);
}

/* ---------------- VISTA: HOY ---------------- */
function renderHoy(){
  const el = document.getElementById("view-hoy");
  const now = Date.now();
  // partido del hero: en vivo si hay; si no, el próximo
  const liveM = WC.matches.find(m => statusOf(m, koCodes(m)).state==="live");
  const nextM = WC.matches.find(m => new Date(m.utc).getTime() > now) || WC.matches[WC.matches.length-1];
  const hero = liveM || nextM;

  let heroHtml = "";
  if(hero){
    const c = koCodes(hero);
    const st = statusOf(hero, c);
    const hsc = scoreFor(RESULTS[hero.n], c.h);
    const nm = code => code?T(code):slotLabel(code===c.h?hero.home:hero.away);
    const hName = c.h?T(c.h):slotLabel(hero.home);
    const aName = c.a?T(c.a):slotLabel(hero.away);
    const center = (hsc.h!=null&&hsc.a!=null)
      ? `<div class="hero-score">${hsc.h} · ${hsc.a}</div>`
      : `<div class="hero-vs">VS</div>`;
    heroHtml = `<div class="hero">
      <div class="hero-label">${st.state==="live"?"● En vivo ahora":"Próximo partido"}</div>
      <div class="hero-match">
        <div class="hero-team">${c.h?flagImg(c.h):''}<span class="nm">${hName}</span></div>
        ${center}
        <div class="hero-team">${c.a?flagImg(c.a):''}<span class="nm">${aName}</span></div>
      </div>
      <div class="hero-meta">${stageLabel(hero)} · ${hero.venue}, ${hero.city} · ${fDayLabel(hero.utc)} · ${fTime(hero.utc)} h</div>
      ${st.state!=="live"?`<div class="hero-countdown" id="cd"></div>`:""}
    </div>`;
  }

  const tk = todayKey();
  const todays = WC.matches.filter(m => fDayKey(m.utc)===tk).sort((a,b)=>a.utc<b.utc?-1:1);
  let body;
  if(todays.length){
    body = `<div class="section-head"><h2>Partidos de hoy</h2><span class="sub">${todays.length} ${todays.length===1?'partido':'partidos'}</span></div>`
      + `<div class="daygroup">${todays.map(matchCard).join("")}</div>`;
  } else {
    const upcoming = WC.matches.filter(m => new Date(m.utc).getTime()>now).slice(0,6);
    body = `<div class="section-head"><h2>Próximos partidos</h2><span class="sub">No hay partidos hoy</span></div>`
      + `<div class="daygroup">${upcoming.map(matchCard).join("")}</div>`;
  }
  el.innerHTML = heroHtml + body;
  startCountdown(hero);
}
function koCodes(m){ if(m.stage.length===1) return {h:m.home,a:m.away}; const r=resolveKO(m.n); return {h:r.h,a:r.a}; }
function stageLabel(m){ if(m.stage.length===1) return "Grupo "+m.stage; const n={R32:"Dieciseisavos",R16:"Octavos",QF:"Cuartos de final",SF:"Semifinal","3P":"Tercer lugar",F:"FINAL"}; return n[m.stage]||m.stage; }

let cdTimer=null;
function startCountdown(hero){
  if(cdTimer) clearInterval(cdTimer);
  const box=document.getElementById("cd"); if(!box||!hero) return;
  const target=new Date(hero.utc).getTime();
  function tick(){
    let d=target-Date.now();
    if(d<=0){ box.innerHTML=`<div class="cd-box"><span class="n">¡Ya!</span><span class="l">en juego</span></div>`; clearInterval(cdTimer); return; }
    const days=Math.floor(d/864e5); d-=days*864e5;
    const h=Math.floor(d/36e5); d-=h*36e5;
    const min=Math.floor(d/6e4); d-=min*6e4;
    const s=Math.floor(d/1e3);
    const cell=(n,l)=>`<div class="cd-box"><span class="n">${String(n).padStart(2,"0")}</span><span class="l">${l}</span></div>`;
    box.innerHTML = (days>0?cell(days,"días"):"") + cell(h,"hrs") + cell(min,"min") + cell(s,"seg");
  }
  tick(); cdTimer=setInterval(tick,1000);
}

/* ---------------- VISTA: CALENDARIO ---------------- */
function renderCalendario(){
  const el=document.getElementById("view-calendario");
  const f=state.filter;
  const teamOpts = GROUP_LETTERS.flatMap(L=>WC.groups[L]).sort((a,b)=>T(a).localeCompare(T(b)))
    .map(c=>`<option value="${c}" ${f.team===c?'selected':''}>${T(c)}</option>`).join("");
  const grpOpts = GROUP_LETTERS.map(L=>`<option value="${L}" ${f.group===L?'selected':''}>Grupo ${L}</option>`).join("");

  const controls = `<div class="filters">
    <button class="chip ${f.mode==='all'?'on':''}" data-mode="all">Todos</button>
    <button class="chip free-chip ${f.mode==='free'?'on':''}" data-mode="free">Solo gratis (MX)</button>
    <button class="chip fav-chip ${f.mode==='fav'?'on':''}" data-mode="fav">★ Favoritos</button>
    <span class="selectwrap"><select id="fGroup"><option value="">Todos los grupos</option>${grpOpts}</select></span>
    <span class="selectwrap"><select id="fTeam"><option value="">Todas las selecciones</option>${teamOpts}</select></span>
  </div>`;

  const list = WC.matches.filter(m => passFilter(m));
  let html;
  if(!list.length){ html=`<div class="empty"><b>Sin partidos</b>Ajusta los filtros para ver más encuentros.</div>`; }
  else {
    html = groupByDay(list).map(([k,ms]) =>
      `<div class="daygroup"><div class="day-h">${fDayLabel(ms[0].utc)}</div>${ms.sort((a,b)=>a.utc<b.utc?-1:1).map(matchCard).join("")}</div>`
    ).join("");
  }
  el.innerHTML = `<div class="section-head"><h2>Calendario</h2><span class="sub">${list.length} de 104 partidos</span></div>${controls}${html}`;

  el.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{ state.filter.mode=b.dataset.mode; renderCalendario(); });
  el.querySelector("#fGroup").onchange=e=>{ state.filter.group=e.target.value; renderCalendario(); };
  el.querySelector("#fTeam").onchange=e=>{ state.filter.team=e.target.value; renderCalendario(); };
}
function passFilter(m){
  const f=state.filter; const c=koCodes(m);
  if(f.mode==="free" && !m.mxFree) return false;
  if(f.mode==="fav" && !((c.h&&state.favs.has(c.h))||(c.a&&state.favs.has(c.a)))) return false;
  if(f.group && m.stage!==f.group) return false;
  if(f.team && !(c.h===f.team||c.a===f.team)) return false;
  return true;
}

/* ---------------- VISTA: GRUPOS ---------------- */
function renderGrupos(){
  const el=document.getElementById("view-grupos");
  const cards = GROUP_LETTERS.map(L=>{
    const s=computeStandings(L);
    const rows = s.map((t,i)=>{
      const q = i===0?"q1":i===1?"q2":i===2?"q3":"";
      return `<tr class="${q}">
        <td class="tl pos"><span class="qbar"></span>${i+1}</td>
        <td class="tl"><div class="team-cell">${flagImg(t.code)}<span class="tnm">${T(t.code)}</span></div></td>
        <td>${t.pj}</td><td>${t.pg}</td><td>${t.pe}</td><td>${t.pp}</td>
        <td>${t.gf}:${t.gc}</td><td>${t.dif>0?'+':''}${t.dif}</td><td class="pts">${t.pts}</td>
      </tr>`;
    }).join("");
    return `<div class="grp-card">
      <h3><span class="gl">${L}</span>Grupo ${L}</h3>
      <div class="tbl-wrap">
      <table class="standings">
        <thead><tr><th class="tl">#</th><th class="tl">Selección</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF:GC</th><th>Dif</th><th>Pts</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
      <div class="grp-legend">
        <span class="lg e"><i></i>1º y 2º — clasifican a 16avos</span>
        <span class="lg g"><i></i>3º — opción a mejor tercero</span>
      </div>
    </div>`;
  }).join("");

  const thirds = bestThirds();
  const anyResult = WC.matches.some(m=>RESULTS[m.n]&&RESULTS[m.n].h!=null);
  const thirdsList = anyResult
    ? `<ol>${thirds.slice(0,8).map(t=>`<li><b>${T(t.code)}</b> <span style="color:var(--muted)">(Gr. ${t.grp} · ${t.pts} pts)</span></li>`).join("")}</ol>`
    : `<p style="color:var(--muted)">Aparecerán aquí en cuanto se carguen resultados de la fase de grupos.</p>`;

  el.innerHTML = `<div class="section-head"><h2>Grupos y posiciones</h2><span class="sub">Se calculan solas con los resultados</span></div>
    ${cards}
    <div class="thirds"><h3>Los 8 mejores terceros</h3>
      <p>Ocho de los doce terceros lugares avanzan a dieciseisavos. La FIFA define el cruce exacto de cada tercero con una tabla oficial según qué grupos clasifiquen.</p>
      ${thirdsList}
    </div>`;
}

/* ---------------- VISTA: ELIMINATORIAS ---------------- */
function renderEliminatorias(){
  const el=document.getElementById("view-eliminatorias");
  const stages=[["R32","Dieciseisavos de final"],["R16","Octavos de final"],["QF","Cuartos de final"],["SF","Semifinales"],["3P","Tercer lugar"],["F","Final"]];
  const html = stages.map(([code,label])=>{
    const ms=WC.matches.filter(m=>m.stage===code);
    return `<div class="bracket-stage"><h3>${label}</h3><div class="ko-grid">${ms.map(koCard).join("")}</div></div>`;
  }).join("");
  el.innerHTML = `<div class="section-head"><h2>Eliminatorias</h2><span class="sub">Se llenan al avanzar el torneo</span></div>${html}`;
}
function koCard(m){
  const r=resolveKO(m.n);
  const osc=scoreFor(RESULTS[m.n], r.h);
  const st=statusOf(m,{h:r.h,a:r.a});
  const showScore=osc.h!=null&&osc.a!=null;
  const hWin=showScore&&osc.h>osc.a, aWin=showScore&&osc.a>osc.h;
  function side(code,token,win,lose){
    const nm=code?`${flagImg(code)}<span>${T(code)}</span>`:`<span>${slotLabel(token)}</span>`;
    const sc = showScore?`<span class="ko-sc">${code===r.h?osc.h:osc.a}</span>`:"";
    return `<div class="ko-side ${code?'':'tbd'} ${win?'win':''} ${lose?'lose':''}">${nm}${sc}</div>`;
  }
  return `<div class="ko-match">
    <div class="ko-num"><span>Partido ${m.n}</span><span>${fShortDate(m.utc)} · ${fTime(m.utc)}h</span></div>
    ${side(r.h,m.home,hWin,aWin)}
    ${side(r.a,m.away,aWin,hWin)}
    <div class="ko-foot">${m.venue}, ${m.city}</div>
  </div>`;
}

/* ---------------- VISTA: DÓNDE VER ---------------- */
function renderDonde(){
  const el=document.getElementById("view-donde");
  el.innerHTML = `
  <div class="section-head"><h2>Dónde ver el Mundial</h2><span class="sub">México y opciones internacionales</span></div>

  <div class="guide-card">
    <h3>TV abierta en México <span class="tag free">Gratis</span></h3>
    <p>Solo <b>32 de los 104 partidos</b> van por señal abierta gratuita, repartidos entre TV Azteca y Televisa (TelevisaUnivisión). Incluyen los <b>tres partidos de México</b> en fase de grupos, el inaugural, partidazos seleccionados y el cierre (semifinales, tercer lugar y final).</p>
    <div class="chan"><span>Azteca 7</span><span>Azteca Uno</span><span>Canal 5</span><span>Las Estrellas</span><span>Nu9ve (Canal 9)</span></div>
    <p style="font-size:12.5px;color:var(--muted)">Online y gratis: <b>Azteca Deportes</b> (sitio, app y Azteca Deportes Network) transmite los mismos 32 partidos que Azteca 7.</p>
    <div class="callout rosa"><b>Dos ventanas gratis poco conocidas:</b> Televisa pasa el inaugural México vs. Sudáfrica gratis por su canal de YouTube, y el canal oficial de la FIFA emite gratis los primeros 10 minutos de cada partido.</div>
  </div>

  <div class="guide-card">
    <h3>De paga en México <span class="tag paid">Costo extra</span></h3>
    <p>Para ver <b>los 104 partidos</b> necesitas streaming de paga. La única plataforma con todo el torneo es <b>ViX Premium</b> (el "Pase Mundial 2026"), con precio de preventa cercano a $499 MXN y regular alrededor de $999 MXN por el torneo completo.</p>
    <ul>
      <li><b>ViX Premium</b> — los 104 partidos en vivo, la mayoría exclusivos para suscriptores.</li>
      <li><b>TUDN</b> — buena parte del calendario, vía TV de paga (Sky, Izzi, Totalplay, Megacable, Dish).</li>
      <li><b>Sky Sports</b> — partidos en paquetes de TV de paga.</li>
    </ul>
    <p style="font-size:12.5px;color:var(--muted)">En la pestaña <b>Calendario</b>, los partidos marcados <span class="badge free" style="font-size:9px">Gratis MX</span> son los confirmados en abierto; los marcados <span class="badge vix" style="font-size:9px">ViX</span> requieren suscripción.</p>
  </div>

  <div class="guide-card">
    <h3>Ver gratis por internet con VPN <span class="tag vpn">VPN</span></h3>
    <p>Varias televisoras públicas del mundo transmiten el Mundial <b>gratis y por internet</b>, pero con bloqueo geográfico. Con una VPN conectada a ese país puedes acceder a su señal gratuita. Estas son las mejores opciones:</p>
    <ul>
      <li><b>🇬🇧 Reino Unido — BBC iPlayer + ITVX:</b> los 104 partidos gratis, en inglés. Pide crear cuenta con un código postal británico (p. ej. <i>SE1 7PB</i>). La opción más completa.</li>
      <li><b>🇦🇺 Australia — SBS On Demand:</b> todos los partidos gratis, en inglés, con registro local.</li>
      <li><b>🇧🇷 Brasil — CazéTV (YouTube):</b> los 104 partidos gratis en 4K y en portugués, sin necesidad de cuenta (solo YouTube).</li>
      <li><b>🇦🇷 Argentina — TV Pública / Telefe:</b> señal gratuita en español.</li>
      <li><b>🇩🇪 Alemania — ARD / ZDF Mediathek:</b> partidos seleccionados gratis, sin registro.</li>
      <li><b>🇪🇸 España — RTVE Play:</b> partidos de España y cruces grandes, gratis y en español.</li>
    </ul>
    <ol class="steps">
      <li><span class="stepnum">1</span><span>Instala una VPN de confianza en tu dispositivo (celular, tablet, smart TV o computadora).</span></li>
      <li><span class="stepnum">2</span><span>Conéctate a un servidor del país de la señal que quieras (Reino Unido para BBC/ITV, etc.).</span></li>
      <li><span class="stepnum">3</span><span>Abre la app o web del canal y, si pide registro, usa un código postal válido de ese país.</span></li>
      <li><span class="stepnum">4</span><span>Reproduce el partido. Para video en vivo prioriza velocidad y estabilidad de la VPN.</span></li>
    </ol>
    <div class="disclaimer"><b>Nota legal:</b> usar una VPN es legal en México. Sin embargo, acceder a señales con bloqueo geográfico puede ir en contra de los términos de uso de cada plataforma; es una decisión personal. Aquí solo se mencionan <b>transmisiones públicas y gratuitas</b> oficiales de cada país.</div>
  </div>`;
}

/* ===================================================================
   NAVEGACIÓN / EVENTOS
   =================================================================== */
const renderers = {hoy:renderHoy, calendario:renderCalendario, grupos:renderGrupos, eliminatorias:renderEliminatorias, donde:renderDonde};
function renderCurrent(){ clearKOCache(); renderers[state.view](); }

function setView(v){
  state.view=v;
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("is-active", t.dataset.view===v));
  document.querySelectorAll(".view").forEach(s=>s.hidden = s.id!=="view-"+v);
  renderCurrent();
  window.scrollTo({top:0,behavior:"instant"});
}

document.getElementById("tabs").addEventListener("click", e=>{
  const b=e.target.closest(".tab"); if(b) setView(b.dataset.view);
});

// favoritos (delegado)
document.getElementById("main").addEventListener("click", e=>{
  const fb=e.target.closest(".fav"); if(!fb) return;
  const [h,a]=fb.dataset.fav.split("|");
  const code = h||a; if(!code) return;
  // alterna ambos equipos del partido como favoritos individuales
  [h,a].filter(Boolean).forEach(c=>{ state.favs.has(c)?state.favs.delete(c):state.favs.add(c); });
  save("wc26_favs",[...state.favs]);
  renderCurrent();
});

// zona horaria
const tzLabel=document.getElementById("tzLabel");
function paintTz(){ tzLabel.textContent = state.tz==="cdmx" ? "Hora CDMX" : "Mi hora"; }
document.getElementById("tzToggle").onclick=()=>{ state.tz = state.tz==="cdmx"?"local":"cdmx"; save("wc26_tz",state.tz); paintTz(); renderCurrent(); };

// botón de actualizar: recarga al instante el results.json más reciente
const syncBtn = document.getElementById("syncBtn");
if(syncBtn) syncBtn.onclick = async () => {
  if(syncBtn.classList.contains("loading")) return;
  syncBtn.classList.remove("done");
  syncBtn.classList.add("loading");
  const started = Date.now();
  try{ await refreshResults(); }catch(e){}
  // mantener el giro un instante mínimo para que se perciba
  const wait = Math.max(0, 450 - (Date.now()-started));
  setTimeout(()=>{
    syncBtn.classList.remove("loading");
    syncBtn.classList.add("done");
    setTimeout(()=>syncBtn.classList.remove("done"), 1400);
  }, wait);
};

// badge de estado
function updateStatusBadge(){
  const live = WC.matches.some(m=>statusOf(m,koCodes(m)).state==="live");
  const b=document.getElementById("statusBadge"), t=document.getElementById("statusText");
  b.classList.toggle("live",live);
  t.textContent = live ? "En vivo" : "Programación";
  const lu=document.getElementById("lastUpdate");
  lu.textContent = lastUpdate ? new Intl.DateTimeFormat("es-MX",{hour:"2-digit",minute:"2-digit"}).format(lastUpdate) : "—";
}

/* ---------------- arranque ---------------- */
paintTz();
setView("hoy");
refreshResults();
setInterval(refreshResults, CONFIG.refreshSeconds*1000);
// refresco de relojes/estado cada minuto aunque no lleguen resultados
setInterval(()=>{ updateStatusBadge(); if(state.view==="hoy") renderHoy(); }, 60000);
