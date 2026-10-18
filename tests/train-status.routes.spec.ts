import express from "express";
import request from "supertest";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import { trainStatusRouter } from "../server/routes/train-status";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(trainStatusRouter);
  return app;
};

const makeChild = () => {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
};

describe("train-status routes", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("starts dataset job with voice_dataset mode metadata", async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const app = buildApp();
    const started = await request(app).post("/api/train/dataset").send({ mode: "voice_dataset" });
    expect(started.status).toBe(200);
    const jobId = started.body.jobId as string;

    child.stdout.emit("data", Buffer.from('STATS {"mode":"voice_dataset","manifestPath":"/tmp/manifest.json"}\n'));
    const job = await request(app).get(`/api/train/job/${jobId}`);

    expect(job.status).toBe(200);
    expect(job.body.metadata?.datasetMode).toBe("voice_dataset");
    expect(job.body.metadata?.mode).toBe("voice_dataset");
    expect(job.body.metadata?.manifestPath).toBe("/tmp/manifest.json");
  });

  it("records artifact refs for tts_voice_train jobs", async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const app = buildApp();
    const started = await request(app).post("/api/train/start").send({ jobType: "tts_voice_train" });
    const spawnArgs = spawnMock.mock.calls[0];
    expect(spawnArgs[2]?.env?.TRAIN_JOB_TYPE).toBe("tts_voice_train");
    expect(started.status).toBe(200);
    const jobId = started.body.jobId as string;

    child.stdout.emit("data", Buffer.from("ARTIFACT checkpoints/tts-voice.pt\n"));
    const job = await request(app).get(`/api/train/job/${jobId}`);

    expect(job.status).toBe(200);
    expect(job.body.type).toBe("tts_voice_train");
    expect(job.body.artifactRefs).toContain("checkpoints/tts-voice.pt");
  });

  it("parses progress/stats/artifacts for tts_prod_train jobs", async () => {
  const child = makeChild();
  spawnMock.mockReturnValue(child);

  const app = buildApp();
  const started = await request(app).post("/api/train/start").send({ jobType: "tts_prod_train" });
  const spawnArgs = spawnMock.mock.calls[0];
  expect(spawnArgs[1]?.[0]).toContain("train_production_tts.py");
  expect(spawnArgs[2]?.env?.TRAIN_JOB_TYPE).toBe("tts_prod_train");
  const jobId = started.body.jobId as string;

  child.stdout.emit("data", Buffer.from("PROGRESS 5 100\n"));
  child.stdout.emit("data", Buffer.from('STATS {"dataset_items":1,"bundle_valid":true}\n'));
  child.stdout.emit("data", Buffer.from("ARTIFACT bundles/dottie_default/voice_bundle/manifest.json\n"));
  const job = await request(app).get(`/api/train/job/${jobId}`);

  expect(job.status).toBe(200);
  expect(job.body.type).toBe("tts_prod_train");
  expect(job.body.progress).toEqual({ current: 5, total: 100 });
  expect(job.body.metadata?.dataset_items).toBe(1);
  expect(job.body.metadata?.bundle_valid).toBe(true);
  expect(job.body.artifactRefs).toContain("bundles/dottie_default/voice_bundle/manifest.json");

  });
  it("aggregates multiple artifacts for tts_prod_train", async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const app = buildApp();
    const started = await request(app).post("/api/train/start").send({ jobType: "tts_prod_train" });
    const jobId = started.body.jobId as string;

    child.stdout.emit("data", Buffer.from("ARTIFACT artifacts/train_status.tts_prod_train.json\n"));
    child.stdout.emit("data", Buffer.from("ARTIFACT bundles/dottie_default/voice_bundle/manifest.json\n"));
    const job = await request(app).get(`/api/train/job/${jobId}`);

    expect(job.body.artifactRefs).toEqual([
      "artifacts/train_status.tts_prod_train.json",
      "bundles/dottie_default/voice_bundle/manifest.json",
    ]);
  });

  it("parses deterministic signals for tts_prod_train_nemo jobs", async () => {
    const child = makeChild();
    spawnMock.mockReturnValue(child);

    const app = buildApp();
    const started = await request(app).post("/api/train/start").send({ jobType: "tts_prod_train_nemo" });
    const spawnArgs = spawnMock.mock.calls[0];
    expect(spawnArgs[1]?.[0]).toContain("train_production_nemo.py");
    expect(spawnArgs[2]?.env?.TRAIN_JOB_TYPE).toBe("tts_prod_train_nemo");
    const jobId = started.body.jobId as string;

    child.stdout.emit("data", Buffer.from("PROGRESS 1 3\n"));
    child.stdout.emit("data", Buffer.from('STATS {"status":"blocked","reason":"nemo_runtime_unavailable"}\n'));
    child.stdout.emit("data", Buffer.from("ARTIFACT artifacts/train_status.tts_prod_train_nemo.json\n"));

    const job = await request(app).get(`/api/train/job/${jobId}`);
    expect(job.status).toBe(200);
    expect(job.body.type).toBe("tts_prod_train_nemo");
    expect(job.body.progress).toEqual({ current: 1, total: 3 });
    expect(job.body.metadata?.reason).toBe("nemo_runtime_unavailable");
    expect(job.body.artifactRefs).toContain("artifacts/train_status.tts_prod_train_nemo.json");
  });

});

