//! Project URL configuration used by the render pipeline.

use std::collections::BTreeMap;
use std::path::Path;

use anyhow::{anyhow, Context, Result};

pub fn load_project_urls(path: &Path) -> Result<BTreeMap<String, String>> {
    let raw = std::fs::read_to_string(path)
        .with_context(|| format!("reading project urls {}", path.display()))?;
    parse_project_urls(&raw)
}

pub fn parse_project_urls(raw: &str) -> Result<BTreeMap<String, String>> {
    let value: serde_json::Value =
        serde_json::from_str(raw).context("parsing project urls json")?;
    let obj = value
        .as_object()
        .ok_or_else(|| anyhow!("project urls must be a JSON object"))?;
    let mut out = BTreeMap::new();
    for (slug, entry) in obj {
        if slug.starts_with('$') {
            continue;
        }
        let url = match entry {
            serde_json::Value::String(s) => Some(s.clone()),
            serde_json::Value::Object(o) => o
                .get("productUrl")
                .and_then(|v| v.as_str())
                .or_else(|| o.get("fallbackUrl").and_then(|v| v.as_str()))
                .map(str::to_string),
            _ => None,
        };
        if let Some(url) = url.filter(|value| !value.trim().is_empty()) {
            out.insert(slug.clone(), url);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_project_urls_skipping_comments() {
        let raw = r#"{
            "$comment": "ignore me",
            "linkchat": { "productUrl": "https://linkchat.dev", "fallbackUrl": "https://gh/linkchat" },
            "reader": "https://reader.dev",
            "broken": {}
        }"#;
        let map = parse_project_urls(raw).unwrap();
        assert_eq!(map.get("linkchat").unwrap(), "https://linkchat.dev");
        assert_eq!(map.get("reader").unwrap(), "https://reader.dev");
        assert!(!map.contains_key("$comment"));
        assert!(!map.contains_key("broken"));
    }

    #[test]
    fn falls_back_to_fallback_url() {
        let raw = r#"{ "x": { "fallbackUrl": "https://gh/x" } }"#;
        let map = parse_project_urls(raw).unwrap();
        assert_eq!(map.get("x").unwrap(), "https://gh/x");
    }
}
