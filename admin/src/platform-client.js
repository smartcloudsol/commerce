const {
  parseExperience,
  projectExperienceRecord,
  parseCatalogSetup,
} = require("../../main/src/experience");
/* Site administration uses the same scoped credentials as shared Pro configuration. */
function createPlatformCommerceClient({
  getContext,
  getConnection,
  requestService,
  assertConfiguration,
  fetcher = (...args) => fetch(...args),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = () => Date.now(),
}) {
  const identifier = /^[A-Za-z0-9_]{1,128}$/;
  const fail = (code) => Object.assign(new Error(code), { code });
  const fields = (v, allowed, required = allowed) => {
    if (
      !v ||
      typeof v !== "object" ||
      Array.isArray(v) ||
      Object.keys(v).some((k) => !allowed.includes(k)) ||
      required.some((k) => !Object.hasOwn(v, k))
    )
      throw fail("invalid_platform_response");
  };
  function project(op, value, resource) {
    if (op === "connection.read" || op === "connection.disconnect") {
      fields(
        value,
        ["connected", "stripe", "connectionRevision"],
        ["connected"],
      );
      if (
        value.connected === false &&
        !Object.hasOwn(value, "stripe") &&
        !Object.hasOwn(value, "connectionRevision")
      )
        return { connected: false };
      if (op === "connection.disconnect" || value.connected !== true)
        throw fail("invalid_platform_response");
      fields(value.stripe, ["accountId", "mode", "publishableKey"]);
      const s = value.stripe;
      if (
        typeof s.accountId !== "string" ||
        !/^acct_[A-Za-z0-9]{1,128}$/.test(s.accountId) ||
        !["test", "live"].includes(s.mode) ||
        typeof s.publishableKey !== "string" ||
        !new RegExp(`^pk_${s.mode}_[A-Za-z0-9]{1,256}$`).test(s.publishableKey)
      )
        throw fail("invalid_platform_response");
      if (
        Object.hasOwn(value, "connectionRevision") &&
        (typeof value.connectionRevision !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value.connectionRevision,
          ))
      )
        throw fail("invalid_platform_response");
      return {
        connected: true,
        ...(value.connectionRevision
          ? { connectionRevision: value.connectionRevision }
          : {}),
        stripe: {
          accountId: s.accountId,
          mode: s.mode,
          publishableKey: s.publishableKey,
        },
      };
    }
    if (op === "connection.begin") {
      fields(value, ["authorizationUrl", "expiresAt"]);
      // The backend owns OAuth-state expiry. Allow ordinary clock skew here;
      // the client status watch is still capped at ten local minutes below.
      const localNow = now() / 1000;
      if (
        typeof value.authorizationUrl !== "string" ||
        !Number.isSafeInteger(value.expiresAt)
      )
        throw fail("invalid_platform_response");
      if (value.expiresAt <= localNow || value.expiresAt > localNow + 720)
        throw fail("stripe_authorization_time_mismatch");
      let u, callback;
      try {
        u = new URL(value.authorizationUrl);
        callback = new URL(u.searchParams.get("redirect_uri"));
      } catch {
        throw fail("invalid_platform_response");
      }
      const keys = [...u.searchParams.keys()];
      if (
        u.protocol !== "https:" ||
        u.hostname !== "marketplace.stripe.com" ||
        u.port ||
        u.username ||
        u.password ||
        u.hash ||
        !/^\/oauth\/v2\/(?:chnlink_[A-Za-z0-9]{1,128}\/)?authorize$/.test(
          u.pathname,
        ) ||
        keys.length !== 3 ||
        new Set(keys).size !== 3 ||
        keys.some((k) => !["state", "client_id", "redirect_uri"].includes(k)) ||
        !/^site_[A-Za-z0-9_-]{43}$/.test(u.searchParams.get("state") || "") ||
        !/^ca_[A-Za-z0-9]{1,128}$/.test(
          u.searchParams.get("client_id") || "",
        ) ||
        callback.protocol !== "https:" ||
        callback.username ||
        callback.password ||
        callback.search ||
        callback.hash
      )
        throw fail("invalid_platform_response");
      return {
        authorizationUrl: u.href,
        expiresAt: Math.min(value.expiresAt, Math.floor(localNow) + 600),
      };
    }
    if (op === "catalog.setupPreview") {
      fields(value, [
        "name",
        "prices",
        "marketingFeatures",
        "features",
        "warnings",
      ]);
      const text = (v, max) =>
        typeof v === "string" &&
        Array.from(v).length <= max &&
        !/[<>\x00-\x1f\x7f]/.test(v);
      const list = (v, cap, max) => {
        if (!Array.isArray(v) || v.length > cap || v.some((x) => !text(x, max)))
          throw fail("invalid_platform_response");
        return [...v];
      };
      if (!text(value.name, 200)) throw fail("invalid_platform_response");
      return {
        name: value.name,
        prices: list(value.prices, 3, 200),
        marketingFeatures: list(value.marketingFeatures, 15, 80),
        features: list(value.features, 15, 200),
        warnings: list(value.warnings, 10, 500),
      };
    }
    if (
      op === "catalog.setupCreate" ||
      op === "catalog.setupStatus" ||
      op === "catalog.setupResume"
    ) {
      fields(
        value,
        ["operationId", "status", "result"],
        ["operationId", "status"],
      );
      if (
        value.operationId !== resource ||
        !["preparing", "ready", "requires_review"].includes(value.status) ||
        (value.status === "ready") !== Object.hasOwn(value, "result")
      )
        throw fail("invalid_platform_response");
      if (value.status !== "ready")
        return { operationId: value.operationId, status: value.status };
      const r = value.result;
      fields(r, ["product", "prices", "features"]);
      const product = project(
        "catalog.read",
        { resource: "products", items: [r.product] },
        "products",
      ).items[0];
      const prices = project(
        "catalog.read",
        { resource: "prices", items: r.prices },
        "prices",
      ).items;
      const features = project(
        "catalog.read",
        { resource: "features", items: r.features },
        "features",
      ).items;
      if (
        !/^prod_[A-Za-z0-9_]{1,128}$/.test(product.id) ||
        product.active !== true ||
        typeof product.name !== "string" ||
        !Array.isArray(product.marketingFeatures) ||
        !prices.length ||
        prices.length > 3 ||
        features.length > 15 ||
        prices.some(
          (p) =>
            !/^price_[A-Za-z0-9_]{1,128}$/.test(p.id) ||
            p.active !== true ||
            p.productId !== product.id ||
            !Number.isSafeInteger(p.amount) ||
            p.amount < 0 ||
            !/^[a-z]{3}$/.test(p.currency || "") ||
            (p.interval !== undefined &&
              (!["month", "year"].includes(p.interval) ||
                p.intervalCount !== 1)),
        ) ||
        features.some(
          (f) =>
            !/^feat_[A-Za-z0-9_]{1,128}$/.test(f.id) ||
            typeof f.name !== "string" ||
            typeof f.lookupKey !== "string",
        )
      )
        throw fail("invalid_platform_response");
      return {
        operationId: value.operationId,
        status: value.status,
        result: { product, prices, features },
      };
    }
    if (
      op === "experience.read" ||
      op === "experience.save" ||
      op === "experience.publish"
    )
      return projectExperienceRecord(value);
    if (op === "experience.preview") {
      fields(value, ["families", "offers", "presentations", "warnings"]);
      const list = (v, cap, max) => {
        if (
          !Array.isArray(v) ||
          v.length > cap ||
          v.some(
            (x) =>
              typeof x !== "string" ||
              x.length > max ||
              /[<>\x00-\x1f\x7f]/.test(x),
          )
        )
          throw fail("invalid_platform_response");
        return [...v];
      };
      if (
        !Array.isArray(value.offers) ||
        value.offers.length > 100 ||
        !Array.isArray(value.presentations) ||
        value.presentations.length > 50
      )
        throw fail("invalid_platform_response");
      return {
        families: list(value.families, 20, 200),
        offers: value.offers.map((o) => {
          fields(o, ["name", "prices", "marketingFeatures"]);
          if (
            typeof o.name !== "string" ||
            o.name.length > 200 ||
            /[<>\x00-\x1f\x7f]/.test(o.name)
          )
            throw fail("invalid_platform_response");
          return {
            name: o.name,
            prices: list(o.prices, 3, 200),
            marketingFeatures: list(o.marketingFeatures, 15, 160),
          };
        }),
        presentations: value.presentations.map((p) => {
          fields(p, ["name", "flow", "kind"]);
          if (
            typeof p.name !== "string" ||
            p.name.length > 200 ||
            /[<>\x00-\x1f\x7f]/.test(p.name) ||
            !["payment_link", "checkout"].includes(p.flow) ||
            !["button", "table"].includes(p.kind)
          )
            throw fail("invalid_platform_response");
          return { name: p.name, flow: p.flow, kind: p.kind };
        }),
        warnings: list(value.warnings, 100, 500),
      };
    }
    fields(value, ["resource", "items", "nextCursor"], ["resource", "items"]);
    if (
      value.resource !== resource ||
      !Array.isArray(value.items) ||
      value.items.length > 50 ||
      (value.nextCursor !== undefined &&
        (typeof value.nextCursor !== "string" ||
          !identifier.test(value.nextCursor)))
    )
      throw fail("invalid_platform_response");
    const items = value.items.map((item) => {
      fields(
        item,
        [
          "id",
          "name",
          "lookupKey",
          "amount",
          "currency",
          "interval",
          "intervalCount",
          "taxBehavior",
          "active",
          "productId",
          "url",
          "marketingFeatures",
          "lineItems",
          "hasMoreLineItems",
        ],
        ["id"],
      );
      if (typeof item.id !== "string" || !identifier.test(item.id))
        throw fail("invalid_platform_response");
      for (const [key, val] of Object.entries(item)) {
        if (key === "id") continue;
        if (key === "active") {
          if (
            !["products", "prices", "paymentLinks"].includes(resource) ||
            typeof val !== "boolean"
          )
            throw fail("invalid_platform_response");
        } else if (key === "hasMoreLineItems") {
          if (resource !== "paymentLinks" || typeof val !== "boolean")
            throw fail("invalid_platform_response");
        } else if (key === "lineItems") {
          if (
            resource !== "paymentLinks" ||
            !Array.isArray(val) ||
            val.length > 10
          )
            throw fail("invalid_platform_response");
          for (const line of val) {
            fields(
              line,
              [
                "priceId",
                "productId",
                "name",
                "currency",
                "amount",
                "quantity",
                "interval",
                "intervalCount",
              ],
              ["priceId", "productId", "name", "currency"],
            );
            if (
              !/^price_[A-Za-z0-9_]{1,128}$/.test(line.priceId) ||
              !/^prod_[A-Za-z0-9_]{1,128}$/.test(line.productId) ||
              typeof line.name !== "string" ||
              line.name.length > 2048 ||
              !/^[a-z]{3}$/.test(line.currency) ||
              (line.amount !== undefined &&
                (!Number.isSafeInteger(line.amount) || line.amount < 0)) ||
              (line.quantity !== undefined &&
                (!Number.isSafeInteger(line.quantity) || line.quantity < 1)) ||
              (line.interval !== undefined &&
                (!["day", "week", "month", "year"].includes(line.interval) ||
                  !Number.isSafeInteger(line.intervalCount) ||
                  line.intervalCount < 1)) ||
              (line.intervalCount !== undefined && line.interval === undefined)
            )
              throw fail("invalid_platform_response");
          }
        } else if (key === "taxBehavior") {
          if (
            resource !== "prices" ||
            !["inclusive", "exclusive", "unspecified"].includes(val)
          )
            throw fail("invalid_platform_response");
        } else if (key === "intervalCount") {
          if (resource !== "prices" || !Number.isSafeInteger(val) || val < 1)
            throw fail("invalid_platform_response");
        } else if (key === "marketingFeatures") {
          if (
            resource !== "products" ||
            !Array.isArray(val) ||
            val.length > 15 ||
            val.some(
              (v) =>
                typeof v !== "string" ||
                !v.length ||
                Array.from(v).length > 80 ||
                /[\x00-\x1f\x7f]/.test(v),
            )
          )
            throw fail("invalid_platform_response");
        } else if (
          key === "amount"
            ? !Number.isSafeInteger(val)
            : typeof val !== "string" || val.length > 2048
        )
          throw fail("invalid_platform_response");
      }
      if (resource === "paymentLinks") {
        let url;
        try {
          url = new URL(item.url);
        } catch {
          throw fail("invalid_platform_response");
        }
        if (
          url.origin !== "https://buy.stripe.com" ||
          url.username ||
          url.password ||
          url.hash
        )
          throw fail("invalid_platform_response");
      }
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
      ...(value.nextCursor ? { nextCursor: value.nextCursor } : {}),
    };
  }
  let disposed = false,
    configuration;
  const pending = new Set();
  function check(context) {
    if (disposed) throw fail("platform_client_disposed");
    if (!context || getContext() !== context)
      throw fail("platform_context_changed");
  }
  function https(value, json = false) {
    if (
      typeof value !== "string" ||
      /[\s\\?#]/.test(value) ||
      Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    )
      throw fail("invalid_platform_url");
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (json && !url.pathname.endsWith(".json"))
    )
      throw fail("invalid_platform_url");
    return url.href.replace(/\/+$/, "");
  }
  function target() {
    const c = getConnection();
    if (
      !c ||
      c.workspaceApiMode !== "workspace" ||
      ![c.workspaceId, c.siteId].every(
        (v) =>
          typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v),
      ) ||
      typeof c.siteKey !== "string" ||
      !c.siteKey ||
      (c.accountId && c.accountId !== c.workspaceId)
    )
      throw fail("site_connection_required");
    const api = https(c.platformApiBaseUrl);
    https(c.platformConfigUrl, true);
    return {
      legacyApiBaseUrl: api,
      workspaceId: c.workspaceId,
      siteId: c.siteId,
      siteKey: c.siteKey,
      pluginKey: "commerce",
      connection: { ...c },
    };
  }
  async function resolveService(selected, context, signal) {
    if (!configuration)
      configuration = (async () => {
        const response = await fetcher(selected.connection.platformConfigUrl, {
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          signal,
        });
        check(context);
        if (!response.ok) throw fail("platform_request_unavailable");
        const text = await response.text();
        check(context);
        if (text.length > 262144) throw fail("invalid_platform_response");
        const value = JSON.parse(text);
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          https(value.foundationApiBaseUrl) !== selected.legacyApiBaseUrl
        )
          throw fail("invalid_platform_url");
        assertConfiguration(value);
        check(context);
        const url = https(
          value.commerceServiceBaseUrl ||
            `${selected.legacyApiBaseUrl}/commerce`,
        );
        if (!new URL(url).pathname.endsWith("/commerce"))
          throw fail("invalid_platform_url");
        return url;
      })().catch((error) => {
        configuration = undefined;
        throw error;
      });
    const result = await configuration;
    check(context);
    return result;
  }
  function operation(
    op,
    resource,
    cursor,
    model,
    expectedRevision,
    publicationId,
  ) {
    switch (op) {
      case "connection.read":
        return ["GET", "stripe-connection"];
      case "connection.begin":
        return ["POST", "stripe-connection", {}];
      case "connection.disconnect":
        return ["DELETE", "stripe-connection", {}];
      case "catalog.read":
        return [
          "GET",
          `stripe-catalog?resource=${resource}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        ];
      case "experience.read":
        return ["GET", "experience"];
      case "experience.save":
        return ["PUT", "experience", { expectedRevision, model }];
      case "experience.preview":
        return ["POST", "experience/preview", { model }];
      case "experience.publish":
        return [
          "POST",
          "experience/publish",
          { expectedRevision, publicationId },
        ];
      case "catalog.setupPreview":
        return ["POST", "catalog-setup/preview", { definition: model }];
      case "catalog.setupCreate":
        return [
          "POST",
          "catalog-setup",
          { definition: model, operationId: publicationId },
        ];
      case "catalog.setupResume":
        return ["POST", "catalog-setup/resume", { operationId: publicationId }];
      case "catalog.setupStatus":
        return [
          "GET",
          `catalog-setup?operationId=${encodeURIComponent(publicationId)}`,
        ];
      default:
        throw fail("invalid_platform_request");
    }
  }
  async function request(
    op,
    resource,
    cursor,
    model,
    expectedRevision,
    publicationId,
  ) {
    const context = getContext();
    check(context);
    if (pending.size >= 4) throw fail("platform_busy");
    const selected = target(),
      controller = new AbortController();
    pending.add(controller);
    const timer = setTimer(() => controller.abort(), 20000);
    try {
      const serviceBaseUrl = await resolveService(
        selected,
        context,
        controller.signal,
      );
      check(context);
      const [method, suffix, body] = operation(
        op,
        resource,
        cursor,
        model,
        expectedRevision,
        publicationId,
      );
      const path = `/workspace/${encodeURIComponent(selected.workspaceId)}/site/${encodeURIComponent(selected.siteId)}/${suffix}`;
      const value = await requestService(selected, {
        serviceBaseUrl,
        path,
        method,
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
      });
      check(context);
      return project(op, value, resource);
    } catch (error) {
      check(context);
      if (controller.signal.aborted) throw fail("platform_timeout");
      throw error;
    } finally {
      clearTimer(timer);
      pending.delete(controller);
    }
  }
  return {
    previewCatalogSetup(model) {
      try {
        return request(
          "catalog.setupPreview",
          undefined,
          undefined,
          parseCatalogSetup(model),
        );
      } catch {
        return Promise.reject(fail("invalid_platform_request"));
      }
    },
    createCatalogSetup(model, operationId) {
      try {
        if (
          typeof operationId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            operationId,
          )
        )
          throw fail("invalid_platform_request");
        return request(
          "catalog.setupCreate",
          operationId,
          undefined,
          parseCatalogSetup(model),
          undefined,
          operationId,
        );
      } catch {
        return Promise.reject(fail("invalid_platform_request"));
      }
    },
    resumeCatalogSetup(operationId) {
      if (
        typeof operationId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          operationId,
        )
      )
        return Promise.reject(fail("invalid_platform_request"));
      return request(
        "catalog.setupResume",
        operationId,
        undefined,
        undefined,
        undefined,
        operationId,
      );
    },
    catalogSetupStatus(operationId) {
      if (
        typeof operationId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          operationId,
        )
      )
        return Promise.reject(fail("invalid_platform_request"));
      return request(
        "catalog.setupStatus",
        operationId,
        undefined,
        undefined,
        undefined,
        operationId,
      );
    },
    experience: () => request("experience.read"),
    publishExperience(expectedRevision, publicationId) {
      if (
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 1 ||
        typeof publicationId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          publicationId,
        )
      )
        return Promise.reject(fail("invalid_platform_request"));
      return request(
        "experience.publish",
        undefined,
        undefined,
        undefined,
        expectedRevision,
        publicationId,
      );
    },
    saveExperience(expectedRevision, model) {
      try {
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
          throw fail("invalid_platform_request");
        return request(
          "experience.save",
          undefined,
          undefined,
          parseExperience(model),
          expectedRevision,
        );
      } catch {
        return Promise.reject(fail("invalid_platform_request"));
      }
    },
    previewExperience(model) {
      try {
        return request(
          "experience.preview",
          undefined,
          undefined,
          parseExperience(model),
        );
      } catch {
        return Promise.reject(fail("invalid_platform_request"));
      }
    },
    connection: () => request("connection.read"),
    connect: () => request("connection.begin"),
    disconnect: () => request("connection.disconnect"),
    catalog(resource, cursor) {
      if (
        !["products", "prices", "features", "paymentLinks"].includes(
          resource,
        ) ||
        (cursor !== undefined &&
          (typeof cursor !== "string" || !identifier.test(cursor)))
      )
        return Promise.reject(fail("invalid_platform_request"));
      return request("catalog.read", resource, cursor);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const controller of pending) controller.abort();
      pending.clear();
      configuration = undefined;
    },
  };
}
module.exports = { createPlatformCommerceClient };
