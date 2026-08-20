//! VideoBrief contract — port of `src/video-brief.js`.
//!
//! Normalizes and validates a raw marketing-post / reel-draft input into the
//! canonical [`VideoBrief`] the rest of the pipeline operates on. Validation
//! semantics (required fields, allowed channels / proof types / render modes,
//! duration bounds, the reel-channel body shape check) mirror the JS exactly so
//! the Rust orchestrator accepts/rejects the same inputs as the Node glue.


use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum BriefError {
    #[error("{0} is required")]
    Required(&'static str),
    #[error("unsupported channel: {0}")]
    UnsupportedChannel(String),
    #[error("unsupported proofType: {0}")]
    UnsupportedProofType(String),
    #[error("unsupported renderMode: {0}")]
    UnsupportedRenderMode(String),
    #[error("durationSeconds must be between 5 and 90")]
    DurationOutOfRange,
    #[error("reel channel body must include script, shot list, captions, and asset prompts")]
    InvalidReelBody,
    #[error("{0} must be an array")]
    NotAnArray(&'static str),
}

pub const CHANNELS: &[&str] = &[
    "tiktok",
    "instagram_reels",
    "youtube_shorts",
    "blog",
    "email",
    "producthunt",
    "x",
    "reddit",
    "other",
];

pub const REEL_CHANNELS: &[&str] = &["tiktok", "instagram_reels", "youtube_shorts"];

pub const PROOF_TYPES: &[&str] = &[
    "screenshot",
    "recording",
    "changelog",
    "before_after",
    "product_artifact",
    "cockpit",
    "generated_card",
];

pub const RENDER_MODES: &[&str] = &[
    "mock",
    "grok",
    "grok-video",
    "grok-videos",
    "ascii",
    "ascii-animation",
    "ascii-fable",
    "askai",
    "html",
    "html-composition",
    "web-composition",
    "blender",
];

pub fn is_reel_channel(channel: &str) -> bool {
    REEL_CHANNELS.contains(&channel)
}

/// A single normalized demo step (for the `mini_demo` template).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DemoStep {
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wait_ms: Option<u32>,
}

/// The canonical video brief consumed by renderers, templates and scoring.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VideoBrief {
    pub id: String,
    pub project_slug: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub marketing_post_id: Option<String>,
    pub channel: String,
    pub title: String,
    pub hook: String,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cta: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audience: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub product_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proof_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_route: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recording_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub changelog_entry_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand_tone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proof_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub screenshots: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub demo_steps: Option<Vec<DemoStep>>,
    pub render_mode: String,
    pub duration_seconds: f64,
}

/// A loosely-typed raw input (the shape that arrives from SaaS Maker / the API),
/// accepting both camelCase and snake_case keys via [`serde_json::Value`] lookup.
pub type RawInput = serde_json::Map<String, serde_json::Value>;

fn lookup<'a>(input: &'a RawInput, keys: &[&str]) -> Option<&'a serde_json::Value> {
    keys.iter().find_map(|k| input.get(*k))
}

fn optional_string(value: Option<&serde_json::Value>) -> Option<String> {
    match value {
        Some(serde_json::Value::String(s)) => {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        }
        _ => None,
    }
}

fn string_or_throw(
    value: Option<&serde_json::Value>,
    field: &'static str,
) -> Result<String, BriefError> {
    optional_string(value).ok_or(BriefError::Required(field))
}

fn normalize_channel(input: &RawInput) -> Result<String, BriefError> {
    let value = string_or_throw(input.get("channel"), "channel")?;
    if CHANNELS.contains(&value.as_str()) {
        Ok(value)
    } else {
        Err(BriefError::UnsupportedChannel(value))
    }
}

fn normalize_proof_type(input: &RawInput) -> Result<Option<String>, BriefError> {
    match optional_string(lookup(input, &["proofType", "proof_type"])) {
        None => Ok(None),
        Some(p) if PROOF_TYPES.contains(&p.as_str()) => Ok(Some(p)),
        Some(p) => Err(BriefError::UnsupportedProofType(p)),
    }
}

fn normalize_render_mode(input: &RawInput) -> Result<String, BriefError> {
    let value = optional_string(lookup(input, &["renderMode", "render_mode"]))
        .unwrap_or_else(|| "html-composition".to_string());
    if RENDER_MODES.contains(&value.as_str()) {
        Ok(value)
    } else {
        Err(BriefError::UnsupportedRenderMode(value))
    }
}

fn normalize_duration(input: &RawInput) -> Result<f64, BriefError> {
    let raw = lookup(input, &["durationSeconds", "duration_seconds"]);
    let duration = match raw {
        None | Some(serde_json::Value::Null) => 20.0,
        Some(serde_json::Value::Number(n)) => n.as_f64().unwrap_or(f64::NAN),
        Some(serde_json::Value::String(s)) => s.trim().parse::<f64>().unwrap_or(f64::NAN),
        _ => f64::NAN,
    };
    if !duration.is_finite() || duration < 5.0 || duration > 90.0 {
        return Err(BriefError::DurationOutOfRange);
    }
    Ok(duration)
}

