import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function registryPairs(): string[] {
  const source = readFileSync(path.resolve(root, "shared/math-stage.ts"), "utf8");
  return [...source.matchAll(/tag:\s*"(CASIMIR_DP_[^"]+)"[\s\S]*?module:\s*"([^"]+)"/g)]
    .map((match) => `${match[1]}|${match[2]}`)
    .sort();
}

function statusPairs(): string[] {
  const status = readFileSync(path.resolve(root, "MATH_STATUS.md"), "utf8");
  return status.split(/\r?\n/)
    .map((line) => line.match(/^\|\s*(CASIMIR_DP_[^|]+?)\s*\|\s*([^|]+?)\s*\|/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => `${match[1].trim()}|${match[2].trim()}`)
    .sort();
}

describe("Casimir-DP math governance", () => {
  it("keeps every Casimir-DP registry module represented in MATH_STATUS and vice versa", () => {
    expect(statusPairs()).toEqual(registryPairs());
  });
});
