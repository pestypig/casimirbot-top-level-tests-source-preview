# CasimirBot top-level test source preview

This MIT-licensed, source-only preview contains **724 selected test source files** from the CasimirBot top-level `tests/` directory. [`SOURCE_SELECTION.json`](SOURCE_SELECTION.json) pins each path, byte count, SHA-256, and source Git blob. One test was changed to generate a one-pixel image fixture rather than embed an image of undocumented origin. The preview has a fresh Git history that excludes the former embedded image.

This is **not a standalone runnable test suite**. Tests import separately published or private CasimirBot modules, external packages, and research inputs not included here. Five C# probes have not been compiled in this snapshot. No full-suite pass, live account acceptance, certified proof, physical viability, or supported deployment is claimed.

A synthetic Google-style `Fixture` key and other test identifiers remain in the selected source. They were reviewed as fixture data, not live credentials. A bounded Gitleaks check is documented in the private source review; scanner heuristics are not a guarantee about every value.

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for dependency and fixture boundaries. The historical platform repository, credentials, built artifacts, external datasets, and separately licensed assets are outside this source preview.
