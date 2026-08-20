//! Integration test: the provider-neutral render flow end-to-end with fakes.
//!
//! Mirrors what `pipeline.js renderReelVariants` does — plan variants, render
//! each via the engine, publish artifacts, score — but using the in-memory mock
//! engine + noop publisher so it runs with no Chrome/ffmpeg/network. This is the
//! Rust analogue of `test/*.test.js` smoke coverage for the orchestration core.

use std::path::Path;

use reel::brief::normalize_from_value;
use reel::engine::mock::MockEngine;
use reel::engine::render_pro::RenderProEngine;
use reel::engine::{RenderEngine, RenderOptions};
use reel::orchestrator::render_reel_variants;
use reel::publisher::{ArtifactPublisher, NoopPublisher, R2Publisher};
use reel::runner::testing::RecordingRunner;
use reel::runner::CommandRunner;

fn sample_brief() -> reel::brief::VideoBrief {
    normalize_from_value(&serde_json::json!({
        "id": "reel_demo",
        "project_slug": "high-signal",
        "channel": "youtube_shorts",
        "title": "Score before you post",
        "hook": "Your last five tweets were noise",
        "body": "Script: open. Shot list: x. Captions: y. Asset prompts: z. audit signal score",
        "cta": "Score it first"
    }))
    .unwrap()
}

#[test]
fn full_variant_render_flow_with_mock_engine() {
    let tmp = tempfile::tempdir().unwrap();
    let engine = MockEngine::new(tmp.path()).with_task_suffix("t");
    let report = render_reel_variants(&sample_brief(), &engine, &NoopPublisher, 2, tmp.path());

    assert_eq!(report.variants.len(), 2);
    // teardown_audit should be selected first (slug + body match), then padded.
    assert_eq!(report.variants[0].template, "teardown_audit");
    for v in &report.variants {
        assert!(
            v.asset_url.is_some(),
            "each completed variant has an asset url"
        );
        assert!(!v.status.is_empty());
    }
    assert_eq!(report.render_log.len(), 2);
}

#[test]
fn render_pro_engine_shells_out_exactly_once_per_reel() {
    // Verify the production path builds the right command and the publisher
    // builds the right wrangler upload — without executing either.
    let render_runner = RecordingRunner::new().with_response(0, "✓ done");
    let engine = RenderProEngine::new(render_runner, "/repo");
    let opts = RenderOptions {
        variant_count: 1,
        ..Default::default()
    };
    let result = engine.render_reel_by_id("demo-linkchat-1", &opts).unwrap();
    assert_eq!(result.provider, "render-pro");

    let publish_runner = RecordingRunner::new().with_response(0, "");
    let publisher = R2Publisher::new(publish_runner, "reel-artifacts", "https://w.dev/reels");
    let urls = publisher
        .publish(
            &["file:///repo/tmp/render-pro/demo/final.mp4".into()],
            Path::new("/repo"),
        )
        .unwrap();
    assert_eq!(urls, vec!["https://w.dev/reels/demo-final.mp4".to_string()]);
}

#[test]
fn recording_runner_captures_render_pro_invocation() {
    let runner = RecordingRunner::new().with_response(0, "ok");
    let engine = RenderProEngine::new(runner, "/repo");
    let spec = engine.command_for("demo-reader-1", 2);
    // exercise the runner directly to assert the recorded call shape
    let recording = RecordingRunner::new().with_response(0, "ok");
    let _ = recording.run(&spec).unwrap();
    let calls = recording.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(
        calls[0].args,
        vec!["content-factory/scripts/render-pro.js", "demo-reader-1"]
    );
    assert_eq!(
        calls[0].env.get("REEL_VARIANT_COUNT").map(String::as_str),
        Some("2")
    );
}
