# KI-API-Integration (Optional)

## Überblick

Standardmäßig erfolgt die KI-Interaktion über Copy/Paste ohne automatische Datenübertragung. Optional kann im Setup ein API-Modus aktiviert werden, der es ermöglicht, Prompts per Klick an einen konfigurierten Endpoint zu senden.

**Wichtig:** Der API-Modus ist eine optionale Ergänzung. Copy/Paste bleibt die Standard-Methode und funktioniert weiterhin unverändert.

---

## Aktivierung

### Voraussetzungen
- Datenmodus muss auf "Externer Dienst" gesetzt sein (Setup-Tab)
- API-Modus im Setup-Tab aktivieren

### Konfiguration (Setup-Tab)

Im Setup-Tab finden Sie die Karte "KI-Integration (optional)" mit folgenden Einstellungen:

1. **Modus:**
   - Copy/Paste (Standard) – keine API-Calls
   - API (Endpoint) – sendet Prompts an konfigurierten Endpoint

2. **Endpoint URL:**
   - URL des Proxy-Endpoints (z.B. `https://example.com/ai`)
   - Muss mit `http://` oder `https://` beginnen

3. **Authentifizierung:**
   - **Keine** – keine Authentifizierung
   - **Bearer Token** – `Authorization: Bearer <token>` Header
   - **API Key Header** – `x-api-key: <key>` Header

4. **API Key:**
   - Wird lokal im Browser gespeichert (localStorage)
   - Nur bei Bearer oder API Key Header erforderlich

5. **Timeout:**
   - Standard: 60000ms (60 Sekunden)
   - Bereich: 5000ms - 180000ms

---

## Nutzung in KI-Flows

Wenn der API-Modus aktiviert ist, erscheint in allen KI-unterstützten Flows ein zusätzlicher Abschnitt "API-Modus" zwischen Prompt-Generierung und Antwort-Einfügen.

**Verfügbar in:**
- Prozess-Extraktion (KI-Tab)
- Maßnahmen-Vorschläge (Maßnahmen-Tab)
- Maßnahmen-KI-Entwurf (Maßnahmen-Tab)
- Semantikfragen-Priorisierung (Qualität-Tab)
- Diff-Erklärung (Änderungen-Tab)

Der Proxy wird für Prozess-Extraktion, Maßnahmen-Vorschläge, Maßnahmen-KI-Entwurf, Semantikfragen-Priorisierung und Diff-Erklärung genutzt.

### Workflow

1. **Quelltext eingeben** (wie gewohnt)
2. **Consent-Checkbox aktivieren:** "Ich verstehe, dass der Prompt an einen externen Dienst gesendet wird"
3. **Optional: Request Preview prüfen** (zeigt JSON-Payload ohne API-Key)
4. **Klick auf "Per API senden"**
   - Prompt wird an konfigurierten Endpoint gesendet
   - Antwort wird automatisch ins "Claude-Antwort (JSON)"-Feld übernommen
5. **Import wie gewohnt** per separatem Klick auf "Als neue Version importieren"

### Fehlerbehandlung

Bei Fehlern (Timeout, Netzwerkfehler, ungültige Antwort) wird eine Fehlermeldung angezeigt. Der Workflow kann dann über Copy/Paste fortgesetzt werden.

---

## Proxy-Vertrag (API Contract)

### Request Format

**Endpoint:** POST zu konfigurierter URL

**Headers:**
- `Content-Type: application/json`
- Optional: `Authorization: Bearer <token>` (bei authMode=bearer)
- Optional: `x-api-key: <key>` (bei authMode=x_api_key)

**Body:**
```json
{
  "schemaVersion": "process-ai-proxy-v1",
  "prompt": "<vollständiger Prompt als String>"
}
```

### Response Format

**Status:** 200 OK

**Headers:**
- `Content-Type: application/json`

**Body:**
```json
{
  "schemaVersion": "process-ai-proxy-v1",
  "text": "<Claude JSON-Antwort als String>"
}
```

### Fehler-Responses

Bei Fehlern sollte der Endpoint HTTP-Fehlercodes zurückgeben (4xx/5xx). Die App zeigt dann eine entsprechende Fehlermeldung mit Status und Body an.

---

## Sicherheitshinweise

### API-Keys im Frontend

**Wichtig:** API-Keys werden lokal im Browser (localStorage) gespeichert. Für produktiven Einsatz mit sensiblen API-Keys empfehlen wir dringend einen eigenen Proxy/Backend.

### Empfohlene Architektur

```
[Browser/App]
    |
    | HTTPS POST (kein Claude API Key)
    v
[Ihr Backend/Proxy]
    |
    | HTTPS POST (Claude API Key)
    v
[Claude API]
```

**Vorteile:**
- Claude API-Key bleibt serverseitig sicher
- Authentifizierung/Autorisierung kann serverseitig erfolgen
- Rate-Limiting und Monitoring möglich
- Logging und Audit-Trail zentral

### Minimale Backend-Implementierung (Beispiel Node.js/Express)

```javascript
const express = require('express');
const app = express();

app.post('/ai', async (req, res) => {
  const { schemaVersion, prompt } = req.body;

  if (schemaVersion !== 'process-ai-proxy-v1') {
    return res.status(400).json({ error: 'Invalid schema version' });
  }

  // TODO: Authentifizierung/Autorisierung prüfen

  try {
    // Claude API Call (Anthropic SDK oder fetch)
    const response = await callClaudeApi(prompt);

    res.json({
      schemaVersion: 'process-ai-proxy-v1',
      text: response.content[0].text
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000);
```

---

## Datenschutz

### Datenfluss

- **Copy/Paste Modus (Standard):** Keine automatische Übertragung, volle Kontrolle
- **API-Modus:** Prompt wird nur auf expliziten Klick mit Consent gesendet
- **Keine Hintergrund-Calls:** Niemals werden Daten ohne Nutzereingabe übertragen

### Empfehlungen

1. **Anonymisierung:** Sensible Daten vor Übertragung anonymisieren
2. **Proxy nutzen:** Eigenes Backend für sichere API-Key-Verwaltung
3. **Logging:** Backend sollte Audit-Trail für Compliance führen
4. **Consent:** Nutzer muss vor jedem API-Call explizit zustimmen

---

## Troubleshooting

### API-Button ist disabled
- Prüfen Sie, ob Consent-Checkbox aktiviert ist
- Prüfen Sie, ob Endpoint URL konfiguriert ist
- Prüfen Sie, ob Quelltext eingegeben wurde
- Prüfen Sie, ob Datenmodus = "Externer Dienst"

### Timeout-Fehler
- Erhöhen Sie Timeout im Setup (max 180 Sekunden)
- Prüfen Sie Backend-Performance
- Prüfen Sie Claude API Response Time

### "Ungültige API Antwort: Feld 'text' fehlt"
- Prüfen Sie Response-Format Ihres Backends
- Muss exakt `{ schemaVersion: 'process-ai-proxy-v1', text: '...' }` sein

### CORS-Fehler
- Backend muss CORS-Headers setzen für Browser-Requests
- `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers`, etc.

---

## Zusammenfassung

- **Copy/Paste bleibt Standard** – keine Änderung am bestehenden Workflow
- **API ist optional** – nur bei Bedarf aktivieren
- **Proxy empfohlen** – für sichere API-Key-Verwaltung
- **Expliziter Consent** – kein automatischer API-Call
- **Transparenter Vertrag** – einfaches JSON Request/Response Format
