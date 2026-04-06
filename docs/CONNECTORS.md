# Connector-Pakete

Die App koppelt standardmäßig nichts still im Hintergrund an Fremdsysteme an.
Stattdessen stellt sie in Schritt 5 optionale Connector-Pakete bereit.

## Enthaltene Pakete

- **Ticket- und Case-Handover**
  - Hauptlinie, Soll-Hinweise, Hotspots und nächste Schritte
  - geeignet für Service-, Ticket- oder Case-Systeme

- **BI- und Reporting-Feed**
  - Kennzahlen, Discovery-/Conformance-/Enhancement-Summen
  - geeignet für Dashboards, Reporting und Data Lab

- **KI- und API-Proxy-Bundle**
  - lokaler Kontext, Guardrails, optionaler Prompt- und API-Hinweis
  - geeignet für Copy/Paste oder einen bewusst konfigurierten API-Proxy

- **Governance- und Audit-Archiv**
  - Governance-Workflow, Freigaben, Berichtsstände und Verlauf
  - geeignet für Review, Audit und Pilotsteuerung

## Grundprinzip

Die Connector-Pakete bleiben bewusst **optional**.
Sie dienen als strukturierte Zwischenform für Weitergabe, Copy/Paste oder vorbereitete Integrationen.
Die App bleibt lokal führend.

## Integrationswerkbank ab v0.37

Zusätzlich zu den Paketexporten gibt es jetzt eine **Integrationswerkbank**.
Sie führt jeden Connector-Weg mit:

- einem klaren Vertrag mit Pflicht- und optionalen Feldern
- einem **Exchange Package** als strukturierter JSON-Zwischenform
- einer Möglichkeit, externe **Receipts** wieder kontrolliert in den PM-Arbeitsstand zurückzuholen

Damit entsteht ein belastbarer Übergabepfad, ohne dass die App im Hintergrund Daten still synchronisiert.

## Prüfbefehl

```bash
npm run connector:check
npm run adapter:check
```

Der Check baut die Bundle-Logik lokal gegen mehrere Beispielpakete und prüft, ob die Pakettypen weiterhin robust erzeugt werden.