fn normalize_screenshots(input: &RawInput) -> Result<Option<Vec<String>>, BriefError> {
    match input.get("screenshots") {
        None | Some(serde_json::Value::Null) => Ok(None),
        Some(serde_json::Value::Array(items)) => {
            let list: Vec<String> = items
                .iter()
                .filter_map(|v| optional_string(Some(v)))
                .collect();
            Ok(if list.is_empty() { None } else { Some(list) })
        }
        _ => Err(BriefError::NotAnArray("screenshots")),
    }
}

fn normalize_demo_steps(input: &RawInput) -> Result<Option<Vec<DemoStep>>, BriefError> {
    let raw = lookup(input, &["demoSteps", "demo_steps"]);
    match raw {
        None | Some(serde_json::Value::Null) => Ok(None),
        Some(serde_json::Value::Array(items)) => {
            let mut steps = Vec::new();
            for entry in items {
                let obj = match entry.as_object() {
                    Some(o) => o,
                    None => continue,
                };
                let action = optional_string(lookup(obj, &["action", "type"]));
                let action = match action {
                    Some(a) => a,
                    None => continue,
                };
                let wait_ms = lookup(obj, &["waitMs", "wait_ms"])
                    .and_then(|v| match v {
                        serde_json::Value::Number(n) => n.as_f64(),
                        serde_json::Value::String(s) => s.trim().parse::<f64>().ok(),
                        _ => None,
                    })
                    .filter(|n| n.is_finite())
                    .map(|n| n.clamp(0.0, 10_000.0) as u32);
                steps.push(DemoStep {
                    action,
                    route: optional_string(lookup(obj, &["route", "path", "url"])),
                    selector: optional_string(obj.get("selector")),
                    value: optional_string(lookup(obj, &["value", "text"])),
                    caption: optional_string(obj.get("caption")),
                    wait_ms,
                });
            }
            Ok(if steps.is_empty() { None } else { Some(steps) })
        }
        _ => Err(BriefError::NotAnArray("demoSteps")),
    }
}

/// Mirror of `looksLikeVideoBrief` in the JS: a reel-channel body must read like
/// an actual brief (script + shot/scene + captions + asset/visual).
fn looks_like_video_brief(body: &str) -> bool {
    let text = body.to_lowercase();
    text.contains("script")
        && (text.contains("shot") || text.contains("scene"))
        && text.contains("caption")
        && (text.contains("asset") || text.contains("visual"))
}

/// Port of `normalizeVideoBrief`.
pub fn normalize_video_brief(input: &RawInput) -> Result<VideoBrief, BriefError> {
    let brief = VideoBrief {
        id: string_or_throw(input.get("id"), "id")?,
        project_slug: string_or_throw(
            lookup(input, &["projectSlug", "project_slug"]),
            "projectSlug",
        )?,
        task_id: optional_string(lookup(input, &["taskId", "task_id"])),
        marketing_post_id: optional_string(lookup(
            input,
            &["marketingPostId", "marketing_post_id"],
        )),
        channel: normalize_channel(input)?,
        title: string_or_throw(input.get("title"), "title")?,
        hook: string_or_throw(input.get("hook"), "hook")?,
        body: string_or_throw(input.get("body"), "body")?,
        cta: optional_string(input.get("cta")),
        audience: optional_string(input.get("audience")),
        product_url: optional_string(lookup(input, &["productUrl", "product_url"])),
        proof_url: optional_string(lookup(input, &["proofUrl", "proof_url"])),
        target_route: optional_string(lookup(input, &["targetRoute", "target_route"])),
        recording_url: optional_string(lookup(input, &["recordingUrl", "recording_url"])),
        changelog_entry_id: optional_string(lookup(
            input,
            &["changelogEntryId", "changelog_entry_id"],
        )),
        brand_tone: optional_string(lookup(input, &["brandTone", "brand_tone"])),
        proof_type: normalize_proof_type(input)?,
        template: optional_string(input.get("template")),
        screenshots: normalize_screenshots(input)?,
        demo_steps: normalize_demo_steps(input)?,
        render_mode: normalize_render_mode(input)?,
        duration_seconds: normalize_duration(input)?,
    };

    if is_reel_channel(&brief.channel) && !looks_like_video_brief(&brief.body) {
        return Err(BriefError::InvalidReelBody);
    }

    Ok(brief)
}

