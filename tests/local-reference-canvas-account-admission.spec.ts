import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: null as any }));
vi.mock("../server/services/helix-account/account-session-store", () => ({ getAccountSessionById: async () => state.session }));
import { resolveLocalCanvasActor } from "../server/services/reference-canvas/default-service";

describe("canvas current password-account admission", () => {
  beforeEach(() => { state.session = {
    session_id: "current-password-session", status: "active", created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60000).toISOString(), account_policy: { account_type: "developer" },
    profile: { profile_id: "local-owner", auth_mode: "password_account", provider: "local", provider_subject: "owner@example.test" },
  }; });
  it("admits the authenticated developer account mode used by Account & Sessions", async () => {
    expect(await resolveLocalCanvasActor("current-password-session")).toMatchObject({ profileId: "local-owner", accountType: "developer", verified: true });
  });
  it.each(["user", "revoked", "expired", "guest", "missing_subject"])("rejects %s while retaining the same authentication surface", async reason => {
    if (reason === "user") state.session.account_policy.account_type = "user";
    if (reason === "revoked") state.session.status = "revoked";
    if (reason === "expired") state.session.expires_at = new Date(Date.now() - 1000).toISOString();
    if (reason === "guest") state.session.profile.auth_mode = "guest";
    if (reason === "missing_subject") state.session.profile.provider_subject = null;
    expect(await resolveLocalCanvasActor("current-password-session")).toBeNull();
  });
});
