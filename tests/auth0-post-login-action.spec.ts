import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { AUTH0_MFA_ACR } from "@shared/desktop-auth0-step-up";

type ActionEvent = {
  client?: { client_id?: string };
  transaction?: { acr_values?: unknown };
};

const require = createRequire(import.meta.url);
const { onExecutePostLogin } = require("../auth0/actions/casimirbot-post-login.cjs") as {
  onExecutePostLogin: (
    event: ActionEvent,
    api: {
      accessToken: { setCustomClaim: ReturnType<typeof vi.fn> };
      multifactor: { enable: ReturnType<typeof vi.fn> };
    },
  ) => Promise<void>;
};

const fixture = (override: Partial<ActionEvent> = {}) => {
  const event: ActionEvent = {
    client: { client_id: "fN6cvAYs1yT2RNnVWjFLOKlZT8QMkmGs" },
    transaction: { acr_values: [AUTH0_MFA_ACR] },
    ...override,
  };
  const api = {
    accessToken: { setCustomClaim: vi.fn() },
    multifactor: { enable: vi.fn() },
  };
  return { event, api };
};

describe("CasimirBot Auth0 post-login Action", () => {
  it("forces fresh MFA only for the exact native client and ACR", async () => {
    const { event, api } = fixture();
    await onExecutePostLogin(event, api);

    expect(api.accessToken.setCustomClaim).toHaveBeenCalledWith(
      "https://casimirbot.com/tenant_id",
      "dev-pfgv4lwpqy3soxoy",
    );
    expect(api.multifactor.enable).toHaveBeenCalledWith("any", {
      allowRememberBrowser: false,
    });
  });

  it.each([
    ["another client", { client: { client_id: "another-client" } }],
    ["no ACR", { transaction: {} }],
    ["an additional ACR", { transaction: { acr_values: [AUTH0_MFA_ACR, "urn:other"] } }],
    ["a scalar ACR", { transaction: { acr_values: AUTH0_MFA_ACR } }],
  ] as const)("does not force MFA for %s", async (_label, override) => {
    const { event, api } = fixture(override);
    await onExecutePostLogin(event, api);
    expect(api.multifactor.enable).not.toHaveBeenCalled();
  });

  it("pins the signed tenant claim for non-step-up clients without forcing MFA", async () => {
    const { event, api } = fixture({ client: { client_id: "another-client" } });
    await onExecutePostLogin(event, api);
    expect(api.accessToken.setCustomClaim).toHaveBeenCalledWith(
      "https://casimirbot.com/tenant_id",
      "dev-pfgv4lwpqy3soxoy",
    );
    expect(api.multifactor.enable).not.toHaveBeenCalled();
  });
});
