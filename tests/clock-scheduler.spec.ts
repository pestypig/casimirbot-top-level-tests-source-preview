import { describe, expect, it } from "vitest";
import { ClockScheduler } from "../server/services/runtime/clock-scheduler";
import { useNavPoseStore } from "../client/src/store/useNavPoseStore";
import { loadRuntimeFrameContract } from "../server/services/runtime/frame-contract";

describe("clock scheduler", () => {
  it("enforces Clock A step cap and marks degraded", async () => {
    const scheduler = new ClockScheduler();
    const contract = loadRuntimeFrameContract();
    const makeTask = (id: string) => ({
      id,
      class: "REALTIME" as const,
      lane: "io" as const,
      input: null,
      run: async () => id,
    });

    const tasks = Array.from({ length: contract.clockA.max_plan_steps + 2 }, (_, index) =>
      makeTask(`t-${index}`),
    );
    const result = await scheduler.runClockA(tasks, { contract });
    expect(result.degraded).toBe(true);
    expect(result.tasks).toHaveLength(contract.clockA.max_plan_steps);
  });

  it("tracks Clock B queue depth", () => {
    const scheduler = new ClockScheduler();
    const contract = loadRuntimeFrameContract();
    const job = scheduler.enqueueClockB(
      {
        id: "bg-1",
        class: "BACKGROUND",
        lane: "media",
        input: null,
        run: async () => "ok",
      },
      { contract },
    );
    expect(job.queueDepth).toBe(1);
    expect(scheduler.getQueueDepth()).toBe(1);
  });

  it("drains Clock B queue", async () => {
    const scheduler = new ClockScheduler();
    const contract = loadRuntimeFrameContract();
    scheduler.enqueueClockB(
      {
        id: "bg-1",
        class: "BACKGROUND",
        lane: "io",
        input: null,
        run: async () => "ok",
      },
      { contract },
    );
    scheduler.enqueueClockB(
      {
        id: "bg-2",
        class: "BACKGROUND",
        lane: "io",
        input: null,
        run: async () => "ok",
      },
      { contract },
    );
    const drained = await scheduler.drainClockB(1);
    expect(drained.ran).toBe(1);
    expect(drained.remaining).toBe(1);
  });

  it("marks deadline using onDeadline policy", async () => {
    const scheduler = new ClockScheduler();
    const contract = loadRuntimeFrameContract();
    const result = await scheduler.runClockA(
      [
        {
          id: "rt-1",
          class: "REALTIME",
          lane: "io",
          input: null,
          deadline_ms: 1,
          onDeadline: "cancel",
          run: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return "late";
          },
        },
      ],
      { contract },
    );
    expect(result.tasks[0]?.status).toBe("deadline");
    expect(result.tasks[0]?.error).toBe("cancelled_on_deadline");
  });

});


describe("nav pose deterministic stepping", () => {
  it("uses provided dt_s for ingest integration", () => {
    const state = useNavPoseStore.getState();
    const base = state.navPose;
    useNavPoseStore.setState({
      navPose: {
        ...base,
        position_m: [0, 0, 0],
        velocity_mps: [0, 0, 0],
        frame: "heliocentric-ecliptic",
        timestamp_ms: 1000,
      },
      source: "sim",
      hasLivePose: false,
      _lastIngestMs: 1000,
    });

    useNavPoseStore.getState().ingestDriveVector({
      velocity_mps: [10, 0, 0],
      now_ms: 5000,
      dt_s: 0.25,
      frame: "heliocentric-ecliptic",
    });

    const pose = useNavPoseStore.getState().navPose;
    expect(pose.position_m[0]).toBeCloseTo(2.5, 8);
    expect(pose.timestamp_ms).toBe(5000);
    expect(useNavPoseStore.getState().source).toBe("derived");
  });
});
