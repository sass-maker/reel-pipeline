# Engine Checkout Policy

Reel Pipeline has no third-party render-engine submodules. MoneyPrinterTurbo
and reel-maker were removed on 2026-08-01 because their checkouts were not part
of the working local product and the UI already had repository-owned render
paths.

New engine capabilities should be implemented behind adapters in
`src/adapters/`, described in `config/render-modes.json`, and proven with a
fixture-backed smoke test. Do not add a third-party engine checkout merely to
expose another dropdown option.
