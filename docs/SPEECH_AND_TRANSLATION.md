# Sprache & Übersetzung

## Überblick

Diese Einstellungen bereiten zukünftige Funktionen für Spracherkennung (Speech-to-Text / STT) und Übersetzung vor. Sie ermöglichen die Konfiguration von Datenmodi und Sprachpräferenzen für die Prozesserfassung.

## Zweck

Die Sprach- und Übersetzungseinstellungen schaffen die Grundlage für erweiterte Erfassungsmöglichkeiten:

- **Spracherkennung**: Transkription von gesprochenen Workshop-Inhalten in Text
- **Übersetzung**: Automatische Übersetzung von Prozessinhalten in verschiedene Zielsprachen
- **Datenschutz**: Klare Kontrolle über lokale vs. externe Datenverarbeitung

## Datenmodus

### Lokal (Standard)

- **Keine externen Dienste**: Alle Daten bleiben im Browser
- **Datenschutz-Default**: Provider sind fest auf "Aus" gesetzt
- **Offline-fähig**: Funktioniert ohne Internetverbindung
- **Empfohlen für**: Sensible Geschäftsprozesse, regulierte Branchen

### Externer Dienst

- **Auf Nutzeraktion**: Externe APIs werden nur bei expliziter Auslösung verwendet
- **Keine automatische Übertragung**: Daten werden nicht automatisch an externe Dienste gesendet
- **Browser-basierte Dienste**: Im External-Modus kann die Browser-Spracherkennung (Web Speech API) aktiviert werden
- **Browser-Support**: Die Verfügbarkeit von Web Speech API wird automatisch geprüft und angezeigt
- **Wichtig**: Auch wenn der Provider verfügbar ist, wird er nur auf explizite Nutzeraktion verwendet

## Einstellungen

### Spracherkennung (STT)

- **Provider**: Auswahl des Transkriptionsdiensts
  - **Aus**: Keine Spracherkennung (Standard)
  - **Browser-Spracherkennung (Web Speech API)**: Nur im External-Modus verfügbar, wenn vom Browser unterstützt
- **Sprache**: Quellsprache für die Transkription (z.B. de-DE, en-US, fr-FR)
- **BCP 47 Format**: Verwenden Sie standardisierte Sprachcodes
- **Browser-Kompatibilität**: Die Unterstützung für Web Speech API variiert je nach Browser und wird automatisch erkannt

### Übersetzung

- **Provider**: Auswahl des Übersetzungsdiensts (aktuell nur "Aus")
- **Zielsprache**: Sprache für übersetzte Inhalte (z.B. de, en, fr)
- **ISO 639-1 Format**: Zweistellige Sprachcodes

## Datenspeicherung

Alle Einstellungen werden **lokal im Browser** gespeichert (localStorage):

- Einstellungen bleiben über Seitenaktualisierungen hinweg erhalten
- Keine Server-seitige Speicherung
- Keine Synchronisation zwischen Geräten
- Zurücksetzen durch Löschen des Browser-Speichers möglich

## Wichtige Hinweise

1. **Keine automatische Datenübertragung**: Unabhängig vom gewählten Modus werden keine Daten automatisch an externe Dienste übertragen.

2. **Provider-Implementierung**: Ab Phase F2-1b ist die Browser-Spracherkennung (Web Speech API) als auswählbarer Provider verfügbar. Ab Phase F2-2 ist die tatsächliche Nutzung (Mikrofon-Diktat mit Start/Stop) im KI-Tab implementiert.

3. **Datenschutz-Fokus**: Der Default-Modus "Lokal" stellt sicher, dass ohne explizite Änderung keine externen Dienste verwendet werden können.

4. **Erweiterbarkeit**: Die Architektur ist so gestaltet, dass zukünftig verschiedene Provider (z.B. Web Speech API, OpenAI Whisper, DeepL) integriert werden können.

## Entwicklungsphasen

