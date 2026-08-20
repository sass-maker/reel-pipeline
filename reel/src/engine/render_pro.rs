//! Production render engine — shells out to the existing
//! `content-factory/scripts/render-pro.js`.
//!
//! This is the ONE production render path. `render-pro.js` already does the
//! Chrome scroll-tour capture, Edge TTS voiceover, ffmpeg scene compositing /
//! xfade stitching, ambient bed, and the `wrangler r2 object put` upload, then
//! patches the reel record on the worker. The Node `auto-render-watcher.js`
//! just `spawn`s it per approved reel id. We replace that watcher glue: this
//! adapter builds the exact `node content-factory/scripts/render-pro.js <reelId>` invocation
//! (with `REEL_VARIANT_COUNT`) and runs it through a [`CommandRunner`].
//!
//! We intentionally do NOT port the renderer's internals into Rust.

use std::path::PathBuf;

use anyhow::{anyhow, Result};

use crate::brief::VideoBrief;
use crate::engine::{RenderEngine, RenderOptions, RenderResult};
use crate::runner::{CommandRunner, CommandSpec};

pub struct RenderProEngine<R: CommandRunner> {
    runner: R,
    /// Reel Pipeline root. Used as the cwd for the Content Factory renderer.
    repo_root: PathBuf,
    /// `node` binary (overridable for environments with a pinned runtime).
    node_bin: String,
    script_path: String,
}

impl<R: CommandRunner> RenderProEngine<R> {
    pub fn new(runner: R, repo_root: impl Into<PathBuf>) -> Self {
        Self {
            runner,
            repo_root: repo_root.into(),
            node_bin: "node".to_string(),
            script_path: "content-factory/scripts/render-pro.js".to_string(),
        }
    }

    pub fn with_node_bin(mut self, bin: impl Into<String>) -> Self {
        self.node_bin = bin.into();
        self
    }

    /// Build the command this engine would run for a given reel id, mirroring
    /// `runRenderPro` in `auto-render-watcher.js`.
    pub fn command_for(&self, reel_id: &str, variant_count: usize) -> CommandSpec {
        let count = variant_count.clamp(1, 3).max(1);
        CommandSpec::new(
            &self.node_bin,
            [self.script_path.clone(), reel_id.to_string()],
        )
        .cwd(self.repo_root.clone())
        .env("REEL_VARIANT_COUNT", count.to_string())
    }
}

impl<R: CommandRunner> RenderEngine for RenderProEngine<R> {
    fn name(&self) -> &str {
        "render-pro"
    }

    fn create_video(&self, brief: &VideoBrief, options: &RenderOptions) -> Result<RenderResult> {
        // render-pro is keyed by reel id and fetches the record from the worker,
        // so the brief flow delegates to the by-id path using the brief id.
        self.render_reel_by_id(&brief.id, options)
    }

    fn render_reel_by_id(&self, reel_id: &str, options: &RenderOptions) -> Result<RenderResult> {
        let variant_count = if options.variant_count == 0 {
            1
        } else {
            options.variant_count
        };
        let spec = self.command_for(reel_id, variant_count);
        let output = self.runner.run(&spec)?;
        if !output.ok() {
            return Err(anyhow!(
                "render-pro exited {} for {reel_id}: {}",
                output.status,
                output.stderr.lines().last().unwrap_or("").trim()
            ));
        }
        // render-pro patches the reel record + uploads to R2 itself; the watcher
        // only cares that the process exited 0. We surface a completed result
        // tagged with the provider so callers can log/score consistently.
        let mut result = RenderResult::completed("render-pro", reel_id);
        result.render_log = output
            .stdout
            .lines()
            .filter(|l| !l.trim().is_empty())
            .map(|l| l.trim().to_string())
            .collect();
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::RenderStatus;
    use crate::runner::testing::RecordingRunner;

    #[test]
    fn builds_render_pro_command_with_variant_env() {
        let engine = RenderProEngine::new(RecordingRunner::new(), "/repo");
        let spec = engine.command_for("demo-linkchat-1", 2);
        assert_eq!(spec.program, "node");
        assert_eq!(
            spec.args,
            vec![
                "content-factory/scripts/render-pro.js",
                "demo-linkchat-1"
            ]
        );
        assert_eq!(spec.cwd.as_deref(), Some(std::path::Path::new("/repo")));
        assert_eq!(
            spec.env.get("REEL_VARIANT_COUNT").map(String::as_str),
            Some("2")
        );
    }

    #[test]
    fn variant_count_clamped_to_three() {
        let engine = RenderProEngine::new(RecordingRunner::new(), "/repo");
        let spec = engine.command_for("demo-1", 99);
        assert_eq!(
            spec.env.get("REEL_VARIANT_COUNT").map(String::as_str),
            Some("3")
        );
    }

    #[test]
    fn render_by_id_runs_and_reports_completed() {
        let runner =
            RecordingRunner::new().with_response(0, "  capturing scroll tour…\n  ✓ uploaded\n");
        let engine = RenderProEngine::new(runner, "/repo");
        let opts = RenderOptions {
            variant_count: 1,
            ..Default::default()
        };
        let result = engine.render_reel_by_id("demo-1", &opts).unwrap();
        assert_eq!(result.status, RenderStatus::Completed);
        assert_eq!(result.provider, "render-pro");
        assert!(!result.render_log.is_empty());
    }

    #[test]
    fn render_by_id_propagates_nonzero_exit() {
        let runner = RecordingRunner::new().with_response(1, "");
        let engine = RenderProEngine::new(runner, "/repo");
        let opts = RenderOptions {
            variant_count: 1,
            ..Default::default()
        };
        let err = engine.render_reel_by_id("demo-1", &opts).unwrap_err();
        assert!(err.to_string().contains("exited 1"));
    }
}
