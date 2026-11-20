/* Pure client: injected Gatey session and network allow tests without browser credentials. */
function createClient({
  config,
  authenticate,
  fetcher,
  origin,
  timeoutMs = 15000,
  now = () => Date.now(),
  resolveConfig,
  getContext,
}) {
  let selector;
  const object = (value) =>
    value && typeof value === "object" && !Array.isArray(value);
  const requireObject = (value) => {
    if (!object(value)) throw new Error("Invalid Commerce response");
    return value;
  };
  const validSubject = (value) => {
    if (value == null) return undefined;
    if (
      !object(value) ||
      !["user", "entity"].includes(value.kind) ||
      typeof value.id !== "string" ||
      !value.id ||
      value.id.length > 200 ||
      (value.kind === "entity" &&
        (typeof value.type !== "string" ||
          !value.type ||
          value.type.length > 100))
    )
      throw new Error("Invalid subject");
    return value.kind === "user"
      ? { kind: "user", id: value.id }
      : { kind: "entity", type: value.type, id: value.id };
  };
  const selected = () => validSubject(selector?.());
  const base = async () => {
    const selectedConfig = resolveConfig ? await resolveConfig() : config;
    const url = new URL(selectedConfig.apiUrl || "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("Commerce API is not configured");
    return url.href.replace(/\/$/, "");
  };
  const returnUrl = (value) => {
    if (!value) return undefined;
    const url = new URL(value, origin);
    if (
      url.origin !== new URL(origin).origin ||
      !["http:", "https:"].includes(url.protocol)
    )
      throw new Error("Invalid return URL");
    return url.href;
  };
  const offer = (value) => {
    if (typeof value !== "string" || !value.trim() || value.length > 200)
      throw new Error("Offer is required");
    return value;
  };
  const safeUrl = (value, host) => {
    if (typeof value !== "string") throw new Error("Invalid Commerce response");
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hostname !== host
    )
      throw new Error("Invalid Commerce response");
    return url.href;
  };
  async function request(path, method = "GET", body, authenticated = true) {
    const context = getContext ? getContext() : undefined;
    const check = () => {
      if (getContext && getContext() !== context)
        throw new Error("Commerce connection changed");
    };
    const headers = { Accept: "application/json" };
    if (authenticated) {
      check();
      const token = await authenticate();
      check();
      if (typeof token !== "string" || !token)
        throw new Error("Sign in required");
      headers.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      check();
      const endpoint = await base();
      check();
      const response = await fetcher(endpoint + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit",
        signal: controller.signal,
      });
      check();
      if (!response.ok)
        throw new Error(`Commerce request failed (${response.status})`);
      check();
      const value = await response.json();
      check();
      return requireObject(value);
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    setSubjectSelector(fn) {
      if (fn !== undefined && typeof fn !== "function")
        throw new Error("Invalid subject selector");
      selector = fn;
    },
    async health() {
      const v = await request("/health", "GET", undefined, false);
      const c = v.capabilities;
      if (
        v.schemaVersion !== 1 ||
        v.status !== "configured" ||
        !object(c) ||
        c.personalEntitlements !== true ||
        typeof c.entityBindings !== "boolean" ||
        c.protectedPaths !== "external-policy-required" ||
        c.knowledgeBase !== "external-policy-required"
      )
        throw new Error("Invalid Commerce health response");
      return {
        schemaVersion: 1,
        status: "configured",
        capabilities: {
          personalEntitlements: true,
          entityBindings: c.entityBindings,
          protectedPaths: c.protectedPaths,
          knowledgeBase: c.knowledgeBase,
        },
      };
    },
    async currentEntitlements() {
      const selectedSubject = selected();
      const v = await request(
        "/entitlements/current" +
          (selectedSubject
            ? `?subject=${encodeURIComponent(JSON.stringify(selectedSubject))}`
            : ""),
      );
      const responseSubject = validSubject(v.subject);
      if (
        !responseSubject ||
        (selectedSubject &&
          JSON.stringify(selectedSubject) !==
            JSON.stringify(responseSubject)) ||
        typeof v.subjectKey !== "string" ||
        !/^[a-f0-9]{64}$/.test(v.subjectKey) ||
        typeof v.entityScoped !== "boolean" ||
        v.entityScoped !== (responseSubject.kind === "entity") ||
        !Array.isArray(v.entitlements) ||
        !["ready", "pending"].includes(v.status) ||
        (v.status === "ready" &&
          (!Number.isSafeInteger(v.validUntil) ||
            v.validUntil * 1000 <= now())) ||
        (v.status === "pending" &&
          (v.entitlements.length !== 0 || v.validUntil !== undefined)) ||
        v.entitlements.some(
          (e) =>
            !object(e) ||
            typeof e.id !== "string" ||
            !e.id ||
            typeof e.featureLookupKey !== "string" ||
            !e.featureLookupKey ||
            e.status !== "active" ||
            !Array.isArray(e.groups) ||
            !e.groups.every((x) => typeof x === "string") ||
            !Array.isArray(e.scopes) ||
            !e.scopes.every((x) => typeof x === "string"),
        )
      )
        throw new Error("Invalid Commerce entitlement response");
      return v;
    },
    async purchaseBinding(offerId) {
      const v = await request("/stripe/purchase-bindings", "POST", {
        subject: selected(),
        offerId: offer(offerId),
      });
      if (
        typeof v.clientReferenceId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          v.clientReferenceId,
        ) ||
        !Number.isSafeInteger(v.expiresAt) ||
        v.expiresAt < 0 ||
        v.protectedEmbedSupported !== false
      )
        throw new Error("Invalid purchase binding response");
      return {
        clientReferenceId: v.clientReferenceId,
        expiresAt: v.expiresAt,
        protectedEmbedSupported: false,
      };
    },
    async checkout(offerId, url) {
      const v = await request("/stripe/checkout-session", "POST", {
        subject: selected(),
        offerId: offer(offerId),
        returnUrl: returnUrl(url),
      });
      if (typeof v.checkoutSessionId !== "string" || !v.checkoutSessionId)
        throw new Error("Invalid checkout response");
      return {
        checkoutSessionId: v.checkoutSessionId,
        url: safeUrl(v.url, "checkout.stripe.com"),
      };
    },
    async customerSession() {
      const v = await request("/stripe/customer-session", "POST", {
        subject: selected(),
      });
      if (
        v.stripeCustomerIdKnown !== true ||
        typeof v.customerSessionClientSecret !== "string" ||
        !v.customerSessionClientSecret
      )
        throw new Error("Invalid customer session response");
      return {
        stripeCustomerIdKnown: true,
        customerSessionClientSecret: v.customerSessionClientSecret,
      };
    },
    async subscriptions() {
      const v = await request("/subscriptions/list", "POST", {
        subject: selected(),
      });
      if (!Array.isArray(v.subscriptions) || v.subscriptions.length > 100)
        throw Error("Invalid subscriptions");
      return {
        subscriptions: v.subscriptions.map((s) => {
          if (
            !object(s) ||
            typeof s.id !== "string" ||
            !/^sub_[A-Za-z0-9_]{1,128}$/.test(s.id) ||
            typeof s.currentPlan !== "string" ||
            s.currentPlan.length > 200 ||
            typeof s.familyName !== "string" ||
            s.familyName.length > 200 ||
            typeof s.cancelAtPeriodEnd !== "boolean" ||
            !Number.isSafeInteger(s.currentPeriodEnd) ||
            !Array.isArray(s.targets) ||
            s.targets.length > 100
          )
            throw Error("Invalid subscription");
          return {
            id: s.id,
            currentPlan: s.currentPlan,
            familyName: s.familyName,
            familyId:
              typeof s.familyId === "string" &&
              /^[a-z0-9][a-z0-9._-]{0,127}$/.test(s.familyId)
                ? s.familyId
                : undefined,
            cancelAtPeriodEnd: s.cancelAtPeriodEnd,
            canCancel: s.canCancel === true,
            canUndoChange: s.canUndoChange === true,
            currentPeriodEnd: s.currentPeriodEnd,
            targets: s.targets.map((t) => {
              if (
                !object(t) ||
                typeof t.offerId !== "string" ||
                typeof t.name !== "string" ||
                t.name.length > 200 ||
                !Number.isSafeInteger(t.amount) ||
                typeof t.currency !== "string" ||
                !/^[a-z]{3}$/.test(t.currency) ||
                !["month", "year"].includes(t.interval) ||
                !["immediate", "period_end"].includes(t.timing)
              )
                throw Error("Invalid target");
              return {
                offerId: t.offerId,
                name: t.name,
                amount: t.amount,
                currency: t.currency,
                interval: t.interval,
                timing: t.timing,
              };
            }),
          };
        }),
      };
    },
    async previewSubscription(input) {
      const v = await request("/subscriptions/preview", "POST", {
        ...input,
        subject: selected(),
      });
      if (
        typeof v.previewId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(v.previewId) ||
        !Number.isSafeInteger(v.expiresAt) ||
        v.expiresAt * 1000 <= now() ||
        !["change", "cancel", "resume", "undo_change"].includes(v.action) ||
        typeof v.currentPlan !== "string" ||
        typeof v.explanation !== "string" ||
        !Number.isSafeInteger(v.effectiveAt) ||
        typeof v.dueNow !== "boolean" ||
        (v.estimatedInvoiceTotal !== undefined &&
          !Number.isSafeInteger(v.estimatedInvoiceTotal)) ||
        (v.amountBasis !== undefined && v.amountBasis !== "base_price") ||
        (v.currency !== undefined &&
          (typeof v.currency !== "string" || !/^[a-z]{3}$/.test(v.currency)))
      )
        throw Error("Invalid preview");
      return {
        previewId: v.previewId,
        expiresAt: v.expiresAt,
        action: v.action,
        currentPlan: v.currentPlan,
        targetPlan: typeof v.targetPlan === "string" ? v.targetPlan : undefined,
        explanation: v.explanation,
        effectiveAt: v.effectiveAt,
        dueNow: v.dueNow,
        estimatedInvoiceTotal: v.estimatedInvoiceTotal,
        ...(v.amountBasis === undefined ? {} : { amountBasis: v.amountBasis }),
        currency: v.currency,
      };
    },
    async confirmSubscription(previewId) {
      if (typeof previewId !== "string" || !/^[0-9a-f-]{36}$/i.test(previewId))
        throw Error("Invalid preview");
      const v = await request("/subscriptions/confirm", "POST", {
        subject: selected(),
        previewId,
      });
      if (!["done", "pending_payment", "needs_review"].includes(v.status))
        throw Error("Invalid result");
      return {
        status: v.status,
        ...(v.billingUrl
          ? { billingUrl: safeUrl(v.billingUrl, "invoice.stripe.com") }
          : {}),
      };
    },
    async portal(url, selection = {}) {
      if (!url) throw new Error("Return URL is required");
      if (
        !object(selection) ||
        Object.keys(selection).some(
          (k) => !["subscriptionId", "familyId"].includes(k),
        ) ||
        (selection.subscriptionId !== undefined &&
          (typeof selection.subscriptionId !== "string" ||
            !/^sub_[A-Za-z0-9_]{1,128}$/.test(selection.subscriptionId))) ||
        (selection.familyId !== undefined &&
          (typeof selection.familyId !== "string" ||
            !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(selection.familyId)))
      )
        throw Error("Invalid portal selection");
      const v = await request("/stripe/customer-portal-session", "POST", {
        subject: selected(),
        returnUrl: returnUrl(url),
        ...selection,
      });
      return { url: safeUrl(v.url, "billing.stripe.com") };
    },
  };
}
module.exports = { createClient };
