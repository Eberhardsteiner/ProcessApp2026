# Strukturierte Quelle mit Mehrfachkontext

## Zielbild
Die Quelle beschreibt einen klaren Sollprozess mit expliziten Mehrfachrollen und Mehrfachsystemen pro Schritt.

## Rollen und Systeme

| Systeme | Rolle | Verantwortung |
| --- | --- | --- |
| CRM, Mail | Innendienst | Erfassung und Kommunikation |
| CRM, DMS | Vertrieb | Kundensicht und Vorbereitung |
| QMS, DMS | Qualitätssicherung | Technische Prüfung |
| Ticketsystem, Mail | Service | Operative Sicht |
| ERP, BI | Teamleitung | Freigabe |
| ERP, Mail | Fachbereich | Fachentscheidung |
| DMS, Wissensdatenbank | Wissensmanagement | Abschluss sichern |

## Standardablauf

| Schritt | Nr. | Systeme | Verantwortung | Ergebnis |
| --- | --- | --- | --- | --- |
| Fall erfassen | 1 | CRM; DMS | Innendienst; Vertrieb | Fall angelegt |
| Technische Sicht einholen | 2 | QMS; Ticketsystem | Qualitätssicherung; Service | Bewertung angefragt |
| Freigabe abstimmen | 3 | ERP; BI; Mail | Teamleitung; Fachbereich | Freigabepfad geklärt |
| Kundenentscheidung kommunizieren | 4 | CRM; Mail | Innendienst; Vertrieb | Mitteilung versandt |
| Abschluss sichern | 5 | DMS; Wissensdatenbank | Qualitätssicherung; Wissensmanagement | Abschluss dokumentiert |

## Hinweise
Mehrfachwerte müssen bis in den finalen Export erhalten bleiben und als atomare Werte vorliegen.
