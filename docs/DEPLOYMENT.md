# Deployment-Reife und Betriebsrahmen

## Ziel

Die App ist weiterhin primär ein lokaler, kontrollierter Arbeitsstand. Ab v0.38 wird das geplante Betriebsziel aber ausdrücklich festgehalten.

## Unterstützte Zielbilder im Sicherheitsprofil

- **lokaler Browserbetrieb**
- **interne statische Bereitstellung**
- **interner Proxy-/Gateway-Betrieb**
- **betreuter Pilotbetrieb**

Diese Angabe ist keine technische Automatik, sondern eine dokumentierte Betriebsentscheidung.

## Typische Leitfragen

- Wird die App nur lokal im Browser genutzt oder intern bereitgestellt?
- Gibt es externe KI-, Übersetzungs- oder Transkriptionswege?
- Wie werden Snapshots, Pilot-Pakete und Connector-Exporte gesichert?
- Wer ist Ansprechperson bei Störungen oder Rückfragen?
- Welche Datenklassifikation gilt für das aktuelle Material?

## Empfehlung für Pilotläufe

1. Datenklassifikation sichtbar festlegen
2. externen Datenweg nur bewusst freigeben
3. Aufbewahrung und Backup kurz dokumentieren
4. Deployment-Ziel und Incident-Kontakt hinterlegen
5. Profil einmal merken und als JSON oder Textbriefing exportieren
6. danach zusätzlich den Release-Check ausführen

## Nützliche Befehle

```bash
npm run security:check
npm run release:check
npm run pilot:check
```
