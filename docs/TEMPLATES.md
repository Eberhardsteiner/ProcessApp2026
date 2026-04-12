# Prozess-Templates

## Zweck

Die Template-Funktion ermöglicht es, Prozesse mit vordefinierten Strukturen schnell zu erstellen. Templates sind Startpunkte, die bereits einen vollständigen Happy Path, Entscheidungen, Ausnahmen sowie vordefinierte Rollen und Systeme enthalten.

Templates beschleunigen den Einstieg und bieten Best-Practice-Beispiele für typische Geschäftsprozesse. Nach der Erstellung aus einem Template können alle Elemente individuell angepasst werden.

## Verfügbare Templates

### 1. Kundenservice: Anfrage bearbeiten

**Beschreibung:** Prozess zur Bearbeitung von Kundenanfragen vom Eingang bis zur Dokumentation

**Merkmale:**
- Kategorie: Kernprozess (kundenwirksam)
- Management-Ebene: Fachlich
- Hierarchie: Hauptprozess
- Happy Path: 6 Schritte
- Entscheidungen: 1 (Ist die Anfrage eindeutig?)
- Ausnahmen: 1 (Kundeninformationen unvollständig)

**Rollen:**
- Kunde
- Service Agent
- Team Lead

**Systeme:**
- Ticket-System
- Wissensdatenbank
- CRM

**Anwendungsfall:** Ideal für Kundenservice-Teams, die einen strukturierten Prozess für die Bearbeitung von Kundenanfragen aufbauen möchten.

---

### 2. Auftragsabwicklung: Auftrag bis Rechnung

**Beschreibung:** Kernprozess von der Auftragsannahme über Versand bis zur Rechnungsstellung

**Merkmale:**
- Kategorie: Kernprozess
- Management-Ebene: Fachlich
- Hierarchie: Hauptprozess
- Happy Path: 8 Schritte
- Entscheidungen: 1 (Sind alle Auftragsdaten vollständig?)
- Ausnahmen: 2 (Auftragsdaten unvollständig, Liefertermin nicht einhaltbar)
- Improvement Backlog: 1 vordefinierte Maßnahme

**Rollen:**
- Vertrieb
- Lager
- Buchhaltung

**Systeme:**
- ERP-System
- CRM
- Versand/Logistik

**Anwendungsfall:** Geeignet für produzierende oder handeltreibende Unternehmen mit klassischer Order-to-Cash-Prozesskette.

---

### 3. Reklamation: Reklamation prüfen und abschließen

**Beschreibung:** Prozess zur Bearbeitung von Kundenreklamationen von Eingang bis Abschluss

**Merkmale:**
- Kategorie: Kernprozess
- Management-Ebene: Fachlich
- Hierarchie: Hauptprozess
- Happy Path: 7 Schritte
- Entscheidungen: 1 (Ist die Reklamation berechtigt?)
- Ausnahmen: 2 (Rechtliche Prüfung erforderlich, Kunde nicht erreichbar)
- Improvement Backlog: 1 vordefinierte Maßnahme

**Rollen:**
- Kunde
- Kundenservice
- Qualitätsmanagement
- Buchhaltung

**Systeme:**
- Ticket/CRM-System
- ERP-System

**Anwendungsfall:** Für Unternehmen, die einen strukturierten Reklamationsprozess mit Qualitätsprüfung etablieren möchten.

---

## Nutzung

### Prozess aus Template erstellen

1. **Projekt auswählen oder erstellen**
   - Navigieren Sie zum Setup-Tab
   - Wählen Sie ein bestehendes Projekt aus oder erstellen Sie ein neues

2. **Template auswählen**
   - Im Abschnitt "Schritt 2: Prozess" finden Sie den Bereich "Prozess aus Template erstellen (optional)"
   - Wählen Sie eines der verfügbaren Templates aus dem Dropdown-Menü
   - Eine Vorschau zeigt Ihnen die wichtigsten Merkmale des gewählten Templates

