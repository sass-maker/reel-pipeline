//! Content Factory artifact-manifest adapter for native Rust render engines.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use serde_json::{json, Value};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::brief::VideoBrief;
use crate::engine::{RenderResult, RenderStatus};

const REMOTE_ARTIFACT_MAX_BYTES: u64 = 512 * 1024 * 1024;
const REMOTE_ARTIFACT_TIMEOUT: Duration = Duration::from_secs(120);

pub fn attach_manifest(
    brief: &VideoBrief,
    render: &mut RenderResult,
    repo_root: &Path,
) -> Result<()> {
    if render.status != RenderStatus::Completed || render.artifact_manifest.is_some() {
        return Ok(());
    }
    let locations = render
        .videos
        .iter()
        .chain(render.combined_videos.iter())
        .cloned()
        .collect::<Vec<_>>();
    if locations.is_empty() {
        return Err(anyhow!(
            "renderer {} completed without a verifiable artifact manifest",
            render.provider
        ));
    }

    let variant_id = format!("{}-vertical", brief.id);
    let mut assets = Vec::new();
    let mut first_path = None;
    for (index, location) in locations.iter().enumerate() {
        let (bytes, artifact_media_type) = if location.starts_with("http://")
            || location.starts_with("https://")
        {
            let config = ureq::Agent::config_builder()
                .timeout_global(Some(REMOTE_ARTIFACT_TIMEOUT))
                .build();
            let agent = ureq::Agent::new_with_config(config);
            let mut response = agent
                .get(location)
                .call()
                .with_context(|| format!("fetching remote artifact {location}"))?;
            if response
                .headers()
                .get("content-length")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse::<u64>().ok())
                .is_some_and(|size| size > REMOTE_ARTIFACT_MAX_BYTES)
            {
                return Err(anyhow!(
                    "remote artifact exceeds {REMOTE_ARTIFACT_MAX_BYTES} bytes: {location}"
                ));
            }
            let content_type = response
                .headers()
                .get("content-type")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.split(';').next())
                .map(ToString::to_string)
                .unwrap_or_else(|| media_type(Path::new(location)).to_string());
            let mut reader = response
                .body_mut()
                .with_config()
                .limit(REMOTE_ARTIFACT_MAX_BYTES + 1)
                .reader();
            let mut digest = Sha256::new();
            let mut size_bytes = 0_u64;
            let mut chunk = [0_u8; 64 * 1024];
            loop {
                let read = reader
                    .read(&mut chunk)
                    .with_context(|| format!("reading remote artifact {location}"))?;
                if read == 0 {
                    break;
                }
                size_bytes += read as u64;
                if size_bytes > REMOTE_ARTIFACT_MAX_BYTES {
                    return Err(anyhow!(
                        "remote artifact exceeds {REMOTE_ARTIFACT_MAX_BYTES} bytes: {location}"
                    ));
                }
                digest.update(&chunk[..read]);
            }
            assets.push(json!({
                "id": format!("{variant_id}-asset-{}", index + 1),
                "variant_id": variant_id,
                "media_type": content_type,
                "location": location,
                "sha256": digest.finalize(),
                "size_bytes": size_bytes,
            }));
            continue;
        } else {
            let local_path = local_path(location, repo_root)?;
            let metadata = fs::metadata(&local_path)
                .with_context(|| format!("reading artifact metadata {}", local_path.display()))?;
            if !metadata.is_file() {
                return Err(anyhow!("artifact is not a file: {}", local_path.display()));
            }
            first_path.get_or_insert_with(|| local_path.clone());
            (fs::read(&local_path)?, media_type(&local_path).to_string())
        };
        assets.push(json!({
            "id": format!("{variant_id}-asset-{}", index + 1),
            "variant_id": variant_id,
            "media_type": artifact_media_type,
            "location": location,
            "sha256": sha256_bytes(&bytes),
            "size_bytes": bytes.len(),
        }));
    }

    let brief_bytes = serde_json::to_vec(brief)?;
    let input_hash = sha256_bytes(&brief_bytes);
    let created_at = OffsetDateTime::now_utc().format(&Rfc3339)?;
    let channel_intent = match brief.channel.as_str() {
        "instagram_reels" => vec!["instagram_reels"],
        "youtube_shorts" => vec!["youtube_shorts"],
        _ => vec!["instagram_reels", "youtube_shorts"],
    };
    let manifest_id_seed = format!(
        "{}:{}:{}",
        render.external_task_id,
        input_hash,
        assets
            .iter()
            .filter_map(|asset| asset.get("sha256").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join(":")
    );
    let source_id = brief
        .marketing_post_id
        .as_deref()
        .or(brief.task_id.as_deref())
        .unwrap_or(&brief.id);
    let manifest = json!({
        "schema_version": 1,
        "manifest_id": format!("manifest-{}", &sha256_bytes(manifest_id_seed.as_bytes())[..24]),
        "generation_run_id": render.external_task_id,
        "brief": { "id": brief.id, "version": 1 },
        "project_id": brief.project_slug,
        "campaign_id": brief.marketing_post_id.clone().unwrap_or_else(|| format!("legacy:{source_id}")),
        "experiment_id": Value::Null,
        "input_hash": input_hash,
        "renderer": { "id": render.provider, "version": "reel-pipeline-rust-adapter-v1" },
        "variants": [{
            "id": variant_id,
            "format": "vertical_video_9_16",
            "channel_intent": channel_intent,
        }],
        "assets": assets,
        "quality": {
            "status": "review",
            "checks": [{
                "id": "artifact-integrity",
                "status": "passed",
                "observed_at": created_at,
                "evidence_ref": format!("sha256://{}", assets[0]["sha256"].as_str().unwrap_or_default()),
                "message": "All emitted artifacts were read locally and hashed.",
            }],
        },
        "provenance": [{ "kind": "reel-pipeline-video-brief", "id": source_id, "revision": Value::Null }],
        "review": {
            "stage": "artifact_review",
            "status": "pending",
            "decided_by": Value::Null,
            "decided_at": Value::Null,
            "evidence_ref": Value::Null,
        },
        "created_at": created_at,
    });
    validate_manifest(&manifest)?;

    let manifest_file_name = format!(
        "{}.content-factory-manifest.v1.json",
        safe_file_name(&render.external_task_id)
    );
    let manifest_path = if let Some(path) = first_path {
        path.parent()
            .map(|parent| parent.join(&manifest_file_name))
            .ok_or_else(|| anyhow!("cannot resolve artifact manifest path"))?
    } else {
        let directory = repo_root.join(".reel-pipeline/content-factory");
        fs::create_dir_all(&directory)?;
        directory.join(&manifest_file_name)
    };
    if manifest_path.exists() {
        let existing: Value = serde_json::from_str(&fs::read_to_string(&manifest_path)?)?;
        validate_manifest(&existing)?;
        if existing["generation_run_id"] != manifest["generation_run_id"]
            || existing["input_hash"] != manifest["input_hash"]
        {
            return Err(anyhow!(
                "immutable manifest collision at {}",
                manifest_path.display()
            ));
        }
        render.artifact_manifest = Some(existing);
    } else {
        fs::write(
            &manifest_path,
            format!("{}\n", serde_json::to_string_pretty(&manifest)?),
        )?;
        render.artifact_manifest = Some(manifest);
    }
    render.artifact_manifest_path = Some(manifest_path);
    Ok(())
}

