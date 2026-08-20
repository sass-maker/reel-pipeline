---
target: Marketing Studio local video workflow
total_score: 24
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 4
timestamp: 2026-08-05T15-22-40Z
slug: src-studio-ui-js
---
Method: dual-agent (A: `/root/impeccable_assessment_a` · B: `/root/impeccable_assessment_b`)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Strong progress and readiness states, but model readiness is hidden until Settings opens. |
| 2 | Match system / real world | 2 | Recipe and runtime jargon displace the documented Film style mental model. |
| 3 | User control and freedom | 2 | Stop, retry, edit, and reject exist, but review lacks a clear decision surface. |
| 4 | Consistency and standards | 3 | Components are consistent; Recipe, Video type, and Film style terminology drifts. |
| 5 | Error prevention | 3 | Resource and rights gates are strong; predictable runtime blockers arrive too late. |
| 6 | Recognition rather than recall | 2 | Progressive disclosure hides the episode path and exact production contract. |
| 7 | Flexibility and efficiency | 2 | Quick/manual paths help, but dense review work has few accelerators. |
| 8 | Aesthetic and minimalist design | 2 | Calm entry becomes a flat field of equal-weight controls after expansion. |
| 9 | Error recovery | 3 | Errors preserve work and suggest next steps, though technical paths leak into primary copy. |
| 10 | Help and documentation | 2 | Useful inline boundaries exist; Film style and model setup lack contextual help. |
| **Total** |  | **24/40** | **Acceptable** |

## Design Specificity Verdict

The operational discipline is distinctly Reel Pipeline: local readiness, rights posture, receipts, fixed workflow stages, and distribution boundaries. The first viewport remains category-interchangeable, however, because versioned Film styles and editorial acceptance are hidden behind a generic prompt and Recipe terminology.

The deterministic CLI scan returned zero findings. Responsive browser overlays at 390, 768, and 1440 pixels found edge spacing, wide shadow, cramped summary padding, long planner copy, shallow type hierarchy, and a decorative glow. Hidden tiny-text and text-occlusion findings were verified false positives.

## Overall Impression

The flow is truthful and operationally robust. Its biggest opportunity is to make the exact production contract and editorial decision as visible as the prompt itself.

## What's Working

- Progressive disclosure keeps the first viewport calm.
- Rights, rendering, distribution, and local-runtime boundaries are unusually honest.
- Semantic tabs, labels, large controls, reduced-motion CSS, and live regions provide a solid accessibility base.

## Priority Issues

### [P1] The review climax has no clear editorial decision

The primary promise is render and review, yet acceptance is buried in advanced details. Add visible Accept, Revise, and Reject actions beside the selected artifact, with Accept as the decisive positive action and a retained decision history.

### [P1] The reproducibility contract is hidden and misnamed

The distinctive versioned Film style contract appears as Recipe and is not persistent. Expose Film style name/version, runtime/model, rights posture, and readiness from prompt through review.

### [P1] Predictable runtime blockers arrive too late

The automatic promise precedes local readiness. Resolve and show Ready locally, Preview only, or Needs setup before enabling generation; keep raw paths inside technical details.

### [P1] The primary prompt loses visible keyboard focus

The textarea removes the global focus indicator. Restore a high-contrast focus-visible treatment and verify keyboard focus across dynamic rerenders.

### [P2] Real data overwhelms the elegant entry

The eight-stage rail, many videos, recipes, episode controls, and repeated shot actions exceed working-memory limits. Give each state one contextual next action and progressively disclose secondary controls.

## Persona Red Flags

- **Alex, power operator:** Episode creation exposes many simultaneous controls without shortcuts, batch review, or production search.
- **Jordan, first-time operator:** Recipe, Video type, Theme, Model, workflow, and Film style are hard to relate; blocked model paths feel like setup failure.
- **Sam, keyboard and screen-reader operator:** The main textarea lacks visible focus, dynamic review rerenders may discard focus, and dense repeated controls create a long tab sequence.

## Minor Observations

- The generic astronaut placeholder understates the evidence-led product.
- Green emphasis is used for several completion-adjacent actions.
- The editor-ready export is not a named terminal reward.
- Browser-only overlay advisories identified excess shadow/glow and tight mobile edge spacing.

## Questions to Consider

- What if the invariant visible everywhere were Film style@version, rights posture, and readiness?
- Should every render land directly on an editorial decision?
- Does an episode operator need five simultaneous toolbar actions, or only the next valid action?

Questions skipped: the preserve-lane brief and existing DESIGN.md answer the direction questions, and the operator already approved implementing the workflow; all four P1 findings are direct contract or accessibility defects rather than optional style choices.
