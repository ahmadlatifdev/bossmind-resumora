/**
 * Essential Advanced interview preparation library (EN/FR).
 * Served only to entitled clients via /api/essential-advanced/* and /studio/essential-advanced.
 * Premium videos: config/resumora-essential-advanced-videos.json (gated embed via video-delivery.js).
 */

const { listVideoModules, sanitizeVideosForClient } = require("./video-delivery");

const VIDEO_MODULES = listVideoModules();

const SIMULATION_SESSIONS = [
  {
    id: "sim_general_management",
    title: { en: "General Management Simulation", fr: "Simulation direction générale" },
    level: { en: "Advanced", fr: "Avancé" },
    questions: [
      {
        q: {
          en: "Tell us about a time you drove a cross-functional initiative with unclear ownership.",
          fr: "Parlez d'une initiative transverse dont la responsabilité était floue.",
        },
        a: {
          en: "Frame mandate, stakeholders, your decision trail, metrics moved, and lessons.",
          fr: "Cadrez mandat, parties prenantes, décisions, métriques et apprentissages.",
        },
      },
      {
        q: {
          en: "How do you prioritize when three executives want conflicting deliverables?",
          fr: "Comment priorisez-vous quand trois dirigeants veulent des livrables contradictoires ?",
        },
        a: {
          en: "Show escalation criteria, trade-off matrix, and communication rhythm.",
          fr: "Montrez critères d'escalade, arbitrage et rythme de communication.",
        },
      },
      {
        q: {
          en: "Describe a failure you owned and how you recovered credibility.",
          fr: "Décrivez un échec assumé et la reprise de crédibilité.",
        },
        a: {
          en: "Use STAR; emphasize accountability without blame-shifting.",
          fr: "Utilisez STAR ; responsabilité sans renvoyer la faute.",
        },
      },
    ],
  },
  {
    id: "sim_technical_leadership",
    title: { en: "Technical Leadership Simulation", fr: "Simulation leadership technique" },
    level: { en: "Advanced", fr: "Avancé" },
    questions: [
      {
        q: {
          en: "Walk us through a system design trade-off you defended to non-technical stakeholders.",
          fr: "Expliquez un arbitrage d'architecture défendu auprès de non-techniques.",
        },
        a: {
          en: "Translate constraints, risk, cost, and user impact in business terms.",
          fr: "Traduisez contraintes, risque, coût et impact métier.",
        },
      },
      {
        q: {
          en: "How do you coach underperformers without slowing delivery?",
          fr: "Comment coachez-vous sans ralentir la livraison ?",
        },
        a: {
          en: "30/60/90 coaching plan, measurable behaviors, and checkpoint reviews.",
          fr: "Plan 30/60/90, comportements mesurables, revues jalons.",
        },
      },
      {
        q: {
          en: "Tell us about a production incident you led end-to-end.",
          fr: "Incident production mené de bout en bout.",
        },
        a: {
          en: "Detection, comms, mitigation, postmortem, prevention backlog.",
          fr: "Détection, communication, mitigation, post-mortem, prévention.",
        },
      },
    ],
  },
  {
    id: "sim_executive_panel",
    title: { en: "Executive Panel Simulation", fr: "Simulation panel exécutif" },
    level: { en: "Executive", fr: "Exécutif" },
    questions: [
      {
        q: {
          en: "Why this company, this role, and why now?",
          fr: "Pourquoi cette entreprise, ce rôle, maintenant ?",
        },
        a: {
          en: "Tie market thesis, your proof stack, and 12-month value hypothesis.",
          fr: "Thèse marché, preuves, hypothèse de valeur à 12 mois.",
        },
      },
      {
        q: {
          en: "What would you accomplish in the first 90 days?",
          fr: "Réalisations visées dans les 90 premiers jours ?",
        },
        a: {
          en: "Listen/learn, quick wins, structural bets—each with KPIs.",
          fr: "Écoute, victoires rapides, paris structurels avec KPI.",
        },
      },
      {
        q: {
          en: "How do you handle board-level scrutiny on margin and growth?",
          fr: "Comment gérez-vous la pression marge/croissance au niveau conseil ?",
        },
        a: {
          en: "Scenario planning, unit economics, transparent reporting cadence.",
          fr: "Scénarios, économie unitaire, reporting transparent.",
        },
      },
    ],
  },
];

