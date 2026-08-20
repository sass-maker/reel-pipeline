//! ASCII animation render engine.
//!
//! The renderer itself lives in `src/adapters/ascii-animation.js` so the Node
//! control layer and Rust orchestrator share one implementation. Rust only
//! writes the normalized brief, shells out to the Node CLI, then maps the JSON
//! result back into [`RenderResult`].

use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};

use crate::brief::VideoBrief;
use crate::engine::{RenderEngine, RenderOptions, RenderResult, RenderStatus};
use crate::runner::{CommandRunner, CommandSpec};

pub struct AsciiAnimationEngine<R: CommandRunner> {
    runner: R,
    repo_root: PathBuf,
    node_bin: String,
    script_path: String,
}

impl<R: CommandRunner> AsciiAnimationEngine<R> {
    pub fn new(runner: R, repo_root: impl Into<PathBuf>) -> Self {
        Self {
            runner,
            repo_root: repo_root.into(),
            node_bin: "node".to_string(),
            script_path: "scripts/render-ascii-animation.js".to_string(),
        }
    }

    pub fn command_for(&self, brief_path: &Path, artifact_dir: &Path) -> CommandSpec {
        CommandSpec::new(
            &self.node_bin,
            [
                self.script_path.clone(),
                "--brief".to_string(),
                brief_path.to_string_lossy().into_owned(),
                "--artifact-dir".to_string(),
                artifact_dir.to_string_lossy().into_owned(),
            ],
        )
        .cwd(self.repo_root.clone())
    }
}

impl<R: CommandRunner> RenderEngine for AsciiAnimationEngine<R> {
    fn name(&self) -> &str {
        "ascii-animation"
    }

    fn create_video(&self, brief: &VideoBrief, _options: &RenderOptions) -> Result<RenderResult> {
        let request_dir = self
            .repo_root
            .join(".reel-pipeline/ascii-requests")
            .join(format!("{}_{}", stable_slug(&brief.id), now_millis()));
        let artifact_dir = self.repo_root.join(".reel-pipeline/ascii-animation");
        std::fs::create_dir_all(&request_dir)
            .with_context(|| format!("creating {}", request_dir.display()))?;
        let brief_path = request_dir.join("brief.json");
        std::fs::write(&brief_path, serde_json::to_string_pretty(brief)?)?;

        let spec = self.command_for(&brief_path, &artifact_dir);
        let output = self.runner.run(&spec)?;
        if !output.ok() {
            return Err(anyhow!(
                "ascii-animation exited {} for {}: {}",
                output.status,
                brief.id,
                output.stderr.lines().last().unwrap_or("").trim()
            ));
        }
        parse_render_result(output.stdout.trim())
    }

    fn render_reel_by_id(&self, reel_id: &str, options: &RenderOptions) -> Result<RenderResult> {
        let brief = VideoBrief {
            id: reel_id.to_string(),
            project_slug: "reel".to_string(),
            task_id: None,
            marketing_post_id: None,
            channel: "other".to_string(),
            title: reel_id.to_string(),
            hook: options.hook.clone().unwrap_or_else(|| reel_id.to_string()),
            body: "body".to_string(),
            cta: options.cta.clone(),
            audience: None,
            product_url: None,
            proof_url: None,
            target_route: None,
            recording_url: None,
            changelog_entry_id: None,
            brand_tone: None,
            proof_type: Some("generated_card".to_string()),
            template: options.template.clone(),
            screenshots: None,
            demo_steps: None,
            render_mode: "ascii".to_string(),
            duration_seconds: 6.0,
        };
        self.create_video(&brief, options)
    }
}

fn parse_render_result(stdout: &str) -> Result<RenderResult> {
    let value: serde_json::Value = serde_json::from_str(stdout)
        .with_context(|| format!("parsing ascii-animation renderer output: {stdout}"))?;
    let provider = value
        .get("provider")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("ascii-animation");
    let task_id = value
        .get("externalTaskId")
        .or_else(|| value.get("external_task_id"))
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| anyhow!("ascii-animation output missing externalTaskId"))?;
    let mut result = RenderResult::completed(provider, task_id);
    result.status = match value.get("status").and_then(serde_json::Value::as_str) {
        Some("completed") | None => RenderStatus::Completed,
        Some("queued") => RenderStatus::Queued,
        Some("running") => RenderStatus::Running,
        Some("failed") => RenderStatus::Failed,
        Some(other) => return Err(anyhow!("unsupported ascii-animation status: {other}")),
    };
    result.videos = value
        .get("videos")
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default();
    result.duration_seconds = value
        .get("durationSeconds")
        .or_else(|| value.get("duration_seconds"))
        .and_then(serde_json::Value::as_f64);
    result.proof_type = value
        .get("proofType")
        .or_else(|| value.get("proof_type"))
        .and_then(serde_json::Value::as_str)
        .map(ToString::to_string);
    result.artifact_manifest = value.get("artifactManifest").cloned();
    result.artifact_manifest_path = value
        .get("artifactManifestPath")
        .and_then(serde_json::Value::as_str)
        .map(std::path::PathBuf::from);
    result.render_log = value
        .get("renderLog")
        .or_else(|| value.get("render_log"))
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default();
    Ok(result)
}

fn stable_slug(value: &str) -> String {
    let mut out = String::new();
    for ch in value.to_ascii_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    out.trim_matches('-').chars().take(80).collect::<String>()
}

fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::testing::RecordingRunner;

    #[test]
    fn builds_ascii_animation_command() {
        let engine = AsciiAnimationEngine::new(RecordingRunner::new(), "/repo");
        let spec = engine.command_for(Path::new("/tmp/brief.json"), Path::new("/tmp/artifacts"));
        assert_eq!(spec.program, "node");
        assert_eq!(
            spec.args,
            vec![
                "scripts/render-ascii-animation.js",
                "--brief",
                "/tmp/brief.json",
                "--artifact-dir",
                "/tmp/artifacts",
            ]
        );
        assert_eq!(spec.cwd.as_deref(), Some(Path::new("/repo")));
    }

    #[test]
    fn parses_node_render_result() {
        let result = parse_render_result(
            r#"{"provider":"ascii-animation","externalTaskId":"ascii_b1_fixed","status":"completed","videos":["/tmp/out.mp4"],"durationSeconds":6,"proofType":"generated_card","renderLog":["style=ascii-fable"]}"#,
        )
        .unwrap();
        assert_eq!(result.provider, "ascii-animation");
        assert_eq!(result.external_task_id, "ascii_b1_fixed");
        assert_eq!(result.status, RenderStatus::Completed);
        assert_eq!(result.videos, vec!["/tmp/out.mp4"]);
        assert_eq!(result.duration_seconds, Some(6.0));
        assert_eq!(result.proof_type.as_deref(), Some("generated_card"));
        assert_eq!(result.render_log, vec!["style=ascii-fable"]);
    }
}
