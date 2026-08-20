---
target: Unified Marketing Studio at /studio
total_score: 35
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 0
timestamp: 2026-07-31T00-13-37Z
slug: src-studio-ui-js
---
# Marketing Studio final critique

## Preservation and specificity

Preservation is a strong pass. The corrected Studio keeps the incumbent compact
header, 180px tool rail, navy work plane, muted labels, teal primary action,
single-column density, and every legacy tool. The new Create, Productions, and
Distribute workflow extends that system instead of replacing it.

Product specificity comes from the five named video workflows, explicit runtime
ownership, editable production briefs, evidence gates, and the Postiz-only
publishing boundary. The visual language remains intentionally restrained
because this is a preserve-mode operator surface.

## Nielsen heuristic scores

| Heuristic | Score | Evidence |
|---|---:|---|
| Visibility of system status | 4/4 | Lifecycle chips, revision and dirty state, progress, busy labels, and live feedback are visible. |
| Match with the real world | 3/4 | Workflow owners and the Postiz boundary are clear; a few production terms still assume operator fluency. |
| User control and freedom | 3/4 | Changes remain local until Save, Clear protects dirty edits, and type changes are reversible before save. |
| Consistency and standards | 4/4 | Existing shell, controls, navigation, colors, and action hierarchy remain coherent. |
| Error prevention | 4/4 | Explicit approvals, evidence gates, stable-media checks, and draft-only distribution fail closed. |
| Recognition rather than recall | 4/4 | Blockers are grouped and each failed row returns to the exact field. |
| Flexibility and efficiency | 3/4 | Direct tool shortcuts and progressive disclosure support experts without overwhelming the primary path. |
| Aesthetic and minimalist design | 3/4 | The work plane is restrained and chunked; the intentionally persistent legacy tool rail remains dense. |
| Error recovery | 4/4 | Distribution recovery opens the correct disclosure, focuses the field, and preserves the selected production. |
| Help and documentation | 3/4 | Inline guidance is specific, though some domain-heavy fields could use deeper contextual help. |
| **Total** | **35/40** | **Pass** |

## Cognitive load

The mapped workflow is shown as one confirmation with a Change video type
disclosure. The brief is chunked into Basics, Story and creative direction, and
Evidence and distribution. Distribution is grouped into Source, Approval, and
Delivery with a visible ready count. This keeps the primary task legible while
retaining the incumbent expert shortcuts.

## Priority findings

- P0: none.
- P1: none.
- P2 findings from the independent finish review were resolved: mobile
  disclosure targets are 44px; the mobile drawer lands focus on the destination
  heading; Clear confirms before discarding dirty edits; startup has one active
  navigation signal.
- P3: deeper contextual help for production terminology remains optional
  polish, not a task blocker.

## Persona check

- Power users retain the full direct tool rail and explicit Save/execute
  boundary.
- First-time operators get one conversational entry, one mapped workflow, and
  field-level recovery from every distribution blocker.
- Keyboard and low-vision users get semantic panels, arrow-key tab navigation,
  visible focus, an inert closed drawer, a skip link, 44px mobile targets, and
  no horizontal overflow.

## Evidence and run notes

- Browser evidence: 390px, 768px, and 1440px screenshots.
- 390px: full-width work plane, off-canvas 180px rail, no horizontal overflow.
- 768px and 1440px: incumbent 180px rail retained.
- Distribution recovery focuses and scrolls the missing brief field.
- Browser console: no warnings or errors.
- Deterministic detector: zero findings.

## Questions for later

- Should production terminology gain contextual help without increasing the
  default density?
- Would a compact lifecycle thread add useful orientation while preserving the
  existing shell?