fn validate_manifest(manifest: &Value) -> Result<()> {
    if manifest["schema_version"] != 1 {
        return Err(anyhow!("Content Factory manifest schema_version must be 1"));
    }
    for field in [
        "manifest_id",
        "generation_run_id",
        "project_id",
        "campaign_id",
        "input_hash",
        "created_at",
    ] {
        if manifest[field].as_str().is_none_or(str::is_empty) {
            return Err(anyhow!("Content Factory manifest missing {field}"));
        }
    }
    if !is_sha256(manifest["input_hash"].as_str().unwrap_or_default()) {
        return Err(anyhow!("Content Factory manifest input_hash is invalid"));
    }
    let assets = manifest["assets"]
        .as_array()
        .filter(|assets| !assets.is_empty())
        .ok_or_else(|| anyhow!("Content Factory manifest needs verified assets"))?;
    if assets
        .iter()
        .any(|asset| !is_sha256(asset["sha256"].as_str().unwrap_or_default()))
    {
        return Err(anyhow!(
            "Content Factory manifest contains an invalid asset hash"
        ));
    }
    if manifest["quality"]["checks"]
        .as_array()
        .is_none_or(Vec::is_empty)
    {
        return Err(anyhow!("Content Factory manifest needs quality evidence"));
    }
    if manifest["review"]["stage"] != "artifact_review" {
        return Err(anyhow!(
            "Content Factory manifest needs artifact review state"
        ));
    }
    Ok(())
}

fn local_path(location: &str, repo_root: &Path) -> Result<PathBuf> {
    if location.starts_with("http://") || location.starts_with("https://") {
        return Err(anyhow!("cannot verify non-local artifact: {location}"));
    }
    let path = location.strip_prefix("file://").unwrap_or(location);
    let path = PathBuf::from(path);
    Ok(if path.is_absolute() {
        path
    } else {
        repo_root.join(path)
    })
}

fn media_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
    {
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "html" => "text/html",
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        _ => "application/octet-stream",
    }
}

