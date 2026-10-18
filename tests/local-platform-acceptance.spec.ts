import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { runLocalPlatformAcceptance, type LocalAcceptanceClient } from "../scripts/local-platform-acceptance-harness";
import { startLocalCanvasFixture } from "./helpers/local-reference-canvas-http";
import { createDefaultReferenceCanvasService, createLocalCanvasBudget } from "../server/services/reference-canvas/default-service";
import { createHostedReferenceCanvasRouter } from "../server/routes/hosted-reference-canvas";
import { createLocalHostedAccountRouter } from "../server/routes/local-hosted-account";
import { resetDbClient } from "../server/db/client";
import { HostedBudgetStore } from "../server/services/helix-account/hosted-budget-store";

beforeAll(()=>{vi.stubEnv("NODE_ENV","test");vi.stubEnv("CASIMIR_LOCAL_HOSTED_MVP","1");
  mkdirSync(path.resolve(".tmp"),{recursive:true});
  const fixtureDatabase=mkdtempSync(path.resolve(".tmp/local-platform-db-"));
  vi.stubEnv("DATABASE_URL","");vi.stubEnv("HELIX_LOCAL_PG_MEM_PERSIST","1");
  vi.stubEnv("HELIX_LOCAL_DB_PATH",path.join(fixtureDatabase,"synthetic-database.json"));});
afterAll(async()=>{await resetDbClient();vi.unstubAllEnvs();});
describe("local platform mounted HTTP acceptance preparation",()=>{
  it("composes actual identity, room, budget and durable canvas with explicitly synthetic consent",async()=>{
    const fixture=await startLocalCanvasFixture();
    let service=fixture.service, server=fixture.server, origin=fixture.origin;
    fixture.app.use("/api/account/local-hosted",createLocalHostedAccountRouter());
    const outsider=await fixture.identity(`local-outsider-${Date.now()}`);
    const client=(identity:typeof fixture.host):LocalAcceptanceClient=>({send:async(method,url,body,key)=>{
      // Cookie/CSRF remain in transport memory and are absent from report/logs.
      const session=await (await fetch(origin+"/api/agi/hosted/v1/session",{headers:{Cookie:identity.cookie}})).json();
      const response=await fetch(origin+url,{method,headers:{Cookie:identity.cookie,Origin:origin,
        "X-CSRF-Token":session.csrf_token,"Idempotency-Key":key??"local-stop-no-new-dispatch", "Content-Type":"application/json",
        "x-casimir-local-action":"explicit",...(url.endsWith("/confirm")?{"x-fixture-native-proof":"synthetic-local-proof"}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
      return {status:response.status,body:await response.json()};
    }});
    try{
      const host=client(fixture.host);
      const sourceFiles=["scripts/local-platform-acceptance-harness.ts","tests/local-platform-acceptance.spec.ts","tests/helpers/local-reference-canvas-http.ts",
        "shared/helix-reference-canvas.ts","shared/helix-hosted-budget.ts","server/routes/hosted-reference-canvas.ts","server/routes/local-hosted-account.ts",
        "server/services/reference-canvas/service.ts","server/services/reference-canvas/store.ts","server/services/reference-canvas/default-service.ts",
        "server/services/helix-account/hosted-budget-store.ts","server/db/client.ts","server/db/migrator.ts","server/db/migrations/101_local_hosted_budgets.ts"]
        .map(file=>({file,sha256:createHash("sha256").update(readFileSync(path.resolve(file))).digest("hex")}));
      const artifactSha256=createHash("sha256").update(JSON.stringify(sourceFiles)).digest("hex");
      const report=await runLocalPlatformAcceptance({host,guest:client(fixture.guest),outsider:client(outsider),guestProfileId:fixture.guestId,
        artifact:{baselineSha:"7e443b08360dbd19d2cbb016baf897c8a3fd5124",artifactSha256,version:"local-platform-fixture-v1"},
        waitForCompletion:async()=>service.drain(),
        inspectBudget:async()=>{
          const response=await host.send("GET","/api/account/local-hosted/status");expect(response.status).toBe(200);
          const term=response.body as {successfulEffects:number;unresolvedEffects:number;personal_tools_available:boolean;production_eligible:boolean};
          expect(term.personal_tools_available).toBe(true);expect(term.production_eligible).toBe(false);
          return {settledEffects:term.successfulEffects,unknownEffects:term.unresolvedEffects};
        },
        restart:async()=>{
          await service.drain();await new Promise<void>(resolve=>server.close(()=>resolve()));
          await resetDbClient();
          const freshBudget=new HostedBudgetStore();
          service=createDefaultReferenceCanvasService(path.join(fixture.directory,"canvas.json"),createLocalCanvasBudget(freshBudget));
          const app=express();app.use(express.json());
          app.use("/api/agi/hosted/v1",createHostedReferenceCanvasRouter({service,localConfirmation:req=>req.get("x-fixture-native-proof")==="synthetic-local-proof"}));
          app.use("/api/account/local-hosted",createLocalHostedAccountRouter({store:freshBudget}));
          server=await new Promise<Server>(resolve=>{const next=app.listen(0,"127.0.0.1",()=>resolve(next));});
          origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
        },
      });
      const evidence=path.resolve(".tmp/local-connection-handoff");mkdirSync(evidence,{recursive:true});
      writeFileSync(path.join(evidence,"integrated-acceptance.json"),JSON.stringify({...report,
        sourceFiles,restartScope:"HTTP server/router/service/native file and isolated file-backed account/room/budget database pool reopened; no real app process restarted",
        authenticationScope:"actual account/room services with synthetic local developer login and synthetic native confirmation"},null,2));
      expect(report.verdict,JSON.stringify(report.checks)).toBe("PASS");
      expect(report.checks).toHaveLength(10);expect(report.humanAcceptance).toBe(false);
    }finally{
      await service.drain();await new Promise<void>(resolve=>server.close(()=>resolve()));
      // Peer fixture cleans only its generated temp directory, after all servers close.
      await fixture.close();
    }
  },60000);
});
