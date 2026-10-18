import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const parsePortBlocks = (source: string): Array<{
  localPort: number;
  externalPort?: number;
}> => {
  const blocks: Array<{ localPort: number; externalPort?: number }> = [];
  let current: Partial<{ localPort: number; externalPort: number }> | null = null;

  const saveCurrent = () => {
    if (current?.localPort !== undefined) {
      blocks.push(current as { localPort: number; externalPort?: number });
    }
    current = null;
  };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "[[ports]]") {
      saveCurrent();
      current = {};
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      saveCurrent();
      continue;
    }
    if (!current) continue;

    const match = line.match(/^(localPort|externalPort)\s*=\s*(\d+)$/);
    if (!match) continue;
    current[match[1] as "localPort" | "externalPort"] = Number(match[2]);
  }

  saveCurrent();
  return blocks;
};

describe("Replit Autoscale port configuration", () => {
  it("exposes only the production server port externally", () => {
    const config = readFileSync(path.resolve(process.cwd(), ".replit"), "utf8");
    const ports = parsePortBlocks(config);

    expect(ports).toEqual([
      { localPort: 5000, externalPort: 80 },
      { localPort: 5001 },
    ]);
    expect(ports.filter((port) => port.externalPort !== undefined)).toEqual([
      { localPort: 5000, externalPort: 80 },
    ]);
  });
});
