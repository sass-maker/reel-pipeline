# Fleet Content Factory

Content Factory is the generation-only boundary retained from Reel Pipeline. It
accepts approved `ContentFactoryBrief` v1 inputs and emits validated
`ContentFactoryArtifactManifest` v1 records. Existing Reel Pipeline engines stay
behind adapters while they are migrated individually.

This service has no scheduler, social publisher, OAuth, analytics, or provider
credential integration. Artifact review remains pending until an owner records a
separate decision; generation never turns that state into distribution approval.

The canonical production-render and content-package implementations live in
`scripts/`. Reel Pipeline keeps thin compatibility launchers at the old paths.
