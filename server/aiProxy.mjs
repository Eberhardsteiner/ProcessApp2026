// Minimaler KI-Proxy: erfüllt den Client-Vertrag "process-ai-proxy-v1"
// (siehe src/ai/aiApiClient.ts) und reicht Prompts an die Anthropic Messages API
// weiter. Der API-Schlüssel liegt ausschließlich serverseitig (Env), nie im Browser.
//
// Keine Frameworks, keine npm-Abhängigkeiten: nur Node-Builtins + global fetch
// (Node >= 18). Start:  node server/aiProxy.mjs
//
// Verifiziert gegen https://platform.claude.com/docs/en/api/messages
//   Endpoint : POST https://api.anthropic.com/v1/messages
//   Header   : x-api-key, anthropic-version, content-type
//   Body     : { model, max_tokens (Pflicht), messages: [{ role, content }] }
//   Antwort  : content[] mit Blöcken { type: "text", text: "..." }

import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// --- Optionales .env neben diesem Skript laden (Node >= 20.6) ---------------
// Liegt keine .env vor, kommt die Konfiguration aus der Shell-Umgebung.
try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url)));
  }
} catch {
  // Keine .env gefunden -> kein Fehler, Env stammt aus der Shell.
}

// --- Konfiguration aus der Umgebung ----------------------------------------
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION || '2023-06-01';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const PROXY_SHARED_SECRET = process.env.PROXY_SHARED_SECRET || '';

const ANTHROPIC_MAX_TOKENS = toPositiveInt(process.env.ANTHROPIC_MAX_TOKENS, 4096);
const PORT = toPositiveInt(process.env.PORT, 8787);

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const REQUEST_TIMEOUT_MS = 60000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // großzügig; schützt nur vor Missbrauch
const SCHEMA_VERSION = 'process-ai-proxy-v1';

// Pflicht-Key: ohne ihn kann der Proxy nichts tun -> mit klarer Meldung beenden.
if (!ANTHROPIC_API_KEY) {
  console.error(
    '[ai-proxy] FEHLER: Umgebungsvariable ANTHROPIC_API_KEY fehlt.\n' +
      '           Setzen Sie sie per Shell-Export oder in server/.env und starten Sie neu.\n' +
      '           Beispiel: ANTHROPIC_API_KEY=sk-ant-... node server/aiProxy.mjs',
  );
  process.exit(1);
}

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Zeitkonstanter Vergleich des Shared Secret (verhindert Timing-Lecks).
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// --- Antwort-Helfer (immer mit CORS-Headern) --------------------------------
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization',
  };
}

function send(res, status, body, contentType) {
  res.writeHead(status, { 'Content-Type': contentType, ...corsHeaders() });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');
}

function sendText(res, status, text) {
  send(res, status, text, 'text/plain; charset=utf-8');
}

