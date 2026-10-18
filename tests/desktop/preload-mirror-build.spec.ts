import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

it("exposes the task-report cloud in ordinary builds and the mirror only in private builds", async () => {
  for (const privateLocalMvp of [false, true]) {
    const result = await build({
      entryPoints: ["apps/desktop/src/preload.ts"],
      bundle: true, platform: "node", target: "node24", format: "cjs",
      external: ["electron"], write: false,
      define: { __CASIMIR_PRIVATE_LOCAL_MVP__: JSON.stringify(privateLocalMvp) },
    });
    let bridge: Record<string, unknown> | undefined;
    runInNewContext(result.outputFiles[0].text, {
      require(name: string) {
        if (name !== "electron") throw new Error("Unexpected preload dependency");
        return { contextBridge: { exposeInMainWorld(_name: string, value: Record<string, unknown>) {
          bridge = value;
        } }, ipcRenderer: { invoke() {}, on() {}, removeListener() {} } };
      },
      window: { addEventListener() {}, removeEventListener() {} },
    });
    expect(bridge).toBeDefined();
    expect(Object.hasOwn(bridge!, "showMessageCloud")).toBe(true);
    expect(Object.hasOwn(bridge!, "showCodexMirror")).toBe(privateLocalMvp);
  }
});
