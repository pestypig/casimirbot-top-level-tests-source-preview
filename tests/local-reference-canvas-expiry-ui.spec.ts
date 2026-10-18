// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); localStorage.clear(); });

it.each([false, true])("Stop follows the pending submission rather than the selected old request (failure=%s)", async failure => {
  const html = readFileSync("public/local-reference-canvas.html", "utf8");
  document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>")).replace(/<script[\s\S]*?<\/script>/g, "");
  let finish!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const pending = new Promise((resolve, fail) => { finish = resolve; reject = fail; });
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/session")) return { ok: true, json: async () => ({ csrf_token: "fixture", profile_id: "fixture-owner" }) };
    if (url.endsWith("/action-requests")) return pending;
    return { ok: true, json: async () => ({ stopped: true }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  window.eval(readFileSync("public/local-reference-canvas.js", "utf8"));
  await vi.waitFor(() => expect(document.getElementById("identity")!.textContent).toContain("fixture-owner"));
  (document.getElementById("room") as HTMLInputElement).value = "submitted-room";
  (document.getElementById("requestId") as HTMLInputElement).value = "old-request";
  document.getElementById("place")!.click();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  (document.getElementById("room") as HTMLInputElement).value = "different-room";
  document.getElementById("stop")!.click();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  if (failure) reject(Error("network"));
  else finish({ ok: true, json: async () => ({ request_id: "new-request" }) });
  await vi.waitFor(() => expect((document.getElementById("stop") as HTMLButtonElement).disabled).toBe(false));
  if (failure) {
    expect(fetchMock).toHaveBeenCalledTimes(2);
    document.getElementById("stop")!.click();
    await vi.waitFor(() => expect(document.getElementById("status")!.textContent).toContain("Retry the retained request"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } else expect(fetchMock.mock.calls.at(-1)![0]).toBe("/api/agi/hosted/v1/rooms/submitted-room/action-requests/new-request/stop");
});

it("expired activity permits inspection and revoke but blocks a new marker submission", async () => {
  const html = readFileSync("public/local-reference-canvas.html", "utf8");
  document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>")).replace(/<script[\s\S]*?<\/script>/g, "");
  let now = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith("/session")
    ? { csrf_token: "fixture", profile_id: "fixture-owner" }
    : url.endsWith("/revoke") ? { revoked: true }
    : { room: { leaseExpiresAt: 2000 }, shares: [], offers: [], requests: [] } }));
  vi.stubGlobal("fetch", fetchMock);
  window.eval(readFileSync("public/local-reference-canvas.js", "utf8"));
  await vi.waitFor(() => expect(document.getElementById("identity")!.textContent).toContain("fixture-owner"));
  (document.getElementById("room") as HTMLInputElement).value = "fixture-room";
  (document.getElementById("offerId") as HTMLInputElement).value = "fixture-offer";
  now = 400000;
  const click = async (id: string) => {
    document.getElementById(id)!.click();
    await vi.waitFor(() => expect(document.getElementById("status")!.textContent).not.toBe("Working…"));
  };
  await click("refresh");
  expect(fetchMock.mock.calls.at(-1)![0]).toBe("/api/agi/hosted/v1/rooms/fixture-room");
  await click("revoke");
  expect(fetchMock.mock.calls.at(-1)![0]).toBe("/api/agi/hosted/v1/rooms/fixture-room/action-offers/fixture-offer/revoke");
  expect(document.getElementById("status")!.textContent).toBe("Updated. Inspect the measured state below.");
  const callsBefore = fetchMock.mock.calls.length;
  await click("place");
  expect(fetchMock.mock.calls.length).toBe(callsBefore);
  expect(document.getElementById("status")!.textContent).toContain("Room activity suspended");
  now = 1000;
  await click("place");
  expect(fetchMock.mock.calls.length).toBe(callsBefore + 1);
});

it.each([false, true])("restores a retained request (receipt=%s) without automatic replay or another account's record", async withReceipt => {
  const html = readFileSync("public/local-reference-canvas.html", "utf8");
  const mount = () => { document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>")).replace(/<script[\s\S]*?<\/script>/g, ""); };
  const retained = { path: "/rooms/saved-room/action-requests", key: "saved-exact-key", body: { offer_id: "saved-offer", expected_offer_revision: 1 }, ...(withReceipt ? { requestId: "saved-request" } : {}) };
  localStorage.setItem("casimir.local-canvas.request.v1:saved-owner", JSON.stringify(retained));
  let profile = "saved-owner";
  const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith("/session") ? { csrf_token: "fixture", profile_id: profile } : { request_id: "saved-request" } }));
  vi.stubGlobal("fetch", fetchMock);
  mount(); window.eval(readFileSync("public/local-reference-canvas.js", "utf8"));
  await vi.waitFor(() => expect(document.getElementById("status")!.textContent).toContain("nothing was resubmitted"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect((document.getElementById("room") as HTMLInputElement).value).toBe("saved-room");
  const actualNow = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(actualNow + 600000);
  vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw Error("quota"); });
  document.getElementById("retry")!.click();
  await vi.waitFor(() => expect(document.getElementById("status")!.textContent).toContain("no new request was sent"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.parse(localStorage.getItem("casimir.local-canvas.request.v1:saved-owner")!)).toEqual(retained);
  document.getElementById("retry")!.click();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const init = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
  expect((init[1].headers as Record<string, string>)["Idempotency-Key"]).toBe(retained.key);
  expect(JSON.parse(String(init[1].body))).toEqual(retained.body);
  await vi.waitFor(() => expect(document.getElementById("status")!.textContent).toContain("Updated"));
  profile = "different-owner"; fetchMock.mockClear(); mount(); window.eval(readFileSync("public/local-reference-canvas.js", "utf8"));
  await vi.waitFor(() => expect(document.getElementById("identity")!.textContent).toContain(profile));
  expect((document.getElementById("room") as HTMLInputElement).value).toBe("");
  document.getElementById("retry")!.click();
  await vi.waitFor(() => expect(document.getElementById("status")!.textContent).toContain("No retained"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each(["grant_expired", "grant_revoked", "http_receipt_deadline_exceeded", "network"])("handles %s without losing uncertain request identity", async errorCode => {
  const html = readFileSync("public/local-reference-canvas.html", "utf8");
  document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>")).replace(/<script[\s\S]*?<\/script>/g, "");
  const requests: Array<{key: string; body: string}> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/session")) return { ok: true, json: async () => ({ csrf_token: "fixture", profile_id: "fixture-guest" }) };
    requests.push({ key: (init!.headers as Record<string, string>)["Idempotency-Key"], body: String(init!.body) });
    if (requests.length === 1) {
      if (errorCode === "network") throw Error("network");
      return { ok: false, status: errorCode.startsWith("grant_") ? 409 : 503, json: async () => ({ error: errorCode }) };
    }
    return { ok: true, json: async () => ({ request_id: "fixture-request" }) };
  }));
  window.eval(readFileSync("public/local-reference-canvas.js", "utf8"));
  await vi.waitFor(() => expect(document.getElementById("identity")!.textContent).toContain("fixture-guest"));
  (document.getElementById("room") as HTMLInputElement).value = "fixture-room";
  (document.getElementById("offerId") as HTMLInputElement).value = "old-offer";
  const click = async (id: string) => {
    document.getElementById(id)!.click();
    await vi.waitFor(() => expect(document.getElementById("status")!.textContent).not.toBe("Working…"));
  };
  await click("place");
  (document.getElementById("offerId") as HTMLInputElement).value = "fresh-offer";
  await click("place");
  if (errorCode.startsWith("grant_")) {
    expect(requests).toHaveLength(2);
    expect(JSON.parse(requests[1].body).offer_id).toBe("fresh-offer");
    expect(requests[1].key).not.toBe(requests[0].key);
  } else {
    expect(requests).toHaveLength(1);
    await click("retry");
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
  }
});
