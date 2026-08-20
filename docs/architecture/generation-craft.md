# Generation Craft

Engine-agnostic techniques for any generation pipeline — local renderers
(Blender, MLX-Video, ASCII, render-pro) or cloud models if a future adapter
adds them. These are craft rules that hold regardless of the engine: they
improve consistency, pacing, and cost discipline without locking the pipeline
to a specific provider.

Pattern source: SuperCMO Skills (`SupercmoHQ/superCMO-skills`, Apache-2.0) —
concepts adapted, no code or infrastructure copied. The local-first stance
and rejection of cloud-dependent stacks (see
[`decisions/0002-openshorts-removed-parked.md`](./decisions/0002-openshorts-removed-parked.md))
is unchanged; this doc captures the transferable generation techniques only.

## Anchor recurring subjects across clips

Clips are generated independently, so a back-reference ("the same woman",
"that sneaker again") drifts into a different-looking thing each time. Whenever
a person, product, or signature prop appears in more than one shot:

1. **Before generating any clip**, produce one clean still of that subject — a
   portrait for a person, a plain product shot for an object. For local
   engines, render or capture the reference frame first; for image-to-video
   adapters, this is the start frame.
2. **Pass that same still as the reference input in every shot** the subject
   appears in. Use the identical image file, not a re-rendered lookalike.
3. **Describe the subject's appearance word-for-word the same in each prompt
   or brief.** Vary only the shot, action, and framing. Hold one lighting and
   palette across the set so a hard cut reads as continuous.
4. **Open each shot on the state the previous one ended in** — pose, position,
   wardrobe — so the world stays continuous across cuts.

This works on any engine that accepts a reference image or a start frame. It
is the single highest-leverage technique for multi-clip consistency.

## Budget the script to the duration

Speech runs about two to three words a second. A fifteen-second read is
thirty to forty-five words; a sixty-second read is one hundred twenty to one
hundred eighty. Set the word count before writing, and trim words rather than
speeding up the delivery — a rushed read sounds worse than a trimmed one.

For video action, aim for roughly one distinct action or shot every couple of
seconds. A short clip carries only a few beats; cramming more makes it busy
and unreadable. When the brief needs more time, action, or dialogue than one
clip allows, build it as several clips and stitch them — do not compress.

## Read supplied media before writing the prompt

When a frame, reference image, or source video is supplied, inspect it before
writing anything. Name what it already fixes — the subject, the palette, the
setting, the lighting — so the prompt or brief animates or matches it instead
of contradicting it. Skip this only when the media was made this turn or
arrived with a description.

For local engines, this means reading the source frame's composition and
color before writing the motion brief. For cloud adapters, it means calling
the analysis tool on the reference first. Either way, the rule is the same:
the source already fixes part of the frame; the prompt carries the rest.

## Route by intent, with a fallback ladder

When more than one engine or model could serve a brief, route by what the
output has to **do**, not by what is newest or fanciest. Read the brief for
intent, pick the engine whose strengths match, and keep a fallback ladder for
when the first choice refuses or fails:

1. The operator named an engine → use it.
2. A hard capability is required (legible text, a real face, a specific
   style) → the engine that delivers it, even over a default.
3. Otherwise stay on the default workhorse; when two tie, prefer the one with
   lower cost or faster turnaround.

A refusal or repeated failure is a signal to step down the ladder, not to
retry the same engine blind. Name what tripped the filter or failed, choose a
workable stand-in, and resubmit. A second failure: tell the operator which
element is blocked instead of guessing again.

## Never re-run a pending job

Long-running generation — especially cloud video models, but also heavy local
renders — can return a pending handle instead of a finished artifact. A
pending result is a job handle, not a failure. Poll for completion with that
exact handle; **never re-run a pending job**, because that starts a new,
separately-billed or separately-computed run. If it is still pending, poll
again. Only when the job is confirmed finished or failed should you act on
the result.

For local engines, the equivalent is: do not kill and restart a render that
is still producing frames. Check the render log or status file, and wait.

## Ask once, not in a back-and-forth

When inputs are missing, ask only for what would change the result and cannot
be sensibly defaulted — a start frame when the operator says "animate this"
but attaches nothing, the aspect ratio when the destination decides the crop,
whether the clip should carry sound. Bundle everything needed into one ask.
If the operator has signalled they do not want questions, choose sensible
defaults, state them in a line, and proceed.
