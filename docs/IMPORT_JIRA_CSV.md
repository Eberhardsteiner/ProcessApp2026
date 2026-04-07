# Jira CSV Import

## Unterstützte Exporte

Der Jira CSV Import verarbeitet den Standard-CSV-Export von Jira (Server, Data Center und Cloud).

Export in Jira: **Issues** > **Export** > **Export Excel CSV (all fields)** oder **Export CSV (current fields)**.

## Workflow

1. Im AI-Tab die Option **"Jira CSV (Tickets)"** unter "CSV-Modus" auswählen.
2. Mit **"Datei wählen"** die exportierte `.csv` Datei öffnen.
3. Der Import läuft vollständig lokal im Browser – keine Netzwerkanfragen, keine externen Dienste.
4. Das Ergebnis erscheint direkt im Quelltextfeld und kann anschließend wie gewohnt als Prompt verwendet werden.

## Erkannte Spalten

Die folgenden Spaltennamen werden erkannt (Groß-/Kleinschreibung egal, deutsch und englisch):

| Feld          | Erkannte Spaltenbezeichnungen                                      |
|---------------|--------------------------------------------------------------------|
| Ticket-Key    | Key, Issue Key, Schlüssel, Issue-Key, IssueKey                    |
| Titel         | Summary, Zusammenfassung, Titel, Title, Betreff                   |
| Beschreibung  | Description, Beschreibung, Body                                    |
| Kommentare    | Comments, Comment, Kommentar, Kommentare, Kommentar(e)             |
| Status        | Status                                                              |
| Typ           | Issue Type, IssueType, Typ, Type, Issue-Type                      |
| Erstellt      | Created, Erstellt, Erstellungsdatum, Created Date                 |
| Aktualisiert  | Updated, Aktualisiert, Updated Date, Last Updated                 |

Nicht erkannte Spalten werden ignoriert. Fehlende Pflichtfelder (Key, Summary) erzeugen eine Warnung.

## Ausgabeformat je Modus

| Modus      | Ergebnis                                                                 |
|------------|--------------------------------------------------------------------------|
| Artefakt   | Alle Tickets nacheinander, getrennt durch zwei Leerzeilen               |
| Fall       | Nur das erste Ticket als `FALL 1 (Jira: KEY)`                           |
| Fälle      | Jedes Ticket als eigener `FALL N (Jira: KEY)`, getrennt durch `---`     |

## Limitierungen

- **Maximale Tickets pro Import:** 50 (Standard). Weitere Tickets werden ignoriert, eine Warnung wird angezeigt.
- **Maximale Zeichenanzahl pro Ticket:** 2000 Zeichen. Längere Inhalte werden gekürzt, eine Warnung wird ausgegeben.
- **HTML-Tags** in Beschreibung und Kommentaren werden entfernt (einfaches Cleanup, kein vollständiges HTML-Rendering).
- **Bilder und Anhänge** aus Jira werden nicht übernommen.
- **Unteraufgaben** sind nur dann enthalten, wenn sie im Export als eigene Zeilen vorhanden sind.
- Jira-Formatierungen (z. B. Atlassian-Markup `{code}`, `*fett*`) werden nicht in Markdown umgewandelt.

## Alles lokal/offline

Der gesamte Import findet im Browser statt. Es werden keine Daten an externe Server übertragen. Die CSV-Datei verlässt das Gerät nicht.
