/* eslint-disable no-control-regex -- Reject control characters in public text. */
const { formatStripePrice } = require("./money.cjs");
/* Public draft model. Server publication must separately validate catalog and authority. */
const idPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const stripeId = (prefix) => new RegExp(`^${prefix}_[A-Za-z0-9_]{1,128}$`);
function invalid() {
  throw Error("invalid_experience");
}
function object(v, allowed, required = allowed) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(v)) ||
    Object.keys(v).some((k) => !allowed.includes(k)) ||
    required.some((k) => !Object.hasOwn(v, k))
  )
    invalid();
  return v;
}
function text(v, max, empty = false, multiline = false) {
  if (
    typeof v !== "string" ||
    (!empty && !v.trim()) ||
    Array.from(v).length > max ||
    (multiline
      ? /[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/
      : /[<>\x00-\x1f\x7f]/
    ).test(v)
  )
    invalid();
  return v;
}
function id(v, pattern = idPattern) {
  if (typeof v !== "string" || !pattern.test(v)) invalid();
  return v;
}
function array(v, max) {
  if (!Array.isArray(v) || v.length > max) invalid();
  return v;
}
function unique(values) {
  if (new Set(values).size !== values.length) invalid();
  return values;
}
function choice(v, values) {
  if (!values.includes(v)) invalid();
  return v;
}
function strings(v, max, pattern = idPattern) {
  return unique(array(v, max).map((x) => id(x, pattern)));
}
function createEmptyExperience() {
  return {
    schemaVersion: 1,
    families: [],
    offers: [],
    presentations: [],
    notificationProfile: {
      enabled: false,
      locale: "en",
      senderName: "",
      replyTo: "",
    },
  };
}
function parseExperience(raw) {
  let encoded;
  try {
    encoded = JSON.stringify(raw);
  } catch {
    invalid();
  }
  if (
    typeof encoded !== "string" ||
    new TextEncoder().encode(encoded).length > 65536
  )
    invalid();
  const root = object(raw, [
    "schemaVersion",
    "families",
    "offers",
    "presentations",
    "notificationProfile",
  ]);
  if (root.schemaVersion !== 1) invalid();
  const families = array(root.families, 20).map((f) => {
    object(
      f,
      [
        "id",
        "name",
        "purchasePolicy",
        "transitions",
        "cancellation",
        "automaticTax",
      ],
      ["id", "name", "purchasePolicy", "transitions", "cancellation"],
    );
    if (f.automaticTax !== undefined && typeof f.automaticTax !== "boolean")
      invalid();
    const cancellation = object(f.cancellation, ["enabled", "atPeriodEnd"]);
    if (
      typeof cancellation.enabled !== "boolean" ||
      typeof cancellation.atPeriodEnd !== "boolean"
    )
      invalid();
    const transitions = array(f.transitions, 100).map((e) => {
      object(e, ["fromOfferId", "toOfferId", "timing", "proration"]);
      return {
        fromOfferId: id(e.fromOfferId),
        toOfferId: id(e.toOfferId),
        timing: choice(e.timing, ["immediate", "period_end"]),
        proration: choice(e.proration, [
          "none",
          "create_prorations",
          "always_invoice",
        ]),
      };
    });
    unique(transitions.map((e) => `${e.fromOfferId}\0${e.toOfferId}`));
    return {
      id: id(f.id),
      name: text(f.name, 200).trim(),
      purchasePolicy: choice(f.purchasePolicy, ["single", "multiple"]),
      ...(f.automaticTax ? { automaticTax: true } : {}),
      transitions,
      cancellation: {
        enabled: cancellation.enabled,
        atPeriodEnd: cancellation.atPeriodEnd,
      },
    };
  });
  unique(families.map((f) => f.id));
  const offers = array(root.offers, 100).map((o) => {
    object(o, [
      "id",
      "familyId",
      "productId",
      "name",
      "description",
      "marketingFeatures",
      "prices",
      "features",
    ]);
    const prices = array(o.prices, 3).map((p) => {
      object(
        p,
        [
          "id",
          "currency",
          "unitAmount",
          "interval",
          "intervalCount",
          "taxBehavior",
        ],
        ["id", "currency", "unitAmount", "interval", "intervalCount"],
      );
      formatStripePrice(p.unitAmount, p.currency);
      if (
        !Number.isSafeInteger(p.unitAmount) ||
        p.unitAmount < 0 ||
        p.intervalCount !== 1
      )
        invalid();
      return {
        id: id(p.id, stripeId("price")),
        currency: id(p.currency, /^[a-z]{3}$/),
        unitAmount: p.unitAmount,
        interval: choice(p.interval, ["month", "year", null]),
        intervalCount: 1,
        ...(p.taxBehavior === undefined
          ? {}
          : {
              taxBehavior: choice(p.taxBehavior, [
                "inclusive",
                "exclusive",
                "unspecified",
              ]),
            }),
      };
    });
    unique(prices.map((p) => p.id));
    unique(prices.map((p) => String(p.interval)));
    return {
      id: id(o.id),
      familyId: id(o.familyId),
      productId: id(o.productId, stripeId("prod")),
      name: text(o.name, 200),
      description: text(o.description, 2000, true, true),
      marketingFeatures: array(o.marketingFeatures, 15).map((v) => text(v, 80)),
      prices,
      features: strings(o.features, 100, /^[a-z0-9][a-z0-9._-]{0,127}$/),
    };
  });
  unique(offers.map((o) => o.id));
  unique(offers.map((o) => o.productId));
  unique(offers.flatMap((o) => o.prices.map((p) => p.id)));
  for (const offer of offers)
    if (!families.some((f) => f.id === offer.familyId)) invalid();
  for (const family of families)
    for (const edge of family.transitions) {
      const from = offers.find((o) => o.id === edge.fromOfferId),
        to = offers.find((o) => o.id === edge.toOfferId);
      if (
        !from ||
        !to ||
        from.id === to.id ||
        from.familyId !== family.id ||
        to.familyId !== family.id ||
        !from.prices.some((p) => p.interval !== null) ||
        !to.prices.some((p) => p.interval !== null)
      )
        invalid();
    }
  const presentations = array(root.presentations, 50).map((p) => {
    object(
      p,
      [
        "id",
        "name",
        "type",
        "flow",
        "offerIds",
        "priceIds",
        "featuredOfferId",
        "buttonLabel",
      ],
      ["id", "name", "type", "flow", "offerIds", "priceIds", "buttonLabel"],
    );
    const offerIds = strings(p.offerIds, 100),
      priceIds = strings(p.priceIds, 100, stripeId("price"));
    const type = choice(p.type, ["button", "table"]),
      flow = choice(p.flow, ["payment_link", "checkout"]);
    if (
      !offerIds.length ||
      !priceIds.length ||
      (type === "button" && (priceIds.length !== 1 || offerIds.length !== 1))
    )
      invalid();
    if (
      offerIds.some((offerId) => !offers.some((o) => o.id === offerId)) ||
      priceIds.some(
        (priceId) =>
          !offers.some(
            (o) =>
              offerIds.includes(o.id) &&
              o.prices.some((price) => price.id === priceId),
          ),
      ) ||
      offerIds.some(
        (offerId) =>
          !offers
            .find((o) => o.id === offerId)
            .prices.some((price) => priceIds.includes(price.id)),
      )
    )
      invalid();
    const featuredOfferId =
      p.featuredOfferId === undefined ? undefined : id(p.featuredOfferId);
    if (featuredOfferId && !offerIds.includes(featuredOfferId)) invalid();
    return {
      id: id(p.id),
      name: text(p.name, 200),
      type,
      flow,
      offerIds,
      priceIds,
      ...(featuredOfferId ? { featuredOfferId } : {}),
      buttonLabel: text(p.buttonLabel, 120),
    };
  });
  unique(presentations.map((p) => p.id));
  const n = object(root.notificationProfile, [
    "enabled",
    "locale",
    "senderName",
    "replyTo",
  ]);
  if (typeof n.enabled !== "boolean") invalid();
  const locale = id(n.locale, /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
  const senderName = text(n.senderName, 120, true),
    replyTo = text(n.replyTo, 254, true);
  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) invalid();
  return {
    schemaVersion: 1,
    families,
    offers,
    presentations,
    notificationProfile: { enabled: n.enabled, locale, senderName, replyTo },
  };
}
// Reversible lower-case encoding preserves case-sensitive Stripe IDs in runtime offer keys.
function runtimeOfferId(offerId, priceId) {
  id(offerId);
  id(priceId, stripeId("price"));
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0,
    value = 0,
    encoded = "";
  for (const character of priceId) {
    value = (value << 8) | character.charCodeAt(0);
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += alphabet[(value >>> bits) & 31];
    }
    value &= (1 << bits) - 1;
  }
  if (bits) encoded += alphabet[(value << (5 - bits)) & 31];
  const key = `${offerId}.${encoded}`;
  if (key.length > 128) invalid();
  return key;
}
function compileSubscriptionPolicy(
  experience,
  revision,
  portalConfigurationIds = {},
) {
  const model = parseExperience(experience);
  if (!Number.isSafeInteger(revision) || revision < 1) invalid();
  object(
    portalConfigurationIds,
    model.families.map((f) => f.id),
    [],
  );
  const output = {
    schemaVersion: 1,
    revision,
    families: [],
    offers: Object.create(null),
  };
  const variant = (offer, price) => runtimeOfferId(offer.id, price.id);
  for (const offer of model.offers)
    for (const price of offer.prices)
      output.offers[variant(offer, price)] = {
        familyId: offer.familyId,
        productId: offer.productId,
        priceId: price.id,
        mode: price.interval === null ? "payment" : "subscription",
        ...(model.families.find((f) => f.id === offer.familyId)?.automaticTax
          ? { automaticTax: true }
          : {}),
      };
  if (Object.keys(output.offers).length > 100) invalid();
  for (const family of model.families) {
    const members = model.offers.filter((o) => o.familyId === family.id),
      transitions = [];
    for (const edge of family.transitions) {
      const from = members.find((o) => o.id === edge.fromOfferId),
        to = members.find((o) => o.id === edge.toOfferId);
      for (const a of from.prices.filter((p) => p.interval !== null))
        for (const b of to.prices.filter((p) => p.interval !== null))
          transitions.push({
            fromOfferId: variant(from, a),
            toOfferId: variant(to, b),
            timing: edge.timing,
            proration: edge.proration,
          });
    }
    if (transitions.length > 100) invalid();
    const portal = portalConfigurationIds[family.id];
    if (portal !== undefined) id(portal, stripeId("bpc"));
    output.families.push({
      id: family.id,
      name: family.name,
      purchasePolicy: family.purchasePolicy,
      ...(family.automaticTax ? { automaticTax: true } : {}),
      offerIds: members.flatMap((o) => o.prices.map((p) => variant(o, p))),
      transitions,
      ...(portal === undefined ? {} : { portalConfigurationId: portal }),
      cancellation: { ...family.cancellation },
    });
  }
  return output;
}
function parseCatalogSetup(raw) {
  const value = object(raw, [
    "name",
    "description",
    "marketingFeatures",
    "prices",
    "featureLookupKeys",
  ]);
  const prices = array(value.prices, 3).map((p) => {
    object(
      p,
      ["currency", "unitAmount", "interval", "intervalCount", "taxBehavior"],
      ["currency", "unitAmount", "interval", "intervalCount"],
    );
    formatStripePrice(p.unitAmount, p.currency);
    if (p.intervalCount !== 1) invalid();
    return {
      currency: p.currency,
      unitAmount: p.unitAmount,
      interval: choice(p.interval, ["month", "year", null]),
      intervalCount: 1,
      ...(p.taxBehavior === undefined
        ? {}
        : {
            taxBehavior: choice(p.taxBehavior, [
              "inclusive",
              "exclusive",
              "unspecified",
            ]),
          }),
    };
  });
  if (!prices.length) invalid();
  unique(prices.map((p) => String(p.interval)));
  return {
    name: text(value.name, 200),
    description: text(value.description, 2000, true, true),
    marketingFeatures: array(value.marketingFeatures, 15).map((v) =>
      text(v, 80),
    ),
    prices,
    featureLookupKeys: strings(
      value.featureLookupKeys,
      15,
      /^[a-z0-9][a-z0-9._-]{0,127}$/,
    ),
  };
}
function projectCatalogSetupResult(raw) {
  const value = object(raw, ["product", "prices", "features"]);
  const product = object(value.product, [
    "id",
    "name",
    "marketingFeatures",
    "active",
  ]);
  if (product.active !== true) invalid();
  const result = {
    product: {
      id: id(product.id, stripeId("prod")),
      name: text(product.name, 200),
      marketingFeatures: array(product.marketingFeatures, 15).map((n) =>
        text(n, 80),
      ),
      active: true,
    },
    prices: [],
    features: [],
  };
  result.prices = array(value.prices, 3).map((p) => {
    object(
      p,
      [
        "id",
        "amount",
        "currency",
        "productId",
        "interval",
        "intervalCount",
        "active",
        "taxBehavior",
      ],
      ["id", "amount", "currency", "productId", "active"],
    );
    if (
      p.active !== true ||
      p.productId !== product.id ||
      (p.interval === undefined) !== (p.intervalCount === undefined) ||
      (p.interval !== undefined &&
        (p.intervalCount !== 1 || !["month", "year"].includes(p.interval)))
    )
      invalid();
    formatStripePrice(p.amount, p.currency);
    return {
      id: id(p.id, stripeId("price")),
      amount: p.amount,
      currency: p.currency,
      productId: product.id,
      active: true,
      ...(p.taxBehavior === undefined
        ? {}
        : {
            taxBehavior: choice(p.taxBehavior, [
              "inclusive",
              "exclusive",
              "unspecified",
            ]),
          }),
      ...(p.interval === undefined
        ? {}
        : { interval: p.interval, intervalCount: 1 }),
    };
  });
  if (!result.prices.length) invalid();
  unique(result.prices.map((p) => p.id));
  result.features = array(value.features, 15).map((f) => {
    object(f, ["id", "name", "lookupKey"]);
    return {
      id: id(f.id, stripeId("feat")),
      name: text(f.name, 200).trim(),
      lookupKey: id(f.lookupKey, /^[a-z0-9][a-z0-9._-]{0,127}$/),
    };
  });
  unique(result.features.map((f) => f.id));
  return result;
}
function projectStorefront(raw) {
  const v = object(
    raw,
    [
      "schemaVersion",
      "revision",
      "accountId",
      "mode",
      "presentations",
      "portalConfigurations",
      "policy",
      "definition",
    ],
    ["schemaVersion", "revision", "accountId", "mode", "presentations"],
  );
  if (
    v.schemaVersion !== 1 ||
    !Number.isSafeInteger(v.revision) ||
    v.revision < 1 ||
    !["test", "live"].includes(v.mode)
  )
    invalid();
  const accountId = id(v.accountId, /^acct_[A-Za-z0-9]{1,128}$/);
  const presentations = array(v.presentations, 50).map((p) => {
    object(
      p,
      [
        "id",
        "name",
        "type",
        "flow",
        "buttonLabel",
        "featuredOfferId",
        "offers",
      ],
      ["id", "name", "type", "flow", "buttonLabel", "offers"],
    );
    const offers = array(p.offers, 100).map((o) => {
      object(o, ["id", "name", "description", "marketingFeatures", "prices"]);
      const prices = array(o.prices, 3).map((price) => {
        object(
          price,
          [
            "id",
            "currency",
            "unitAmount",
            "interval",
            "intervalCount",
            "checkoutOfferId",
            "paymentLinkUrl",
            "taxBehavior",
            "automaticTax",
          ],
          [
            "id",
            "currency",
            "unitAmount",
            "interval",
            "intervalCount",
            "checkoutOfferId",
          ],
        );
        formatStripePrice(price.unitAmount, price.currency);
        if (price.automaticTax !== undefined && price.automaticTax !== true)
          invalid();
        if (
          !Number.isSafeInteger(price.unitAmount) ||
          price.unitAmount < 0 ||
          price.intervalCount !== 1 ||
          price.checkoutOfferId !== runtimeOfferId(o.id, price.id)
        )
          invalid();
        let paymentLinkUrl;
        if (price.paymentLinkUrl !== undefined) {
          let url;
          try {
            url = new URL(price.paymentLinkUrl);
          } catch {
            invalid();
          }
          if (
            url.origin !== "https://buy.stripe.com" ||
            url.username ||
            url.password ||
            url.hash ||
            url.href.length > 2048
          )
            invalid();
          paymentLinkUrl = url.href;
        }
        if (p.flow === "payment_link" && !paymentLinkUrl) invalid();
        return {
          id: id(price.id, stripeId("price")),
          currency: id(price.currency, /^[a-z]{3}$/),
          unitAmount: price.unitAmount,
          interval: choice(price.interval, ["month", "year", null]),
          intervalCount: 1,
          ...(price.taxBehavior === undefined
            ? {}
            : {
                taxBehavior: choice(price.taxBehavior, [
                  "inclusive",
                  "exclusive",
                  "unspecified",
                ]),
              }),
          ...(price.automaticTax === true ? { automaticTax: true } : {}),
          checkoutOfferId: price.checkoutOfferId,
          ...(paymentLinkUrl ? { paymentLinkUrl } : {}),
        };
      });
      if (!prices.length) invalid();
      return {
        id: id(o.id),
        name: text(o.name, 200),
        description: text(o.description, 2000, true, true),
        marketingFeatures: array(o.marketingFeatures, 15).map((n) =>
          text(n, 80),
        ),
        prices,
      };
    });
    if (
      !offers.length ||
      (p.type === "button" &&
        (offers.length !== 1 || offers[0].prices.length !== 1))
    )
      invalid();
    const featuredOfferId =
      p.featuredOfferId === undefined ? undefined : id(p.featuredOfferId);
    if (featuredOfferId && !offers.some((o) => o.id === featuredOfferId))
      invalid();
    return {
      id: id(p.id),
      name: text(p.name, 200),
      type: choice(p.type, ["button", "table"]),
      flow: choice(p.flow, ["payment_link", "checkout"]),
      buttonLabel: text(p.buttonLabel, 120),
      ...(featuredOfferId ? { featuredOfferId } : {}),
      offers,
    };
  });
  unique(presentations.map((p) => p.id));
  const result = {
    schemaVersion: 1,
    revision: v.revision,
    accountId,
    mode: v.mode,
    presentations,
  };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 65536)
    invalid();
  return result;
}
function projectExperienceRecord(raw) {
  const v = object(
    raw,
    ["draftRevision", "draft", "publishedRevision", "published", "publication"],
    ["draftRevision", "publishedRevision"],
  );
  if (
    ![v.draftRevision, v.publishedRevision].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    v.publishedRevision > v.draftRevision
  )
    invalid();
  const result = {
    draftRevision: v.draftRevision,
    publishedRevision: v.publishedRevision,
  };
  if (v.draft !== undefined) result.draft = parseExperience(v.draft);
  if (v.published !== undefined) {
    result.published = projectStorefront(v.published);
    if (result.published.revision !== v.publishedRevision) invalid();
  }
  if (v.publication !== undefined) {
    const job = object(
      v.publication,
      ["id", "revision", "status", "projection", "failureCode"],
      ["id", "revision", "status"],
    );
    if (
      typeof job.id !== "string" ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(job.id) ||
      !Number.isSafeInteger(job.revision) ||
      job.revision < 1 ||
      job.revision > v.draftRevision
    )
      invalid();
    result.publication = {
      id: job.id,
      revision: job.revision,
      status: choice(job.status, [
        "preparing",
        "awaiting_runtime",
        "active",
        "failed",
      ]),
    };
    if (job.failureCode !== undefined) {
      if (job.failureCode !== "publication_failed") invalid();
      result.publication.failureCode = job.failureCode;
    }
    if (job.projection !== undefined)
      result.publication.projection = projectStorefront(job.projection);
  }
  return result;
}
module.exports = {
  createEmptyExperience,
  parseExperience,
  compileSubscriptionPolicy,
  runtimeOfferId,
  projectStorefront,
  projectExperienceRecord,
  parseCatalogSetup,
  projectCatalogSetupResult,
};
