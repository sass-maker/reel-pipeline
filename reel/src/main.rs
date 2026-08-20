//! `reel` binary entry point. Wires the CLI to the library. Live/network-heavy
//! subcommands default to dry-run (printing the exact shell-out) so the binary
//! is safe to run without a render environment.

mod cli;

use std::path::Path;

use anyhow::{Context, Result};
use clap::Parser;

use reel::brief::normalize_from_value;
use reel::config::load_project_urls;
use reel::engine::render_pro::RenderProEngine;
use reel::engine::RenderEngine;
use reel::engine::RenderOptions;
use reel::orchestrator::render_reel_variants;
use reel::publisher::NoopPublisher;
use reel::quality::{score_variant, ScoreInput};
use reel::runner::ProcessRunner;
use reel::templates::build_variant_plan;
use reel::watcher::{run_watch, WatchConfig};

use cli::{Cli, Command, ConfigKind};

fn main() -> Result<()> {
    let cli = Cli::parse();
    match &cli.command {
        Command::Render(args) => cmd_render(&cli.repo_root, args),
        Command::Watch(args) => cmd_watch(&cli.repo_root, args),
        Command::Plan(args) => cmd_plan(args),
        Command::ValidateBrief(args) => cmd_validate(args),
        Command::Score(args) => cmd_score(args),
        Command::Config(args) => cmd_config(&cli.repo_root, args),
    }
}

fn read_brief_value(path: &Path) -> Result<serde_json::Value> {
    let raw = std::fs::read_to_string(path)
        .with_context(|| format!("reading brief {}", path.display()))?;
    serde_json::from_str(&raw).with_context(|| format!("parsing brief json {}", path.display()))
}

fn cmd_render(repo_root: &Path, args: &cli::RenderArgs) -> Result<()> {
    let engine = RenderProEngine::new(ProcessRunner, repo_root);
    let execute = args.execute;
    for reel_id in &args.reel_ids {
        let spec = engine.command_for(reel_id, args.variant_count);
        if execute {
            println!("▸ rendering {reel_id}: {}", spec.display());
            let opts = RenderOptions {
                variant_count: args.variant_count,
                ..Default::default()
            };
            let result = engine.render_reel_by_id(reel_id, &opts)?;
            println!(
                "✓ {reel_id}: {} ({} log lines)",
                result.status.as_str(),
                result.render_log.len()
            );
        } else {
            println!(
                "[dry-run] would run (cwd={}): {}",
                repo_root.display(),
                spec.display()
            );
            println!(
                "          REEL_VARIANT_COUNT={}",
                spec.env
                    .get("REEL_VARIANT_COUNT")
                    .cloned()
                    .unwrap_or_default()
            );
        }
    }
    Ok(())
}

fn cmd_watch(repo_root: &Path, args: &cli::WatchArgs) -> Result<()> {
    run_watch(
        repo_root,
        &WatchConfig {
            worker_url: args.worker_url.clone(),
            interval_ms: args.interval_ms,
            max_per_tick: args.max_per_tick,
            variant_count: args.variant_count,
            once: args.once || !args.execute,
            execute: args.execute,
        },
        ProcessRunner,
    )
}

fn cmd_plan(args: &cli::BriefArgs) -> Result<()> {
    let value = read_brief_value(&args.brief)?;
    let brief = normalize_from_value(&value)?;
    let plan = build_variant_plan(&brief, args.variant_count);
    println!(
        "brief {}: project={} channel={} mode={}",
        brief.id, brief.project_slug, brief.channel, brief.render_mode
    );
    for entry in &plan {
        println!(
            "  {} → template={} ({})\n      hook: {}\n      cta:  {}",
            entry.variant_id,
            entry.template.id,
            entry.template.label,
            entry.hook,
            entry.cta.clone().unwrap_or_else(|| "(none)".into())
        );
    }
    Ok(())
}

fn cmd_validate(args: &cli::BriefArgs) -> Result<()> {
    let value = read_brief_value(&args.brief)?;
    let brief = normalize_from_value(&value)?;
    println!("{}", serde_json::to_string_pretty(&brief)?);
    eprintln!("✓ valid brief");
    Ok(())
}

fn cmd_score(args: &cli::BriefArgs) -> Result<()> {
    let value = read_brief_value(&args.brief)?;
    let brief = normalize_from_value(&value)?;
    let score = score_variant(&ScoreInput {
        hook: Some(brief.hook.clone()),
        cta: brief.cta.clone(),
        body: Some(brief.body.clone()),
        product_url: brief.product_url.clone(),
        proof_url: brief.proof_url.clone(),
        proof_type: brief
            .proof_type
            .clone()
            .or(Some("generated_card".to_string())),
        proof_path_count: brief.screenshots.as_ref().map(|s| s.len()).unwrap_or(0),
        aspect: "9:16".to_string(),
        duration_seconds: Some(brief.duration_seconds),
        render_failed: false,
        video_url: None,
    });
    println!("{}", serde_json::to_string_pretty(&score)?);
    Ok(())
}

fn cmd_config(repo_root: &Path, args: &cli::ConfigArgs) -> Result<()> {
    match args.which {
        ConfigKind::ProjectUrls => {
            let path = args
                .path
                .clone()
                .unwrap_or_else(|| repo_root.join("config/project-urls.json"));
            let urls = load_project_urls(&path)?;
            for (slug, url) in &urls {
                println!("{slug} → {url}");
            }
        }
    }
    Ok(())
}

#[allow(unused_imports)]
use reel::orchestrator::RenderReport as _RenderReport;
#[allow(dead_code)]
fn _orchestrator_link() {
    let _ = render_reel_variants::<RenderProEngine<ProcessRunner>, NoopPublisher>;
}
