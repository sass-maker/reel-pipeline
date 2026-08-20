//! Safe Blender literal-scene engine.
//!
//! Node owns Blender manifest validation and the repository-owned scene
//! builder. Rust writes the normalized brief, invokes that bounded adapter,
//! and maps its JSON receipt into the shared render result.

use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};

use crate::brief::VideoBrief;
use crate::engine::{RenderEngine, RenderOptions, RenderResult, RenderStatus};
use crate::runner::{CommandRunner, CommandSpec};

pub struct BlenderEngine<R: CommandRunner> {
    runner: R,
    repo_root: PathBuf,
}

impl<R: CommandRunner> BlenderEngine<R> {
    pub fn new(runner: R, repo_root: impl Into<PathBuf>) -> Self {
        Self {
            runner,
            repo_root: repo_root.into(),
        }
    }

    pub fn command_for(&self, brief_path: &Path, artifact_dir: &Path) -> CommandSpec {
        CommandSpec::new(
            "node",
            [
                "scripts/render-blender-scenes.js".to_string(),
                "--brief".to_string(),
                brief_path.to_string_lossy().into_owned(),
                "--artifact-dir".to_string(),
                artifact_dir.to_string_lossy().into_owned(),
            ],
        )
        .cwd(self.repo_root.clone())
    }
}

impl<R: CommandRunner> RenderEngine for BlenderEngine<R> {
    fn name(&self) -> &str {
        "blender"
    }

    fn create_video(&self, brief: &VideoBrief, _options: &RenderOptions) -> Result<RenderResult> {
        let request_dir = self
            .repo_root
            .join(".reel-pipeline/blender-requests")
            .join(format!("{}_{}", stable_slug(&brief.id), now_millis()));
        let artifact_dir = self.repo_root.join(".reel-pipeline/blender");
        std::fs::create_dir_all(&request_dir)
            .with_context(|| format!("creating {}", request_dir.display()))?;
        let brief_path = request_dir.join("brief.json");
        std::fs::write(&brief_path, serde_json::to_string_pretty(brief)?)?;

        let output = self
            .runner
            .run(&self.command_for(&brief_path, &artifact_dir))?;
        if !output.ok() {
            return Err(anyhow!(
                "blender exited {} for {}: {}",
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
            body: "Script: literal scene. Shot list: one bounded Blender plate. Captions: none. Asset prompts: allowlisted primitives.".to_string(),
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
            render_mode: "blender".to_string(),
            duration_seconds: 6.0,
        };
        self.create_video(&brief, options)
    }
}

fn parse_render_result(stdout: &str) -> Result<RenderResult> {
    let value: serde_json::Value = serde_json::from_str(stdout)
        .with_context(|| format!("parsing Blender renderer output: {stdout}"))?;
    let task_id = value
        .get("externalTaskId")
        .or_else(|| value.get("external_task_id"))
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| anyhow!("Blender output missing externalTaskId"))?;
    let provider = value
        .get("provider")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("blender");
    let mut result = RenderResult::completed(provider, task_id);
    result.status = match value.get("status").and_then(serde_json::Value::as_str) {
        Some("completed") | None => RenderStatus::Completed,
        Some("queued") => RenderStatus::Queued,
        Some("running") => RenderStatus::Running,
        Some("failed") => RenderStatus::Failed,
        Some(other) => return Err(anyhow!("unsupported Blender status: {other}")),
    };
    result.thumbnail = value
        .get("artifacts")
        .and_then(serde_json::Value::as_array)
        .and_then(|items| items.first())
        .and_then(serde_json::Value::as_str)
        .map(PathBuf::from);
    result.proof_type = value
        .get("proofType")
        .or_else(|| value.get("proof_type"))
        .and_then(serde_json::Value::as_str)
        .map(ToString::to_string);
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
    result.artifact_manifest = value.get("artifactManifest").cloned();
    result.artifact_manifest_path = value
        .get("artifactManifestPath")
        .and_then(serde_json::Value::as_str)
        .map(PathBuf::from);
    Ok(result)
}

fn stable_slug(value: &str) -> String {
    let mut output = String::new();
    for character in value.to_ascii_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            output.push(character);
        } else if !output.ends_with('-') {
            output.push('-');
        }
    }
    output.trim_matches('-').chars().take(80).collect()
}

fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::testing::RecordingRunner;

    #[test]
    fn builds_bounded_node_adapter_command() {
        let engine = BlenderEngine::new(RecordingRunner::new(), "/repo");
        let command = engine.command_for(
            Path::new("/tmp/brief.json"),
            Path::new("/tmp/blender-artifacts"),
        );
        assert_eq!(command.program, "node");
        assert_eq!(
            command.args,
            vec![
                "scripts/render-blender-scenes.js",
                "--brief",
                "/tmp/brief.json",
                "--artifact-dir",
                "/tmp/blender-artifacts",
            ]
        );
        assert_eq!(command.cwd.as_deref(), Some(Path::new("/repo")));
    }

    #[test]
    fn parses_plate_and_provenance() {
        let result = parse_render_result(
            r#"{"provider":"blender","externalTaskId":"blender_fixture","status":"completed","artifacts":["/tmp/plate.png"],"proofType":"generated_card","renderLog":["blenderVersion=5.2.0"],"artifactManifest":{"schema_version":1},"artifactManifestPath":"/tmp/manifest.json"}"#,
        )
        .unwrap();
        assert_eq!(result.provider, "blender");
        assert_eq!(result.thumbnail, Some(PathBuf::from("/tmp/plate.png")));
        assert_eq!(result.render_log, vec!["blenderVersion=5.2.0"]);
        assert_eq!(
            result.artifact_manifest_path,
            Some(PathBuf::from("/tmp/manifest.json"))
        );
    }
}
