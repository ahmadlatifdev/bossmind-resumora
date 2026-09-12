type Chip = {
  id: string;
  label: string;
  prompt: string;
};

const CHIPS: Chip[] = [
  {
    id: 'fix-build',
    label: 'Fix Build',
    prompt:
      'Diagnose and propose a fix for the current npm run build failures. Summarize before mutating.',
  },
  {
    id: 'deploy-staging',
    label: 'Deploy Staging',
    prompt:
      'Prepare a staging Hosting deploy. List the exact steps and wait for approval before deployHosting.',
  },
  {
    id: 'update-manual',
    label: 'Update Manual',
    prompt:
      'Regenerate or update the BossMind system manual. Confirm changes before regenerateManual.',
  },
  {
    id: 'run-health',
    label: 'Run Health Check',
    prompt: 'Run a system health cycle and summarize score, findings, and next checklist items.',
  },
  {
    id: 'edit-page',
    label: 'Edit Page',
    prompt:
      'Propose an edit to a specific admin or client page. Show a pending change card before writeFile.',
  },
  {
    id: 'view-logs',
    label: 'View Logs',
    prompt: 'Summarize recent harness_audit_log and system health incidents. Read-only.',
  },
];

type Props = {
  onAction: (prompt: string) => void;
  disabled?: boolean;
};

export default function AdminHarnessToolbar({ onAction, disabled }: Props) {
  return (
    <div className="admin-harness-toolbar" role="toolbar" aria-label="Admin harness quick actions">
      {CHIPS.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className="admin-harness-toolbar__chip"
          disabled={disabled}
          title={chip.prompt}
          onClick={() => onAction(chip.prompt)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