3. **Prozess erstellen**
   - Klicken Sie auf "Aus Template erstellen und Wizard starten"
   - Der Prozess wird automatisch mit allen vordefinierten Elementen erstellt
   - Eine erste Version wird angelegt und Sie werden automatisch zum Wizard-Tab weitergeleitet

4. **Anpassung**
   - Alle Template-Inhalte können im Wizard oder im Draft-Tab angepasst werden
   - Ergänzen Sie weitere Schritte, Entscheidungen oder Ausnahmen nach Bedarf
   - Passen Sie Rollen, Systeme und andere Metadaten an Ihre Organisation an

### Version aus Template erstellen

Für bereits existierende Prozesse können Sie ebenfalls neue Versionen aus Templates erstellen. Dies ist nützlich, wenn Sie einen Prozess mit einer vorgefertigten Struktur starten möchten, ohne einen komplett neuen Prozess anzulegen.

1. **Prozess auswählen**
   - Navigieren Sie zum Setup-Tab
   - Wählen Sie ein bestehendes Projekt und einen Prozess aus oder erstellen Sie diese

2. **Template für Version auswählen**
   - Im Abschnitt "Schritt 3: Version" finden Sie den Bereich "Neue Version aus Template (optional)"
   - Wählen Sie eines der verfügbaren Templates aus dem Dropdown-Menü
   - Eine Vorschau zeigt Ihnen die wichtigsten Merkmale des gewählten Templates

3. **Version erstellen**
   - Klicken Sie auf "Version aus Template erstellen und Wizard starten"
   - Eine neue Version wird mit allen vordefinierten Elementen (EndToEnd, Draft, Rollen, Systeme) erstellt
   - Der Prozessname und die Prozessklassifikation bleiben dabei unverändert
   - Sie werden automatisch zum Wizard-Tab weitergeleitet

4. **Anpassung**
   - Die neue Version kann wie jede andere Version im Wizard oder Draft-Tab bearbeitet werden
   - Alle Template-Inhalte können individuell angepasst werden

**Hinweis:** Diese Funktion erstellt nur eine neue Version für den bestehenden Prozess. Die Prozessmetadaten (Titel, Kategorie, Management-Ebene, Hierarchie) werden nicht aus dem Template übernommen, sondern vom Prozess beibehalten.

### Alternative: Manuelle Erstellung

Wenn kein Template Ihren Anforderungen entspricht, können Sie weiterhin einen Prozess oder eine Version manuell erstellen. Wählen Sie dazu im Dropdown "(kein Template - manuelle Erstellung)" und nutzen Sie die entsprechenden Felder bzw. Buttons.

## Hinweise

- **Templates sind Startpunkte:** Die vordefinierten Strukturen sollen als Orientierung dienen und müssen in der Regel an die spezifischen Anforderungen Ihrer Organisation angepasst werden.

- **Keine Abhängigkeiten:** Nach der Erstellung aus einem Template besteht keine Verbindung mehr zum ursprünglichen Template. Alle Änderungen erfolgen unabhängig.

- **Erweiterbarkeit:** Die Template-Bibliothek kann in der Datei `src/templates/processTemplates.ts` erweitert werden. Neue Templates folgen der gleichen Struktur wie die bestehenden Vorlagen.

- **Best Practices:** Templates enthalten bewusst Pain Points und To-Be-Hinweise, um typische Optimierungspotenziale aufzuzeigen.

## Technische Details

### Template-Struktur

Jedes Template besteht aus:

- **Process-Metadaten:** Titel, Kategorie, Management-Ebene, Hierarchie
- **EndToEnd-Definition:** Trigger und Outcome des Prozesses
- **Sidecar-Daten:**
  - Rollen (roles)
  - Systeme (systems)
  - Capture Draft (happyPath, decisions, exceptions)
  - Optional: Improvement Backlog, Data Objects, KPIs

### Template-Registry

Templates werden zentral in `src/templates/processTemplates.ts` definiert und exportiert:

```typescript
export const PROCESS_TEMPLATES: ProcessTemplateDefinition[]
export function getProcessTemplate(id: string): ProcessTemplateDefinition | null
```

Die UI in `WizardPlayground.tsx` greift direkt auf diese Registry zu.