/// Convenience: normalize from a free-form JSON object literal.
pub fn normalize_from_value(value: &serde_json::Value) -> Result<VideoBrief, BriefError> {
    let map = value
        .as_object()
        .cloned()
        .unwrap_or_else(serde_json::Map::new);
    normalize_video_brief(&map)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_reel_body() -> &'static str {
        "Script: open. Shot list: x. Captions: y. Asset prompts: z."
    }

    fn raw(json: serde_json::Value) -> RawInput {
        json.as_object().cloned().unwrap()
    }

    #[test]
    fn normalizes_minimal_reel_brief() {
        let brief = normalize_video_brief(&raw(serde_json::json!({
            "id": "b1",
            "project_slug": "linkchat",
            "channel": "tiktok",
            "title": "Stop answering the same DM",
            "hook": "Stop answering the same DM",
            "body": valid_reel_body(),
        })))
        .unwrap();
        assert_eq!(brief.project_slug, "linkchat");
        assert_eq!(brief.render_mode, "html-composition");
        assert_eq!(brief.duration_seconds, 20.0);
        assert!(brief.cta.is_none());
    }

    #[test]
    fn accepts_camel_and_snake_case_keys() {
        let brief = normalize_video_brief(&raw(serde_json::json!({
            "id": "b1",
            "projectSlug": "reader",
            "channel": "youtube_shorts",
            "title": "t",
            "hook": "h",
            "body": valid_reel_body(),
            "productUrl": "https://x.dev",
            "render_mode": "mock",
            "duration_seconds": 30
        })))
        .unwrap();
        assert_eq!(brief.product_url.as_deref(), Some("https://x.dev"));
        assert_eq!(brief.render_mode, "mock");
        assert_eq!(brief.duration_seconds, 30.0);
    }

    #[test]
    fn accepts_html_composition_render_modes() {
        for mode in ["html", "html-composition", "web-composition"] {
            let brief = normalize_video_brief(&raw(serde_json::json!({
                "id": "b1",
                "project_slug": "reader",
                "channel": "youtube_shorts",
                "title": "t",
                "hook": "h",
                "body": valid_reel_body(),
                "render_mode": mode,
            })))
            .unwrap();
            assert_eq!(brief.render_mode, mode);
        }
    }

    #[test]
    fn rejects_reel_channel_with_bad_body() {
        let err = normalize_video_brief(&raw(serde_json::json!({
            "id": "b1",
            "project_slug": "x",
            "channel": "tiktok",
            "title": "t",
            "hook": "h",
            "body": "just a sentence"
        })))
        .unwrap_err();
        assert_eq!(err, BriefError::InvalidReelBody);
    }

    #[test]
    fn allows_non_reel_channel_with_plain_body() {
        let brief = normalize_video_brief(&raw(serde_json::json!({
            "id": "b1",
            "project_slug": "x",
            "channel": "blog",
            "title": "t",
            "hook": "h",
            "body": "just a sentence"
        })))
        .unwrap();
        assert_eq!(brief.channel, "blog");
    }

    #[test]
    fn rejects_missing_required_field() {
        let err = normalize_video_brief(&raw(serde_json::json!({
            "project_slug": "x",
            "channel": "blog",
            "title": "t",
            "hook": "h",
            "body": "b"
        })))
        .unwrap_err();
        assert_eq!(err, BriefError::Required("id"));
    }

    #[test]
    fn rejects_unsupported_channel() {
        let err = normalize_video_brief(&raw(serde_json::json!({
            "id": "b1",
            "project_slug": "x",
            "channel": "snapchat",
            "title": "t",
            "hook": "h",
            "body": "b"
        })))
        .unwrap_err();
        assert_eq!(err, BriefError::UnsupportedChannel("snapchat".into()));
    }

    #[test]
    fn rejects_out_of_range_duration() {
        let err = normalize_video_brief(&raw(serde_json::json!({
            "id": "b1",
            "project_slug": "x",
            "channel": "blog",
            "title": "t",
            "hook": "h",
            "body": "b",
            "duration_seconds": 120
        })))
        .unwrap_err();
        assert_eq!(err, BriefError::DurationOutOfRange);
    }

    #[test]
    fn normalizes_demo_steps_and_clamps_wait() {
        let brief = normalize_video_brief(&raw(serde_json::json!({
            "id": "b1",
            "project_slug": "x",
            "channel": "blog",
            "title": "t",
            "hook": "h",
            "body": "b",
            "demo_steps": [
                { "action": "open", "route": "/", "wait_ms": 99999 },
                { "selector": "#btn" },
                { "type": "click", "caption": "press" }
            ]
        })))
        .unwrap();
        let steps = brief.demo_steps.unwrap();
        assert_eq!(steps.len(), 2); // entry with no action/type dropped
        assert_eq!(steps[0].action, "open");
        assert_eq!(steps[0].wait_ms, Some(10_000));
        assert_eq!(steps[1].action, "click");
    }

}
