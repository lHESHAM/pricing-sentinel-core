# pricing-sentinel-core

A small demonstration of pricing snapshot validation, challenge detection, ARIA-based extraction and a drift check.

## Included

- Zod schemas for pricing snapshots.
- Challenge marker and HTTP status detection.
- A Playwright test that toggles annual billing and extracts a sample pricing card using ARIA roles.
- A drift check comparing tier prices and feature lists.

This example does not implement a production extractor, Postgres integration, alert pausing, or a per-domain PR lock.

## Run tests

```bash
npm install
npx playwright install chromium
npm test
```
