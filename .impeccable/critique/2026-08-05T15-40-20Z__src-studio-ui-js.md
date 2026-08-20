---
target: Marketing Studio local video workflow post-fix
total_score: 32
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 0
timestamp: 2026-08-05T15-40-20Z
slug: src-studio-ui-js
---
Method: dual-agent (A: `/root/impeccable_assessment_a` · B: `/root/impeccable_assessment_b`)

## Design Health Score

| # | Heuristic | Score | Post-fix evidence |
|---|---|---:|---|
| 1 | Visibility of system status | 4 | Global request count, `aria-busy`, local progress, and ready timestamps cover asynchronous work. |
| 2 | Match system / real world | 3 | Film style language is consistent and versioned; expert production terms remain. |
| 3 | User control and freedom | 3 | Accept, Revise, Reject, retry, stop, and append-only decision history are explicit. |
| 4 | Consistency and standards | 4 | One canonical `name@version · readiness` contract persists through Create and review. |
| 5 | Error prevention | 3 | Model, storage, RAM, rights, and distribution gates fail closed before action. |
| 6 | Recognition rather than recall | 3 | Visible contracts and decision history keep production context available. |
| 7 | Flexibility and efficiency | 3 | Production search, quick/manual modes, and keyboard accelerators support repeat operators. |
| 8 | Aesthetic and minimalist design | 3 | Secondary episode controls are collapsed and browser overlay density defects are resolved. |
| 9 | Error recovery | 3 | Sanitized blockers, retry/revise controls, and preserved artifacts support recovery. |
| 10 | Help and documentation | 3 | Contextual Film-style help explains readiness and shortcuts without leaving the task. |
| **Total** |  | **32/40** | **Good; Fleet floor met.** |

## Design Specificity Verdict

The surface now presents Reel Pipeline's distinctive contract directly: a versioned Film style, local readiness, rights posture, reproducible evidence, and an explicit editorial decision. It remains a dense operator console by design, but it no longer reads as a generic AI-video prompt followed by hidden machine administration.

The deterministic CLI detector remained clean. Browser evidence at 390, 768, and 1440 pixels showed no horizontal overflow. Lighthouse accessibility and best-practices scores were 100. Browser-only overlay findings for edge spacing, excess shadow/glow, cramped summary padding, and line length were fixed; the hidden tiny-text and occlusion signals were false positives.

## What's Working

- Every selected style resolves to a canonical name, version, and readiness state before generation.
- Review ends with Accept, Revise, or Reject and retains append-only decision events bound to the artifact hash and brief revision.
- Global and local status feedback, keyboard focus, reduced motion, search, and progressive disclosure make a complex workflow operable.

## Priority Issues

No unresolved P0 or P1 issues.

### [P2] Dense episode work can still benefit from future batch review

The current serial flow is intentionally safe and reproducible, but expert operators may eventually want accept-all-passing or multi-shot selection after the real episode canary proves the quality gates.

### [P3] Historical missing local media creates harmless browser 404s

Some stale local production records point to files removed during storage cleanup. The UI remains functional; a future cleanup pass could mark those records unavailable before the browser requests them.

## Persona Red Flags

- **Alex, power operator:** Search and shortcuts improve speed; batch shot review remains the main efficiency gap.
- **Jordan, first-time operator:** Contextual Film-style help and sanitized readiness states now explain the path before generation.
- **Sam, keyboard and screen-reader operator:** Focus-visible, semantic controls, live status, `aria-busy`, and reduced-motion handling support the primary flow.

## Minor Observations

- The generic astronaut example remains intentionally neutral rather than source-backed.
- Existing local records with deleted media should eventually render an unavailable state without requesting the file.

## Questions to Consider

- After a real 2- to 3-minute canary, which review actions are safe to batch without weakening evidence?
- Should editor-package export become the visible reward immediately after Accept?

Questions skipped: the remaining findings are P2/P3 follow-ups outside the approved local-workflow implementation, and the preserve-lane direction is already fixed by PRODUCT.md and DESIGN.md.