fn safe_file_name(value: &str) -> String {
    let value = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    let value = value.trim_matches('-');
    if value.is_empty() {
        "generation".to_string()
    } else {
        value.chars().take(140).collect()
    }
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn sha256_bytes(input: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(input);
    digest.finalize()
}

struct Sha256 {
    state: [u32; 8],
    block: [u8; 64],
    block_len: usize,
    total_len: u64,
}

impl Sha256 {
    fn new() -> Self {
        Self {
            state: [
                0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
                0x5be0cd19,
            ],
            block: [0; 64],
            block_len: 0,
            total_len: 0,
        }
    }

    fn update(&mut self, mut input: &[u8]) {
        self.total_len = self.total_len.wrapping_add(input.len() as u64);
        if self.block_len > 0 {
            let take = (64 - self.block_len).min(input.len());
            self.block[self.block_len..self.block_len + take].copy_from_slice(&input[..take]);
            self.block_len += take;
            input = &input[take..];
            if self.block_len == 64 {
                let block = self.block;
                self.compress(&block);
                self.block_len = 0;
            }
        }
        while input.len() >= 64 {
            let block: &[u8; 64] = input[..64].try_into().expect("64-byte SHA block");
            self.compress(block);
            input = &input[64..];
        }
        if !input.is_empty() {
            self.block[..input.len()].copy_from_slice(input);
            self.block_len = input.len();
        }
    }

    fn finalize(mut self) -> String {
        let bit_len = self.total_len.wrapping_mul(8);
        self.block[self.block_len] = 0x80;
        self.block_len += 1;
        if self.block_len > 56 {
            self.block[self.block_len..].fill(0);
            let block = self.block;
            self.compress(&block);
            self.block = [0; 64];
        } else {
            self.block[self.block_len..56].fill(0);
        }
        self.block[56..].copy_from_slice(&bit_len.to_be_bytes());
        let block = self.block;
        self.compress(&block);
        self.state
            .iter()
            .map(|word| format!("{word:08x}"))
            .collect()
    }

    fn compress(&mut self, block: &[u8; 64]) {
        const K: [u32; 64] = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
            0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
            0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
            0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
            0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
            0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
            0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
            0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
            0xc67178f2,
        ];
        let mut w = [0u32; 64];
        for (index, bytes) in block.chunks_exact(4).enumerate() {
            w[index] = u32::from_be_bytes(bytes.try_into().expect("four-byte SHA word"));
        }
        for index in 16..64 {
            let s0 = w[index - 15].rotate_right(7)
                ^ w[index - 15].rotate_right(18)
                ^ (w[index - 15] >> 3);
            let s1 = w[index - 2].rotate_right(17)
                ^ w[index - 2].rotate_right(19)
                ^ (w[index - 2] >> 10);
            w[index] = w[index - 16]
                .wrapping_add(s0)
                .wrapping_add(w[index - 7])
                .wrapping_add(s1);
        }
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh] = self.state;
        for index in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let choice = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(choice)
                .wrapping_add(K[index])
                .wrapping_add(w[index]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let majority = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(majority);
            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }
        for (slot, value) in self.state.iter_mut().zip([a, b, c, d, e, f, g, hh]) {
            *slot = slot.wrapping_add(value);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brief::normalize_from_value;
    use crate::engine::mock::MockEngine;
    use crate::engine::{RenderEngine, RenderOptions};

    #[test]
    fn sha256_matches_known_vector() {
        assert_eq!(
            sha256_bytes(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let payload = vec![b'a'; 1_000];
        let mut streaming = Sha256::new();
        for chunk in payload.chunks(37) {
            streaming.update(chunk);
        }
        assert_eq!(
            streaming.finalize(),
            "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3"
        );
    }

    #[test]
    fn native_render_gets_validated_manifest_with_hash_and_review_state() {
        let temp = tempfile::tempdir().unwrap();
        let brief = normalize_from_value(&json!({
            "id": "brief-1",
            "project_slug": "high-signal",
            "channel": "youtube_shorts",
            "title": "Proof",
            "hook": "Proof first",
            "body": "Script: x. Shot list: y. Captions: z. Asset prompts: w."
        }))
        .unwrap();
        let mut render = MockEngine::new(temp.path())
            .with_task_suffix("fixed")
            .create_video(&brief, &RenderOptions::default())
            .unwrap();
        attach_manifest(&brief, &mut render, temp.path()).unwrap();
        let manifest = render.artifact_manifest.as_ref().unwrap();
        assert_eq!(manifest["quality"]["status"], "review");
        assert_eq!(manifest["review"]["status"], "pending");
        assert!(is_sha256(manifest["assets"][0]["sha256"].as_str().unwrap()));
        assert!(render.artifact_manifest_path.as_ref().unwrap().exists());
    }
}
