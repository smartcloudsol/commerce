/* This client only accepts the public Commerce admin contract. */
const { createEmailTemplateClient } = require('./email-template-client');
function createStripeAdminClient({
  resolveBaseUrl,
  authenticate,
  fetcher,
  getContext,
  now = () => Date.now(),
}) {
  const object = (v) => v && typeof v === "object" && !Array.isArray(v);
  const fields = (v, allowed, required = allowed) => {
    if (
      !object(v) ||
      Object.keys(v).some((k) => !allowed.includes(k)) ||
      required.some((k) => !Object.hasOwn(v, k))
    )
      throw Error("Invalid response");
  };
  const str = (v, pattern) => typeof v === "string" && pattern.test(v);
  async function request(path, method = "GET", body) {
    const context = getContext();
    const check = () => {
      if (context !== getContext()) throw Error("Connection changed");
    };
    check();
    const endpoint = await resolveBaseUrl();
    check();
    const base = new URL(endpoint);
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    )
      throw Error("Backend unavailable");
    check();
    const token = await authenticate();
    check();
    if (typeof token !== "string" || !token) throw Error("Sign in required");
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      path === "/admin/experience/apply" ? 28000 : 15000,
    );
    try {
      check();
      const response = await fetcher(base.href.replace(/\/$/, "") + path, {
        method,
        credentials: "omit",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      check();
      if (!response.ok) {
        const error = Error(
          response.status === 403
            ? "Administrator access required"
            : response.status === 409
              ? "Connection requires attention"
              : "Backend unavailable",
        );
        error.status = response.status;
        throw error;
      }
      check();
      const value = await response.json();
      check();
      return value;
    } finally {
      clearTimeout(timer);
    }
  }
  function status(v) {
    fields(v, ["connected", "stripe"], ["connected"]);
    if (v.connected === false && !Object.hasOwn(v, "stripe"))
      return { connected: false };
    if (v.connected !== true) throw Error("Invalid response");
    fields(v.stripe, ["accountId", "mode", "publishableKey"]);
    if (
      !str(v.stripe.accountId, /^acct_[A-Za-z0-9]{1,128}$/) ||
      !["test", "live"].includes(v.stripe.mode) ||
      !str(
        v.stripe.publishableKey,
        new RegExp(`^pk_${v.stripe.mode}_[A-Za-z0-9]{1,256}$`),
      )
    )
      throw Error("Invalid response");
    return { connected: true, stripe: { ...v.stripe } };
  }
  function authorization(v) {
    fields(v, ["authorizationUrl", "expiresAt"]);
    const localNow = now() / 1000;
    if (
      typeof v.authorizationUrl !== "string" ||
      !Number.isSafeInteger(v.expiresAt) ||
      v.expiresAt <= localNow ||
      v.expiresAt > localNow + 720
    )
      throw Error("Invalid response");
    const u = new URL(v.authorizationUrl);
    if (
      u.protocol !== "https:" ||
      u.hostname !== "marketplace.stripe.com" ||
      u.port ||
      u.username ||
      u.password ||
      u.hash ||
      !/^\/oauth\/v2\/(?:chnlink_[A-Za-z0-9]{1,128}\/)?authorize$/.test(
        u.pathname,
      )
    )
      throw Error("Invalid response");
    const keys = [...u.searchParams.keys()];
    if (
      keys.length !== 3 ||
      new Set(keys).size !== 3 ||
      keys.some((k) => !["state", "client_id", "redirect_uri"].includes(k)) ||
      !str(u.searchParams.get("state"), /^[A-Za-z0-9_-]{43}$/) ||
      !str(u.searchParams.get("client_id"), /^ca_[A-Za-z0-9]{1,128}$/)
    )
      throw Error("Invalid response");
    const callback = new URL(u.searchParams.get("redirect_uri"));
    if (
      callback.protocol !== "https:" ||
      callback.username ||
      callback.password ||
      callback.hash ||
      callback.search
    )
      throw Error("Invalid response");
    return { authorizationUrl: u.href, expiresAt: Math.min(v.expiresAt, Math.floor(localNow) + 600) };
  }
  return {
    ...createEmailTemplateClient(request),
    async experienceState() {
      const value = await request("/admin/experience/state");
      fields(
        value,
        [
          "siteId",
          "deploymentId",
          "accountId",
          "mode",
          "workspaceId",
          "revision",
          "configurationRevision",
          "hash",
        ],
        [
          "siteId",
          "deploymentId",
          "accountId",
          "mode",
          "workspaceId",
          "revision",
          "configurationRevision",
        ],
      );
      if (
        ![value.siteId, value.deploymentId, value.workspaceId].every((v) =>
          str(v, /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
        ) ||
        !str(value.accountId, /^acct_[A-Za-z0-9]{1,128}$/) ||
        !["test", "live"].includes(value.mode) ||
        ![value.revision, value.configurationRevision].every(
          (v) => Number.isSafeInteger(v) && v >= 0,
        ) ||
        (value.hash !== undefined && !str(value.hash, /^[a-f0-9]{64}$/)) ||
        (value.revision > 0 && !value.hash)
      )
        throw Error("Invalid backend identity");
      return { ...value };
    },
    async applyExperience(identity) {
      fields(identity, ["siteId", "workspaceId", "accountId", "mode"]);
      if (
        ![identity.siteId, identity.workspaceId].every((v) =>
          str(v, /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
        ) ||
        !str(identity.accountId, /^acct_[A-Za-z0-9]{1,128}$/) ||
        !["test", "live"].includes(identity.mode)
      )
        throw Error("Invalid backend identity");
      const value = await request("/admin/experience/apply", "POST", {
        expectedSiteId: identity.siteId,
        expectedWorkspaceId: identity.workspaceId,
        expectedAccountId: identity.accountId,
        expectedMode: identity.mode,
      });
      fields(value, ["revision", "configurationRevision", "hash"]);
      if (
        !Number.isSafeInteger(value.revision) ||
        value.revision < 1 ||
        !Number.isSafeInteger(value.configurationRevision) ||
        value.configurationRevision < 0 ||
        !str(value.hash, /^[a-f0-9]{64}$/)
      )
        throw Error("Invalid policy confirmation");
      return { ...value };
    },
    async connection() {
      return status(await request("/admin/stripe/connection"));
    },
    async connect() {
      return authorization(await request("/admin/stripe/connect", "POST", {}));
    },
    async disconnect() {
      const v = await request("/admin/stripe/disconnect", "POST", {});
      fields(v, ["connected"]);
      if (v.connected !== false) throw Error("Invalid response");
      return { connected: false };
    },
    async enroll(nonce) {
      if (!str(nonce, /^[A-Za-z0-9_-]{43}$/))
        throw Error("Invalid enrollment code");
      const v = await request("/admin/stripe/enroll", "POST", {
        enrollmentNonce: nonce,
      });
      fields(v, ["enrolled"]);
      if (v.enrolled !== true) throw Error("Invalid response");
      return { enrolled: true };
    },
    async catalog(resource, cursor) {
      if (
        !["products", "prices", "features", "paymentLinks"].includes(
          resource,
        ) ||
        (cursor !== undefined && !str(cursor, /^[A-Za-z0-9_]{1,128}$/))
      )
        throw Error("Invalid request");
      const v = await request(
        `/admin/stripe/catalog?resource=${resource}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      fields(v, ["resource", "items", "nextCursor"], ["resource", "items"]);
      if (
        v.resource !== resource ||
        !Array.isArray(v.items) ||
        v.items.length > 50 ||
        (v.nextCursor !== undefined &&
          !str(v.nextCursor, /^[A-Za-z0-9_]{1,128}$/))
      )
        throw Error("Invalid response");
      const items = v.items.map((item) => {
        fields(
          item,
          [
            "id",
            "name",
            "lookupKey",
            "amount",
            "currency",
            "interval",
            "productId",
            "url",
            "marketingFeatures",
          ],
          ["id"],
        );
        if (
          !str(item.id, /^[A-Za-z0-9_]{1,128}$/) ||
          Object.entries(item).some(([k, val]) =>
            k === "marketingFeatures"
              ? resource !== "products" ||
                !Array.isArray(val) ||
                val.length > 15 ||
                val.some(
                  (name) =>
                    typeof name !== "string" ||
                    !name.length ||
                    Array.from(name).length > 80 ||
                    /[\x00-\x1f\x7f]/.test(name),
                )
              : k === "amount"
                ? !Number.isSafeInteger(val)
                : k !== "id" && (typeof val !== "string" || val.length > 2048),
          )
        )
          throw Error("Invalid response");
        return {
          ...item,
          ...(item.marketingFeatures
            ? { marketingFeatures: [...item.marketingFeatures] }
            : {}),
        };
      });
      return {
        resource,
        items,
        ...(v.nextCursor ? { nextCursor: v.nextCursor } : {}),
      };
    },
  };
}
module.exports = { createStripeAdminClient };
