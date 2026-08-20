//! HTTP client for the reel-pipeline Cloudflare Worker.
//!
//! The production render loop polls `GET /reels?status=approved` and renders
//! each reel where `renderJobId` is unset and `variants` is empty — mirroring
//! `scripts/auto-render-watcher.js`.

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;

pub const DEFAULT_WORKER_URL: &str =
    "https://reel-pipeline-artifacts.sarthakagrawal927.workers.dev";

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReelRecord {
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub project_slug: Option<String>,
    #[serde(default)]
    pub render_job_id: Option<String>,
    #[serde(default)]
    pub variants: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct ReelsResponse {
    #[serde(default)]
    data: Vec<ReelRecord>,
}

/// True when the reel still needs a `render-pro.js` pass (ports `needsRender`).
pub fn needs_render(reel: &ReelRecord) -> bool {
    if reel
        .render_job_id
        .as_ref()
        .is_some_and(|id| !id.trim().is_empty())
    {
        return false;
    }
    if let Some(variants) = &reel.variants {
        if !variants.is_empty() {
            return false;
        }
    }
    true
}

pub struct WorkerClient {
    base_url: String,
    internal_token: Option<String>,
}

impl WorkerClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            internal_token: std::env::var("REEL_INTERNAL_TOKEN").ok(),
        }
    }

    pub fn from_env_or_default(explicit: Option<String>) -> Self {
        let url = explicit
            .or_else(|| std::env::var("REEL_WORKER_URL").ok())
            .unwrap_or_else(|| DEFAULT_WORKER_URL.to_string());
        Self::new(url)
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    pub fn fetch_approved(&self) -> Result<Vec<ReelRecord>> {
        let url = format!("{}/reels?status=approved", self.base_url);
        let token = self.internal_token.as_deref().ok_or_else(|| {
            anyhow!("REEL_INTERNAL_TOKEN is required for internal Reel Pipeline Worker routes")
        })?;
        let mut response = ureq::get(&url)
            .header("authorization", &format!("Bearer {token}"))
            .call()
            .map_err(|err| anyhow!("worker GET {url} failed: {err}"))?;
        let status = response.status();
        if status != 200 {
            return Err(anyhow!("worker /reels?status=approved → {status}"));
        }
        let body = response
            .body_mut()
            .read_to_string()
            .context("reading worker /reels response body")?;
        let payload: ReelsResponse =
            serde_json::from_str(&body).context("parsing worker /reels JSON")?;
        Ok(payload.data)
    }

    pub fn approved_needing_render(&self) -> Result<Vec<ReelRecord>> {
        Ok(self
            .fetch_approved()?
            .into_iter()
            .filter(needs_render)
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn needs_render_matches_js_semantics() {
        let bare = ReelRecord {
            id: "r1".into(),
            title: None,
            project_slug: None,
            render_job_id: None,
            variants: None,
        };
        assert!(needs_render(&bare));

        let with_job = ReelRecord {
            render_job_id: Some("job_1".into()),
            ..bare.clone()
        };
        assert!(!needs_render(&with_job));

        let with_variants = ReelRecord {
            variants: Some(vec![serde_json::json!({"variantId": "v1"})]),
            ..bare
        };
        assert!(!needs_render(&with_variants));
    }

    #[test]
    fn parses_worker_list_payload() {
        let raw = r#"{
          "data": [
            {
              "id": "demo-1",
              "title": "Hook reel",
              "projectSlug": "linkchat",
              "renderJobId": null,
              "variants": []
            },
            {
              "id": "demo-2",
              "projectSlug": "reader",
              "renderJobId": "job_x",
              "variants": []
            }
          ]
        }"#;
        let payload: ReelsResponse = serde_json::from_str(raw).unwrap();
        assert_eq!(payload.data.len(), 2);
        let pending: Vec<_> = payload.data.iter().filter(|r| needs_render(r)).collect();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].id, "demo-1");
    }
}
