import { createProject, listProjects, getProject } from './repositories/projectsRepo';
import { createProcess, listProcesses, getProcess } from './repositories/processesRepo';
import {
  createVersion,
  listVersions,
  getLatestVersion,
  updateVersion,
  cloneVersion,
} from './repositories/versionsRepo';
import {
  getCurrentPhase,
  getNextQuestions,
  applyAnswers,
  generateQualityFindings,
} from '../capture/wizardEngine';
import { buildBpmnXmlFromDraft } from '../bpmn/exportBpmn';
import { exportProcessBundle, parseProcessBundle, importProcessBundleToProject } from './processBundle';
import { exportProjectBundle, parseProjectBundle, importProjectBundleAsNewProject } from './projectBundle';

export async function runStorageSelfTest(): Promise<void> {
  console.log('=== Storage Self-Test Start ===');

  console.log('\n1. Projekt erstellen...');
  const project = await createProject('Vertriebsprozesse 2024', 'Alle Prozesse im Vertrieb');
  console.log('Projekt erstellt:', project.projectId, '-', project.name);

  console.log('\n2. Projekte auflisten...');
  const projects = await listProjects();
  console.log('Anzahl Projekte:', projects.length);

  console.log('\n3. Projekt abrufen...');
  const retrievedProject = await getProject(project.projectId);
  console.log('Projekt abgerufen:', retrievedProject?.name);

  console.log('\n4. Prozess erstellen...');
  const process = await createProcess(project.projectId, {
    title: 'Auftragsabwicklung',
    category: 'kern',
    managementLevel: 'fachlich',
    hierarchyLevel: 'hauptprozess',
    parentProcessId: null,
  });
  console.log('Prozess erstellt:', process.processId, '-', process.title);

  console.log('\n5. Prozesse auflisten...');
  const processes = await listProcesses(project.projectId);
  console.log('Anzahl Prozesse:', processes.length);

  console.log('\n6. Prozess abrufen...');
  const retrievedProcess = await getProcess(process.processId);
  console.log('Prozess abgerufen:', retrievedProcess?.title);

  console.log('\n7. Version erstellen...');
  const version = await createVersion(process.processId, {
    status: 'draft',
    titleSnapshot: process.title,
    endToEndDefinition: {
      trigger: 'Kundenanfrage geht ein',
      customer: 'Externer Kunde',
      outcome: 'Auftrag abgeschlossen und Rechnung versendet',
      doneCriteria: 'Kunde hat Zahlung geleistet',
    },
    sidecar: {
      roles: [
        {
          id: crypto.randomUUID(),
          name: 'Vertriebsmitarbeiter',
          kind: 'role',
        },
      ],
      systems: [
        {
          id: crypto.randomUUID(),
          name: 'SAP ERP',
          systemType: 'ERP',
        },
      ],
      dataObjects: [
        {
          id: crypto.randomUUID(),
          name: 'Auftrag',
          kind: 'document',
        },
      ],
      kpis: [
        {
          id: crypto.randomUUID(),
          name: 'Durchlaufzeit',
          definition: 'Zeit von Auftragseingang bis Versand',
          unit: 'Stunden',
          target: '< 48',
        },
      ],
      aiReadinessSignals: {
        standardization: 'high',
        dataAvailability: 'high',
        variability: 'low',
        complianceRisk: 'medium',
      },
    },
    quality: {
      semanticQuestions: [
        {
          id: crypto.randomUUID(),
          question: 'Ist der Prozess wirklich zu Ende, wenn die Rechnung versendet wurde?',
          relatedStepHint: 'End-Event',
        },
      ],
    },
  });
  console.log('Version erstellt:', version.versionId, '-', version.status);

  console.log('\n8. Versionen auflisten...');
  const versions = await listVersions(process.processId);
  console.log('Anzahl Versionen:', versions.length);

  console.log('\n9. Letzte Version abrufen...');
  const latestVersion = await getLatestVersion(process.processId);
  console.log('Letzte Version:', latestVersion?.versionId);

  console.log('\n10. Version aktualisieren...');
  const updatedVersion = await updateVersion(process.processId, version.versionId, {
    status: 'in_review',
    captureProgress: {
      phaseStates: {
        scope: 'done',
        happy_path: 'done',
        roles: 'in_progress',
        decisions: 'not_started',
        exceptions: 'not_started',
        data_it: 'not_started',
        kpis: 'not_started',
        automation: 'not_started',
        review: 'not_started',
      },
      lastTouchedAt: new Date().toISOString(),
    },
  });
  console.log('Version aktualisiert:', updatedVersion.status);
  console.log('Capture Progress - Scope:', updatedVersion.captureProgress.phaseStates.scope);
  console.log('Capture Progress - Roles:', updatedVersion.captureProgress.phaseStates.roles);

  console.log('\n11. Datenintegrität prüfen...');
  console.log('Sidecar - Anzahl Rollen:', updatedVersion.sidecar.roles.length);
  console.log('Sidecar - Anzahl Systeme:', updatedVersion.sidecar.systems.length);
  console.log('Sidecar - Anzahl KPIs:', updatedVersion.sidecar.kpis.length);
  console.log('Quality - Anzahl semantische Fragen:', updatedVersion.quality.semanticQuestions.length);
  console.log('BPMN - Diagrammtyp:', updatedVersion.bpmn.diagramType);
  console.log('End-to-End - Trigger:', updatedVersion.endToEndDefinition.trigger);

  console.log('\n=== WIZARD ENGINE TEST ===');

  console.log('\n12. Neue Version für Wizard-Test erstellen...');
  const wizardProcess = await createProcess(project.projectId, {
    title: 'Rechnungseingang',
    category: 'unterstuetzung',
    managementLevel: 'fachlich',
    hierarchyLevel: 'hauptprozess',
    parentProcessId: null,
  });

  const wizardVersion = await createVersion(wizardProcess.processId, {
    status: 'draft',
    titleSnapshot: wizardProcess.title,
    endToEndDefinition: {
      trigger: '',
      customer: '',
      outcome: '',
    },
  });
  console.log('Wizard-Version erstellt:', wizardVersion.versionId);

  console.log('\n13. Aktuelle Phase ermitteln...');
  const currentPhase = getCurrentPhase(wizardVersion);
  console.log('Aktuelle Phase:', currentPhase);

  console.log('\n14. Nächste Fragen abrufen...');
  const nextQuestions = getNextQuestions(wizardProcess, wizardVersion, 3);
  console.log('Anzahl nächster Fragen:', nextQuestions.length);
  nextQuestions.forEach((q) => {
    console.log(`  - ${q.title} (${q.id}): ${q.prompt.substring(0, 50)}...`);
  });

  console.log('\n15. Scope-Antworten anwenden...');
  const scopeAnswers = [
    {
      questionId: 'scope_trigger',
      value: 'Rechnung ist eingegangen',
    },
    {
      questionId: 'scope_customer',
      value: 'Buchhaltung',
    },
    {
      questionId: 'scope_outcome',
      value: 'Rechnung ist gebucht und bezahlt',
    },
  ];

  const scopeResult = applyAnswers(wizardProcess, wizardVersion, scopeAnswers);
  console.log('Scope-Antworten angewendet, Fehler:', scopeResult.errors.length);
  console.log('Neue Phase nach Scope:', scopeResult.updatedCaptureProgress.phaseStates.scope);

  const wizardVersionAfterScope = await updateVersion(
    wizardProcess.processId,
    wizardVersion.versionId,
    scopeResult.versionPatch
  );
  console.log('Version nach Scope gespeichert');

  console.log('\n16. Happy-Path-Schritte anwenden...');
  const happyPathAnswer = {
    questionId: 'happy_path_steps',
    value: `Rechnung empfangen
Rechnung erfassen
Rechnung prüfen
Buchungskonto ermitteln
Rechnung buchen
Zahlung freigeben
Zahlung ausführen`,
  };

  const happyPathResult = applyAnswers(wizardProcess, wizardVersionAfterScope, [happyPathAnswer]);
  console.log('Happy-Path angewendet, Fehler:', happyPathResult.errors.length);
  console.log(
    'Anzahl Steps:',
    happyPathResult.versionPatch.sidecar?.captureDraft?.happyPath?.length
  );

  let wizardVersionAfterHappyPath = await updateVersion(
    wizardProcess.processId,
    wizardVersion.versionId,
    happyPathResult.versionPatch
  );
  console.log('Version nach Happy-Path gespeichert');

  console.log('\n17. Rollen und Systems für BPMN-Test hinzufügen...');
  const roleId1 = crypto.randomUUID();
  const roleId2 = crypto.randomUUID();
  const systemId1 = crypto.randomUUID();

  const happyPath = wizardVersionAfterHappyPath.sidecar.captureDraft?.happyPath || [];
  if (happyPath.length >= 3) {
    happyPath[0].roleId = roleId1;
    happyPath[0].workType = 'user_task';
    happyPath[0].systemId = systemId1;

    happyPath[1].roleId = roleId1;
    happyPath[1].workType = 'manual';

    happyPath[2].roleId = roleId2;
    happyPath[2].workType = 'service_task';
  }

  wizardVersionAfterHappyPath = await updateVersion(
    wizardProcess.processId,
    wizardVersion.versionId,
    {
      sidecar: {
        ...wizardVersionAfterHappyPath.sidecar,
        roles: [
          ...wizardVersionAfterHappyPath.sidecar.roles,
          { id: roleId1, name: 'Sachbearbeiter', kind: 'role' },
          { id: roleId2, name: 'Teamleiter', kind: 'role' },
        ],
        systems: [
          ...wizardVersionAfterHappyPath.sidecar.systems,
          { id: systemId1, name: 'Finanzsystem', systemType: 'ERP' },
        ],
        captureDraft: wizardVersionAfterHappyPath.sidecar.captureDraft,
      },
    }
  );
  console.log('Rollen, Systems, roleId und workType hinzugefügt');

  console.log('\n18. BPMN Export mit Lanes und Task-Typen testen...');
  const bpmnResult = buildBpmnXmlFromDraft(wizardProcess, wizardVersionAfterHappyPath);
  console.log('BPMN Warnings:', bpmnResult.warnings.length);
  if (bpmnResult.warnings.length > 0) {
    bpmnResult.warnings.forEach((w) => console.log('  -', w));
  }
  console.log('BPMN XML (erste 200 Zeichen):', bpmnResult.xml.substring(0, 200));

  if (!bpmnResult.xml.includes('<bpmn:laneSet')) {
    throw new Error('BPMN Export Test fehlgeschlagen: Kein laneSet im XML gefunden');
  }
  console.log('✓ laneSet im XML gefunden');

  const hasUserTask = bpmnResult.xml.includes('<bpmn:userTask');
  const hasServiceTask = bpmnResult.xml.includes('<bpmn:serviceTask');
  const hasManualTask = bpmnResult.xml.includes('<bpmn:manualTask');

  if (!hasUserTask && !hasServiceTask && !hasManualTask) {
    throw new Error('BPMN Export Test fehlgeschlagen: Keine spezifischen Task-Typen im XML gefunden');
  }
  console.log('✓ Task-Typen im XML gefunden:', { hasUserTask, hasServiceTask, hasManualTask });

  if (!bpmnResult.xml.includes('<bpmn:documentation>System: Finanzsystem</bpmn:documentation>')) {
    throw new Error('BPMN Export Test fehlgeschlagen: System-Dokumentation nicht gefunden');
  }
  console.log('✓ System-Dokumentation im XML gefunden');

  const wizardVersionWithBpmn = await updateVersion(
    wizardProcess.processId,
    wizardVersion.versionId,
    {
      bpmn: {
        ...wizardVersionAfterHappyPath.bpmn,
        bpmnXml: bpmnResult.xml,
        lastExportedAt: new Date().toISOString(),
      },
    }
  );
  console.log('BPMN XML gespeichert, lastExportedAt:', wizardVersionWithBpmn.bpmn.lastExportedAt);

  console.log('\n19. Decisions-List anwenden...');
  const decisionsAnswer = {
    questionId: 'decisions_list',
    value: `Betrag > 10.000 EUR?
3: Betrag korrekt?`,
  };

  const decisionsResult = applyAnswers(wizardProcess, wizardVersionWithBpmn, [decisionsAnswer]);
  console.log('Decisions angewendet, Fehler:', decisionsResult.errors.length);
  if (decisionsResult.errors.length > 0) {
    console.log('FEHLER:', decisionsResult.errors);
  }
  console.log(
    'Anzahl Decisions:',
    decisionsResult.versionPatch.sidecar?.captureDraft?.decisions?.length
  );
  console.log(
    'Anzahl Semantic Questions:',
    decisionsResult.versionPatch.quality?.semanticQuestions?.length
  );

  const hasFallback = decisionsResult.versionPatch.quality?.semanticQuestions?.some(q =>
    q.question.toLowerCase().includes('keinem schritt') || q.question.toLowerCase().includes('nicht eindeutig')
  );
  console.log('Fallback-Semantikfrage vorhanden:', hasFallback);

  const wizardVersionAfterDecisions = await updateVersion(
    wizardProcess.processId,
    wizardVersion.versionId,
    decisionsResult.versionPatch
  );
  console.log('Version nach Decisions gespeichert');

  console.log('\n20. KPIs-List anwenden...');
  const kpisAnswer = {
    questionId: 'kpis_list',
    value: `Durchlaufzeit: Zeit von Eingang bis Buchung
Fehlerquote: Anteil Rückfragen`,
  };

  const kpisResult = applyAnswers(wizardProcess, wizardVersionAfterDecisions, [kpisAnswer]);
  console.log('KPIs angewendet, Fehler:', kpisResult.errors.length);
  if (kpisResult.errors.length > 0) {
    console.log('FEHLER:', kpisResult.errors);
  }
  console.log(
    'Anzahl KPIs:',
    kpisResult.versionPatch.sidecar?.kpis?.length
  );

  const wizardVersionAfterKpis = await updateVersion(
    wizardProcess.processId,
    wizardVersion.versionId,
    kpisResult.versionPatch
  );
  console.log('Version nach KPIs gespeichert');

  console.log('\n21. Quality-Findings generieren...');
  const qualityFindings = generateQualityFindings(wizardProcess, wizardVersionAfterKpis);
  console.log('Naming-Findings:', qualityFindings.namingFindings?.length);
  console.log('Semantic-Questions:', qualityFindings.semanticQuestions?.length);

  if (qualityFindings.namingFindings && qualityFindings.namingFindings.length > 0) {
    console.log('Erstes Naming-Finding:', qualityFindings.namingFindings[0].message);
  }

  if (qualityFindings.semanticQuestions && qualityFindings.semanticQuestions.length > 0) {
    console.log('Erste Semantic-Question:', qualityFindings.semanticQuestions[0].question);
  }

  console.log('\n22. XOR-Decision für BPMN-Gateway-Test hinzufügen...');
  const happyPathSteps = wizardVersionAfterKpis.sidecar.captureDraft?.happyPath || [];
  if (happyPathSteps.length < 3) {
    console.log('WARNUNG: Nicht genug Schritte für Gateway-Test, wird übersprungen');
  } else {
    const afterStepId = happyPathSteps[1].stepId;
    const targetStepId = happyPathSteps[2].stepId;

    const xorDecision = {
      decisionId: crypto.randomUUID(),
      afterStepId,
      gatewayType: 'xor' as const,
      question: 'Betrag korrekt?',
      branches: [
        {
          branchId: crypto.randomUUID(),
          conditionLabel: 'OK',
          nextStepId: targetStepId,
          endsProcess: false,
        },
        {
          branchId: crypto.randomUUID(),
          conditionLabel: 'Abbruch',
          endsProcess: true,
        },
      ],
    };

    const wizardVersionWithDecision = await updateVersion(
      wizardProcess.processId,
      wizardVersion.versionId,
      {
        sidecar: {
          ...wizardVersionAfterKpis.sidecar,
          captureDraft: {
            ...wizardVersionAfterKpis.sidecar.captureDraft!,
            decisions: [xorDecision],
          },
        },
      }
    );
    console.log('XOR-Decision hinzugefügt:', xorDecision.question);

    console.log('\n23. BPMN mit XOR-Gateway exportieren...');
    const bpmnWithGatewayResult = buildBpmnXmlFromDraft(wizardProcess, wizardVersionWithDecision);
    console.log('BPMN Warnings mit Gateway:', bpmnWithGatewayResult.warnings.length);
    if (bpmnWithGatewayResult.warnings.length > 0) {
      bpmnWithGatewayResult.warnings.forEach((w) => console.log('  -', w));
    }

    if (!bpmnWithGatewayResult.xml.includes('<bpmn:exclusiveGateway')) {
      throw new Error('BPMN Gateway-Test fehlgeschlagen: Kein exclusiveGateway im XML gefunden');
    }
    console.log('✓ exclusiveGateway im XML gefunden');

    if (!bpmnWithGatewayResult.xml.includes('name="OK"')) {
      throw new Error('BPMN Gateway-Test fehlgeschlagen: Branch-Name "OK" nicht im XML gefunden');
    }
    console.log('✓ Branch-Flow mit name="OK" gefunden');

    const hasAbbruchBranch = bpmnWithGatewayResult.xml.includes('name="Abbruch"');
    const hasFlowToEndEvent = bpmnWithGatewayResult.xml.match(/sourceRef="Gateway_[^"]*" targetRef="EndEvent_1"/);

    if (!hasAbbruchBranch || !hasFlowToEndEvent) {
      throw new Error('BPMN Gateway-Test fehlgeschlagen: Branch zu EndEvent nicht korrekt exportiert');
    }
    console.log('✓ Abbruch-Branch führt zu EndEvent_1');

    const hasGatewayShape = bpmnWithGatewayResult.xml.includes('bpmnElement="Gateway_') &&
                            bpmnWithGatewayResult.xml.includes('isMarkerVisible="true"');
    if (!hasGatewayShape) {
      throw new Error('BPMN Gateway-Test fehlgeschlagen: Gateway-Shape oder isMarkerVisible fehlt');
    }
    console.log('✓ Gateway-Shape mit isMarkerVisible="true" gefunden');

    console.log('✓ BPMN Gateway-Export Test erfolgreich');
  }

  console.log('\n24. XOR-Decision mit Loop für BPMN-Loop-Test hinzufügen...');
  const happyPathStepsForLoop = wizardVersionAfterKpis.sidecar.captureDraft?.happyPath || [];
  if (happyPathStepsForLoop.length < 4) {
    console.log('WARNUNG: Nicht genug Schritte für Loop-Test, wird übersprungen');
  } else {
    const afterStepId = happyPathStepsForLoop[2].stepId;
    const loopBackToStepId = happyPathStepsForLoop[0].stepId;
    const forwardStepId = happyPathStepsForLoop[3].stepId;

    const loopDecision = {
      decisionId: crypto.randomUUID(),
      afterStepId,
      gatewayType: 'xor' as const,
      question: 'Nacharbeit erforderlich?',
      branches: [
        {
          branchId: crypto.randomUUID(),
          conditionLabel: 'Nacharbeit',
          nextStepId: loopBackToStepId,
          endsProcess: false,
        },
        {
          branchId: crypto.randomUUID(),
          conditionLabel: 'OK',
          nextStepId: forwardStepId,
          endsProcess: false,
        },
      ],
    };

    const wizardVersionWithLoop = await updateVersion(
      wizardProcess.processId,
      wizardVersion.versionId,
      {
        sidecar: {
          ...wizardVersionAfterKpis.sidecar,
          captureDraft: {
            ...wizardVersionAfterKpis.sidecar.captureDraft!,
            decisions: [loopDecision],
          },
        },
      }
    );
    console.log('Loop-Decision hinzugefügt:', loopDecision.question);

    console.log('\n25. BPMN mit Loop exportieren...');
    const bpmnWithLoopResult = buildBpmnXmlFromDraft(wizardProcess, wizardVersionWithLoop);
    console.log('BPMN Warnings mit Loop:', bpmnWithLoopResult.warnings.length);
    if (bpmnWithLoopResult.warnings.length > 0) {
      bpmnWithLoopResult.warnings.forEach((w) => console.log('  -', w));
    }

    if (!bpmnWithLoopResult.xml.includes('<bpmn:exclusiveGateway')) {
      throw new Error('BPMN Loop-Test fehlgeschlagen: Kein exclusiveGateway im XML gefunden');
    }
    console.log('✓ exclusiveGateway im XML gefunden');

    if (!bpmnWithLoopResult.xml.includes('name="Nacharbeit"')) {
      throw new Error('BPMN Loop-Test fehlgeschlagen: Branch-Name "Nacharbeit" nicht im XML gefunden');
    }
    console.log('✓ Branch-Flow mit name="Nacharbeit" gefunden');

    const taskIdForStep0 = `Task_${loopBackToStepId}`;
    const hasLoopBack = bpmnWithLoopResult.xml.includes(`targetRef="${taskIdForStep0}"`);
    if (!hasLoopBack) {
      throw new Error('BPMN Loop-Test fehlgeschlagen: Loop zurück zu Step 0 nicht gefunden');
    }
    console.log(`✓ Loop zurück zu ${taskIdForStep0} gefunden`);

    const hasLoopWarning = bpmnWithLoopResult.warnings.some((w) =>
      w.includes('führt zurück') && w.includes('Schleifen werden exportiert')
    );
    if (!hasLoopWarning) {
      throw new Error('BPMN Loop-Test fehlgeschlagen: Loop-Warning fehlt');
    }
    console.log('✓ Loop-Warning vorhanden');

    console.log('✓ BPMN Loop-Export Test erfolgreich');
  }

  console.log('\n26. Exception für BPMN-Boundary-Event-Test hinzufügen...');
  const happyPathForException = wizardVersionAfterHappyPath.sidecar.captureDraft?.happyPath || [];
  if (happyPathForException.length < 2) {
    console.log('WARNUNG: Nicht genug Schritte für Exception-Test, wird übersprungen');
  } else {
    const relatedStepId = happyPathForException[1].stepId;

    const testException = {
      exceptionId: crypto.randomUUID(),
      relatedStepId,
      type: 'timeout' as const,
      description: 'System antwortet nicht',
      handling: 'Ticket erstellen und manuell fortsetzen',
    };

    const wizardVersionWithException = await updateVersion(
      wizardProcess.processId,
      wizardVersion.versionId,
      {
        sidecar: {
          ...wizardVersionAfterHappyPath.sidecar,
          captureDraft: {
            ...wizardVersionAfterHappyPath.sidecar.captureDraft!,
            exceptions: [testException],
          },
        },
      }
    );
    console.log('Exception hinzugefügt:', testException.description);

    console.log('\n27. BPMN mit Boundary Event exportieren...');
    const bpmnWithExceptionResult = buildBpmnXmlFromDraft(wizardProcess, wizardVersionWithException);
    console.log('BPMN Warnings mit Exception:', bpmnWithExceptionResult.warnings.length);
    if (bpmnWithExceptionResult.warnings.length > 0) {
      bpmnWithExceptionResult.warnings.forEach((w) => console.log('  -', w));
    }

    if (!bpmnWithExceptionResult.xml.includes('<bpmn:boundaryEvent')) {
      throw new Error('BPMN Exception-Test fehlgeschlagen: Kein boundaryEvent im XML gefunden');
    }
    console.log('✓ boundaryEvent im XML gefunden');

    if (!bpmnWithExceptionResult.xml.includes('attachedToRef="Task_')) {
      throw new Error('BPMN Exception-Test fehlgeschlagen: attachedToRef nicht gefunden');
    }
    console.log('✓ attachedToRef im boundaryEvent gefunden');

    if (!bpmnWithExceptionResult.xml.includes('<bpmn:timerEventDefinition')) {
      throw new Error('BPMN Exception-Test fehlgeschlagen: timerEventDefinition nicht gefunden');
    }
    console.log('✓ timerEventDefinition für timeout-Exception gefunden');

    if (!bpmnWithExceptionResult.xml.includes('EndEvent_Exception_')) {
      throw new Error('BPMN Exception-Test fehlgeschlagen: Exception End Event nicht gefunden');
    }
    console.log('✓ Exception End Event gefunden');

    const hasTimeoutWarning = bpmnWithExceptionResult.warnings.some((w) =>
      w.includes('Timeout nutzt Default PT1H')
    );
    if (!hasTimeoutWarning) {
      throw new Error('BPMN Exception-Test fehlgeschlagen: Timeout-Warning fehlt');
    }
    console.log('✓ Timeout-Warning vorhanden');

    console.log('✓ BPMN Exception-Export Test erfolgreich');
  }

  console.log('\n=== EXPORT/IMPORT TEST ===');

  console.log('\n28. Prozess exportieren...');
  const bundle = await exportProcessBundle(process.processId);
  console.log('Bundle exportiert, schemaVersion:', bundle.schemaVersion);
  console.log('Export enthält Prozess:', bundle.process.title);
  console.log('Export enthält Versionen:', bundle.versions.length);

  console.log('\n29. Bundle parsen...');
  const bundleJson = JSON.stringify(bundle);
  const parsedBundle = parseProcessBundle(bundleJson);
  console.log('Bundle geparst, schemaVersion:', parsedBundle.schemaVersion);
  console.log('Geparster Prozess:', parsedBundle.process.title);
  console.log('Geparste Versionen:', parsedBundle.versions.length);

  console.log('\n30. Bundle importieren...');
  const importResult = await importProcessBundleToProject(project.projectId, parsedBundle);
  console.log('Import abgeschlossen, neue processId:', importResult.processId);
  console.log('Importierte Versionen:', importResult.importedVersionCount);
  console.log('Warnungen:', importResult.warnings.length);
  if (importResult.warnings.length > 0) {
    importResult.warnings.forEach((w) => console.log('  -', w));
  }

  console.log('\n31. Importierten Prozess validieren...');
  if (importResult.processId === process.processId) {
    throw new Error('Import Test fehlgeschlagen: processId sollte sich unterscheiden');
  }
  console.log('✓ Neue processId wurde vergeben');

  const importedProcess = await getProcess(importResult.processId);
  if (!importedProcess) {
    throw new Error('Import Test fehlgeschlagen: Importierter Prozess nicht gefunden');
  }
  console.log('✓ Importierter Prozess gefunden:', importedProcess.title);

  const importedVersions = await listVersions(importResult.processId);
  if (importedVersions.length !== importResult.importedVersionCount) {
    throw new Error(`Import Test fehlgeschlagen: Erwartete ${importResult.importedVersionCount} Versionen, gefunden: ${importedVersions.length}`);
  }
  console.log('✓ Alle Versionen wurden importiert');

  console.log('\n✓ Export/Import Test erfolgreich');

  console.log('\n=== PROJECT EXPORT/IMPORT TEST ===');

  console.log('\n32. Projekt exportieren...');
  const projectBundle = await exportProjectBundle(project.projectId);
  console.log('Projekt-Bundle exportiert, schemaVersion:', projectBundle.schemaVersion);
  console.log('Export enthält Projekt:', projectBundle.project.name);
  console.log('Export enthält Prozesse:', projectBundle.processes.length);
  console.log('Export enthält Versionen:', projectBundle.versions.length);

  console.log('\n33. Projekt-Bundle parsen...');
  const projectBundleJson = JSON.stringify(projectBundle);
  const parsedProjectBundle = parseProjectBundle(projectBundleJson);
  console.log('Projekt-Bundle geparst, schemaVersion:', parsedProjectBundle.schemaVersion);
  console.log('Geparster Projektname:', parsedProjectBundle.project.name);
  console.log('Geparste Prozesse:', parsedProjectBundle.processes.length);
  console.log('Geparste Versionen:', parsedProjectBundle.versions.length);

  console.log('\n34. Projekt-Bundle importieren...');
  const projectImportResult = await importProjectBundleAsNewProject(parsedProjectBundle);
  console.log('Projekt-Import abgeschlossen, neue projectId:', projectImportResult.projectId);
  console.log('Importierte Prozesse:', projectImportResult.importedProcessCount);
  console.log('Importierte Versionen:', projectImportResult.importedVersionCount);
  console.log('Warnungen:', projectImportResult.warnings.length);
  if (projectImportResult.warnings.length > 0) {
    projectImportResult.warnings.forEach((w) => console.log('  -', w));
  }

  console.log('\n35. Importiertes Projekt validieren...');
  if (projectImportResult.projectId === project.projectId) {
    throw new Error('Projekt-Import Test fehlgeschlagen: projectId sollte sich unterscheiden');
  }
  console.log('✓ Neue projectId wurde vergeben');

  const importedProject = await getProject(projectImportResult.projectId);
  if (!importedProject) {
    throw new Error('Projekt-Import Test fehlgeschlagen: Importiertes Projekt nicht gefunden');
  }
  console.log('✓ Importiertes Projekt gefunden:', importedProject.name);

  const importedProcesses = await listProcesses(projectImportResult.projectId);
  if (importedProcesses.length !== projectImportResult.importedProcessCount) {
    throw new Error(`Projekt-Import Test fehlgeschlagen: Erwartete ${projectImportResult.importedProcessCount} Prozesse, gefunden: ${importedProcesses.length}`);
  }
  console.log('✓ Alle Prozesse wurden importiert');

  let totalImportedVersions = 0;
  for (const proc of importedProcesses) {
    const procVersions = await listVersions(proc.processId);
    totalImportedVersions += procVersions.length;
  }
  if (totalImportedVersions !== projectImportResult.importedVersionCount) {
    throw new Error(`Projekt-Import Test fehlgeschlagen: Erwartete ${projectImportResult.importedVersionCount} Versionen, gefunden: ${totalImportedVersions}`);
  }
  console.log('✓ Alle Versionen wurden importiert');

  console.log('\n✓ Projekt Export/Import Test erfolgreich');

  console.log('\n=== VERSION CLONE TEST ===');

  console.log('\n36. Version mit BPMN XML für Clone-Test vorbereiten...');
  const cloneTestProcess = await createProcess(project.projectId, {
    title: 'Clone Test Prozess',
    category: 'kern',
    managementLevel: 'fachlich',
    hierarchyLevel: 'hauptprozess',
    parentProcessId: null,
  });

  const cloneTestVersion = await createVersion(cloneTestProcess.processId, {
    status: 'draft',
    titleSnapshot: cloneTestProcess.title,
    endToEndDefinition: {
      trigger: 'Start',
      customer: 'Kunde',
      outcome: 'Ende',
    },
    sidecar: {
      roles: [{ id: crypto.randomUUID(), name: 'Rolle 1', kind: 'role' }],
      systems: [],
      dataObjects: [],
      kpis: [],
      captureDraft: {
        draftVersion: 'capture-draft-v1',
        happyPath: [
          {
            stepId: crypto.randomUUID(),
            order: 1,
            label: 'Schritt 1',
            workType: 'user_task',
          },
        ],
        decisions: [],
        exceptions: [],
      },
    },
    bpmn: {
      diagramType: 'collaboration',
      bpmnXml: '<bpmn:definitions>Test XML</bpmn:definitions>',
      lastExportedAt: new Date().toISOString(),
    },
  });
  console.log('Clone-Test-Version erstellt mit BPMN XML');

  console.log('\n37. Version duplizieren mit resetBpmnXml=true...');
  const clonedVersion = await cloneVersion(cloneTestProcess.processId, cloneTestVersion.versionId, {
    titleSnapshot: cloneTestProcess.title,
    status: 'draft',
    resetBpmnXml: true,
  });
  console.log('Version geklont, neue versionId:', clonedVersion.versionId);

  console.log('\n38. Klon validieren...');
  if (clonedVersion.versionId === cloneTestVersion.versionId) {
    throw new Error('Clone Test fehlgeschlagen: versionId sollte sich unterscheiden');
  }
  console.log('✓ Neue versionId wurde vergeben');

  if (!clonedVersion.sidecar.captureDraft || clonedVersion.sidecar.captureDraft.happyPath.length === 0) {
    throw new Error('Clone Test fehlgeschlagen: captureDraft wurde nicht kopiert');
  }
  console.log('✓ captureDraft wurde kopiert, Schritte:', clonedVersion.sidecar.captureDraft.happyPath.length);

  if (clonedVersion.bpmn.bpmnXml !== undefined) {
    throw new Error('Clone Test fehlgeschlagen: bpmnXml sollte zurückgesetzt sein');
  }
  console.log('✓ bpmnXml wurde zurückgesetzt');

  if (clonedVersion.bpmn.lastExportedAt !== undefined) {
    throw new Error('Clone Test fehlgeschlagen: lastExportedAt sollte zurückgesetzt sein');
  }
  console.log('✓ lastExportedAt wurde zurückgesetzt');

  if (cloneTestVersion.bpmn.bpmnXml === undefined) {
    throw new Error('Clone Test fehlgeschlagen: Original bpmnXml wurde gelöscht');
  }
  console.log('✓ Original-Version bpmnXml ist weiterhin vorhanden');

  if (clonedVersion.sidecar.roles.length !== cloneTestVersion.sidecar.roles.length) {
    throw new Error('Clone Test fehlgeschlagen: Rollen wurden nicht vollständig kopiert');
  }
  console.log('✓ Rollen wurden korrekt kopiert');

  console.log('\n39. Version duplizieren mit resetBpmnXml=false...');
  const clonedVersionWithXml = await cloneVersion(cloneTestProcess.processId, cloneTestVersion.versionId, {
    titleSnapshot: cloneTestProcess.title,
    status: 'draft',
    resetBpmnXml: false,
  });

  if (clonedVersionWithXml.bpmn.bpmnXml === undefined) {
    throw new Error('Clone Test fehlgeschlagen: bpmnXml sollte vorhanden sein bei resetBpmnXml=false');
  }
  console.log('✓ bpmnXml wurde mit resetBpmnXml=false beibehalten');

  console.log('\n✓ Version Clone Test erfolgreich');

  console.log('\n=== Storage Self-Test erfolgreich abgeschlossen ===');
}