- **F2-1a (abgeschlossen)**: Settings-Grundlage mit lokaler Persistenz
- **F2-1b (abgeschlossen)**: Provider-Katalog mit Web Speech API-Option (Auswahl, keine Nutzung)
  - STT Provider: 'none' + 'web_speech'
  - Translation Provider: 'none' + 'external_stub' (Platzhalter)
  - Verfügbarkeitsprüfung für Web Speech API
- **F2-2 (abgeschlossen)**: Mikrofon-Diktat im KI-Tab mit Web Speech API
  - Start/Stop-Controls für Diktat
  - Live-Interim-Text während Aufnahme
  - Automatisches Anhängen des finalen Texts an aiRawText
  - Respektiert Settings (nur wenn external + web_speech)
  - Cleanup beim Tab-Wechsel
  - Setup-Hinweis wenn nicht konfiguriert
- **F2-3 (abgeschlossen)**: Mikrofon-Diktat pro Wizard-Frage
  - Mic-Button direkt am Eingabefeld (short_text, long_text, list)
  - Live-Interim-Text während Aufnahme
  - Finaler Text wird ins jeweilige Feld geschrieben (space oder newline je nach Feldtyp)
  - Zentrale Steuerung: nur ein aktives Wizard-Diktat gleichzeitig
  - Bei Wechsel zu anderer Frage wird laufendes Diktat abgebrochen und neu gestartet
  - Buttons "Speichern" und "Überspringen" während Diktat deaktiviert
  - Setup-Hinweis wenn nicht konfiguriert (Button "Zu Setup")
  - Respektiert Settings (nur external + web_speech)
  - Cleanup beim Tab-Wechsel
- **F2-4 (geplant)**: Übersetzungs-Provider-Implementierung

## Web Speech API

Die Browser-Spracherkennung nutzt die standardisierte Web Speech API:

- **Browser-Support**: Variiert je nach Browser (Chrome, Edge unterstützen es gut; Firefox und Safari haben eingeschränkte Unterstützung)
- **Datenschutz**: Die Web Speech API kann je nach Browser über externe Dienste (z.B. Google) laufen
- **Verfügbarkeitsprüfung**: Die Anwendung prüft automatisch `window.SpeechRecognition` oder `window.webkitSpeechRecognition`
- **Konfiguration**: Provider wird nur im External-Modus angeboten und ist disabled wenn nicht unterstützt
- **Nutzung im KI-Tab**: Ab Phase F2-2 verfügbar - Diktat-Funktion im Tab "AI", Schritt 1 "Quelltext eingeben"
  - Klick auf "Diktat starten" aktiviert Mikrofon
  - Live-Anzeige des Interim-Texts (während Sie sprechen)
  - Finaler Text wird automatisch ans Ende von aiRawText angehängt
  - "Stop" beendet die Aufnahme
  - Beim Tab-Wechsel wird eine aktive Aufnahme automatisch abgebrochen
  - Setup-Hinweis erscheint, wenn der Provider nicht aktiviert ist
- **Nutzung im Wizard**: Ab Phase F2-3 verfügbar - Mikrofon-Button direkt an Textfragen
  - Erscheint bei short_text, long_text und list Fragen
  - Klick auf Mikrofon-Icon startet Diktat für diese Frage
  - Live-Anzeige des Interim-Texts unter der Frage
  - Bei Listen wird jeder final erkannte Text als neue Zeile angehängt
  - Bei Text-Feldern wird mit Leerzeichen angehängt
  - Nur ein Diktat gleichzeitig: Wechsel zu anderer Frage beendet vorheriges Diktat
  - Buttons "Speichern" und "Überspringen" während Diktat deaktiviert
  - Setup-Button erscheint, wenn der Provider nicht aktiviert ist

## Technische Details

Einstellungen werden unter dem Schlüssel `process-app-settings-v1` gespeichert. Die Struktur ist versioniert, um zukünftige Erweiterungen zu ermöglichen, ohne bestehende Daten zu verlieren.

Bei fehlenden oder fehlerhaften Einstellungen werden automatisch sichere Standardwerte verwendet:
- Modus: Lokal
- Provider: Aus (none)
- Transkriptionssprache: de-DE
- Zielsprache: de
