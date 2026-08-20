//! Render orchestration — port of the core loop in `src/pipeline.js`.
//!
//! Ties the pure planning (templates) + scoring (quality) together with the
//! engine + publisher traits. `render_reel_variants` mirrors `renderReelVariants`:
//! for each variant in the plan it renders, publishes artifacts, scores the
//! result, and collects a per-variant summary + render log. The heavy work lives
//! behind the traits, so this function is fully unit-testable with fakes.

use anyhow::Result;
use serde::Serialize;

use crate::brief::VideoBrief;
use crate::engine::{RenderEngine, RenderOptions, RenderStatus};
use crate::publisher::ArtifactPublisher;
use crate::quality::{score_variant, QualityScore, ScoreInput};
use crate::templates::{build_variant_plan, VariantPlanEntry};

#[derive(Debug, Clone, Serialize)]
pub struct VariantOutcome {
    pub variant_id: String,
    pub template: String,
    pub template_label: String,
    pub hook: String,
    pub cta: Option<String>,
    pub proof_type: String,
    pub asset_url: Option<String>,
    pub duration_seconds: Option<f64>,
    pub quality_overall: f64,
    pub status: String,
    pub quality_reasons: Vec<String>,
    pub provider: String,
    pub external_task_id: String,
    pub artifact_manifest_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RenderReport {
    pub variants: Vec<VariantOutcome>,
    pub render_log: Vec<String>,
}

/// Clamp helper matching the JS `Math.max(1, Math.min(6, n))`.
pub fn clamp_variant_count(n: usize) -> usize {
    n.clamp(1, 6)
}

/// Port of `renderReelVariants`.
pub fn render_reel_variants<E, P>(
    brief: &VideoBrief,
    engine: &E,
    publisher: &P,
    variant_count: usize,
    cwd: &std::path::Path,
) -> RenderReport
where
    E: RenderEngine,
    P: ArtifactPublisher,
{
    let count = clamp_variant_count(variant_count);
    let plan = build_variant_plan(brief, count);
    let mut variants = Vec::new();
    let mut render_log = Vec::new();

    for entry in plan {
        match render_one(brief, &entry, engine, publisher, cwd) {
            Ok((outcome, score)) => {
                render_log.push(format!(
                    "variant={} status={} score={}",
                    entry.variant_id, score.status, score.overall
                ));
                variants.push(outcome);
            }
            Err(err) => {
                render_log.push(format!("variant={} failed: {err}", entry.variant_id));
                variants.push(VariantOutcome {
                    variant_id: entry.variant_id.clone(),
                    template: entry.template.id.to_string(),
                    template_label: entry.template.label.to_string(),
                    hook: entry.hook.clone(),
                    cta: entry.cta.clone(),
                    proof_type: "generated_card".to_string(),
                    asset_url: None,
                    duration_seconds: None,
                    quality_overall: 0.0,
                    status: "video_rejected".to_string(),
                    quality_reasons: vec![format!("render failed: {err}")],
                    provider: String::new(),
                    external_task_id: String::new(),
                    artifact_manifest_path: None,
                });
            }
        }
    }

    RenderReport {
        variants,
        render_log,
    }
}

fn render_one<E, P>(
    brief: &VideoBrief,
    entry: &VariantPlanEntry,
    engine: &E,
    publisher: &P,
    cwd: &std::path::Path,
) -> Result<(VariantOutcome, QualityScore)>
where
    E: RenderEngine,
    P: ArtifactPublisher,
{
    let options = RenderOptions {
        variant_id: Some(entry.variant_id.clone()),
        variant_count: 1,
        template: Some(entry.template.id.to_string()),
        hook: Some(entry.hook.clone()),
        cta: entry.cta.clone(),
    };
    let mut raw = engine.create_video(brief, &options)?;
    if raw.status == RenderStatus::Completed {
        crate::content_factory::attach_manifest(brief, &mut raw, cwd)?;
    }

    // Publish only completed renders (mirrors the JS `status === 'completed'`).
    let published_videos = if raw.status == RenderStatus::Completed {
        publisher.publish(&raw.videos, cwd)?
    } else {
        raw.videos.clone()
    };

    let asset_url = crate::artifact::first_video_url(&published_videos, &raw.combined_videos, None);
    let proof_type = raw
        .proof_type
        .clone()
        .unwrap_or_else(|| "generated_card".to_string());

    let score = score_variant(&ScoreInput {
        hook: Some(entry.hook.clone()),
        cta: entry.cta.clone(),
        body: Some(brief.body.clone()),
        product_url: brief.product_url.clone(),
        proof_url: brief.proof_url.clone(),
        proof_type: Some(proof_type.clone()),
        proof_path_count: 0,
        aspect: raw.aspect.clone(),
        duration_seconds: raw.duration_seconds,
        render_failed: raw.status == RenderStatus::Failed,
        video_url: asset_url.clone(),
    });

    let outcome = VariantOutcome {
        variant_id: entry.variant_id.clone(),
        template: entry.template.id.to_string(),
        template_label: entry.template.label.to_string(),
        hook: entry.hook.clone(),
        cta: entry.cta.clone(),
        proof_type,
        asset_url,
        duration_seconds: raw.duration_seconds,
        quality_overall: score.overall,
        status: score.status.clone(),
        quality_reasons: score.reasons.clone(),
        provider: raw.provider.clone(),
        external_task_id: raw.external_task_id.clone(),
        artifact_manifest_path: raw
            .artifact_manifest_path
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned()),
    };
    Ok((outcome, score))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::mock::MockEngine;
    use crate::publisher::NoopPublisher;

    fn brief() -> VideoBrief {
        crate::brief::normalize_from_value(&serde_json::json!({
            "id": "b1",
            "project_slug": "linkchat",
            "channel": "tiktok",
            "title": "Stop answering the same DM",
            "hook": "Stop answering the same DM today",
            "body": "Script: x. Shot list: y. Captions: z. Asset prompts: w.",
            "product_url": "https://linkchat.dev",
            "cta": "Try it once"
        }))
        .unwrap()
    }

    #[test]
    fn renders_planned_variants_and_logs() {
        let tmp = tempfile::tempdir().unwrap();
        let engine = MockEngine::new(tmp.path()).with_task_suffix("fixed");
        let report = render_reel_variants(&brief(), &engine, &NoopPublisher, 3, tmp.path());
        assert_eq!(report.variants.len(), 3);
        assert_eq!(report.render_log.len(), 3);
        // mock proof is generated_card → not video_ready, but it should score + run
        for v in &report.variants {
            assert!(!v.template.is_empty());
            assert!(v.asset_url.is_some());
        }
        assert!(report.render_log[0].starts_with("variant=b1-v1"));
    }

    #[test]
    fn clamps_variant_count() {
        assert_eq!(clamp_variant_count(0), 1);
        assert_eq!(clamp_variant_count(99), 6);
        assert_eq!(clamp_variant_count(3), 3);
    }
}
