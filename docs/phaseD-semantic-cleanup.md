# Phase D · Kandidatenmodell semantisch säubern

Diese Ausbaustufe reduziert semantische Fehlableitungen im evidenzbasierten Kandidatenmodell.

## Kernänderungen

- Rollen- und Systemkandidaten werden nur noch aus expliziten Kurzlabels oder belastbaren Musterhinweisen abgeleitet.
- Ganze Sätze, Review-Fragmente, offene Fragen und Meta-Zeilen werden nicht mehr als Rollen- oder Systemkandidaten übernommen.
- Narrative Meta-Blöcke wie `Signal:`, `Wichtig:`, `Rollen:`, `Systeme:` oder Fallüberschriften werden aus der Kernschrittbildung herausgehalten.
- Narrative Schrittkandidaten behalten ihr Rohlabel für die Prüfung, werden aber separat normalisiert. Dadurch lassen sich Einleitungs- und Reviewsätze zuverlässiger verwerfen.
- Cross-Domain-Step-Families wurden präzisiert, damit generische oder fachfremde Labels nicht mehr zu leicht ausgelöst werden.

## Zielwirkung

- weniger Satzfragmente als Rollen oder Systeme
- weniger fachfremde Generallabels in narrativen Dokumenten
- stärkere Trennung zwischen Kernschritt, Signal, Review und Meta-Material
- defensivere Verarbeitung schwacher Tabellenfragmente ohne Scheinprozesse
