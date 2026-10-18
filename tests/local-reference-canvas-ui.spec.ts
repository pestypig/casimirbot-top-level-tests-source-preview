import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { chromium } from "playwright";
import { startLocalCanvasFixture } from "./helpers/local-reference-canvas-http";
import { resetDbClient } from "../server/db/client";
import path from "node:path";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { hostedBudgetStore } from "../server/services/helix-account/hosted-budget-store";

let databaseDirectory: string;
beforeAll(() => { databaseDirectory = mkdtempSync(path.join(tmpdir(), "casimir-canvas-ui-db-")); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("CASIMIR_LOCAL_HOSTED_MVP", "1"); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("HELIX_LOCAL_DB_PATH", path.join(databaseDirectory, "snapshot.json")); });
afterAll(async () => { await resetDbClient(); vi.unstubAllEnvs(); rmSync(databaseDirectory, { recursive: true, force: true }); });
it("two isolated browser contexts use the real local room/canvas page without provider traffic", async () => {
  const fixture = await startLocalCanvasFixture();
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  let unexpectedOutbound = 0;
  let releaseCommit = () => {};
  let releaseReceipt = () => {};
  try {
    const owner = await browser.newContext({ extraHTTPHeaders: { "x-fixture-native-proof": "synthetic-local-proof" } }); const member = await browser.newContext();
    for (const [context, identity] of [[owner, fixture.host], [member, fixture.guest]] as const) {
      await context.addCookies([{ name: "helix_session", value: identity.cookie.slice("helix_session=".length), url: fixture.origin, httpOnly: true, sameSite: "Lax" }]);
      await context.route("**/*", route => { if (!route.request().url().startsWith(fixture.origin + "/")) { unexpectedOutbound++; return route.abort(); } return route.continue(); });
    }
    const hostPage = await owner.newPage(); const guestPage = await member.newPage();
    await hostPage.goto(fixture.origin + "/local-reference-canvas.html"); await guestPage.goto(fixture.origin + "/local-reference-canvas.html");
    await hostPage.waitForFunction(() => document.querySelector("#identity")?.textContent?.startsWith("Developer account:"));
    await guestPage.waitForFunction(() => document.querySelector("#identity")?.textContent?.startsWith("Developer account:"));
    async function click(page: typeof hostPage, id: string) { await page.locator(`#${id}`).click(); await page.waitForFunction(() => document.querySelector("#status")?.textContent !== "Working…"); const status = await page.locator("#status").textContent(); expect(status).toBe("Updated. Inspect the measured state below."); }
    await click(hostPage, "create"); const roomId = await hostPage.locator("#room").inputValue();
    await hostPage.locator("#guest").fill(fixture.guestId); await click(hostPage, "invite"); const invitationId = await hostPage.locator("#invitation").inputValue();
    await guestPage.locator("#invitation").fill(invitationId); await click(guestPage, "join"); expect(await guestPage.locator("#room").inputValue()).toBe(roomId);
    await click(hostPage, "share"); await click(hostPage, "confirm"); await click(hostPage, "observe"); await click(hostPage, "grant");
    await click(guestPage, "refresh"); await click(guestPage, "place"); await fixture.service.drain(); await click(guestPage, "result");
    const result = JSON.parse((await guestPage.locator("#evidence").textContent())!); expect(result.status).toBe("succeeded"); expect(result.provider_calls).toBe(0);
    await click(hostPage, "observe"); expect(await hostPage.locator("#canvas circle").count()).toBe(1);
    expect(await hostPage.locator("#canvas circle").getAttribute("cx")).toBe("250"); expect(await hostPage.locator("#canvas circle").getAttribute("cy")).toBe("750");
    await click(guestPage, "stop"); expect(JSON.parse((await guestPage.locator("#evidence").textContent())!).committed_content_preserved).toBe(true);
    await guestPage.reload();
    await guestPage.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("nothing was resubmitted"));
    expect(await guestPage.locator("#requestId").inputValue()).toBe(result.requestId);
    await click(guestPage, "refresh");
    await click(guestPage, "retry");
    expect(JSON.parse((await guestPage.locator("#evidence").textContent())!).request_id).toBe(result.requestId);
    await click(hostPage, "observe"); expect(await hostPage.locator("#canvas circle").count()).toBe(1);
    // Controlled fixture timing verifies the renderer and real HTTP/budget
    // cancellation contract together, without changing native runtime timing.
    let commitReady!: () => void;
    let receiptReady!: () => void;
    const atCommit = new Promise<void>(resolve => { commitReady = resolve; });
    const heldCommit = new Promise<void>(resolve => { releaseCommit = resolve; });
    const atReceipt = new Promise<void>(resolve => { receiptReady = resolve; });
    const heldReceipt = new Promise<void>(resolve => { releaseReceipt = resolve; });
    fixture.service.deps.beforeCommit = async () => { commitReady(); await heldCommit; };
    await click(hostPage, "grant");
    await click(guestPage, "refresh");
    await guestPage.route("**/action-requests", async route => {
      const response = await route.fetch();
      receiptReady();
      await heldReceipt;
      await route.fulfill({ response });
    });
    await guestPage.locator("#place").click();
    await Promise.all([atCommit, atReceipt]);
    // The selected ID still names the earlier committed request at this point.
    expect(await guestPage.locator("#requestId").inputValue()).toBe(result.requestId);
    const stopResponse = guestPage.waitForResponse(response => response.url().endsWith("/stop"));
    await guestPage.locator("#stop").click();
    releaseReceipt();
    const stopped = await (await stopResponse).json();
    expect(stopped.requestId).not.toBe(result.requestId);
    expect(stopped.status).toBe("canceled");
    expect(stopped.committed_content_preserved).toBe(false);
    releaseCommit();
    await fixture.service.drain();
    await guestPage.waitForFunction(() => !(document.querySelector("#stop") as HTMLButtonElement)?.disabled);
    await click(guestPage, "result");
    const canceled = JSON.parse((await guestPage.locator("#evidence").textContent())!);
    expect(canceled.status).toBe("canceled");
    expect(canceled.effectId).toBeFalsy();
    expect(canceled.provider_calls).toBe(0);
    await click(hostPage, "observe");
    expect(await hostPage.locator("#canvas circle").count()).toBe(1);
    expect(await hostedBudgetStore.termStatus(fixture.hostId)).toMatchObject({ successfulEffects: 1, unresolvedEffects: 0 });
    expect(unexpectedOutbound).toBe(0);
    if (process.env.CANVAS_UI_EVIDENCE_DIRECTORY) {
      const directory = path.resolve(process.env.CANVAS_UI_EVIDENCE_DIRECTORY);
      await hostPage.screenshot({ path: path.join(directory, "owner-canvas.png"), fullPage: true });
      await guestPage.screenshot({ path: path.join(directory, "member-result.png"), fullPage: true });
      writeFileSync(path.join(directory, "ui-qualification.json"), JSON.stringify({ scope: "two isolated synthetic identity browser contexts over actual local HTTP", nativeConfirmation: "synthetic independent local proof fixture", browser: "Microsoft Edge headless", observedMarkers: 1, revision: result.documentRevision, status: result.status, providerCalls: 0, unexpectedOutboundRequests: unexpectedOutbound, humanAcceptance: false, publicAcceptance: false }, null, 2));
    }
    await hostPage.reload();
    await hostPage.waitForFunction(() => document.querySelector("#identity")?.textContent?.startsWith("Developer account:"));
    expect(await hostPage.locator("#room").inputValue()).toBe(roomId);
    expect(await hostPage.locator("#evidence").textContent()).toBe("");
    await hostPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const homeLink = hostPage.getByRole("link", { name: "← Home" });
    const homeBox = await homeLink.boundingBox();
    expect(homeBox).not.toBeNull();
    expect(homeBox!.y).toBeGreaterThanOrEqual(0);
    expect(homeBox!.y + homeBox!.height).toBeLessThanOrEqual(hostPage.viewportSize()!.height);
    await homeLink.click();
    await hostPage.waitForURL(/\/desktop\?panels=environment-home&focus=environment-home$/);
  } finally { releaseReceipt(); releaseCommit(); await browser.close(); await fixture.close(); }
}, 60000);
