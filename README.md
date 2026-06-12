# Mundial 2026 — Guía y calendario

Aplicación web estática con el calendario completo del **Mundial de Fútbol 2026** (11 jun – 19 jul 2026): los 104 partidos con fecha y hora, **dónde verlos en México** (TV abierta gratis y opciones de paga), **opciones internacionales gratuitas vía VPN**, **tablas de grupos** y **cuadro de eliminatorias** que se calculan solos a partir de los resultados.

No necesita servidor ni base de datos: es HTML + CSS + JavaScript puro, ideal para **GitHub Pages**. Funciona en cualquier dispositivo (celular, tablet, computadora, smart TV).

---

## 1. Publicarla en tu GitHub (GitHub Pages)

### Opción A — Desde la web de GitHub (la más sencilla, sin instalar nada)

1. Entra a <https://github.com/new> y crea un repositorio nuevo, por ejemplo **`mundial-2026`**. Déjalo **público** y créalo vacío (sin README).
2. En la página del repo, pulsa **Add file → Upload files**.
3. Arrastra estos archivos (todos en la raíz, no dentro de una carpeta):
   - `index.html`
   - `styles.css`
   - `app.js`
   - `data.js`
   - `results.json`
   - `README.md` (opcional)
4. Abajo pulsa **Commit changes**.
5. Ve a **Settings → Pages** (menú lateral).
6. En **Build and deployment → Source** elige **Deploy from a branch**.
7. En **Branch** selecciona **`main`** y carpeta **`/ (root)`**, y pulsa **Save**.
8. Espera 1–2 minutos. GitHub te mostrará la dirección pública, del estilo:
   `https://TU-USUARIO.github.io/mundial-2026/`

¡Listo! Esa URL está disponible siempre y en cualquier dispositivo. Guárdala como favorito o como acceso directo en la pantalla de inicio del celular.

### Opción B — Desde la terminal (si usas git)

```bash
cd carpeta-con-los-archivos
git init
git add .
git commit -m "Mundial 2026"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/mundial-2026.git
git push -u origin main
```

Luego haz los pasos **5–8** de la Opción A para activar Pages.

### Opción C — Con GitHub CLI (`gh`), todo desde la terminal

Si ya tienes la GitHub CLI instalada y con sesión iniciada (`gh auth login` hecho), desde la carpeta con los archivos:

```bash
cd mundial-2026
gh repo create mundial-2026 --public --source=. --remote=origin --push
```

Eso crea el repo en tu cuenta y sube los archivos en un solo paso. Después activa Pages (una vez):

```bash
gh api -X POST "repos/{owner}/mundial-2026/pages" \
  -f "source[branch]=main" -f "source[path]=/"
```

Sustituye `{owner}` por tu usuario de GitHub. Si ese comando da error de permisos, simplemente activa Pages a mano con los pasos **5–8** de la Opción A (toma 10 segundos). La URL final es `https://TU-USUARIO.github.io/mundial-2026/`.

---

## 2. Actualizar resultados (clasificación y cruces en vivo)

La app lee un archivo **`results.json`** del propio repositorio cada minuto. Tú lo editas, haces commit, y la app recalcula **automáticamente** las tablas de cada grupo, los mejores terceros y el cuadro de eliminatorias.

### Formato

`results.json` es un objeto donde la **clave es el número de partido** (el `#` que ves en cada tarjeta) y el valor lleva goles de local (`h`), de visitante (`a`) y el estado (`status`):

```json
{
  "1":  { "h": 2, "a": 1, "status": "FT" },
  "2":  { "h": 0, "a": 0, "status": "LIVE" },
  "7":  { "h": 3, "a": 1, "status": "FT" }
}
```

- `status`: `"FT"` = finalizado · `"LIVE"` = en juego · omítelo o usa `"PRE"` si aún no empieza.
- Solo agrega los partidos que ya tengan marcador; los demás se quedan como “por jugarse”.
- En los partidos de eliminatoria, marca `"FT"` para que el ganador avance al siguiente cruce.

### Cómo editarlo en GitHub

1. En el repo, abre `results.json` y pulsa el lápiz ✏️ (**Edit**).
2. Agrega o cambia los marcadores.
3. **Commit changes**. En ~1 minuto la app refleja los cambios (las tablas y el cuadro se recalculan solos).

> El **local** (`h`) es el primer equipo que aparece en la tarjeta del partido; el **visitante** (`a`) es el segundo.

---

## 3. (Opcional) Actualización automática con API-Football

El repositorio ya incluye todo lo necesario para que los resultados se actualicen **solos** desde [API-Football](https://www.api-football.com/), sin que tú edites nada:

- `scripts/fetch-results.js` — consulta la API (liga 1, temporada 2026), mapea cada partido a su número y escribe `results.json`.
- `.github/workflows/update-results.yml` — ejecuta ese script cada 30 minutos.

### 🔒 Seguridad: NUNCA pongas tu API key en el código

Tu clave de API es secreta. **No la escribas en `app.js`, `data.js` ni en ningún archivo del repositorio**, porque tu sitio es público y cualquiera podría copiarla y agotar tu cuota. La forma correcta es guardarla como **secreto cifrado**, así nunca se publica.

### Pasos para activarla

1. En tu repo, ve a **Settings → Secrets and variables → Actions → New repository secret**.
2. **Name:** `API_FOOTBALL_KEY` — **Secret:** pega tu clave de API-Football. Guarda.
3. Ve a la pestaña **Actions**, elige el flujo **“Actualizar resultados (API-Football)”** y pulsa **Run workflow** para una primera ejecución inmediata (luego corre solo cada 30 min).
4. Abre la pestaña de esa ejecución para ver el registro: dirá cuántos partidos mapeó y si algún nombre de equipo no coincidió.

Con eso, `results.json` se actualiza solo y la app muestra marcadores, tablas y cruces al día. El modo manual de la sección 2 sigue disponible como respaldo.

### Notas

- **Cuota:** el plan gratuito de API-Football suele permitir ~100 peticiones/día. Cada ejecución usa 1–2 peticiones; a 30 min son ~48–96/día. Si ves errores de límite, cambia el `cron` a `"0 * * * *"` (cada hora) en el workflow.
- **Nombres de equipos:** el script reconoce los 48 países, pero si en el registro aparece algún “Sin mapear”, dime el nombre exacto que usa la API y lo añado.
- **Eliminatorias:** el script ya maneja ganadores por penales para que el cuadro avance correctamente.
- Si compartiste tu clave en algún lugar, **regenérala** en tu panel de API-Football y actualiza el secreto.

---

## 4. Notas sobre la información

- **TV abierta gratis en México:** de los 104 partidos, alrededor de **32** van por señal abierta (TV Azteca y Televisa), incluidos los 3 de México, el inaugural, partidazos selectos, semifinales, tercer lugar y final. Los marcados *Gratis MX* en el calendario son los confirmados en abierto; la lista exacta puede ajustarse según se acerque cada jornada. Para los 104 se necesita **ViX Premium** (de paga).
- **VPN:** usar VPN es legal en México. Acceder a señales con bloqueo geográfico puede ir contra los términos de uso de cada plataforma; es una decisión personal. La app solo menciona **transmisiones públicas y gratuitas** oficiales (BBC/ITV en Reino Unido, SBS en Australia, CazéTV en Brasil, etc.).
- **Horarios:** se convierten automáticamente a la zona de tu dispositivo, con opción de ver todo en **hora de Ciudad de México**.

Proyecto independiente de aficionado. No afiliado a la FIFA.
