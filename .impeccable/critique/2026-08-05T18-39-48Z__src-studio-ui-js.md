---
target: Marketing Studio AI workflow proposal redesign
total_score: 37
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 0
timestamp: 2026-08-05T18-39-48Z
slug: src-studio-ui-js
---
Method: single-context review against PRODUCT.md, DESIGN.md, rendered screenshots, and the live interaction path.

⚠️ DEGRADED: single-context. Sub-agents were not authorized for this turn, so the two independent assessments normally preferred by the critique playbook were not run.

## Design Health Score

| # | Heuristic | Score | Evidence |
|---|---|---:|---|
| 1 | Visibility of system status | 4 | The proposal says nothing has run, shows readiness beside the route, and freezes the version only at the run action. |
| 2 | Match system / real world | 4 | The UI speaks in production terms: route, shot, subject conditioning, model runtime, graph, seed, render, and review. |
| 3 | User control and freedom | 4 | New video, revise plan, inspect, manual fallback, and explicit run remain available without silent execution. |
| 4 | Consistency and standards | 3 | The proposal follows the studio's type, color, spacing, and evidence language; the older manual planner remains a denser neighboring surface. |
| 5 | Error prevention | 4 | Exact model, graph, prompt, seed, resource envelope, and missing-reference blockers are visible before execution. |
| 6 | Recognition rather than recall | 4 | Model, lane, format, seed, four phases, and the direct-plan prompt stay visible on one route. |
| 7 | Flexibility and efficiency | 3 | AI selection is one click to run, revisions are direct text instructions, and expert details are progressively disclosed. |
| 8 | Aesthetic and minimalist design | 4 | One continuous evidence beam replaces the rejected stack of equal-weight cards and repeated form chrome. |
| 9 | Error recovery | 3 | Readiness blockers and revision feedback are clear; render recovery remains owned by the existing production review flow. |
| 10 | Help and documentation | 4 | Inline copy explains what is frozen, what each phase does, and why an MLX route cannot expose a Comfy graph. |
| **Total** |  | **37/40** | **Strong and product-specific.** |

## Design Specificity Verdict

Pass. The workflow proposal now looks and behaves like a film-production route rather than a generic AI settings dashboard. The evidence beam, pinned machinery, staged handoff, and frozen-version contract are specific to Reel Pipeline's operating model.

Rendered evidence: `artifacts/design/local-workflow-proposal/after-390.png`, `after-768.png`, and `after-1440.png`. All three use the live persisted Night Out proposal. Exact viewport checks reported zero horizontal overflow.

## What's Working

- The primary task is unmistakable: inspect the proposed route, optionally revise it, then run exactly that version.
- Mobile converts the horizontal evidence beam into a legible vertical production timeline without losing phase ownership or detail.
- The inspector truthfully distinguishes the pinned MLX runtime from a Comfy-backed preview graph.
- Technical facts remain scannable without becoming a wall of bordered cards.

## Priority Issues

No unresolved P0 or P1 issues.

### [P3] Manual fallback is deliberately visually distant

The manual planner disclosure sits below the proposal with substantial whitespace. This reinforces the AI-first route, but users who habitually use manual planning may take an extra moment to find it. Keep unless owner feedback says the fallback should carry more weight.

## Persona Red Flags

- **First-time creator:** The route explains itself before running and exposes one obvious primary action.
- **Power operator:** Exact model, seed, runtime, graph scope, and direct revision remain one disclosure or command away.
- **Keyboard or touch user:** Primary controls meet 44px targets, focus treatment is visible, and the 390px layout has no horizontal overflow.

## Questions to Consider

- Should the manual production planner remain this quiet, or should it appear as a secondary action beside New video?

Questions skipped during implementation because the preserve-lane direction and AI-first hierarchy are already fixed by PRODUCT.md and DESIGN.md; owner review is still required before this design can be called complete.
