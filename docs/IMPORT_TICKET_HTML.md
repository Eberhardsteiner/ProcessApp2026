# Import: Ticket HTML (Jira / ServiceNow)

## Unterstützte Formate

Tabellenbasierte HTML-Exporte aus Listenansichten (z.B. Jira Issue Navigator, ServiceNow Liste).

- **Jira HTML**: HTML-Tabelle mit Spalten „Issue Key" (oder „Key") und „Summary"
- **ServiceNow HTML**: HTML-Tabelle mit Spalten „Number" und „Short Description"

## Verwendung

1. HTML-Modus im Dateiimport auf „Jira HTML (Tickets)" oder „ServiceNow HTML (Tickets)" stellen
2. HTML-Datei hochladen
3. Ticketblöcke werden erzeugt (artifact / case / cases)

## Evidence-Label

- Jira HTML: `Jira HTML: <Dateiname>`
- ServiceNow HTML: `ServiceNow HTML: <Dateiname>`

## Limitierungen

- Nur Spalten, die im HTML-Export enthalten sind, werden importiert
- Keine Anhänge oder eingebettete Bilder
- Felder werden auf 2000 (Jira) bzw. 2500 (ServiceNow) Zeichen gekürzt
- Für Einzelticket-Detailseiten empfiehlt sich der Modus „Rohtext (bereinigt)"
- Limit: 50 Tickets pro Import

## Fehlermeldung bei fehlender Tabelle

Wenn keine passende Ticket-Tabelle erkannt wird, erscheint eine Fehlermeldung mit Hinweis auf „HTML Rohtext" oder CSV als Alternative.

## Offline

Dieser Import erfolgt vollständig lokal im Browser. Es werden keine Daten an externe Server gesendet.
