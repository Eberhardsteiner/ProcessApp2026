# KI-Proxy (`process-ai-proxy-v1` → Anthropic Messages API)

Schlanker, eigenständiger Node-Server. Er erfüllt den bereits vorhandenen
Client-Vertrag **`process-ai-proxy-v1`** (siehe `src/ai/aiApiClient.ts`) und reicht
Prompts an die [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages)
weiter.

**Der API-Schlüssel liegt ausschließlich serverseitig (Env), niemals im Browser.**

- Keine Frameworks, keine npm-Abhängigkeiten — nur Node-Builtins + global `fetch`.
- Voraussetzung: **Node >= 18** (für global `fetch`). Optionales Laden einer
  `server/.env` funktioniert ab **Node >= 20.6** (`process.loadEnvFile`).

---

## 1. Konfiguration

Kopieren Sie `server/.env.example` nach `server/.env` und tragen Sie Ihren Schlüssel ein:

```bash
cp server/.env.example server/.env
# danach ANTHROPIC_API_KEY=... in server/.env eintragen
```

| Variable | Pflicht | Default | Bedeutung |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | **ja** | – | Anthropic API-Key. Fehlt er, beendet sich der Proxy mit klarer Meldung. |
| `ANTHROPIC_MODEL` | nein | `claude-sonnet-4-6` | Modell-ID (per Env überschreibbar). |
| `ANTHROPIC_VERSION` | nein | `2023-06-01` | Wert des `anthropic-version`-Headers. |
| `ANTHROPIC_MAX_TOKENS` | nein | `4096` | `max_tokens` (Pflichtfeld der Messages API). |
| `PORT` | nein | `8787` | Lokaler Port des Proxys. |
| `ALLOWED_ORIGIN` | nein | `*` | Wert für `Access-Control-Allow-Origin` (CORS). |
| `PROXY_SHARED_SECRET` | nein | leer | Wenn gesetzt: Clients müssen `Authorization: Bearer <secret>` senden. |

`server/.env` wird von Git ignoriert und darf **nicht** committet werden.

---

## 2. Start

Mit `server/.env` (Node >= 20.6 lädt sie automatisch):

```bash
node server/aiProxy.mjs
```

Oder ohne `.env`, per Shell-Export:

```bash
# Linux/macOS
export ANTHROPIC_API_KEY=sk-ant-...
node server/aiProxy.mjs
```

```powershell
# Windows PowerShell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
node server/aiProxy.mjs
```

Beim Start erscheint eine Zeile wie:

```
[ai-proxy] läuft auf http://localhost:8787  (Modell: claude-sonnet-4-6, anthropic-version: 2023-06-01, Auth: offen (Dev), CORS-Origin: http://localhost:5173)
```

---

## 3. Lokaler Test mit curl

**Health-Check** (kein Key/keine Netzverbindung nötig):

```bash
curl http://localhost:8787/health
# -> ok
```

**Extraktion** (`POST /ai`, Vertrag `process-ai-proxy-v1`):

```bash
curl -X POST http://localhost:8787/ai \
  -H "content-type: application/json" \
  -d '{"schemaVersion":"process-ai-proxy-v1","prompt":"Sag in einem Satz Hallo."}'
```

Erfolgreiche Antwortform:

```json
{ "schemaVersion": "process-ai-proxy-v1", "text": "..." }
```

Mit aktivem `PROXY_SHARED_SECRET` zusätzlich den Bearer-Header senden:

```bash
curl -X POST http://localhost:8787/ai \
  -H "content-type: application/json" \
  -H "authorization: Bearer DEIN_SECRET" \
  -d '{"schemaVersion":"process-ai-proxy-v1","prompt":"Sag in einem Satz Hallo."}'
```

---

## 4. Eintrag im App-Setup (`AiApiSettingsCard`)

Im App-Setup unter **KI-Integration**:

- Datenmodus: **Externer Dienst** (sonst ist der API-Modus deaktiviert).
- Modus: **API (Endpoint)**.
- **Endpoint URL:** `http://localhost:8787/ai`
- **Authentifizierung (authMode):** `Keine` (`none`)

Der Schlüssel liegt im Proxy, nicht im Browser — daher im Dev-Setup `authMode = none`.

---

## 5. Produktionshinweise

- **`PROXY_SHARED_SECRET` setzen** und im App-Setup
  **authMode = `Bearer Token`** mit demselben Secret verwenden. Der Proxy weist
  Anfragen ohne gültigen Bearer-Token mit `401` ab.
- **`ALLOWED_ORIGIN`** auf die echte App-Domain einschränken (z. B.
  `https://app.example.com`), nicht `*` belassen.
- Den Proxy hinter **HTTPS** betreiben (Reverse Proxy / TLS-Terminierung).
- Der Anthropic-Key wird **nie** geloggt oder an den Client zurückgegeben.

---

## Verhalten / Endpunkte

| Methode | Pfad | Verhalten |
|---|---|---|
| `GET` | `/health` | `200` Body `ok`. |
| `OPTIONS` | beliebig | CORS-Preflight (`204`). |
| `POST` | `/ai` | Erwartet `{ schemaVersion: "process-ai-proxy-v1", prompt }`. |

Fehlerfälle bei `POST /ai`:

- Falsches `schemaVersion` oder leerer `prompt` → `400` mit klarer Meldung.
- `PROXY_SHARED_SECRET` gesetzt, aber Bearer fehlt/falsch → `401`.
- Upstream nicht 2xx → derselbe Statuscode + lesbare Anthropic-Meldung.
- Timeout (60 s) → `504` mit klarer Meldung.
