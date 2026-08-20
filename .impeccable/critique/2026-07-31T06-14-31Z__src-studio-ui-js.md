---
target: Unified Marketing Studio at /studio
total_score: 32
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 0
timestamp: 2026-07-31T06-14-31Z
slug: src-studio-ui-js
---
# Marketing Studio pattern-alignment critique

## Preservation and specificity

Preservation is a strong pass. Studio now uses the same near-black workbench,
72px mast, evidence mark, staged panels, 14px surfaces, 10px controls, and
intake-plus-working-plane composition as Forge and Reel Review. The earlier
navy shell, teal accent, and persistent narrow rail are gone.

Product specificity remains strong through the five named video workflows,
explicit runtime ownership, editable production evidence, and the Postiz draft
boundary.

## Nielsen heuristic scores

| Heuristic | Score | Evidence |
|---|---:|---|
| Visibility of system status | 4/4 | Lifecycle, revision, busy labels, readiness, blockers, and feedback are visible. |
| Match with the real world | 3/4 | Workflow owners and draft-only distribution are clear; some production terms assume operator fluency. |
| User control and freedom | 3/4 | Briefs remain editable and execution stays behind explicit actions. |
| Consistency and standards | 4/4 | Tokens, mast, controls, spacing, and responsive workbench match Forge. |
| Error prevention | 4/4 | Rights, approval, media, and Postiz boundaries fail closed. |
| Recognition rather than recall | 3/4 | Blockers return to exact fields, though the long Tools set is ungrouped. |
| Flexibility and efficiency | 3/4 | Advanced tools remain directly available for expert operators. |
| Aesthetic and minimalist design | 3/4 | The primary workflow is restrained; the 18-item Tools surface remains dense. |
| Error recovery | 3/4 | Recovery actions preserve work and focus the relevant production field. |
| Help and documentation | 2/4 | Inline guidance is specific, but advanced tool and production terminology has limited contextual help. |
| **Total** | **32/40** | **Pass** |

## Priority findings

- P0: none.
- P1: none.
- Resolved: structural brief refinements now update contradictory hook,
  summary, and creative copy while preserving neutral titles.
- Resolved: repeated secondary actions now meet the 44px interaction floor.
- Resolved: conversation messages expose operator and Studio speaker labels to
  assistive technology.
- P2: the 18 advanced tools remain ungrouped and depend on a long horizontal
  strip at tablet and mobile widths.

## Persona check

- Power users retain the complete advanced tool set and direct execution paths.
- First-time operators get one conversational entry, one mapped workflow, and
  explicit evidence gates.
- Keyboard and low-vision users get semantic tabs and panels, visible focus, a
  skip link, labelled conversation turns, and 44px repeated actions.

## Evidence

- Browser evidence at 390px, 768px, and 1440px showed no document-level
  horizontal overflow.
- Create, Productions, Distribute, and Tools were inspected.
- Browser console was clean.
- The deterministic detector reported zero findings.
- Independent finish review reported P0 0, P1 0, and Nielsen 32/40.