const QA_CATEGORIES = [
  {
    key: "behavioral",
    label: { en: "Behavioral", fr: "Comportemental" },
    seeds: [
      {
        en: ["leadership under pressure", "conflict resolution", "mentoring success", "stakeholder alignment"],
        fr: ["leadership sous pression", "résolution de conflit", "mentorat réussi", "alignement parties prenantes"],
      },
    ],
  },
  {
    key: "situational",
    label: { en: "Situational", fr: "Situationnel" },
    seeds: [
      {
        en: ["tight deadline", "ambiguous mandate", "budget cut", "priority shift"],
        fr: ["délai serré", "mandat ambigu", "coupe budgétaire", "changement de priorité"],
      },
    ],
  },
  {
    key: "competency",
    label: { en: "Competency", fr: "Compétence" },
    seeds: [
      {
        en: ["data-driven decision", "innovation", "client recovery", "process improvement"],
        fr: ["décision data-driven", "innovation", "récupération client", "amélioration processus"],
      },
    ],
  },
  {
    key: "executive",
    label: { en: "Executive", fr: "Exécutif" },
    seeds: [
      {
        en: ["P&L ownership", "org design", "M&A integration", "culture transformation"],
        fr: ["responsabilité P&L", "design organisationnel", "intégration M&A", "transformation culturelle"],
      },
    ],
  },
];

function buildQaBank() {
  const bank = [];
  let n = 0;
  for (const cat of QA_CATEGORIES) {
    for (const seedGroup of cat.seeds) {
      for (let i = 0; i < seedGroup.en.length; i++) {
        const topicEn = seedGroup.en[i];
        const topicFr = seedGroup.fr[i];
        bank.push({
          id: `qa_${cat.key}_${n + 1}`,
          category: cat.key,
          categoryLabel: cat.label,
          q: {
            en: `Describe a professional situation involving ${topicEn}. What was your approach and outcome?`,
            fr: `Décrivez une situation professionnelle liée à ${topicFr}. Approche et résultat ?`,
          },
          a: {
            en: `Use STAR: quantify impact, name stakeholders, and state what you would repeat or change.`,
            fr: `Utilisez STAR : impact chiffré, parties prenantes, ce que vous referiez ou changeriez.`,
          },
        });
        n += 1;
      }
    }
  }
  const extras = [
    {
      en: "What is your greatest professional strength?",
      fr: "Quelle est votre plus grande force professionnelle ?",
      aEn: "One strength, two proof points, relevance to role.",
      aFr: "Une force, deux preuves, pertinence au rôle.",
    },
    {
      en: "What area are you actively improving?",
      fr: "Quel axe améliorez-vous activement ?",
      aEn: "Honest gap, actions taken, measurable progress.",
      aFr: "Écart honnête, actions, progrès mesurable.",
    },
    {
      en: "Why should we hire you over other finalists?",
      fr: "Pourquoi vous plutôt que les autres finalistes ?",
      aEn: "Differentiated value, risk reduction, cultural fit proof.",
      aFr: "Valeur différenciée, réduction du risque, adéquation culturelle.",
    },
    {
      en: "Tell me about yourself.",
      fr: "Parlez-moi de vous.",
      aEn: "Present → relevant past → future fit in under 2 minutes.",
      aFr: "Présent → passé pertinent → adéquation future en moins de 2 minutes.",
    },
    {
      en: "Where do you see yourself in five years?",
      fr: "Où vous voyez-vous dans cinq ans ?",
      aEn: "Growth aligned to company trajectory, not generic titles.",
      aFr: "Croissance alignée à la trajectoire de l'entreprise.",
    },
  ];
  for (const ex of extras) {
    bank.push({
      id: `qa_extra_${bank.length + 1}`,
      category: "core",
      categoryLabel: { en: "Core", fr: "Fondamental" },
      q: { en: ex.en, fr: ex.fr },
      a: { en: ex.aEn, fr: ex.aFr },
    });
  }
  while (bank.length < 60) {
    const i = bank.length + 1;
    bank.push({
      id: `qa_gen_${i}`,
      category: "practice",
      categoryLabel: { en: "Practice", fr: "Pratique" },
      q: {
        en: `Practice question ${i}: How do you demonstrate ownership in complex projects?`,
        fr: `Question pratique ${i} : Comment démontrez-vous l'appropriation sur projets complexes ?`,
      },
      a: {
        en: "Cite scope, decisions, metrics, and stakeholder feedback.",
        fr: "Citez périmètre, décisions, métriques et retours parties prenantes.",
      },
    });
  }
  return bank.slice(0, 60);
}

