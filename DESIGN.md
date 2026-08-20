# Design System

## Direction

Reel Pipeline films use one visual metaphor and one continuous spatial logic.
The selected reference direction is `evidence-beam`: uncertainty is isolated,
evidence travels along a single path, and the path resolves into a qualified
decision.

## Theme

A dark photographic studio viewed at close range, with real screens and
materials lit by one controlled evidence signal. The mood moves from tension to
clarity without changing visual worlds.

## Color

- Background: `#07090d`
- Surface: `#11151c`
- Primary text: `#f3f5f7`
- Muted text: `#9aa3ad`
- Risk: `#ff5a67`
- Evidence: `#d9e6ef`
- Verified: `#82d9a7`

Signal colors remain below 12 percent of a frame and never replace hierarchy.

## Typography

Use the system sans stack with decisive weight contrast for primary claims.
Use monospace only inside real code or evidence labels. Display tracking must
remain at or above `-0.04em`, and a phone-sized frame must never carry more
than two short lines of primary copy.

## Composition

- Full-bleed imagery is the default.
- One subject occupies at least 60 percent of the visual attention.
- One supporting layer may clarify the subject.
- UI chrome is cropped away unless it is necessary evidence.
- Safe title margins are 7 percent horizontally and 6 percent vertically.
- Cards, panel grids, and simultaneous picture-in-picture modules are not part
  of the default language. `guided-app-demo@1` is the deliberate exception:
  one same-session presenter may occupy the bottom-right 24 percent width with
  a 6 percent safe margin while the real application remains dominant.

## Motion

- One principal action and one camera movement per scene.
- Use focus pulls, mask zooms, match cuts, and evidence-path continuity.
- Entrances use confident exponential ease-out; exits are shorter.
- Generated motion may bridge deterministic captures but must cut back to real
  product evidence before showing a claim.
- Reduced-motion review uses direct cuts and crossfades.

## Operator Console

The hosted `/forge` console is a dense control surface, not an editor. It uses
the same dark, restrained evidence language while prioritizing scan speed over
cinematic presentation.

- Create, Queue, Assets, and Review are the only top-level views.
- The **Film style** choice and exact internal version remain visible through
  the whole job.
- Prompt, keyframe, rights posture, progress, variants, and decisions are
  grouped by production stage.
- `accept` is the only strong positive action; retry/change/cloud decisions are
  visually secondary but always named.
- The console never exposes draggable layers, a freeform timeline, or social
  publishing controls.

## Video Maker Workflow

The `/studio` Create surface keeps the current dense, restrained console
language while making production state directly editable.

- Talk and Type are equivalent intake paths; captured audio remains available
  when local transcription cannot run.
- The fixed eight-stage rail is always visible for saved briefs. Status uses
  labels and action text as well as color, and every runnable stage supports
  keyboard activation.
- Cast cards expose source posture, likeness eligibility, mature readiness,
  and per-workflow role, expression, wardrobe, and continuity overrides.
- The soundtrack editor separates procedural drafts, owned local audio,
  platform references, and generated variations. Trim, offset, loop, fades,
  gain, ducking, musical controls, selection, runtime readiness, and rights
  blockers remain explicit.
- Advanced controls progressively appear only after a brief is saved; the
  primary Create path remains legible at 390, 768, and 1440 pixels without
  horizontal page scrolling.

## Film Skills

A Film style is a versioned design system for one class of video. Its internal
contract is stored as `filmSkill`. It pins the
story grammar, allowed primitives, asset requirements, visual and audio
defaults, quality gates, reference output, and known failure modes. AI may
select and populate a skill, but it cannot silently change that recipe during a
render.

## Audio

Narration leads timing. Music remains restrained and textural. Effects mark
material transitions—scan, isolate, connect, resolve—rather than every cut.
Captions are phrase-timed and remain readable without sound.

## References

- Apple product launch films: physical clarity, negative space, decisive
  close-ups.
- Linear product motion: continuity between product states.
- Buck studio transitions: one graphic idea transformed with discipline.

## Anti-patterns

Do not use dashboard collages, generic holograms, decorative ASCII, gradient
text, glass cards, repeated tiny labels, feature-icon grids, or a presenter as
the default subject.
