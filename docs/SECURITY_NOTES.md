# Security Notes

## Audit Snapshot
Date: 2026-02-21

1. `npm audit` reported 16 high vulnerabilities.
2. `npm audit --omit=dev` reported 0 vulnerabilities.

## Interpretation
1. Current findings are in dev/build toolchain dependencies, not runtime production dependencies.
2. App runtime dependency set is currently clean according to omit-dev audit.

## Primary Dependency Chains Involved
1. `vite-plugin-pwa -> workbox-build -> @surma/rollup-plugin-off-main-thread -> ejs/jake/filelist/minimatch`
2. `eslint` and `@typescript-eslint/*` dependency chain via `minimatch` advisory.

## Recommended Next Actions
1. Pin and periodically re-check toolchain versions (`vite-plugin-pwa`, `eslint`, `@typescript-eslint/*`).
2. Avoid blind `npm audit fix --force` because suggested fixes include semver-major and questionable downgrades.
3. Keep CI check with both:
- `npm audit --omit=dev`
- `npm audit` (informational, non-blocking) until stack updates stabilize.
