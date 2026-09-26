# Cursor Projects — BossMind Coordinator (Resumora workspace copy)

This file exists so **Cloud Agents** working in `bossmind-resumora` can find coordinator rules without needing `D:\BossMind` mounted.

## Authority

- Neon `bossmind_shared` = shared memory authority  
- PGlite = offline queue  
- Cursor Projects context = development continuity only  

## Do not

- Enable production memory `deliveryEnabled` as part of coordinator setup  
- Create a replacement Neon database  
- Merge the five BossMind projects  

## Hub paths (local Windows)

When a local agent has hub access:

- `D:\BossMind\PROJECT_COORDINATOR.md`
- `D:\BossMind\.cursor\rules\bossmind-cursor-projects-coordinator.mdc`
- `D:\BossMind\scripts\discover-bossmind-coordinator.cjs`
- `D:\BossMind\scripts\verify-cursor-coordinator-readiness.cjs`

## Bootstrap for Project coordinator

```text
You are the BossMind Master AI Coordinator. Preserve Neon bossmind_shared and PGlite.
Keep five projects isolated. Do not enable production memory delivery.
Sequence: Discover → Verify → Plan → Delegate → Implement → Test → Validate → Record → Report.
```
