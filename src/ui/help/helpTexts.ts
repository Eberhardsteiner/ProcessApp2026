export type HelpText = {
  title: string;
  body: string;
};

export const HELP_TEXTS = {
  'mode.assisted': {
    title: 'Assistierter Modus',
    body:
      'Dieser Modus führt Sie Schritt für Schritt durch Erfassung, KI-Auswertung, Import und erste Optimierung.\n' +
      'Die App übernimmt so viel wie möglich, ohne bestehende Daten zu überschreiben.',
  },
  'mode.expert': {
    title: 'Expertenmodus',
    body:
      'Hier stehen alle Funktionen und Einstellungen zur Verfügung.\n' +
      'Nutzen Sie diesen Modus für Feinschliff, Spezialimporte, Mining-Details und fortgeschrittene Analysen.',
  },
  'nav.search': {
    title: 'Suche',
    body:
      'Durchsucht den aktuellen Arbeitsstand (Schritte, Rollen, Systeme, Maßnahmen, Hinweise).\n' +
      'Praktisch, um schnell an die richtige Stelle zu springen.',
  },

  'tabs.setup': {
    title: 'Setup',
    body:
      'Projekt, Prozess und Version sind die Basis für alle weiteren Schritte.\n' +
      'Hier legen Sie fest, woran Sie arbeiten und können Exporte und Imports durchführen.',
  },
  'tabs.wizard': {
    title: 'Wizard',
    body:
      'Geführte Erfassung ohne BPMN-Kenntnisse.\n' +
      'Sie beantworten Fragen, daraus entsteht ein strukturierter Entwurf.',
  },
  'tabs.draft': {
    title: 'Entwurf',
    body:
      'Hier sehen und bearbeiten Sie den erfassten Prozessentwurf.\n' +
      'Rollen, Systeme, Kennzahlen, Evidence und Details können ergänzt werden.',
  },
  'tabs.review': {
    title: 'Review',
    body:
      'Qualitätsprüfung und Auswertung.\n' +
      'Hier finden Sie Hinweise, Lücken (Evidence), semantische Fragen und eine Digitalisierungsbewertung.',
  },
  'tabs.issues': {
    title: 'Open Issues',
    body:
      'Sammelt offene Punkte, Inkonsistenzen und fehlende Informationen.\n' +
      'Nutzen Sie das als Arbeitsliste für den nächsten Workshop oder Review.',
  },
  'tabs.ai': {
    title: 'KI-Assistent',
    body:
      'Erzeugt Prompts und importiert KI-Ergebnisse als neue Version.\n' +
      'Standard ist Copy/Paste, API ist optional und nur auf Klick aktiv.',
  },
  'tabs.mining': {
    title: 'Process Mining',
    body:
      'Analysiert Event Logs und verbindet sie mit Ihrem Prozessmodell.\n' +
      'Hilft bei Varianten, Durchlaufzeiten, Engpässen und Konformitätsprüfungen.',
  },
  'tabs.improvements': {
    title: 'Maßnahmen',
    body:
      'Backlog für Verbesserungs- und Automatisierungsmaßnahmen.\n' +
      'Sie können Templates, Heuristiken und KI-Vorschläge nutzen.',
  },
  'tabs.report': {
    title: 'Report',
    body:
      'Erstellt einen Bericht aus Modell, Entwurf, Bewertung und Maßnahmen.\n' +
      'Export als Markdown/HTML oder Druck als PDF ist möglich.',
  },
  'tabs.changes': {
    title: 'Änderungen',
    body:
      'Vergleicht Versionen miteinander.\n' +
      'Hilft, Änderungen nachvollziehbar zu machen und Entscheidungen zu dokumentieren.',
  },
  'tabs.workshop': {
    title: 'Workshop',
    body:
      'Workshop-Ansicht für Moderation und gemeinsames Durchgehen.\n' +
      'Fokus auf Agenda, offene Punkte, Happy Path und schnelle Klärungen.',
  },

  'setup.project.select': {
    title: 'Projekt auswählen',
    body:
      'Ein Projekt bündelt mehrere Prozesse und Versionen.\n' +
      'Wählen Sie ein bestehendes Projekt, wenn Sie daran weiterarbeiten möchten.',
  },
  'setup.project.create': {
    title: 'Neues Projekt',
    body:
      'Erstellt einen neuen Arbeitsbereich für mehrere Prozesse.\n' +
      'Bestehende Daten werden nicht verändert.',
  },
  'setup.project.name': {
    title: 'Projektname',
    body:
      'Vergeben Sie einen eindeutigen Namen, damit Sie das Projekt später schnell wiederfinden.\n' +
      'Beispiele sind Bereich, Thema oder Zeitraum.',
  },

  'setup.process.template': {
    title: 'Prozess-Template',
    body:
      'Templates setzen Startwerte für Klassifikation und Struktur.\n' +
      'Sie können danach jederzeit manuell ergänzen oder anpassen.',
  },
  'setup.process.createFromTemplate': {
    title: 'Aus Template starten',
    body:
      'Legt den Prozess an und startet direkt die Erfassung.\n' +
      'Sinnvoll, wenn Sie schnell einen sauberen Ausgangspunkt brauchen.',
  },
  'setup.process.name': {
    title: 'Prozessname',
    body:
      'Der Prozessname ist der Titel in Report, Versionen und Exporten.\n' +
      'Wählen Sie eine kurze, fachliche Bezeichnung.',
  },
  'setup.process.category': {
    title: 'Kategorie',
    body:
      'Ordnet den Prozess grob ein (Steuerung, Kernprozess, Unterstützung).\n' +
      'Das hilft bei Strukturierung und Auswertungen.',
  },
  'setup.process.managementLevel': {
    title: 'Management-Ebene',
    body:
      'Kennzeichnet die Perspektive: strategisch, fachlich oder technisch.\n' +
      'Das beeinflusst, wie der Prozess später eingeordnet wird.',
  },
  'setup.process.hierarchy': {
    title: 'Hierarchie',
    body:
      'Definiert die Ebene im Prozessmodell (Landkarte, Hauptprozess, Unterprozess).\n' +
      'Nützlich für Prozesslandschaften und Ableitungen.',
  },
  'setup.process.openExisting': {
    title: 'Vorhandene Prozesse öffnen',
    body:
      'Öffnet einen bestehenden Prozess im Projekt und macht ihn aktiv.\n' +
      'Danach können Sie Versionen laden oder neue Versionen erstellen.',
  },

  'setup.version.whatIsVersion': {
    title: 'Version',
    body:
      'Eine Version ist ein Arbeitsstand des Prozessmodells.\n' +
      'Importe und Änderungen erzeugen typischerweise neue Versionen, damit Historie erhalten bleibt.',
  },
  'setup.version.template': {
    title: 'Version-Template',
    body:
      'Erstellt eine neue Version mit vorbefülltem Entwurf.\n' +
      'Der Prozessname und die Klassifikation bleiben dabei unverändert.',
  },
  'setup.version.create': {
    title: 'Neue Version erstellen',
    body:
      'Legt einen neuen Arbeitsstand an und startet die Erfassung.\n' +
      'Der bisherige Stand bleibt erhalten.',
  },
  'setup.version.load': {
    title: 'Version laden',
    body:
      'Setzt eine vorhandene Version als aktive Arbeitsgrundlage.\n' +
      'Alle Tabs arbeiten immer mit der aktiven Version.',
  },
  'setup.version.clone': {
    title: 'Duplizieren',
    body:
      'Erstellt eine Kopie der ausgewählten Version.\n' +
      'Nützlich, wenn Sie Varianten ausprobieren möchten, ohne den Originalstand zu ändern.',
  },

  'setup.export.projectJson': {
    title: 'Projekt exportieren',
    body:
      'Exportiert das gesamte Projekt als JSON (alle Prozesse und Versionen).\n' +
      'Geeignet für Backup, Transfer oder Archivierung.',
  },
  'setup.export.processJson': {
    title: 'Prozess exportieren',
    body:
      'Exportiert nur den aktiven Prozess inklusive aller Versionen als JSON.\n' +
      'Praktisch, wenn Sie einen einzelnen Prozess weitergeben möchten.',
  },
  'setup.export.packageZip': {
    title: 'Exportpaket (ZIP)',
    body:
      'Erstellt ein ZIP mit BPMN, CSVs und JSON-Bundle.\n' +
      'Geeignet als Deliverable oder für Tool-Weiterverarbeitung.',
  },
  'setup.import.processBundle': {
    title: 'Bundle importieren',
    body:
      'Importiert ein Prozessmodell-Bundle als neuen Prozess.\n' +
      'Bestehende Daten werden nicht überschrieben.',
  },
  'setup.import.projectBundle': {
    title: 'Projekt-Bundle importieren',
    body:
      'Importiert ein Projekt-Bundle als neues Projekt.\n' +
      'Es wird nichts überschrieben, Hierarchien werden nach Möglichkeit wiederhergestellt.',
  },

  'settings.dataHandlingMode': {
    title: 'Datenmodus',
    body:
      'Im Modus „Lokal" werden keine externen Dienste genutzt.\n' +
      'Im Modus „Externer Dienst" können externe Funktionen verwendet werden, jedoch nur nach Ihrem Klick.',
  },
  'settings.stt.provider': {
    title: 'Spracherkennung (Provider)',
    body:
      'Legt fest, wie Sprache in Text umgewandelt wird.\n' +
      'Browser-Spracherkennung kann je nach Browser über externe Dienste laufen und startet nur auf Klick.',
  },
  'settings.stt.language': {
    title: 'Sprache (STT)',
    body:
      'Steuert die Erkennungssprache der Spracherkennung.\n' +
      'Beispiele: de-DE, en-US, fr-FR.',
  },
  'settings.translation.provider': {
    title: 'Übersetzung (Provider)',
    body:
      'Legt fest, ob eine Übersetzung über einen Dienst erfolgen soll.\n' +
      'Wenn kein Provider aktiv ist, können Sie Übersetzungen weiterhin manuell per Copy/Paste hinzufügen.',
  },
  'settings.translation.targetLanguage': {
    title: 'Zielsprache',
    body:
      'Definiert die Sprache, in die übersetzt werden soll.\n' +
      'Beispiele: de, en, fr.',
  },

  'settings.ai.mode': {
    title: 'KI-Modus',
    body:
      'Copy/Paste ist der Standard ohne automatische Datenübertragung.\n' +
      'API ist optional und sendet Prompts nur nach Ihrem Klick an einen konfigurierten Endpoint.',
  },
  'settings.ai.endpoint': {
    title: 'Endpoint URL',
    body:
      'Adresse Ihres API-Endpunkts für KI-Aufrufe.\n' +
      'Empfehlung: Nutzen Sie einen eigenen Proxy/Server, damit Schlüssel und Anbieterwechsel sauber steuerbar sind.',
  },
  'settings.ai.authMode': {
    title: 'Authentifizierung',
    body:
      'Legt fest, wie sich die App am Endpoint authentifiziert.\n' +
      'Wählen Sie die Variante, die Ihr Endpoint erwartet (z.B. Bearer oder x-api-key).',
  },
  'settings.ai.apiKey': {
    title: 'API Key',
    body:
      'Der Schlüssel wird lokal im Browser gespeichert.\n' +
      'Geben Sie nur Schlüssel ein, die für diesen Zweck vorgesehen sind.',
  },
  'settings.ai.timeout': {
    title: 'Timeout',
    body:
      'Maximale Wartezeit für eine API-Antwort.\n' +
      'Erhöhen Sie den Wert, wenn größere Prompts oder langsame Endpoints genutzt werden.',
  },

  'ai.privacyNotice': {
    title: 'Datenschutz',
    body:
      'Die App sendet keine Inhalte automatisch.\n' +
      'Im Standardflow kopieren Sie den Prompt manuell in Ihr KI-Tool und fügen die Antwort wieder ein.',
  },
  'ai.captureMode': {
    title: 'Erfassungsmodus',
    body:
      'Wählen Sie, ob Sie eine allgemeine Prozessbeschreibung oder konkrete Fälle erfassen.\n' +
      'Konkrete Fälle helfen besonders bei Varianten und Ausnahmen.',
  },
  'ai.captureMode.artifact': {
    title: 'Prozessbeschreibung / Artefakt',
    body:
      'Nutzen Sie das für SOPs, Mails, Wiki-Seiten, Tabellen oder Freitext.\n' +
      'Die KI extrahiert daraus einen strukturierten Entwurf.',
  },
  'ai.captureMode.case': {
    title: 'Ein konkreter Fall',
    body:
      'Beschreiben Sie einen realen Vorgang von Anfang bis Ende.\n' +
      'Die KI leitet daraus den typischen Ablauf ab und markiert Sonderfälle.',
  },
  'ai.captureMode.cases': {
    title: 'Mehrere konkrete Fälle',
    body:
      'Erfassen Sie mehrere reale Fälle (empfohlen 3 bis 5).\n' +
      'Die KI konsolidiert den Standardablauf und trennt Varianten als Entscheidungen oder Ausnahmen.',
  },
  'ai.evidenceLabel': {
    title: 'Evidence-Quelle (Label)',
    body:
      'Dieses Label dokumentiert, woher die Inhalte stammen (z.B. Workshop, SOP-Version).\n' +
      'Es verbessert Nachvollziehbarkeit und Review.',
  },

  'ai.sourceText': {
    title: 'Quelltext',
    body:
      'Hier steht die Grundlage für den Prompt.\n' +
      'Je konkreter und chronologischer, desto besser werden Schritte, Rollen und Ausnahmen erkannt.',
  },
  'ai.dictation': {
    title: 'Spracheingabe',
    body:
      'Diktieren erzeugt Text, der an den bestehenden Inhalt angehängt werden kann.\n' +
      'Die Aufnahme startet und stoppt ausschließlich durch Ihren Klick.',
  },
  'ai.fileImport': {
    title: 'Datei importieren',
    body:
      'Liest Dokumente lokal im Browser ein und extrahiert Text.\n' +
      'PDFs werden nur über vorhandenen Textlayer gelesen. Für Scans ohne Textlayer wird keine OCR durchgeführt.',
  },

  'mining.overview': {
    title: 'Process Mining',
    body:
      'Analysiert Event Logs direkt in der App und verbindet sie mit Ihrem Prozessmodell.\n' +
      'Nutzen Sie es für Varianten, Durchlaufzeiten, Engpässe und Konformität.',
  },
  'mining.datasets': {
    title: 'Datasets',
    body:
      'Ein Dataset ist ein importierter Event Log. Sie können mehrere Datasets speichern und zwischen ihnen wechseln.\n' +
      'Importe erzeugen neue Datasets, damit nichts überschrieben wird.',
  },
  'mining.dataset.rename': {
    title: 'Umbenennen',
    body: 'Ändert den Anzeigenamen des Datasets. Der Inhalt bleibt unverändert.',
  },
  'mining.dataset.duplicate': {
    title: 'Duplizieren',
    body: 'Erstellt eine Kopie des Datasets. Praktisch, um Aufbereitungsschritte auszuprobieren, ohne das Original zu ändern.',
  },
  'mining.dataset.delete': {
    title: 'Dataset löschen',
    body: 'Entfernt nur dieses Dataset. Andere Datasets bleiben erhalten. Wenn es das letzte Dataset ist, werden Mining-Daten komplett entfernt.',
  },
  'mining.dataset.clearAll': {
    title: 'Alle Mining-Daten entfernen',
    body: 'Entfernt alle Datasets und Mining-Konfigurationen aus der aktuellen Version. Dies kann nicht rückgängig gemacht werden.',
  },
  'mining.sourceLabel': {
    title: 'Quellenlabel',
    body:
      'Name der Log-Quelle, z.B. System, Exportdatum oder Report-ID.\n' +
      'Hilft bei Nachvollziehbarkeit und bei mehreren Imports.',
  },
  'mining.column.caseId': {
    title: 'Spalte: Fall-ID',
    body:
      'Identifiziert den Fall (z.B. Ticket, Auftrag, Vorgang).\n' +
      'Alle Events mit gleicher ID werden zu einem Ablauf zusammengeführt.',
  },
  'mining.column.activity': {
    title: 'Spalte: Aktivität',
    body:
      'Name des Events oder Statuswechsels.\n' +
      'Eine gute Aktivitätsbezeichnung erleichtert Mapping und Auswertung.',
  },
  'mining.column.timestamp': {
    title: 'Spalte: Zeitstempel',
    body:
      'Zeitpunkt des Events.\n' +
      'Je sauberer Formate und Zeitzonen, desto zuverlässiger sind Laufzeit- und Wartezeitberechnungen.',
  },
  'mining.column.resource': {
    title: 'Spalte: Ressource',
    body:
      'Optional: wer oder welches System das Event ausgelöst hat.\n' +
      'Hilft bei Lastverteilung, Verantwortungen und Ursachenanalyse.',
  },
  'mining.xesImport': {
    title: 'XES importieren',
    body:
      'XES ist ein Standardformat für Event Logs.\n' +
      'Nutzen Sie es, wenn Ihr Mining-Tool XES exportieren kann.',
  },
  'mining.docAiWorkflow': {
    title: 'KI: Prozess aus Dokumenten (Soll-Entwurf)',
    body:
      'Dokumente dienen ausschließlich zur Ableitung eines Prozessentwurfs (Soll-Modell: Happy Path, Rollen, Entscheidungen).\n' +
      'Sie sind keine Quelle für echtes Process Mining. Ein Dokument enthält keine Ausführungsdaten.\n' +
      'Für echtes Process Mining benötigen Sie ein Event Log mit echten Zeitstempeln und Fall-IDs – importieren Sie dieses über CSV, XES oder Tool-History.',
  },
  'mining.docEvidenceRef': {
    title: 'Evidence RefId',
    body:
      'Optional: Referenz zur Dokumentquelle (z.B. SOP, Wiki-Seite, Export).\n' +
      'Verknüpft den abgeleiteten Prozessentwurf mit seinem Ursprungsdokument für spätere Nachvollziehbarkeit.',
  },
  'mining.xesExport': {
    title: 'XES Export',
    body:
      'Exportiert das aktuelle Event Log als XES (Standardformat für Process Mining).\n' +
      'Geeignet für externe Tools, Archivierung und Vergleich. Wenn Segment-Filter aktiv ist, können Segment A/B separat exportiert werden.',
  },
  'mining.segmentFilter': {
    title: 'Segment-Filter',
    body:
      'Filtert die Analyse auf Cases, bei denen mindestens ein Event ein bestimmtes Attribut trägt.\n' +
      'Nutzen Sie Segment A/B, um Unterschiede in Varianten, Laufzeiten und Abweichungen sichtbar zu machen.',
  },
  'mining.mapping': {
    title: 'Activity → Step Mapping',
    body:
      'Ordnet Aktivitäten aus dem Event Log den fachlichen Prozessschritten zu.\n' +
      'Damit werden Kennzahlen und Abweichungen auf Schritt-Ebene berechnet. Ohne Mapping bleiben Aktivitäten „unmapped".',
  },
  'mining.conformance': {
    title: 'Conformance Checking',
    body:
      'Vergleicht den erfassten Prozess (Happy Path) mit dem Event Log.\n' +
      'Zeigt Abweichungen wie fehlende Schritte, Backtracking und unmapped Aktivitäten. Ergebnisse sind Hinweise und sollten fachlich validiert werden.',
  },
  'mining.preprocessing': {
    title: 'Aufbereitung',
    body:
      'Bereinigt und normalisiert ein Dataset. Das Original bleibt erhalten, Ergebnis wird als neues Dataset gespeichert.',
  },
  'mining.preprocessing.dedupeExact': {
    title: 'Exakte Duplikate entfernen',
    body:
      'Entfernt identische Events. Hilft bei doppelten Exports oder Wiederholungen.',
  },
  'mining.preprocessing.dedupeConsecutive': {
    title: 'Konsekutive Duplikate entfernen',
    body:
      'Entfernt direkt aufeinanderfolgende gleiche Aktivitäten innerhalb eines Cases. Hilft, wenn Logs sehr fein granuliert sind.',
  },
  'mining.preprocessing.timeRange': {
    title: 'Zeitfenster',
    body:
      'Schränkt Events auf ein Zeitfenster ein. Nützlich für Vergleich oder um historische Daten auszublenden.',
  },
  'mining.preprocessing.rename': {
    title: 'Aktivitäten umbenennen',
    body:
      'Vereinheitlicht Bezeichnungen (z.B. Tippfehler, Synonyme). Regeln werden der Reihe nach angewendet.',
  },
  'mining.preprocessing.recipes': {
    title: 'Recipes',
    body:
      'Recipes speichern eine Aufbereitungs-Konfiguration (Rename, Zeitfenster, Dedupe).\n' +
      'Sie können Recipes wiederverwenden, um neue Datasets reproduzierbar zu erzeugen.',
  },
  'mining.preprocessing.noise': {
    title: 'Noise-Filter',
    body: 'Entfernt seltene Aktivitäten, um Modelle stabiler und interpretierbarer zu machen. Hinweis: Min. Abdeckung ist ein Anteil (0–1). Beispiel: 0,05 = 5% der Cases.',
  },
  'mining.preprocessing.merge': {
    title: 'Merge',
    body: 'Fasst mehrere Aktivitätsnamen zu einem Zielnamen zusammen (Synonyme, Systemvarianten).',
  },
  'mining.preprocessing.split': {
    title: 'Split nach Attribut',
    body: 'Teilt eine Aktivität anhand eines Attributs auf (z.B. Status). Ergebnis: Aktivität · Wert.',
  },
  'mining.preprocessing.lifecycle': {
    title: 'Lifecycle',
    body:
      'Erkennt Suffixe wie start/complete in Aktivitätsnamen.\n' +
      '„Start entfernen" entfernt erkannte Start-Events und bereinigt ggf. das Complete-Suffix.\n' +
      '„Complete entfernen" entfernt erkannte Complete-Events und bereinigt ggf. das Start-Suffix.\n' +
      '„Suffixe entfernen" entfernt nur die Suffixe, ohne zu filtern.',
  },
  'mining.preprocessing.attrnorm': {
    title: 'Attribut-Normalisierung',
    body: 'Bereinigt Attribute (Keys/Values). Optional werden Zahlen/Datumswerte/Enums kanonisiert.',
  },
  'mining.preprocessing.recipe.save': {
    title: 'Recipe speichern',
    body: 'Speichert die aktuelle Aufbereitungs-Konfiguration als Recipe. Das ist unabhängig vom Erzeugen eines neuen Datasets.',
  },
  'mining.preprocessing.recipe.update': {
    title: 'Recipe aktualisieren',
    body: 'Überschreibt das ausgewählte Recipe mit der aktuellen Konfiguration. Der Name kann ebenfalls angepasst werden.',
  },
  'mining.preprocessing.recipe.delete': {
    title: 'Recipe löschen',
    body: 'Entfernt das Recipe aus der Bibliothek. Bereits erzeugte Datasets bleiben unverändert.',
  },
  'mining.discoveryToBpmn': {
    title: 'Discovery → BPMN (Vorschlag)',
    body:
      'Leitet automatisch ein Prozessmodell aus dem Event Log ab und erzeugt daraus eine BPMN-Datei. ' +
      'Je nach Ableitungsmodus wird entweder die häufigste Variante linear übernommen oder per DFG-Heuristik Abzweigungen und Parallelität ergänzt. ' +
      'Das Ergebnis ist ein Vorschlag – keine abgestimmte Prozessdokumentation.',
  },
  'mining.discoveryToBpmn.derive': {
    title: 'Modell ableiten',
    body:
      'Im Modus "Top-Variante" wird die häufigste Ablauffolge direkt als lineare Sequenz übernommen. ' +
      'Bei den DFG-Modi (XOR bzw. XOR+AND) analysiert eine Heuristik den Directly-Follows-Graphen und ergänzt Abzweigungen sowie optional Parallelität.',
  },
  'mining.discoveryToBpmn.preview': {
    title: 'BPMN Vorschau',
    body: 'Öffnet das abgeleitete BPMN-Modell im Viewer. Zoom und Navigation sind möglich.',
  },
  'mining.discoveryToBpmn.download': {
    title: 'BPMN herunterladen',
    body: 'Speichert das abgeleitete BPMN-Modell als .bpmn-Datei auf dem Gerät.',
  },
  'mining.discoveryToBpmn.createVersion': {
    title: 'Als neue Version speichern',
    body:
      'Erstellt eine neue Prozessversion mit dem abgeleiteten Draft und der generierten BPMN-Datei.\n' +
      'Die aktuelle Version bleibt unverändert. Activity Mappings werden passend zur neuen Schrittfolge aktualisiert.',
  },
  'mining.discoveryToBpmn.mode': {
    title: 'Ableitungsmodus',
    body:
      'Wählen Sie, wie das Modell aus dem Event Log abgeleitet wird.\n' +
      'Top-Variante ist linear. DFG-Heuristik ergänzt Abzweige (XOR) und optional Parallelität (experimentell).',
  },
  'mining.discoveryToBpmn.params': {
    title: 'Komplexität steuern',
    body:
      'Mit Schwellenwerten begrenzen Sie die Komplexität des Modells.\n' +
      'Höhere Schwellenwerte erzeugen weniger Branches und ein ruhigeres BPMN.',
  },
  'mining.discoveryToBpmn.minEdgeShare': {
    title: 'Min. Kanten-Anteil',
    body:
      'Nur Kanten, die in einem Mindestanteil der Fälle vorkommen, werden für Entscheidungen berücksichtigt.',
  },
  'mining.discoveryToBpmn.maxBranches': {
    title: 'Max. zusätzliche Branches',
    body:
      'Begrenzt die Anzahl zusätzlicher Abzweige pro Entscheidung. Der Standardpfad bleibt erhalten.',
  },
  'mining.discoveryToBpmn.loops': {
    title: 'Schleifen zulassen',
    body:
      'Wenn aktiv, können Branches zurück zu früheren Schritten erzeugt werden (Rework/Loops).',
  },
  'mining.discoveryToBpmn.parallel': {
    title: 'Parallelität (experimentell)',
    body:
      'Erkennt einfache 2-Schritt-Parallelität heuristisch. Ergebnisse sind Vorschläge und sollten fachlich geprüft werden.',
  },
  'mining.discoveryToBpmn.minNodeCoverage': {
    title: 'Seltene Aktivitäten ausblenden',
    body:
      'Filtert sehr seltene Aktivitäten außerhalb des Hauptpfads, um das Modell zu vereinfachen.',
  },
  'mining.conformance.alignmentDeviations': {
    title: 'Deviation Explorer (Alignment)',
    body:
      'Fehlende Schritte sind Deletions im Alignment: der Schritt ist im Soll-Prozess vorhanden, fehlt aber im tatsächlichen Ablauf.\n' +
      'Zusätzliche Schritte sind Insertions: im Ablauf vorhandene Schritte, die nicht im Soll vorkommen – oft Rework, Schleifen oder Umwege.',
  },
  'mining.conformance.alignmentInsertions': {
    title: 'Zusätzliche Schritte',
    body:
      'Zusätzliche Schritte treten auf, wenn ein Schritt im tatsächlichen Ablauf häufiger vorkommt als im Soll-Modell vorgesehen.\n' +
      'Typische Ursachen sind Wiederholungen, Schleifen (Rework) oder Umwege.',
  },
  'mining.conformance.alignmentDeletions': {
    title: 'Fehlende Schritte',
    body:
      'Fehlende Schritte bedeuten, dass ein im Soll-Prozess definierter Schritt im tatsächlichen Ablauf nicht ausgeführt wurde.\n' +
      'Mögliche Ursachen sind Auslassungen, Abbrüche oder unvollständige Erfassung im Event Log.',
  },
  'mining.conformance.draftModel': {
    title: 'Draft als Modell prüfen',
    body:
      'Prüft Transition-Konformität direkt gegen den Capture Draft (Happy Path + Entscheidungen), ohne BPMN Export. Heuristisch, aber für Diagnose sehr nützlich.',
  },
  'mining.conformance.draftModel.toggle': {
    title: 'Draft Transition Conformance',
    body:
      'Aktiviert die Prüfung von Schritt-Übergängen gegen das Draft-Modell. Zeigt illegale Starts und Transition-Abweichungen.',
  },
  'mining.conformance.fitness': {
    title: 'Fitness',
    body:
      'Anteil der erwarteten Schritte, die als geordnete Teilsequenz im Log wiedergefunden werden. Höher ist besser.',
  },
  'mining.conformance.patterns': {
    title: 'Abweichungsmuster',
    body:
      'Häufige Kombinationen aus fehlenden und zusätzlichen Schritten. Damit finden Sie systematische Abweichungen.',
  },
  'mining.conformance.order': {
    title: 'Order & Rework',
    body:
      'Order Violations: Schritte erscheinen in unerwarteter Reihenfolge. Rework/Loop: Schritte wiederholen sich innerhalb eines Cases.',
  },
  'mining.conformance.attributes': {
    title: 'Attribute-Signale',
    body:
      'Zeigt Attribute/Werte, die in abweichenden Cases überproportional häufig vorkommen (Lift). Hilft bei der Ursachenanalyse.',
  },
  'mining.performance.caseDurations': {
    title: 'Durchlaufzeiten',
    body: 'Analysiert die Zeit zwischen erstem und letztem Event pro Case. Nutzen Sie das für Outlier und SLA-Betrachtungen.',
  },
  'mining.performance.transitions': {
    title: 'Transitions (Zeitdeltas)',
    body: 'Zeitdeltas zwischen zwei aufeinanderfolgenden Events bzw. Schritten. P90/P95 helfen, seltene, aber relevante Verzögerungen zu erkennen.',
  },
  'mining.performance.mode': {
    title: 'Modus',
    body: 'Aktivität: originaler Event-Name. Schritt: nutzt Mapping (Activity → Step). Für Schritt-Modus sind gepflegte Mappings wichtig.',
  },
  'mining.sla': {
    title: 'SLA & Breaches',
    body: 'Definiert Schwellenwerte und zeigt, wie oft sie verletzt werden. Ergebnisse sind Diagnosehilfe und sollten fachlich geprüft werden.',
  },
  'mining.sla.kind': {
    title: 'Regeltyp',
    body: 'Case Duration: Ende-zu-Ende. Time-to-Step: Zeit bis zu einem Schritt. Wait-between-Steps: Wartezeit zwischen zwei Schritten.',
  },
  'mining.sla.threshold': {
    title: 'Schwellwert',
    body: 'Der Grenzwert, ab dem ein Case als Breach zählt. Einheit wird in Minuten/Stunden/Tagen eingegeben und intern in Millisekunden gespeichert.',
  },
  'mining.sla.missing': {
    title: 'Missing',
    body: 'Fälle, bei denen die Regel nicht berechenbar ist (z.B. fehlender Schritt oder unparsebare Zeitstempel). Optional können Missing als Breach gezählt werden.',
  },
  'mining.org': {
    title: 'Organisation',
    body: 'Analysiert Ressourcen (Personen/Rollen) und Übergaben zwischen Ressourcen. Voraussetzung ist eine Resource-Spalte im Event Log.',
  },
  'mining.org.resources': {
    title: 'Ressourcen',
    body: 'Zeigt, welche Ressourcen wie viele Cases und Events bearbeiten. Hilfreich für Workload- und Zuständigkeitsanalyse.',
  },
  'mining.org.handovers': {
    title: 'Handovers',
    body: 'Zählt Übergaben zwischen Ressourcen entlang der Case-Sequenz. Hohe Werte können auf Schnittstellen, Wartezeiten oder Reibung hindeuten.',
  },
  'mining.rootcause': {
    title: 'Ursachenanalyse',
    body: 'Vergleicht Attribute von langsamen Cases mit allen Cases. Ergebnisse sind statistische Signale und müssen fachlich interpretiert werden.',
  },
  'mining.rootcause.threshold': {
    title: 'Schwelle für \u201elangsam\u201c',
    body: 'Definiert, ab wann ein Case als langsam gilt (z.B. ab P90 oder eine feste Dauer).',
  },
  'mining.rootcause.support': {
    title: 'Mindest-Support',
    body: 'Filtert Signale mit sehr wenig Daten. Höherer Support reduziert Zufallstreffer.',
  },
  'mining.drift': {
    title: 'Vergleich (Drift)',
    body: 'Vergleicht zwei Datasets. Geeignet für Vorher/Nachher, Releases oder Zeitschnitte (z.B. Monate).',
  },
  'mining.drift.select': {
    title: 'Datasets auswählen',
    body: 'Wählen Sie ein Baseline-Dataset und ein Vergleichs-Dataset. Die Auswertung ist rein analytisch und verändert keine Daten.',
  },
  'mining.drift.mode': {
    title: 'Vergleichsebene',
    body: 'Aktivität nutzt Event-Namen. Schritt nutzt Mapping (Activity → Step) und ist stabiler, wenn Mappings gepflegt sind.',
  },
  'mining.drift.kpis': {
    title: 'KPIs',
    body: 'Vergleicht Events/Cases, Varianten und (wenn möglich) Durchlaufzeiten. Deltas helfen, Veränderungen schnell zu erkennen.',
  },
  'mining.drift.variants': {
    title: 'Varianten-Drift',
    body: 'Zeigt die stärksten Veränderungen in der Variantenverteilung. Overlap nahe 1 bedeutet sehr ähnlich.',
  },
  'mining.drift.activities': {
    title: 'Aktivitäten/Schritte',
    body: 'Zeigt neue/entfallene Elemente und deutliche Verschiebungen in der Case-Abdeckung.',
  },
  'mining.drift.timeslicing': {
    title: 'Zeitschnitte',
    body: 'Erzeugt neue Datasets pro Monat oder Quartal basierend auf dem Case-Start (inklusive aller Events des Cases). Gut für Drift über Zeit.',
  },
  'mining.drift.timeslicing.granularity': {
    title: 'Granularität',
    body: 'Monat erzeugt Zeitschnitte pro Monat. Quartal erzeugt Zeitschnitte pro Quartal (Q1–Q4).',
  },
  'mining.drift.timeslicing.range': {
    title: 'Zeitraum',
    body: 'Optionaler Zeitraum in Monaten. Ohne Eingabe wird der Zeitraum aus dem Dataset abgeleitet.',
  },
  'mining.drift.trend': {
    title: 'Zeitverlauf',
    body: 'Zeigt Drift und Performance-Entwicklung über Zeitschnitte (z.B. Monate/Quartale). Drift wird gegen den vorherigen Zeitschnitt gemessen.',
  },
  'mining.drift.trend.compare': {
    title: 'Vergleichen',
    body: 'Setzt Baseline (A) und Vergleich (B) automatisch, um den Drift für diesen Zeitraum direkt zu prüfen.',
  },
  'mining.drift.trend.activate': {
    title: 'Aktivieren',
    body: 'Wechselt das aktive Dataset auf den ausgewählten Zeitschnitt (für alle anderen Tabs).',
  },
  'mining.discovery.heatmap': {
    title: 'Heatmap',
    body: 'Zeigt Wartezeiten als Intensität. Median ist robust gegen Ausreißer, P95 zeigt seltene aber relevante Verzögerungen.',
  },
  'mining.performance.histogram': {
    title: 'Histogramm',
    body: 'Zeigt die Verteilung der Durchlaufzeiten in Klassen. Hilft, typische Laufzeiten und Ausreißer schneller zu erkennen.',
  },
  'mining.org.workload': {
    title: 'Workload',
    body: 'Zeigt Ereignislast nach Ressource und Zeit. Hilft, Peak-Zeiten und Kapazitätsengpässe zu erkennen.',
  },
  'mining.org.workload.peaks': {
    title: 'Peak-Zeiten',
    body: 'Auswertung nach Wochentag und Stunde (lokale Zeit). Events ohne parsbaren Zeitstempel fließen nicht ein – sie erscheinen in den Dataset-Statistiken als Hinweis auf Datenqualitätsprobleme.',
  },
  'mining.org.workload.heatmap': {
    title: 'Heatmap',
    body: '7×24 Übersicht (Wochentag × Stunde). Dunkler bedeutet mehr Events in diesem Zeitfenster.',
  },

  'app.roadmap': {
    title: 'Produktstand und Roadmap',
    body:
      'Zeigt, was in den bisherigen Phasen umgesetzt wurde und welche Ausbauschritte als Nächstes geplant sind.\n' +
      'Die Roadmap ist bewusst in kleine, stabile Schritte gegliedert, damit Bedienbarkeit und Funktionalität nicht leiden.',
  },
  'pmv2.workspace': {
    title: 'Arbeitsbereich',
    body:
      'Hier sehen Sie die aktuelle Phase, den Datenstand und die nächste sinnvolle Aktion.\n' +
      'Nutzen Sie den Überblick, bevor Sie in Details springen.',
  },
  'pmv2.readiness': {
    title: 'Analyse-Reife',
    body:
      'Zeigt ehrlich, was mit den aktuellen Daten bereits belastbar ausgewertet werden kann.\n' +
      'Die Hinweise schützen vor überzogenen Aussagen bei zu wenig Material.',
  },
  'pmv2.digest': {
    title: 'Sofortauswertung ohne KI',
    body:
      'Fasst die wichtigsten lokalen Ergebnisse direkt in der App zusammen.\n' +
      'Damit sehen Sie Hauptlinie, Soll-Hinweis, Reibungspunkt und Datenlage, bevor Sie mit KI oder Feinschliff weiterarbeiten.',
  },
  'pmv2.quality': {
    title: 'Datenstärke',
    body:
      'Zeigt, wie tragfähig die aktuellen Eingänge für die weitere Analyse sind.\n' +
      'Mehr Quellen, klarere Schrittnamen und echte Zeitangaben erhöhen die Aussagekraft.',
  },
  'pmv2.maturity': {
    title: 'Qualität und Datenreife',
    body:
      'Diese Werkstatt zeigt, welche Teile der Datenbasis schon stark sind und wo noch gezielte Nacharbeit sinnvoll ist.\n' +
      'Sie verbindet Datenqualität, Belegstellen, Rollen, Zeitangaben und Vergleichsbasis mit direkten nächsten Schritten.',
  },
  'pmv2.observations': {
    title: 'Prozess auswerten',
    body:
      'Hier beginnt die Arbeit: Freitext beschreiben oder Dokumente hochladen.\n' +
      'Die App leitet daraus automatisch Schritte, Rollen und Reibungssignale ab.',
  },
  'pmv2.observations.describe': {
    title: 'Prozessfall beschreiben',
    body:
      'Nutzen Sie diesen Weg, wenn Sie einen Ablauf in eigenen Worten schildern möchten.\n' +
      'Je konkreter Zeitpunkte, Rollen und Entscheidungen beschrieben sind, desto stabiler die lokale Ableitung.',
  },
  'pmv2.observations.upload': {
    title: 'Dokument hochladen',
    body:
      'DOCX und PDF werden direkt ausgewertet.\n' +
      'CSV und XLSX lassen sich als Fallbeschreibungen oder als Ereignistabelle importieren.',
  },
  'pmv2.fileimport.table': {
    title: 'Tabellendatei zuordnen',
    body:
      'Wählen Sie hier, ob jede Zeile eine Fallbeschreibung ist oder ob die Datei bereits eine Ereignistabelle enthält.\n' +
      'Die richtige Zuordnung verbessert die lokale Auswertung deutlich.',
  },
  'pmv2.sources': {
    title: 'Quellenübersicht',
    body:
      'Zeigt pro Fall oder Dokument, ob die Quelle schon ausgewertet ist und ob eine kurze Prüfung noch sinnvoll ist.\n' +
      'So behalten Sie bei mehreren Eingängen den Überblick.',
  },
  'pmv2.review': {
    title: 'Prüfwerkstatt',
    body:
      'Hier schärfen Sie die lokale Ableitung ohne KI.\n' +
      'Typische Aktionen sind Namen vereinheitlichen, Sammelschritte aufteilen oder Problemhinweise als Reibungssignal führen.',
  },
  'pmv2.discovery': {
    title: 'Kernprozess erkennen',
    body:
      'Verdichtet die erkannten Schritte zu einer Hauptlinie.\n' +
      'Bei wenigen Quellen ist das zunächst ein Prozessentwurf, bei mehreren Fällen werden Varianten und Häufigkeiten belastbarer.',
  },
  'pmv2.conformance': {
    title: 'Mit Soll abgleichen',
    body:
      'Vergleicht die erkannte Hauptlinie oder einzelne Fälle mit dem Soll-Prozess.\n' +
      'Wenn kein Happy Path vorliegt, nutzt die App vorübergehend die lokal erkannte Hauptlinie als Vergleich.',
  },
  'pmv2.enhancement': {
    title: 'Verbesserungen erkennen',
    body:
      'Sammelt Hotspots, Reibungen, Rücksprünge und fehlende Angaben.\n' +
      'Zeitbasierte Hinweise erscheinen nur, wenn echte Zeitangaben vorliegen.',
  },
  'pmv2.augmentation': {
    title: 'Ergebnisse anreichern',
    body:
      'Hier ergänzen Sie Ursachen, Risiken, Rollen, Systeme und Evidenz.\n' +
      'Wichtige Erkenntnisse lassen sich explizit ins Backlog oder als Evidenz übernehmen.',
  },
  'pmv2.reporting': {
    title: 'Berichte und Übergaben',
    body:
      'Erzeugt lokal eine Management-Kurzfassung, eine verständliche Prozessgeschichte und Übergabetexte für verschiedene Zielgruppen.\n' +
      'So wird aus Analyseergebnissen schnell ein gut kommunizierbarer Arbeitsstand.',
  },
  'pmv2.story': {
    title: 'Zusammenfassung und Story',
    body:
      'Hier verdichten Sie die Ergebnisse in eigenen Worten oder übernehmen die lokal erzeugte Kurzfassung.\n' +
      'Das eignet sich für Entscheidungsvorlagen, Zwischenstände und Workshop-Protokolle.',
  },
  'pmv2.handover': {
    title: 'Übergaben',
    body:
      'Die Übergabetexte sind auf typische Zielgruppen zugeschnitten: Management, Prozessverantwortung, operatives Team und Workshop.\n' +
      'Sie können die Texte kopieren, als Evidenz speichern oder als Ausgangspunkt für eigene Kommunikation nutzen.',
  },
  'pmv2.ai': {
    title: 'Optionale KI-Verfeinerung',
    body:
      'Die KI ist ein Zusatzweg, nicht die Pflichtstrecke.\n' +
      'Die lokale Analyse bleibt führend; mit KI können Sie Schrittlabels, Rollen, Systeme und Reibungssignale weiter schärfen.',
  },

} satisfies Record<string, HelpText>;

export type HelpKey = keyof typeof HELP_TEXTS;
