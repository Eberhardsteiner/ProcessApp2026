// Minimaler Transkriptions-Proxy: erfüllt den Client-Vertrag
// "process-transcription-proxy-v1" (siehe src/speech/transcriptionProxyClient.ts)
// und reicht Audio an eine OpenAI-kompatible /audio/transcriptions-Gegenstelle
// (self-hosted Whisper ODER OpenAI) weiter. Der Upstream-Schlüssel liegt
// ausschließlich serverseitig (Env), nie im Browser.
//
// Eigenständiger Prozess auf EIGENEM Port (Default 8788) NEBEN server/aiProxy.mjs.
// Keine Frameworks, keine npm-Abhängigkeiten: nur Node-Builtins + global fetch /
// FormData / Blob (Node >= 18). Start:  node server/transcriptionProxy.mjs
//
// Zwei getrennte Auth-Richtungen (wie bei aiProxy):
//   - eingehend  (Browser -> Proxy): optionales TRANSCRIPTION_PROXY_SHARED_SECRET
//   - ausgehend  (Proxy -> Whisper/OpenAI): optionaler TRANSCRIPTION_API_KEY

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
const TRANSCRIPTION_ENDPOINT = process.env.TRANSCRIPTION_ENDPOINT;
const TRANSCRIPTION_API_KEY = process.env.TRANSCRIPTION_API_KEY || '';
const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL || 'whisper-1';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const TRANSCRIPTION_PROXY_SHARED_SECRET = process.env.TRANSCRIPTION_PROXY_SHARED_SECRET || '';

const PORT = toPositiveInt(process.env.PORT, 8788);
const REQUEST_TIMEOUT_MS = toPositiveInt(process.env.TRANSCRIPTION_TIMEOUT_MS, 60000);

const MAX_BODY_BYTES = 40 * 1024 * 1024; // Audio (Base64 im JSON) darf größer sein als Text
const SCHEMA_VERSION = 'process-transcription-proxy-v1';

