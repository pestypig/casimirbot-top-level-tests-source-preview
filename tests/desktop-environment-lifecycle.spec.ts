import { describe, expect, it, vi } from "vitest";
import { PrivateEnvironmentLifecycle } from "../apps/desktop/src/environment-private-lifecycle";
import { PrivateDesktopOwnerError } from "../apps/desktop/src/environment-private-desktop-owner";

const deferred = () => { let resolve!: () => void, reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const fixture = () => {
  const order: string[] = [], done = deferred(), closing = deferred();
  const owner = { stop: vi.fn(async (_session: object) => {}), close: vi.fn(() => closing.promise) };
  const preventDefault = vi.fn();
  const lifecycle = new PrivateEnvironmentLifecycle({ owner: () => owner,
    beginQuit: () => order.push("begin"), recordFailure: code => order.push(code),
    resumeQuit: () => {
      order.push("resume");
      if (lifecycle.beforeQuit({ preventDefault })) order.push("service_shutdown");
      done.resolve();
    } });
  return { owner, lifecycle, closing, done, order, preventDefault };
};

describe("private environment native lifecycle", () => {
  it("defers repeated quit events and shuts down service only after a single Close resolves", async () => {
    const s = fixture();
    expect(s.lifecycle.beforeQuit(s)).toBe(false); expect(s.lifecycle.beforeQuit(s)).toBe(false);
    expect(s.owner.close).toHaveBeenCalledTimes(1); expect(s.preventDefault).toHaveBeenCalledTimes(2);
    expect(s.order).toEqual(["begin"]); expect(s.lifecycle.status().quit).toBe("waiting");
    s.closing.resolve(); await s.done.promise;
    expect(s.order).toEqual(["begin", "resume", "service_shutdown"]); expect(s.lifecycle.status().quit).toBe("clean");
    expect(s.owner.close).toHaveBeenCalledTimes(1);
  });
  it("records failed cleanup before exit without labeling it clean", async () => {
    const s = fixture(); s.lifecycle.beforeQuit(s);
    s.closing.reject(new Error("sensitive implementation detail")); await s.done.promise;
    expect(s.order).toEqual(["begin", "private_environment_quit_cleanup_unconfirmed", "resume", "service_shutdown"]);
    expect(s.lifecycle.status().quit).toBe("unconfirmed");
  });
  it("retains failed Stop while treating a foreign session as a denied request", async () => {
    const s = fixture(), session = {};
    s.owner.stop.mockRejectedValueOnce(new PrivateDesktopOwnerError("private_environment_session_mismatch"));
    expect(await s.lifecycle.invalidate(session)).toEqual({ stopped: false, error: "private_environment_session_mismatch" });
    expect(s.lifecycle.status().stopFailure).toBe(false); expect(s.order).toEqual([]);
    s.owner.stop.mockRejectedValueOnce(new Error("native cleanup failed"));
    expect(await s.lifecycle.invalidate(session)).toEqual({ stopped: false, error: "private_environment_stop_unconfirmed" });
    expect(s.lifecycle.status().stopFailure).toBe(true);
    expect(s.order).toEqual(["private_environment_stop_unconfirmed"]);
    expect(await s.lifecycle.invalidate(session)).toEqual({ stopped: true });
    expect(s.lifecycle.status().stopFailure).toBe(true);
  });
  it("passes only the trusted session to Stop and requires no account revalidation", async () => {
    const s = fixture(), session = {};
    expect(await s.lifecycle.invalidate(session)).toEqual({ stopped: true });
    expect(s.owner.stop).toHaveBeenCalledWith(session); expect(s.owner.close).not.toHaveBeenCalled();
  });
  it("allows startup failure or no-owner quit without creating an environment host", async () => {
    const resumed = deferred(), owner = vi.fn(() => undefined);
    const lifecycle = new PrivateEnvironmentLifecycle({ owner, beginQuit: () => {}, resumeQuit: resumed.resolve, recordFailure: vi.fn() });
    expect(lifecycle.beforeQuit({ preventDefault() {} })).toBe(false); await resumed.promise;
    expect(lifecycle.status().quit).toBe("clean"); expect(owner).toHaveBeenCalledTimes(1);
  });
  it("waits for a separate provider-session cleanup after environment close",async()=>{
    const s=fixture(), provider=deferred();
    const lifecycle=new PrivateEnvironmentLifecycle({owner:()=>s.owner,
      beginQuit:()=>s.order.push("begin"),recordFailure:code=>s.order.push(code),
      finalizeQuit:async()=>{s.order.push("provider_begin");await provider.promise;s.order.push("provider_done");},
      resumeQuit:()=>s.order.push("resume")});
    expect(lifecycle.beforeQuit(s)).toBe(false);
    s.closing.resolve();
    await vi.waitFor(()=>expect(s.order).toContain("provider_begin"));
    expect(s.order).not.toContain("resume");
    provider.resolve();
    await vi.waitFor(()=>expect(s.order).toEqual(["begin","provider_begin","provider_done","resume"]));
  });
  it("does not turn a diagnostic writer failure into clean status or an unhandled rejection", async () => {
    const resumed = deferred();
    const lifecycle = new PrivateEnvironmentLifecycle({ owner: () => ({ stop: async () => {}, close: async () => { throw Error("cleanup"); } }),
      beginQuit: () => {}, resumeQuit: resumed.resolve, recordFailure: () => { throw Error("disk unavailable"); } });
    lifecycle.beforeQuit({ preventDefault() {} }); await resumed.promise;
    expect(lifecycle.status().quit).toBe("unconfirmed");
  });
});
