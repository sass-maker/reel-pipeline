# Inert Postiz host contract

This directory records the official Postiz `v2.22.1` deployment topology
without installing or activating it. `images.json` is the pin manifest;
`compose.yaml` is an explicit-manual-profile Compose contract. The Postiz image
uses its multi-architecture digest. PostgreSQL, Redis, Temporal auto-setup, the
Temporal PostgreSQL store, and Elasticsearch use pinned tags and never
`latest`.

The Compose file publishes only Postiz on `127.0.0.1:4007` and Temporal RPC on
`127.0.0.1:7233`. PostgreSQL, Redis, and Elasticsearch stay on private bridge
networks. Only the Postiz container joins the non-internal `egress` network,
because OAuth and social publishing require outbound HTTPS; dependency
containers do not. All six state directories are bind mounts below
`POSTIZ_DATA_ROOT`, which must resolve outside the checkout.

## Machine-local configuration contract

The Compose file contains no `environment` values. It requires four absolute,
machine-local env-file paths through `POSTIZ_ENV_FILE`,
`POSTIZ_POSTGRES_ENV_FILE`, `POSTIZ_TEMPORAL_ENV_FILE`, and
`POSTIZ_ELASTICSEARCH_ENV_FILE`. Do not create these files in the checkout.

Required variable names, without values:

- Postiz: `MAIN_URL`, `FRONTEND_URL`, `NEXT_PUBLIC_BACKEND_URL`, `JWT_SECRET`,
  `DATABASE_URL`, `REDIS_URL`, `BACKEND_INTERNAL_URL`, `TEMPORAL_ADDRESS`,
  `IS_GENERAL`, `DISABLE_REGISTRATION`, `RUN_CRON`, `STORAGE_PROVIDER`,
  `UPLOAD_DIRECTORY`, `NEXT_PUBLIC_UPLOAD_DIRECTORY`, `API_LIMIT`, and
  `NX_ADD_PLUGINS`.
- Postiz PostgreSQL: `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`.
- Temporal PostgreSQL and auto-setup: `POSTGRES_USER`, `POSTGRES_PASSWORD`,
  `POSTGRES_PWD`, `DB`, `DB_PORT`, `POSTGRES_SEEDS`, `ENABLE_ES`, `ES_SEEDS`,
  `ES_VERSION`, `TEMPORAL_NAMESPACE`, and `DYNAMIC_CONFIG_FILE_PATH`.
- Elasticsearch: `discovery.type`, `xpack.security.enabled`, `ES_JAVA_OPTS`,
  and the four `cluster.routing.allocation.disk.*` settings used by the
  official topology.

Provider OAuth, Postiz API keys, passwords, and storage credentials stay only
in those machine-local files. The checked-in files contain neither example nor
placeholder secret values.

## Validation without activation

The following validates Compose structure without interpolation, loading env
files, pulling images, creating volumes, or starting containers:

```sh
docker compose -f ops/postiz/compose.yaml config --no-interpolate
```

Do not pass `--profile postiz-manual` to an execution command until a separate
owner-approved host cutover.

The complete activation sequence is tracked in
[`../../docs/operations/postiz-operations.md`](../../docs/operations/postiz-operations.md).