// Pflicht-Endpoint: ohne ihn kann der Proxy nichts tun -> mit klarer Meldung beenden.
if (!TRANSCRIPTION_ENDPOINT) {
  console.error(
    '[transcription-proxy] FEHLER: Umgebungsvariable TRANSCRIPTION_ENDPOINT fehlt.\n' +
      '           Setzen Sie die OpenAI-kompatible /audio/transcriptions-URL per Shell-Export\n' +
      '           oder in server/.env und starten Sie neu.\n' +
      '           Beispiel: TRANSCRIPTION_ENDPOINT=http://localhost:8000/v1/audio/transcriptions node server/transcriptionProxy.mjs',
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

// Dateiname für den Upload aus dem MIME-Type ableiten (Gegenstelle nutzt die Endung).
function filenameForMime(mimeType) {
  const m = String(mimeType || '').toLowerCase();
  if (m.includes('webm')) return 'audio.webm';
  if (m.includes('wav')) return 'audio.wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'audio.mp3';
  if (m.includes('mp4') || m.includes('m4a')) return 'audio.m4a';
  if (m.includes('ogg')) return 'audio.ogg';
  return 'audio.webm';
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

// --- Kernlogik: POST /transcribe -------------------------------------------
async function handleTranscribe(req, res) {
  // 1) Optionale Shared-Secret-Authentifizierung (eingehend, vor jeglicher Arbeit).
  if (TRANSCRIPTION_PROXY_SHARED_SECRET) {
    const auth = req.headers['authorization'] || '';
    if (!safeEqual(auth, `Bearer ${TRANSCRIPTION_PROXY_SHARED_SECRET}`)) {
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
      sendText(res, 413, 'Audio zu groß.');
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

  // 4) Vertrag prüfen: schemaVersion + audioBase64.
  if (payload?.schemaVersion !== SCHEMA_VERSION) {
    sendText(res, 400, `Feld "schemaVersion" muss "${SCHEMA_VERSION}" sein.`);
    return;
  }
  const audioBase64 = payload?.audioBase64;
  if (typeof audioBase64 !== 'string' || audioBase64.length === 0) {
    sendText(res, 400, 'Feld "audioBase64" fehlt oder ist leer.');
    return;
  }
  const mimeType = typeof payload?.mimeType === 'string' && payload.mimeType.trim() ? payload.mimeType.trim() : 'audio/webm';
  const language = typeof payload?.language === 'string' && payload.language.trim() ? payload.language.trim() : undefined;

  // 5) Audio -> Buffer -> Blob -> multipart FormData (OpenAI-kompatibel).
  let form;
  try {
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    if (audioBuffer.length === 0) {
      sendText(res, 400, 'Audio konnte nicht dekodiert werden (leeres Base64).');
      return;
    }
    const blob = new Blob([audioBuffer], { type: mimeType });
    form = new FormData();
    form.append('file', blob, filenameForMime(mimeType));
    form.append('model', TRANSCRIPTION_MODEL);
    if (language) form.append('language', language);
    form.append('response_format', 'json');
  } catch {
    sendText(res, 400, 'Audio konnte nicht verarbeitet werden.');
    return;
  }

  // 6) An die OpenAI-kompatible Gegenstelle POSTen (mit Timeout).
  //    Niemals API-Key oder gesendete Header loggen/zurückgeben.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = {};
    if (TRANSCRIPTION_API_KEY) headers['Authorization'] = `Bearer ${TRANSCRIPTION_API_KEY}`;
    // Content-Type NICHT setzen: fetch erzeugt die multipart-Boundary für FormData selbst.

    const upstream = await fetch(TRANSCRIPTION_ENDPOINT, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const raw = await upstream.text().catch(() => '');
      let message = raw;
      try {
        const parsed = JSON.parse(raw);
        message = parsed?.error?.message || parsed?.message || raw;
      } catch {
        // raw bleibt unverändert
      }
      console.error(`[transcription-proxy] Upstream-Fehler ${upstream.status}`);
      sendText(
        res,
        upstream.status,
        `Transkriptions-Fehler (${upstream.status}): ${message || upstream.statusText || 'Unbekannter Fehler'}`,
      );
      return;
    }

    // 7) Erfolg: JSON { text } erwarten; bei reinem Text diesen direkt verwenden.
    const raw = await upstream.text();
    let text = raw.trim();
    try {
      const data = JSON.parse(raw);
      if (data && typeof data.text === 'string') {
        text = data.text;
      }
    } catch {
      // kein JSON -> raw als reinen Text verwenden
    }

    sendJson(res, 200, { schemaVersion: SCHEMA_VERSION, text });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      sendText(
        res,
        504,
        `Zeitüberschreitung: Die Transkriptions-Gegenstelle hat nicht innerhalb von ${REQUEST_TIMEOUT_MS} ms geantwortet.`,
      );
    } else {
      console.error('[transcription-proxy] Verbindung zur Gegenstelle fehlgeschlagen:', err?.message);
      sendText(
        res,
        502,
        `Verbindung zur Transkriptions-Gegenstelle fehlgeschlagen: ${err?.message || 'Unbekannter Fehler'}`,
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

    if (method === 'POST' && pathname === '/transcribe') {
      await handleTranscribe(req, res);
      return;
    }

    sendText(res, 404, 'Nicht gefunden. Verfügbar: GET /health, POST /transcribe');
  } catch (err) {
    // Einzelne Fehler dürfen den Server nicht abstürzen lassen.
    console.error('[transcription-proxy] Interner Fehler:', err?.message);
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
  console.error('[transcription-proxy] Unerwarteter Fehler (abgefangen):', err?.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[transcription-proxy] Unbehandelte Rejection (abgefangen):', err?.message);
});

server.listen(PORT, () => {
  console.log(
    `[transcription-proxy] läuft auf http://localhost:${PORT}  ` +
      `(Modell: ${TRANSCRIPTION_MODEL}, Upstream: ${TRANSCRIPTION_ENDPOINT}, ` +
      `Auth eingehend: ${TRANSCRIPTION_PROXY_SHARED_SECRET ? 'Bearer erforderlich' : 'offen (Dev)'}, ` +
      `Auth ausgehend: ${TRANSCRIPTION_API_KEY ? 'Bearer gesetzt' : 'keiner'}, ` +
      `CORS-Origin: ${ALLOWED_ORIGIN})`,
  );
});
