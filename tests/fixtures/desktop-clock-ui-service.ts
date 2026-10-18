import express from "express";
import fs from "node:fs";
import path from "node:path";
import { accountSessionRouter } from "../../server/routes/account-session";
import { environmentConnectorBrowserRouter } from "../../server/routes/environment-connector-platform";
import { resetDbClient } from "../../server/db/client";

const root = fs.realpathSync(process.argv[2]);
const port = process.argv[3] === undefined ? 0 : Number(process.argv[3]);
const connectionRevokeMode = process.argv[4] === "connection-revoke";
const connectionMode = process.argv[4] === "connections" || connectionRevokeMode;
if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error("fixture_port_invalid");
const allowed = new Set([
  "GET /", "GET /renderer.js", "GET /fixture.css", "GET /api/account/session",
  "GET /api/account/session/private-environment-identity",
  "POST /api/account/session/sign-in", "POST /api/account/session/sign-out",
  "GET /api/agi/environment-connectors/private/directory/packages",
  "GET /api/agi/environment-connectors/private/install-policy",
  "GET /api/agi/environment-connectors/private/clock-runtime-policy",
]);
const counts: Record<string, number> = {};
if(connectionMode) allowed.add("GET /api/account/session/agent-connections/readiness");
if(connectionRevokeMode) {
  allowed.add("POST /fixture/binding");
  allowed.add("GET /api/account/session/agent-bindings");
}
const service = express();
service.use((req, res, next) => {
  const key = `${req.method} ${req.path}`;
  const revokeRequest=connectionRevokeMode && req.method==="DELETE" && /^\/api\/account\/session\/agent-bindings\/[^/]+$/.test(req.path);
  if (!allowed.has(key) && !revokeRequest) { res.status(404).end(); return; }
  res.once("finish", () => { const outcome = `${key} ${res.statusCode}`; counts[outcome] = (counts[outcome] ?? 0) + 1; });
  res.setHeader("Cache-Control", "no-store"); next();
});
service.get("/", (_req, res) => {
  res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:");
  res.sendFile(path.join(root, "fixture.html"));
});
service.get("/renderer.js", (_req, res) => res.sendFile(path.join(root, "renderer.js")));
service.get("/fixture.css", (_req, res) => res.sendFile(path.join(root, "fixture.css")));
service.use("/api/account", express.json(), accountSessionRouter);
if(connectionRevokeMode) {
  const {createHelixAgentAccountBindingsRouter}=await import("../../server/routes/helix-agent-account-bindings");
  const {helixAgentAccountLinkStore}=await import("../../server/services/helix-account/agent-account-link-store");
  const {getAccountSessionById}=await import("../../server/services/helix-account/account-session-store");
  const {readHelixSessionCookie}=await import("../../server/services/helix-account/session-cookie");
  let seeded=false;
  // Test-only precondition: controlled external identity, never OAuth proof.
  // This endpoint is absent from production and every other fixture mode.
  service.post("/fixture/binding",async(req,res)=>{
    try {
      const account=await getAccountSessionById(readHelixSessionCookie(req.headers.cookie));
      if(!account || account.profile.profile_id!=="profile:g16a-clock-ui"){res.status(401).end();return;}
      if(seeded){res.status(409).end();return;}
      const session={sessionId:account.session_id,profileId:account.profile.profile_id};
      const issuer="https://fixture.invalid",audience="https://fixture.invalid/mcp",provider="fixture-oauth";
      const intent=await helixAgentAccountLinkStore.createLinkIntent({session,expectedIssuer:issuer,expectedAudience:audience,expectedProvider:provider,ttlSeconds:60});
      const receipt=await helixAgentAccountLinkStore.completeLinkIntent({session,state:intent.state,
        identity:{issuer,audience,providerAlias:provider,tenantId:"fixture-only",subject:"fixture-subject"}});
      seeded=true;res.json({bindingRef:receipt.binding.binding_ref,identityVerification:"controlled fixture precondition, not OAuth"});
    } catch {res.status(500).json({error:"fixture_binding_seed_failed"});}
  });
  service.use("/api/account",createHelixAgentAccountBindingsRouter());
}
if(connectionMode) {
  const {createAgentConnectionsRouter}=await import("../../server/routes/agent-connections");
  const {HelixLocalSupervisorCoordinationStore}=await import("../../server/services/local-supervisor/local-supervisor-coordination");
  service.use("/api/account",createAgentConnectionsRouter({coordinationStore:new HelixLocalSupervisorCoordinationStore("fixture:connection-ui")}));
}
service.use("/api/agi", environmentConnectorBrowserRouter);
const listener = service.listen(port, "127.0.0.1", () => {
  const address = listener.address();
  if (!address || typeof address === "string") throw Error("fixture_address_invalid");
  process.env.CASIMIR_PUBLIC_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.send?.({ kind: "ready", origin: `http://127.0.0.1:${address.port}` });
});
let closing = false;
const close = async () => {
  if (closing) return; closing = true;
  listener.closeAllConnections(); await new Promise<void>(resolve => listener.close(() => resolve()));
  await resetDbClient();
  fs.writeFileSync(path.join(root, "service-result.json"), JSON.stringify({ counts, closed: true }, null, 2));
  process.exit(0);
};
process.on("message", message => { if ((message as { kind?: string })?.kind === "close") void close(); });
process.on("disconnect", () => void close());
