//! reel — Rust orchestrator for the reel-pipeline.
//!
//! Rust orchestration for render engines and R2 artifact publishing. Heavy
//! lifting stays behind traits and adapter-specific
//! engines:
//!   - [`engine::RenderEngine`] → render-pro, Grok local MP4s, ASCII animation,
//!     HTML composition, Blender, and mock engines.
//!   - [`publisher::ArtifactPublisher`] → [`publisher::R2Publisher`]
//!     (shells out to `wrangler r2 object put`).
//!
//! The pure logic (brief normalization, template selection, quality scoring,
//! artifact path/key handling, config parsing) is ported in full and unit
//! tested. See ARCHITECTURE.md and PLAN.md at the repo root for the flow map and
//! remaining phases.

pub mod artifact;
pub mod brief;
pub mod config;
pub mod content_factory;
pub mod engine;
pub mod orchestrator;
pub mod publisher;
pub mod quality;
pub mod runner;
pub mod store;
pub mod templates;
pub mod watcher;
pub mod worker_client;