// --- Request-Body lesen (mit Größenlimit) -----------------------------------
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// --- Kernlogik: POST /ai ----------------------------------------------------
async function handleAi(req, res) {
  // 1) Optionale Shared-Secret-Authentifizierung (zuerst, vor jeglicher Arbeit).
  if (PROXY_SHARED_SECRET) {
    const auth = req.headers['authorization'] || '';
    if (!safeEqual(auth, `Bearer ${PROXY_SHARED_SECRET}`)) {
      sendText(res, 401, 'Nicht autorisiert: gültiger Bearer-Token erforderlich.');
      return;
    }
  }

  // 2) Body einlesen.
  let rawBody;
  try {
    rawBody = await readRequestBody(req);
  } catch (err) {
    if (err && err.message === 'TOO_LARGE') {
      sendText(res, 413, 'Anfrage zu groß.');
    } else {
      sendText(res, 400, 'Anfrage-Body konnte nicht gelesen werden.');
    }
    return;
  }

  // 3) Body als JSON parsen.
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    sendText(res, 400, 'Ungültiges JSON im Anfrage-Body.');
    return;
  }

  // 4) Vertrag prüfen: schemaVersion + prompt.
  if (payload?.schemaVersion !== SCHEMA_VERSION) {
    sendText(res, 400, `Feld "schemaVersion" muss "${SCHEMA_VERSION}" sein.`);
    return;
  }
  const prompt = payload?.prompt;
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    sendText(res, 400, 'Feld "prompt" fehlt oder ist leer.');
    return;
  }

  // 5) An Anthropic Messages API weiterleiten (mit Timeout).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    // 6) Upstream-Fehler: Statuscode + lesbare Meldung zurückgeben.
    //    Niemals API-Key oder gesendete Header loggen/zurückgeben.
    if (!upstream.ok) {
      const raw = await upstream.text().catch(() => '');
      let message = raw;
      try {
        const parsed = JSON.parse(raw);
        message = parsed?.error?.message || parsed?.message || raw;
      } catch {
        // raw bleibt unverändert
      }
      console.error(`[ai-proxy] Upstream-Fehler ${upstream.status}`);
      sendText(
        res,
        upstream.status,
        `Anthropic-Fehler (${upstream.status}): ${message || upstream.statusText || 'Unbekannter Fehler'}`,
      );
      return;
    }

    // 7) Erfolg: alle Text-Blöcke aus content[] zu EINEM String konkatenieren.
    let data;
    try {
      data = await upstream.json();
    } catch {
      console.error('[ai-proxy] Antwort konnte nicht als JSON gelesen werden');
      sendText(res, 502, 'Antwort der Anthropic-API konnte nicht gelesen werden.');
      return;
    }

    const text = Array.isArray(data?.content)
      ? data.content
          .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('')
      : '';

    sendJson(res, 200, { schemaVersion: SCHEMA_VERSION, text });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      sendText(
        res,
        504,
        `Zeitüberschreitung: Anthropic hat nicht innerhalb von ${REQUEST_TIMEOUT_MS} ms geantwortet.`,
      );
    } else {
      console.error('[ai-proxy] Verbindung zur Anthropic-API fehlgeschlagen:', err?.message);
      sendText(
        res,
        502,
        `Verbindung zur Anthropic-API fehlgeschlagen: ${err?.message || 'Unbekannter Fehler'}`,
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

// --- HTTP-Server + Routing --------------------------------------------------
const server = http.createServer(async (req, res) => {
  try {
    const method = req.method || 'GET';
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;

    // CORS-Preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    if (method === 'GET' && pathname === '/health') {
      sendText(res, 200, 'ok');
      return;
    }

    if (method === 'POST' && pathname === '/ai') {
      await handleAi(req, res);
      return;
    }

    sendText(res, 404, 'Nicht gefunden. Verfügbar: GET /health, POST /ai');
  } catch (err) {
    // Einzelne Fehler dürfen den Server nicht abstürzen lassen.
    console.error('[ai-proxy] Interner Fehler:', err?.message);
    try {
      sendText(res, 500, 'Interner Serverfehler im Proxy.');
    } catch {
      // Antwort ggf. bereits gesendet -> ignorieren.
    }
  }
});

// Zusätzliche Sicherheitsnetze gegen Abstürze.
server.on('clientError', (_err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
process.on('uncaughtException', (err) => {
  console.error('[ai-proxy] Unerwarteter Fehler (abgefangen):', err?.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[ai-proxy] Unbehandelte Rejection (abgefangen):', err?.message);
});

server.listen(PORT, () => {
  console.log(
    `[ai-proxy] läuft auf http://localhost:${PORT}  ` +
      `(Modell: ${ANTHROPIC_MODEL}, anthropic-version: ${ANTHROPIC_VERSION}, ` +
      `Auth: ${PROXY_SHARED_SECRET ? 'Bearer erforderlich' : 'offen (Dev)'}, ` +
      `CORS-Origin: ${ALLOWED_ORIGIN})`,
  );
});
