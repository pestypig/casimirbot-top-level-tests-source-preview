import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSolarObservationSaver, isSolarObservationSaveSenderTrusted, solarObservationDialogDestination } from "../apps/desktop/src/solar-observation-save";
import { validateObservationReplay } from "../shared/solar-observation-replay";

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});
const snapshot = () => {
  const bytes = Buffer.alloc(32 * 32 * 4);
  return JSON.stringify({ instrument: "AIA", wavelength_A: 193, meta: { observed_mode: "observed" },
    frames: [{ grid_size: 32, map_b64: bytes.toString("base64"), obstime: "2026-09-26T17:00:00Z",
      coordinate_frame: "native_instrument_pixel_grid", fits_sha256: "a".repeat(64),
      display_sha256: createHash("sha256").update(bytes).digest("hex"), fits_path: "private/source.fits" }] });
};
const destination = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "solar-save-test-"));
  directories.push(directory);
  return path.join(directory, "observation.json");
};
describe("bounded native observation save", () => {
  it("distinguishes explicit cancellation from an incomplete native destination result", async () => {
    expect(solarObservationDialogDestination({ canceled: true })).toBeNull();
    expect(solarObservationDialogDestination({ canceled: true, filePath: "ignored.json" })).toBeNull();
    for (const filePath of [undefined, "", "   "])
      expect(() => solarObservationDialogDestination({ canceled: false, filePath })).toThrow("no destination");
    const file = await destination();
    expect(solarObservationDialogDestination({ canceled: false, filePath: file })).toBe(file);
    vi.stubGlobal("crypto", webcrypto);
    const save=createSolarObservationSaver({authorize:async()=>{},selectDestination:async()=>solarObservationDialogDestination({canceled:false})});
    expect((await save(snapshot())).status).toBe("failed");
    await expect(readFile(file)).rejects.toMatchObject({code:"ENOENT"});
  });
  it("writes verified sanitized bytes only after authorization and user destination selection", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const file = await destination();
    const authorize = vi.fn(async () => {});
    const result = await createSolarObservationSaver({ authorize, selectDestination: async () => file })(snapshot());
    expect(result.status).toBe("saved");
    expect(authorize).toHaveBeenCalledTimes(2);
    const text = await readFile(file, "utf8");
    expect(text).not.toContain("private");
    const reopened=await validateObservationReplay(JSON.parse(text));
    expect(reopened.frames).toHaveLength(1);
    expect(reopened.archive_identity?.snapshotId).toMatch(/^solar-observation:[a-f0-9]{64}$/);
    expect(reopened.archive_identity?.scientificAdmission).toBe(false);
    expect(result).toEqual({ status: "saved", fileName: "observation.json", bytes: Buffer.byteLength(text) });
  });
  it("never overwrites an existing file", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const file = await destination();
    await writeFile(file, "preserve");
    const result = await createSolarObservationSaver({ authorize: async () => {}, selectDestination: async () => file })(snapshot());
    expect(result.status).toBe("failed");
    expect(await readFile(file, "utf8")).toBe("preserve");
  });
  it("reports cancellation without writing", async () => {
    vi.stubGlobal("crypto", webcrypto);
    expect(await createSolarObservationSaver({ authorize: async () => {}, selectDestination: async () => null })(snapshot()))
      .toEqual({ status: "cancelled" });
  });
  it("rejects authorization, oversized input, model data and tampered hashes before opening the dialog", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const selectDestination = vi.fn(async () => null);
    const denied = createSolarObservationSaver({ authorize: async () => { throw new Error("denied"); }, selectDestination });
    expect((await denied(snapshot())).status).toBe("failed");
    const save = createSolarObservationSaver({ authorize: async () => {}, selectDestination });
    const model = JSON.parse(snapshot()); model.meta.observed_mode = "model";
    const tampered = JSON.parse(snapshot()); tampered.frames[0].display_sha256 = "b".repeat(64);
    for (const input of ["x".repeat(8_000_001), JSON.stringify(model), JSON.stringify(tampered), "invalid JSON"])
      expect((await save(input)).status).toBe("failed");
    expect(selectDestination).not.toHaveBeenCalled();
  });
  it("rechecks authorization after selection and refuses parallel dialogs", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const file = await destination();
    const authorize = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("logged out"));
    expect((await createSolarObservationSaver({ authorize, selectDestination: async () => file })(snapshot())).status).toBe("failed");
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
    let release!: () => void;
    const save = createSolarObservationSaver({ authorize: () => new Promise<void>(resolve => { release = resolve; }), selectDestination: async () => null });
    const first = save(snapshot());
    expect((await save(snapshot())).status).toBe("failed");
    release();
    expect(await first).toEqual({ status: "cancelled" });
  });
  it("refuses non-JSON destinations and reports file-write failure without exposing local paths", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const file = await destination();
    for (const selected of ["relative.json", `${file}.exe`, path.join(path.dirname(file), "missing", "observation.json")]) {
      const result = await createSolarObservationSaver({ authorize: async () => {}, selectDestination: async () => selected })(snapshot());
      expect(result.status).toBe("failed");
      expect(JSON.stringify(result)).not.toContain(path.dirname(file));
    }
  });
  it("admits only the live owning workstation's trusted main frame", () => {
    const frame = { url: "http://127.0.0.1:61810/star-watcher" };
    const sender = { isDestroyed: () => false, mainFrame: frame };
    const owner = { isDestroyed: () => false, webContents: sender };
    const trustedUrl = (url: string) => new URL(url).origin === "http://127.0.0.1:61810";
    const input = { sender, frame, owner, trustedUrl };
    expect(isSolarObservationSaveSenderTrusted(input)).toBe(true);
    expect(isSolarObservationSaveSenderTrusted({ ...input, frame: { ...frame } })).toBe(false);
    expect(isSolarObservationSaveSenderTrusted({ ...input, sender: { ...sender } })).toBe(false);
    expect(isSolarObservationSaveSenderTrusted({ ...input, owner: null })).toBe(false);
    expect(isSolarObservationSaveSenderTrusted({ ...input, owner: { ...owner, isDestroyed: () => true } })).toBe(false);
    expect(isSolarObservationSaveSenderTrusted({ ...input, trustedUrl: () => false })).toBe(false);
  });
});
