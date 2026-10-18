import { describe, expect, it } from "vitest";
import { kvAdd, kvGetSessionBytes, kvGetSessionTokensApprox, kvReset } from "../server/services/llm/kv-budgeter";

describe("kv budgeter runtime helpers", () => {
  it("returns session bytes and approximate token count", () => {
    kvReset();
    kvAdd("s1", "t1", 80);
    kvAdd("s1", "t2", 12);
    expect(kvGetSessionBytes("s1")).toBe(92);
    expect(kvGetSessionTokensApprox("s1")).toBe(23);
  });
});
