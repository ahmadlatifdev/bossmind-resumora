# Golden baseline chrome captures for UI regression.

#

# Seed (after build on an approved design lock):

# powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\export-golden-baseline.ps1

#

# Compare:

# node scripts/ui-consistency-check.js --serve --compare-baseline artifacts/golden-baseline

#

# Align with git tag `v1.0.0-design-locked`. Refresh only with explicit approval

# or a PR titled with `[Intentional Design Change]`.
