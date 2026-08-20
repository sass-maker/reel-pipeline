//! Render-engine factory — mirrors `createRenderer` in `src/pipeline.js`.

use std::path::Path;

use anyhow::{anyhow, Result};

use crate::brief::VideoBrief;
use crate::runner::CommandRunner;

use super::ascii_animation::AsciiAnimationEngine;
use super::blender::BlenderEngine;
use super::grok_video::GrokVideoEngine;
use super::html_composition::HtmlCompositionEngine;
use super::mock::MockEngine;
use super::render_pro::RenderProEngine;
use super::{RenderEngine, RenderOptions, RenderResult};

pub enum PipelineEngine<R: CommandRunner> {
    AsciiAnimation(AsciiAnimationEngine<R>),
    Blender(BlenderEngine<R>),
    Mock(MockEngine),
    GrokVideo(GrokVideoEngine),
    HtmlComposition(HtmlCompositionEngine<R>),
    RenderPro(RenderProEngine<R>),
}

impl<R: CommandRunner> RenderEngine for PipelineEngine<R> {
    fn name(&self) -> &str {
        match self {
            PipelineEngine::AsciiAnimation(e) => e.name(),
            PipelineEngine::Blender(e) => e.name(),
            PipelineEngine::Mock(e) => e.name(),
            PipelineEngine::GrokVideo(e) => e.name(),
            PipelineEngine::HtmlComposition(e) => e.name(),
            PipelineEngine::RenderPro(e) => e.name(),
        }
    }

    fn create_video(&self, brief: &VideoBrief, options: &RenderOptions) -> Result<RenderResult> {
        match self {
            PipelineEngine::AsciiAnimation(e) => e.create_video(brief, options),
            PipelineEngine::Blender(e) => e.create_video(brief, options),
            PipelineEngine::Mock(e) => e.create_video(brief, options),
            PipelineEngine::GrokVideo(e) => e.create_video(brief, options),
            PipelineEngine::HtmlComposition(e) => e.create_video(brief, options),
            PipelineEngine::RenderPro(e) => e.create_video(brief, options),
        }
    }

    fn render_reel_by_id(&self, reel_id: &str, options: &RenderOptions) -> Result<RenderResult> {
        match self {
            PipelineEngine::AsciiAnimation(e) => e.render_reel_by_id(reel_id, options),
            PipelineEngine::Blender(e) => e.render_reel_by_id(reel_id, options),
            PipelineEngine::Mock(e) => e.render_reel_by_id(reel_id, options),
            PipelineEngine::GrokVideo(e) => e.render_reel_by_id(reel_id, options),
            PipelineEngine::HtmlComposition(e) => e.render_reel_by_id(reel_id, options),
            PipelineEngine::RenderPro(e) => e.render_reel_by_id(reel_id, options),
        }
    }

    fn get_status(&self, external_task_id: &str) -> Result<RenderResult> {
        match self {
            PipelineEngine::AsciiAnimation(e) => e.get_status(external_task_id),
            PipelineEngine::Blender(e) => e.get_status(external_task_id),
            PipelineEngine::Mock(e) => e.get_status(external_task_id),
            PipelineEngine::GrokVideo(e) => e.get_status(external_task_id),
            PipelineEngine::HtmlComposition(e) => e.get_status(external_task_id),
            PipelineEngine::RenderPro(e) => e.get_status(external_task_id),
        }
    }
}

pub fn create_renderer<R: CommandRunner>(
    mode: &str,
    repo_root: &Path,
    runner: R,
) -> Result<PipelineEngine<R>> {
    match mode {
        "mock" => Ok(PipelineEngine::Mock(MockEngine::new(
            repo_root.join(".reel-pipeline/artifacts"),
        ))),
        "grok" | "grok-video" | "grok-videos" => Ok(PipelineEngine::GrokVideo(
            GrokVideoEngine::from_env(repo_root),
        )),
        "ascii" | "ascii-animation" | "ascii-fable" | "askai" => Ok(
            PipelineEngine::AsciiAnimation(AsciiAnimationEngine::new(runner, repo_root)),
        ),
        "blender" => Ok(PipelineEngine::Blender(BlenderEngine::new(
            runner, repo_root,
        ))),
        "html" | "html-composition" | "web-composition" => Ok(PipelineEngine::HtmlComposition(
            HtmlCompositionEngine::new(runner, repo_root),
        )),
        "render-pro" | "renderpro" => Ok(PipelineEngine::RenderPro(RenderProEngine::new(
            runner, repo_root,
        ))),
        other => Err(anyhow!("unsupported render mode: {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brief::RENDER_MODES;
    use crate::runner::testing::RecordingRunner;
    use serde_json::Value;

    #[test]
    fn factory_covers_supported_rust_render_modes() {
        let cases = [
            ("mock", "mock"),
            ("grok-video", "grok-video"),
            ("ascii", "ascii-animation"),
            ("blender", "blender"),
            ("html-composition", "html-composition"),
            ("render-pro", "render-pro"),
        ];

        for (mode, expected_name) in cases {
            let engine = create_renderer(mode, Path::new("/repo"), RecordingRunner::new())
                .unwrap_or_else(|err| panic!("{mode} should create an engine: {err}"));
            assert_eq!(engine.name(), expected_name);
        }
    }

    #[test]
    fn factory_and_brief_validation_cover_render_mode_matrix() {
        let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        let matrix_path = manifest_dir
            .parent()
            .unwrap()
            .join("config/render-modes.json");
        let raw = std::fs::read_to_string(&matrix_path)
            .unwrap_or_else(|err| panic!("reading {}: {err}", matrix_path.display()));
        let matrix: Value = serde_json::from_str(&raw)
            .unwrap_or_else(|err| panic!("parsing {}: {err}", matrix_path.display()));
        let modes = matrix
            .get("modes")
            .and_then(Value::as_array)
            .expect("render mode matrix must have a modes array");

        for mode in modes {
            let id = mode.get("id").and_then(Value::as_str).expect("mode id");
            let provider = mode
                .get("provider")
                .and_then(Value::as_str)
                .expect("mode provider");
            let surface = mode
                .get("surface")
                .and_then(Value::as_str)
                .expect("mode surface");
            let aliases = mode
                .get("aliases")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let values = std::iter::once(Value::String(id.to_string()))
                .chain(aliases.into_iter())
                .collect::<Vec<_>>();

            for value in values {
                let render_mode = value.as_str().expect("render mode alias is a string");
                if surface == "faceless-workflow" || surface == "content-package" {
                    assert!(
                        create_renderer(render_mode, Path::new("/repo"), RecordingRunner::new())
                            .is_err(),
                        "faceless mode {render_mode} must stay outside the Rust renderer factory"
                    );
                    assert!(
                        !RENDER_MODES.contains(&render_mode),
                        "faceless mode {render_mode} must stay outside Rust VideoBrief validation"
                    );
                    continue;
                }

                let engine =
                    create_renderer(render_mode, Path::new("/repo"), RecordingRunner::new())
                        .unwrap_or_else(|err| {
                            panic!("matrix mode {render_mode} should create an engine: {err}")
                        });
                assert_eq!(engine.name(), provider, "mode {render_mode}");

                if surface == "render-accepted" {
                    assert!(
                        RENDER_MODES.contains(&render_mode),
                        "render-accepted mode {render_mode} must be accepted by VideoBrief"
                    );
                }
            }
        }
    }
}