const SUCCESS_TIPS = [
  { id: "tip_01", text: { en: "Research the panel on LinkedIn and recent company news.", fr: "Renseignez-vous sur le panel et l'actualité de l'entreprise." } },
  { id: "tip_02", text: { en: "Prepare three STAR stories adaptable to multiple prompts.", fr: "Préparez trois histoires STAR réutilisables." } },
  { id: "tip_03", text: { en: "Bring a one-page role-aligned achievement brief.", fr: "Apportez une page de réalisations alignées au rôle." } },
  { id: "tip_04", text: { en: "Test audio/video 24 hours before virtual panels.", fr: "Testez audio/vidéo 24 h avant un panel virtuel." } },
  { id: "tip_05", text: { en: "Use the interviewer’s name once early—never overuse.", fr: "Utilisez le nom de l'intervieweur une fois—sans excès." } },
  { id: "tip_06", text: { en: "Pause two seconds before answering executive questions.", fr: "Pause de deux secondes avant les questions exécutives." } },
  { id: "tip_07", text: { en: "Quantify outcomes: %, $, time saved, risk reduced.", fr: "Quantifiez : %, $, temps gagné, risque réduit." } },
  { id: "tip_08", text: { en: "Ask clarifying questions before diving into long answers.", fr: "Posez des questions de clarification avant une longue réponse." } },
  { id: "tip_09", text: { en: "Mirror the company’s values with specific examples.", fr: "Reflétez les valeurs de l'entreprise avec des exemples." } },
  { id: "tip_10", text: { en: "Prepare thoughtful questions about success metrics.", fr: "Préparez des questions sur les métriques de succès." } },
  { id: "tip_11", text: { en: "Dress one notch above the role’s daily standard.", fr: "Habillez-vous un cran au-dessus du standard quotidien." } },
  { id: "tip_12", text: { en: "Send a concise thank-you within 12 hours.", fr: "Remerciement concis sous 12 heures." } },
  { id: "tip_13", text: { en: "Avoid speaking negatively about former employers.", fr: "Évitez de parler négativement des anciens employeurs." } },
  { id: "tip_14", text: { en: "Practice aloud—silent reading is insufficient.", fr: "Pratiquez à voix haute—la lecture silencieuse ne suffit pas." } },
  { id: "tip_15", text: { en: "Map your résumé bullets to likely interview themes.", fr: "Mappez vos points CV aux thèmes d'entretien probables." } },
  { id: "tip_16", text: { en: "Prepare a 30-second and 90-second ‘tell me about yourself’.", fr: "Préparez « parlez-moi de vous » en 30 et 90 secondes." } },
  { id: "tip_17", text: { en: "Know your compensation range and non-negotiables.", fr: "Connaissez votre fourchette et vos non-négociables." } },
  { id: "tip_18", text: { en: "Use structured note-taking during multi-person panels.", fr: "Notes structurées pendant les panels multi-personnes." } },
  { id: "tip_19", text: { en: "Close with clear interest and next-step alignment.", fr: "Clôturez avec intérêt clair et prochaines étapes." } },
  { id: "tip_20", text: { en: "Review your Resumora dossier so stories stay consistent.", fr: "Relisez votre dossier Resumora pour rester cohérent." } },
  { id: "tip_21", text: { en: "Sleep and hydration affect executive presence—plan ahead.", fr: "Sommeil et hydratation influencent la présence—anticipez." } },
  { id: "tip_22", text: { en: "Record a mock interview and review filler words.", fr: "Enregistrez un entretien simulé et réduisez les tics verbaux." } },
];

const EXECUTIVE_SECTION = {
  id: "executive_interview",
  title: { en: "Executive Interview Preparation", fr: "Préparation entretien exécutif" },
  modules: [
    {
      id: "exec_board",
      title: { en: "Board & C-Suite Readiness", fr: "Préparation conseil et C-suite" },
      body: {
        en: "Focus on capital allocation, talent density, and strategic narrative. Every answer should connect to enterprise value.",
        fr: "Focus sur allocation du capital, densité de talents et récit stratégique. Chaque réponse relie à la valeur entreprise.",
      },
    },
    {
      id: "exec_story",
      title: { en: "Strategic Storyline", fr: "Récit stratégique" },
      body: {
        en: "Prepare a 3-act career arc: builder → scaler → transformer. Tie each act to metrics and culture outcomes.",
        fr: "Arc 3 actes : bâtisseur → accélérateur → transformateur, avec métriques et culture.",
      },
    },
    {
      id: "exec_risk",
      title: { en: "Risk & Governance", fr: "Risque et gouvernance" },
      body: {
        en: "Anticipate questions on compliance, ethics, and downside scenarios. Show proactive controls, not defensiveness.",
        fr: "Anticipez conformité, éthique et scénarios défavorables. Contrôles proactifs, pas défensif.",
      },
    },
  ],
};

