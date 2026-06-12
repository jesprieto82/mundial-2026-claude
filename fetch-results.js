/* ===================================================================
   Actualiza results.json desde API-Football (api-sports.io).
   - Liga 1 (FIFA World Cup), temporada 2026.
   - La API key se lee de la variable de entorno API_FOOTBALL_KEY
     (un secreto de GitHub Actions). NUNCA se escribe en el repo.
   - Mapea cada partido a NUESTRO número (1-104) y orienta el marcador.
   =================================================================== */
const fs = require("fs");

const API_KEY = process.env.API_FOOTBALL_KEY;
const HOST = "https://v3.football.api-sports.io";
const LEAGUE = 1;      // FIFA World Cup
const SEASON = 2026;

/* ---- cargar nuestro fixture (data.js define window.WC) ---- */
global.window = {};
eval(fs.readFileSync("data.js", "utf8"));
const WC = global.window.WC;
const byNum = {}; WC.matches.forEach(m => byNum[m.n] = m);

/* ---- normalizar nombres de la API -> nuestros códigos ---- */
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
const ALIAS = {
  mx:["mexico"], za:["southafrica"], kr:["southkorea","korearepublic","koreasouth"],
  cz:["czechrepublic","czechia"], ca:["canada"], ba:["bosniaandherzegovina","bosnia","bosniaherzegovina"],
  qa:["qatar"], ch:["switzerland"], br:["brazil"], ma:["morocco"], "gb-sct":["scotland"], ht:["haiti"],
  us:["usa","unitedstates","unitedstatesofamerica"], py:["paraguay"], au:["australia"], tr:["turkey","turkiye"],
  de:["germany"], cw:["curacao"], ci:["ivorycoast","cotedivoire"], ec:["ecuador"], nl:["netherlands"],
  jp:["japan"], se:["sweden"], tn:["tunisia"], be:["belgium"], eg:["egypt"], ir:["iran","iranislamicrepublic"],
  nz:["newzealand"], es:["spain"], cv:["capeverde","caboverde"], sa:["saudiarabia"], uy:["uruguay"],
  fr:["france"], sn:["senegal"], iq:["iraq"], no:["norway"], ar:["argentina"], dz:["algeria"],
  at:["austria"], jo:["jordan"], pt:["portugal"], cd:["congodr","drcongo","democraticrepublicofcongo","congokinshasa"],
  uz:["uzbekistan"], co:["colombia"], "gb-eng":["england"], hr:["croatia"], gh:["ghana"], pa:["panama"]
};
const NAME2CODE = {};
Object.keys(ALIAS).forEach(c => ALIAS[c].forEach(n => NAME2CODE[norm(n)] = c));
Object.keys(WC.teams).forEach(c => { NAME2CODE[norm(WC.teams[c])] = c; }); // también el nombre en español
const codeOf = name => NAME2CODE[norm(name)] || null;

/* ---- índices de mapeo ---- */
// grupos: el par de equipos es único -> número de partido
const pairToN = {};
WC.matches.filter(m => m.stage.length === 1).forEach(m => { pairToN[[m.home, m.away].sort().join("|")] = m.n; });
// eliminatorias: minuto de inicio (UTC) -> número
const minOf = iso => new Date(iso).toISOString().slice(0, 16);
const koByMin = {};
WC.matches.filter(m => m.stage.length > 1).forEach(m => { (koByMin[minOf(m.utc)] = koByMin[minOf(m.utc)] || []).push(m.n); });

/* ---- estado del partido ---- */
function mapStatus(short) {
  if (["FT", "AET", "PEN"].includes(short)) return "FT";
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"].includes(short)) return "LIVE";
  return null; // NS, TBD, PST, CANC... -> no empezado
}

async function fetchAllFixtures() {
  let page = 1, total = 1, all = [];
  while (page <= total) {
    const res = await fetch(`${HOST}/fixtures?league=${LEAGUE}&season=${SEASON}&page=${page}`, {
      headers: { "x-apisports-key": API_KEY }
    });
    if (!res.ok) { console.error("❌ HTTP", res.status, await res.text()); process.exit(1); }
    const data = await res.json();
    if (data.errors && Object.keys(data.errors).length) {
      console.error("❌ La API devolvió errores:", JSON.stringify(data.errors));
      process.exit(1);
    }
    all = all.concat(data.response || []);
    total = data.paging?.total || 1;
    page++;
  }
  return all;
}

/* Convierte la lista de fixtures de la API en nuestro results.json. */
function buildResults(fixtures) {
  const out = {};
  let mapped = 0, skipped = 0;
  for (const fx of fixtures) {
    const st = mapStatus(fx.fixture?.status?.short);
    if (!st) continue;                                  // no empezado
    const gh = fx.goals?.home, ga = fx.goals?.away;
    if (gh == null || ga == null) continue;
    const round = fx.league?.round || "";
    const hCode = codeOf(fx.teams?.home?.name);
    const aCode = codeOf(fx.teams?.away?.name);

    if (/group/i.test(round)) {
      if (!hCode || !aCode) { skipped++; console.warn("Sin mapear (grupo):", fx.teams?.home?.name, "vs", fx.teams?.away?.name); continue; }
      const n = pairToN[[hCode, aCode].sort().join("|")];
      if (n == null) { skipped++; console.warn("Par no encontrado:", hCode, aCode); continue; }
      const mm = byNum[n];
      const h = (hCode === mm.home) ? gh : ga;          // orientar a NUESTRO local/visitante
      const a = (hCode === mm.home) ? ga : gh;
      out[n] = { h, a, status: st };
      mapped++;
    } else {
      const cands = koByMin[minOf(fx.fixture.date)] || [];
      if (cands.length !== 1) { skipped++; console.warn("KO sin mapear (minuto ambiguo o ausente):", round, fx.fixture.date); continue; }
      const n = cands[0];
      const entry = { h: gh, a: ga, status: st, ht: hCode, at: aCode };  // códigos reales para orientar/decidir ganador
      const ph = fx.score?.penalty?.home, pa = fx.score?.penalty?.away;
      if (fx.fixture?.status?.short === "PEN" && ph != null && pa != null) { entry.ph = ph; entry.pa = pa; }
      out[n] = entry;
      mapped++;
    }
  }
  console.log(`Mapeados: ${mapped} | Omitidos: ${skipped}`);
  return out;
}

async function run() {
  if (!API_KEY) { console.error("❌ Falta el secreto API_FOOTBALL_KEY"); process.exit(1); }
  const fixtures = await fetchAllFixtures();
  console.log("Fixtures recibidos:", fixtures.length);
  const out = buildResults(fixtures);
  fs.writeFileSync("results.json", JSON.stringify(out, null, 2) + "\n");
  console.log(`✅ results.json actualizado con ${Object.keys(out).length} partidos.`);
}

if (require.main === module) {
  run().catch(e => { console.error(e); process.exit(1); });
}
module.exports = { buildResults };
