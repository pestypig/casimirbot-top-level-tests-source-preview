# External dependencies and fixture notes

No third-party package source, binary, dataset, model weight, or external media is bundled in this source-only preview. The selected tests directly import packages including `vitest`, `express`, `supertest`, `electron`, `pg`, `esbuild`, `pg-mem`, `react`, `react-dom`, `fast-check`, `yaml`, `typescript`, `playwright`, `@testing-library/jest-dom`, and `sharp`. Their own licenses apply if obtained separately.

The Google-style `Fixture` string in `tests/desktop-live-connection.spec.ts` is mocked key-storage and request-shape data, not a credential supplied for use. URL userinfo, example hostnames, citation hashes, lease tokens, serialized key-order fields, and NHM2 correction identifiers are test fixtures. CC-BY-4.0 strings in some assertions are metadata examples; no referenced media or model weight is included or relicensed.

The MIT license covers the first-party source in this repository; it does not grant rights to separately obtained packages, datasets, or services.
