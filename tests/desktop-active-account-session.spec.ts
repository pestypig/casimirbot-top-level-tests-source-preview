import { describe, expect, it, vi } from "vitest";
import {
  ensureDelegatedActiveDesktopAccount,
  parseActiveDesktopAccount,
} from
  "../apps/desktop/src/active-account-session";

const activePayload = {
  session: {
    session_id: "account_session:developer-owner",
    profile: { profile_id: "user:owner-profile" },
    status: "active",
    account_policy: { account_type: "developer" },
  },
};

describe("desktop active account-session parsing", () => {
  it("accepts the canonical nested account-session profile shape", () => {
    expect(parseActiveDesktopAccount(activePayload)).toEqual({
      sessionId: "account_session:developer-owner",
      profileId: "user:owner-profile",
      accountType: "developer",
    });
  });

  it("rejects the obsolete direct profile_id projection", () => {
    expect(parseActiveDesktopAccount({
      session: {
        ...activePayload.session,
        profile: undefined,
        profile_id: "user:owner-profile",
      },
    })).toBeNull();
  });

  it("rejects inactive or malformed session authority", () => {
    expect(parseActiveDesktopAccount({
      session: { ...activePayload.session, status: "signed_out" },
    })).toBeNull();
    expect(parseActiveDesktopAccount({
      session: { ...activePayload.session, session_id: "invalid" },
    })).toBeNull();
    expect(parseActiveDesktopAccount({
      session: {
        ...activePayload.session,
        account_policy: { account_type: "guest" },
      },
    })).toBeNull();
  });

  it("restores only the exact broker-validated delegated session", async () => {
    const setCookie = vi.fn(async () => undefined);
    const restored = parseActiveDesktopAccount(activePayload)!;
    const readActiveAccount = vi.fn()
      .mockRejectedValueOnce(new Error("renderer cookie missing"))
      .mockResolvedValueOnce(restored);

    await expect(ensureDelegatedActiveDesktopAccount({
      origin: "http://127.0.0.1:59485",
      delegatedAccountSessionId: restored.sessionId,
      readActiveAccount,
      setCookie,
      nowMs: 1_000,
    })).resolves.toEqual(restored);
    expect(setCookie).toHaveBeenCalledWith({
      url: "http://127.0.0.1:59485",
      name: "helix_session",
      value: restored.sessionId,
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      expirationDate: 604_801,
    });
  });

  it("never replaces a different active renderer identity", async () => {
    const setCookie = vi.fn(async () => undefined);
    await expect(ensureDelegatedActiveDesktopAccount({
      origin: "http://127.0.0.1:59485",
      delegatedAccountSessionId: "account_session:different-owner",
      readActiveAccount: async () => parseActiveDesktopAccount(activePayload)!,
      setCookie,
    })).rejects.toThrow("native_delegated_account_session_mismatch");
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("refreshes a matching cookie before it can expire after validation", async () => {
    const account = parseActiveDesktopAccount(activePayload)!;
    const setCookie = vi.fn(async () => undefined);
    const readActiveAccount = vi.fn().mockResolvedValue(account);
    await expect(ensureDelegatedActiveDesktopAccount({
      origin: "http://127.0.0.1:59485",
      delegatedAccountSessionId: account.sessionId,
      readActiveAccount,
      setCookie,
      nowMs: 2_000,
    })).resolves.toEqual(account);
    expect(setCookie).toHaveBeenCalledOnce();
    expect(readActiveAccount).toHaveBeenCalledTimes(2);
  });
});
