# ServiceNow CSV Import

## Unterstützter Export

Der ServiceNow CSV Import verarbeitet den Standard-CSV-Export aus ServiceNow-Listenansichten (Incidents, Requests, Tasks, Changes).

Export in ServiceNow: **Liste öffnen** > **Hamburger-Menü / Kontextmenü** > **Export** > **CSV**.

## Workflow

1. Im AI-Tab die Option **"ServiceNow CSV (Tickets)"** unter "CSV-Modus" auswählen.
2. Mit **"Datei wählen"** die exportierte `.csv` Datei öffnen.
3. Der Import läuft vollständig lokal im Browser – keine Netzwerkanfragen, keine externen Dienste.
4. Das Ergebnis erscheint direkt im Quelltextfeld und kann anschließend wie gewohnt als Prompt verwendet werden.

## Erkannte Spalten

Die folgenden Spaltennamen werden erkannt (Groß-/Kleinschreibung egal, deutsch und englisch):

| Feld            | Erkannte Spaltenbezeichnungen                                                           |
|-----------------|-----------------------------------------------------------------------------------------|
| Ticket-Nummer   | Number, Nummer, Ticket, Incident, Request, Req Number, Inc Number                      |
| Kurzbeschreibung| Short Description, Short_Description, Kurzbeschreibung, Summary, Titel, Title          |
| Beschreibung    | Description, Beschreibung, Desc                                                         |
| Kommentare      | Comments, Additional Comments, Additional_Comments, Kommentare, Zusätzliche Kommentare |
| Work Notes      | Work Notes, Work_Notes, Arbeitsnotizen, Worknote, Work Note                            |
| Status          | State, Status, Zustand                                                                  |
| Kategorie       | Category, Kategorie, Cat                                                                |
| Erstellt        | Opened, Opened At, Opened_At, Erstellt, Created, Created At                            |
| Aktualisiert    | Updated, Updated At, Updated_At, Aktualisiert, Last Updated                            |

Nicht erkannte Spalten werden ignoriert. Fehlen Number und Short Description, erscheint eine Warnung.

## Ausgabeformat je Modus

| Modus      | Ergebnis                                                                              |
|------------|---------------------------------------------------------------------------------------|
| Artefakt   | Alle Tickets nacheinander, getrennt durch zwei Leerzeilen                            |
| Fall       | Nur das erste Ticket als `FALL 1 (ServiceNow: INC0001234)`                           |
| Fälle      | Jedes Ticket als eigener `FALL N (ServiceNow: INC…)`, getrennt durch `---`          |

## Limitierungen

- **Maximale Tickets pro Import:** 50 (Standard). Weitere Tickets werden ignoriert, eine Warnung wird angezeigt.
- **Maximale Zeichenanzahl pro Ticket:** 2500 Zeichen. Längere Inhalte werden gekürzt, eine Warnung wird ausgegeben.
- **HTML-Tags** in Beschreibung, Kommentaren und Work Notes werden entfernt (einfaches Cleanup).
- **Bilder und Anhänge** aus ServiceNow werden nicht übernommen.
- Formatierungen wie Rich-Text oder Tabellen werden nicht vollständig erhalten.

## Alles lokal/offline

Der gesamte Import findet im Browser statt. Es werden keine Daten an externe Server übertragen. Die CSV-Datei verlässt das Gerät nicht.
