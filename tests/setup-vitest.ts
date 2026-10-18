import "@testing-library/jest-dom/vitest";

// Keep test output bounded; massive tool-log stdout floods can OOM vitest workers.
if (!process.env.TOOL_LOG_STDOUT) {
  process.env.TOOL_LOG_STDOUT = "0";
}

// Bound in-memory tool-log retention in tests to avoid heap blowups in heavy ask suites.
if (!process.env.TOOL_LOG_BUFFER_SIZE) {
  process.env.TOOL_LOG_BUFFER_SIZE = "25";
}
if (!process.env.TOOL_LOG_TENANT_BUFFER_SIZE) {
  process.env.TOOL_LOG_TENANT_BUFFER_SIZE = "25";
}

// Most route-contract fixtures exercise the legacy Helix-native policy runtime.
// Production requests default to Codex; provider-specific tests override this explicitly.
if (!process.env.HELIX_ASK_AGENT_RUNTIME) {
  process.env.HELIX_ASK_AGENT_RUNTIME = "helix";
}
if (!process.env.HELIX_ASK_TEST_RUNTIME_POLICY_BYPASS) {
  process.env.HELIX_ASK_TEST_RUNTIME_POLICY_BYPASS = "1";
}
