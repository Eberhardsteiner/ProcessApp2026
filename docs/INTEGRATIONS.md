# Betriebsgrenzen und optionale Integrationen

## Grundsatz

Die App bleibt lokal nutzbar und zwingt keine Live-Kopplung zu Drittsystemen.
Stattdessen werden vorbereitete Integrationsprofile, Exportwege und optionale API-Pfade angeboten.

## Neue Prüfpunkte in v0.26

- Import-Gesundheit in Schritt 1
- Betriebsgrenzen und Integrationswege in Schritt 5
- vorbereitete JSON-Profile für Connector-Kurzprofil und Handover
- lokaler Integrationscheck per `npm run integration:check`

## Erweiterung in v0.37

- neue **Integrationswerkbank** in Schritt 5
- strukturierte **Integrationsverträge** je Connector-Paket
- **Exchange Package** als ruhige JSON-Zwischenform
- Rückmeldungen aus Zielsystemen oder Proxies können als Receipt wieder in den Arbeitsstand übernommen werden
- neuer Check `npm run adapter:check`

## Wann ein Integrationsweg sinnvoll ist

- **Lokal und ohne KI**: wenn Dokumente, Freitexte oder Tabellen bereits tragfähige Prozessschritte liefern
- **Copy/Paste-KI**: wenn lokale Ergebnisse gut sind, aber sprachlich oder strukturell nachgeschärft werden sollen
- **API-KI**: nur wenn im Setup ein Endpoint bewusst hinterlegt wurde
- **Zeitbasierte Übergaben**: erst bei echten Zeitangaben sinnvoll
- **Governance-Weitergabe**: erst mit Bericht und zumindest teilgeklärtem Review-Stand

## Bewusst noch nicht aktiv

- stille Live-Synchronisation in externe Systeme
- automatische Hintergrundübertragung ohne Nutzerklick
- belastbare Zeitanalysen ohne echte Zeitstempel

## Nützlicher Prüfpfad

```bash
npm ci
npm run typecheck
npm run build
npm run benchmark:pm
npm run pilot:check
npm run integration:check
npm run adapter:check
```