const DOWNLOADS = [
  {
    id: "dl_star_workbook",
    filename: "resumora-star-interview-workbook.md",
    title: { en: "STAR Method Workbook", fr: "Classeur méthode STAR" },
    mime: "text/markdown; charset=utf-8",
  },
  {
    id: "dl_qa_master",
    filename: "resumora-interview-qa-master.md",
    title: { en: "Interview Q&A Master List", fr: "Liste maître Q&R entretien" },
    mime: "text/markdown; charset=utf-8",
  },
  {
    id: "dl_executive_playbook",
    filename: "resumora-executive-interview-playbook.md",
    title: { en: "Executive Interview Playbook", fr: "Playbook entretien exécutif" },
    mime: "text/markdown; charset=utf-8",
  },
  {
    id: "dl_checklist",
    filename: "resumora-interview-day-checklist.md",
    title: { en: "Interview Day Checklist", fr: "Liste du jour J" },
    mime: "text/markdown; charset=utf-8",
  },
];

const QA_BANK = buildQaBank();

function allAssetKeys() {
  const keys = [];
  for (const v of VIDEO_MODULES) keys.push(v.id);
  for (const s of SIMULATION_SESSIONS) keys.push(s.id);
  for (const q of QA_BANK) keys.push(q.id);
  for (const t of SUCCESS_TIPS) keys.push(t.id);
  for (const m of EXECUTIVE_SECTION.modules) keys.push(m.id);
  for (const d of DOWNLOADS) keys.push(d.id);
  return keys;
}

function getInterviewPrepCatalog(lang = "en") {
  const L = lang === "fr" ? "fr" : "en";
  return {
    version: 1,
    planId: "essential_advanced",
    counts: {
      videos: VIDEO_MODULES.length,
      simulations: SIMULATION_SESSIONS.length,
      qa: QA_BANK.length,
      tips: SUCCESS_TIPS.length,
      downloads: DOWNLOADS.length,
    },
    videos: sanitizeVideosForClient(L),
    simulations: SIMULATION_SESSIONS,
    qaBank: QA_BANK,
    tips: SUCCESS_TIPS,
    executive: EXECUTIVE_SECTION,
    downloads: DOWNLOADS.map((d) => ({
      ...d,
      title: d.title[L],
    })),
    assetKeys: allAssetKeys(),
  };
}

function renderDownload(assetId, lang = "en") {
  const L = lang === "fr" ? "fr" : "en";
  if (assetId === "dl_star_workbook") {
    return `# ${L === "fr" ? "Classeur STAR — Resumora Essential Advanced" : "STAR Workbook — Resumora Essential Advanced"}

## ${L === "fr" ? "Situation" : "Situation"}
- ${L === "fr" ? "Contexte, enjeu, parties prenantes" : "Context, stakes, stakeholders"}

## ${L === "fr" ? "Tâche" : "Task"}
- ${L === "fr" ? "Votre responsabilité explicite" : "Your explicit responsibility"}

## ${L === "fr" ? "Action" : "Action"}
- ${L === "fr" ? "Décisions, influence, exécution" : "Decisions, influence, execution"}

## ${L === "fr" ? "Résultat" : "Result"}
- ${L === "fr" ? "Métriques, apprentissages, répétabilité" : "Metrics, learnings, repeatability"}
`;
  }
  if (assetId === "dl_qa_master") {
    const lines = QA_BANK.map(
      (q, i) =>
        `### ${i + 1}. ${q.q[L]}\n\n**${L === "fr" ? "Réponse" : "Answer"}:** ${q.a[L]}\n`
    );
    return `# ${L === "fr" ? "Liste maître Q&R" : "Q&A Master List"}\n\n${lines.join("\n")}`;
  }
  if (assetId === "dl_executive_playbook") {
    const mods = EXECUTIVE_SECTION.modules
      .map((m) => `## ${m.title[L]}\n\n${m.body[L]}\n`)
      .join("\n");
    return `# ${EXECUTIVE_SECTION.title[L]}\n\n${mods}`;
  }
  if (assetId === "dl_checklist") {
    return `# ${L === "fr" ? "Liste du jour J" : "Interview Day Checklist"}

- [ ] ${L === "fr" ? "Relire le mandat et les métriques clés" : "Review role mandate and key metrics"}
- [ ] ${L === "fr" ? "Imprimer le brief de réalisations" : "Print achievement brief"}
- [ ] ${L === "fr" ? "Tester la technologie (si virtuel)" : "Test technology (if virtual)"}
- [ ] ${L === "fr" ? "Préparer 5 questions pour le panel" : "Prepare 5 questions for the panel"}
- [ ] ${L === "fr" ? "Planifier le suivi sous 12 h" : "Schedule follow-up within 12h"}
`;
  }
  return null;
}

module.exports = {
  VIDEO_MODULES,
  SIMULATION_SESSIONS,
  QA_BANK,
  SUCCESS_TIPS,
  EXECUTIVE_SECTION,
  DOWNLOADS,
  allAssetKeys,
  getInterviewPrepCatalog,
  renderDownload,
};
