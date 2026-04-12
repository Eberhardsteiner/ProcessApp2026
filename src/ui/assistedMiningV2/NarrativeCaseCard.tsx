import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Check,
  X,
  Sparkles,
  GripVertical,
} from 'lucide-react';
import type { ProcessMiningObservationCase, ProcessMiningObservation } from '../../domain/process';

const PLACEHOLDER_NARRATIVE = `Beispiel:
Am Montag um 9 Uhr öffnet die Sachbearbeiterin das eingegangene Dokument im System.
Sie prüft die Angaben – das dauert in der Regel 10 bis 15 Minuten.
Falls Unterlagen fehlen, schreibt sie eine E-Mail an den Kunden und wartet auf Antwort (manchmal bis zu 2 Tage).
Nach vollständiger Prüfung leitet sie den Vorgang an die Genehmigungsstelle weiter.
Der Vorgang wird dann innerhalb von 1 Werktag genehmigt oder abgelehnt.
Am Ende informiert sie den Kunden per E-Mail über das Ergebnis.`;

interface Props {
  caseItem: ProcessMiningObservationCase;
  observations: ProcessMiningObservation[];
  onUpdate: (updated: ProcessMiningObservationCase) => void;
  onDelete: () => void;
  onExtract: () => void;
  allowExtract?: boolean;
  onToggleEditor?: () => void;
  editorOpen?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  caseIndex: number;
}

export function NarrativeCaseCard({
  caseItem,
  observations,
  onUpdate,
  onDelete,
  onExtract,
  allowExtract = true,
  onToggleEditor,
  editorOpen = false,
  dragHandleProps,
  caseIndex,
}: Props) {
  const [expanded, setExpanded] = useState(caseIndex === 0);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(caseItem.name);
  const [showAdvanced, setShowAdvanced] = useState(false);

  function saveName() {
    const trimmed = nameInput.trim();
    if (trimmed) onUpdate({ ...caseItem, name: trimmed, updatedAt: new Date().toISOString() });
    setEditingName(false);
  }

  function updateField(field: keyof ProcessMiningObservationCase, value: string) {
    onUpdate({ ...caseItem, [field]: value, updatedAt: new Date().toISOString() });
  }

  const obsCount = observations.length;
  const realTimeCount = observations.filter(o => o.timestampQuality === 'real').length;

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-200">
        <span
          {...dragHandleProps}
          className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none"
          title="Verschieben"
        >
          <GripVertical className="w-4 h-4" />
        </span>

        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                type="text"
                className="flex-1 text-sm font-medium border border-blue-400 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') { setEditingName(false); setNameInput(caseItem.name); }
                }}
              />
              <button type="button" onClick={saveName} className="text-green-600 hover:text-green-700">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => { setEditingName(false); setNameInput(caseItem.name); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-800 truncate">{caseItem.name}</span>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="text-slate-300 hover:text-slate-500 transition-colors shrink-0"
                title="Umbenennen"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {obsCount > 0 && (
            <span className="text-xs text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full font-medium">
              {obsCount} erkannte Schritte
            </span>
          )}
          {obsCount > 0 && realTimeCount === 0 && (
            <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
              keine Zeitangaben
            </span>
          )}
          {obsCount > 0 && editorOpen && (
            <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-medium">
              Prüfung offen
            </span>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="text-slate-300 hover:text-red-500 transition-colors"
            title="Fall löschen"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Beschreibung des Prozessablaufs
            </label>
            <textarea
              rows={7}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y leading-relaxed"
              placeholder={PLACEHOLDER_NARRATIVE}
              value={caseItem.narrative}
              onChange={e => updateField('narrative', e.target.value)}
            />
            <p className="text-xs text-slate-400">
              Beschreibe den Ablauf in ganzen Sätzen oder Stichpunkten. Je mehr konkrete Schritte, Rollen oder Hinweise enthalten sind, desto besser die automatische Auswertung.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(a => !a)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Weitere Felder (Fall-ID, Datumshinweise, Notiz)
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">Fall-ID (optional)</label>
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="z.B. TICKET-1234"
                  value={caseItem.caseRef ?? ''}
                  onChange={e => updateField('caseRef', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">Datumshinweise (optional)</label>
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="z.B. KW 12 2024, oder 15.03.2024"
                  value={caseItem.dateHints ?? ''}
                  onChange={e => updateField('dateHints', e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="block text-xs font-medium text-slate-600">Quelle / Notiz (optional)</label>
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="z.B. Interview mit Frau Müller, Protokoll Workshop 2024"
                  value={caseItem.sourceNote ?? ''}
                  onChange={e => updateField('sourceNote', e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="pt-1 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onExtract}
              disabled={!allowExtract || !caseItem.narrative.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Prozess erneut auswerten
            </button>
            {obsCount > 0 && onToggleEditor && (
              <button
                type="button"
                onClick={onToggleEditor}
                className="px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                {editorOpen ? 'Prüfbereich ausblenden' : 'Erkannte Schritte prüfen'}
              </button>
            )}
            {obsCount > 0 && (
              <p className="text-xs text-teal-700 basis-full">
                Bereits {obsCount} Schritte erkannt. Eine erneute Auswertung ersetzt dieses Ergebnis für die Quelle.
              </p>
            )}
            {!allowExtract && (
              <p className="text-xs text-slate-500 basis-full">
                Diese Quelle läuft bereits über den Tabellenpfad und wird nicht erneut durch den Dokumentpfad ausgewertet.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
