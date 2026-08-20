//! HTML/CSS composition preview engine.
//!
//! This mirrors the Node adapter and intentionally exports authoring artifacts
//! rather than a posting-ready MP4: `composition.html`, `timeline.json`, and
//! `captions.json`. A later renderer can consume those files for video output.

use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};

use crate::brief::VideoBrief;
use crate::engine::{RenderEngine, RenderOptions, RenderResult, RenderStatus};
use crate::runner::{CommandRunner, CommandSpec};

pub struct HtmlCompositionEngine<R: CommandRunner> {
    runner: R,
    repo_root: PathBuf,
    node_bin: String,
    script_path: String,
}

impl<R: CommandRunner> HtmlCompositionEngine<R> {
    pub fn new(runner: R, repo_root: impl Into<PathBuf>) -> Self {
        Self {
            runner,
            repo_root: repo_root.into(),
            node_bin: "node".to_string(),
            script_path: "scripts/export-html-composition.js".to_string(),
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

impl<R: CommandRunner> RenderEngine for HtmlCompositionEngine<R> {
    fn name(&self) -> &str {
        "html-composition"
    }

    fn create_video(&self, brief: &VideoBrief, _options: &RenderOptions) -> Result<RenderResult> {
        let request_dir = self
            .repo_root
            .join(".reel-pipeline/html-composition-requests")
            .join(format!("{}_{}", stable_slug(&brief.id), now_millis()));
        let artifact_dir = self.repo_root.join(".reel-pipeline/html-composition");
        std::fs::create_dir_all(&request_dir)
            .with_context(|| format!("creating {}", request_dir.display()))?;
        let brief_path = request_dir.join("brief.json");
        std::fs::write(&brief_path, serde_json::to_string_pretty(brief)?)?;

        let spec = self.command_for(&brief_path, &artifact_dir);
        let output = self.runner.run(&spec)?;
        if !output.ok() {
            return Err(anyhow!(
                "html-composition exited {} for {}: {}",
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
            body: "Script: preview composition. Shot list: HTML scenes. Captions: timed text. Asset prompts: CSS motion.".to_string(),
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
            render_mode: "html-composition".to_string(),
            duration_seconds: 20.0,
        };
        self.create_video(&brief, options)
    }

    fn get_status(&self, external_task_id: &str) -> Result<RenderResult> {
        let manifest_path = self
            .repo_root
            .join(".reel-pipeline/html-composition")
            .join(external_task_id)
            .join("manifest.json");
        let raw = std::fs::read_to_string(&manifest_path)
            .with_context(|| format!("reading {}", manifest_path.display()))?;
        let value: serde_json::Value = serde_json::from_str(&raw)
            .with_context(|| format!("parsing {}", manifest_path.display()))?;
        let render = value
            .get("render")
            .ok_or_else(|| anyhow!("html-composition manifest missing render"))?;
        parse_render_result(&render.to_string())
    }
}

fn parse_render_result(stdout: &str) -> Result<RenderResult> {
    let value: serde_json::Value = serde_json::from_str(stdout)
        .with_context(|| format!("parsing html-composition renderer output: {stdout}"))?;
    let provider = value
        .get("provider")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("html-composition");
    let task_id = value
        .get("externalTaskId")
        .or_else(|| value.get("external_task_id"))
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| anyhow!("html-composition output missing externalTaskId"))?;
    let mut result = RenderResult::completed(provider, task_id);
    result.status = match value.get("status").and_then(serde_json::Value::as_str) {
        Some("completed") | None => RenderStatus::Completed,
        Some("queued") => RenderStatus::Queued,
        Some("running") => RenderStatus::Running,
        Some("failed") => RenderStatus::Failed,
        Some(other) => return Err(anyhow!("unsupported html-composition status: {other}")),
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
    fn builds_html_composition_command() {
        let engine = HtmlCompositionEngine::new(RecordingRunner::new(), "/repo");
        let spec = engine.command_for(Path::new("/tmp/brief.json"), Path::new("/tmp/artifacts"));
        assert_eq!(spec.program, "node");
        assert_eq!(
            spec.args,
            vec![
                "scripts/export-html-composition.js",
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
            r#"{"provider":"html-composition","externalTaskId":"html_b1_fixed","status":"completed","videos":[],"durationSeconds":12,"proofType":"generated_card","renderLog":["style=html-css-composition"]}"#,
        )
        .unwrap();
        assert_eq!(result.provider, "html-composition");
        assert_eq!(result.external_task_id, "html_b1_fixed");
        assert_eq!(result.status, RenderStatus::Completed);
        assert!(result.videos.is_empty());
        assert_eq!(result.duration_seconds, Some(12.0));
        assert_eq!(result.proof_type.as_deref(), Some("generated_card"));
        assert_eq!(result.render_log, vec!["style=html-css-composition"]);
    }
}
