const {
  parseExperience,
  createEmptyExperience,
} = require("../../main/src/experience");
const { formatStripePrice } = require("../../main/src/money.cjs");

function contextIdentity(value) {
  function canonical(v) {
    if (Array.isArray(v)) return ["list", v.map(canonical)];
    if (v && typeof v === "object")
      return [
        "map",
        Object.keys(v)
          .sort()
          .map((key) => [key, canonical(v[key])]),
      ];
    return [v === null ? "null" : typeof v, v];
  }
  return JSON.stringify(canonical(value));
}

function embedIds(settings, key) {
  const legacy = key === "pricingTableIds" ? "pricingTableId" : "buyButtonId";
  return [
    ...(Array.isArray(settings[key])
      ? settings[key]
      : settings[legacy]
        ? [settings[legacy]]
        : []),
  ];
}
function manualSettings(settings, publishableKey, pricingTables, buyButtons) {
  const key = publishableKey.trim();
  if (!/^pk_(test|live)_[A-Za-z0-9]+$/.test(key))
    throw Error("publishable_key");
  const read = (value, prefix) => {
    const ids = value
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (
      ids.length > 100 ||
      new Set(ids).size !== ids.length ||
      ids.some(
        (id) =>
          id.length > 200 || !new RegExp(`^${prefix}[A-Za-z0-9]+$`).test(id),
      )
    )
      throw Error("embed_ids");
    return ids;
  };
  const pricingTableIds = read(pricingTables, "prctbl_"),
    buyButtonIds = read(buyButtons, "buy_btn_");
  if (!pricingTableIds.length && !buyButtonIds.length)
    throw Error("embed_required");
  return { ...settings, publishableKey: key, pricingTableIds, buyButtonIds };
}
function availablePrices(catalog) {
  const validAmount = (price) => {
    try {
      formatStripePrice(price.amount, price.currency);
      return true;
    } catch {
      return false;
    }
  };
  return catalog.prices.filter(
    (price) =>
      catalog.products.some(
        (product) => product.id === price.productId && product.active === true,
      ) &&
      price.active === true &&
      Number.isSafeInteger(price.amount) &&
      price.amount >= 0 &&
      validAmount(price) &&
      (price.interval === undefined ||
        price.interval === null ||
        ["month", "year"].includes(price.interval)) &&
      (price.interval === undefined ||
        price.interval === null ||
        price.intervalCount === 1),
  );
}
function uniqueId(name, used) {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "sales";
  let id = base,
    i = 2;
  while (used.includes(id)) id = `${base}-${i++}`;
  return id;
}
/** Append an explicitly selected Payment Link presentation; never replace existing plans or rules. */
function createStarterPresentation(base, catalog, name, type, selectedPrices) {
  const draft = parseExperience(base || createEmptyExperience());
  if (
    !name.trim() ||
    !["button", "table"].includes(type) ||
    !selectedPrices.length ||
    new Set(selectedPrices).size !== selectedPrices.length ||
    (type === "button" && selectedPrices.length !== 1)
  )
    throw Error("selection");
  const valid = availablePrices(catalog),
    chosen = selectedPrices.map((id) => valid.find((price) => price.id === id));
  if (
    chosen.some((price) => !price) ||
    new Set(chosen.map((price) => price.productId)).size !== chosen.length
  )
    throw Error("selection");
  // Existing products can have independent access/transition semantics. Use their advanced editor rather than silently rewriting them.
  if (
    chosen.some((price) =>
      draft.offers.some((offer) => offer.productId === price.productId),
    )
  )
    throw Error("existing_plan");
  const familyId = uniqueId(
    name,
    draft.families.map((f) => f.id),
  );
  draft.families.push({
    id: familyId,
    name: name.trim(),
    purchasePolicy: "single",
    transitions: [],
    cancellation: { enabled: false, atPeriodEnd: true },
  });
  const offerIds = [];
  for (const price of chosen) {
    const product = catalog.products.find((p) => p.id === price.productId);
    const id = uniqueId(
      product.name || "plan",
      draft.offers.map((o) => o.id),
    );
    draft.offers.push({
      id,
      familyId,
      productId: product.id,
      name: product.name || "Plan",
      description: "",
      marketingFeatures: product.marketingFeatures || [],
      prices: [
        {
          id: price.id,
          currency: price.currency,
          unitAmount: price.amount,
          interval: price.interval || null,
          intervalCount: 1,
          ...(price.taxBehavior === undefined
            ? {}
            : { taxBehavior: price.taxBehavior }),
        },
      ],
      features: [],
    });
    offerIds.push(id);
  }
  const presentationId = uniqueId(
    name,
    draft.presentations.map((p) => p.id),
  );
  draft.presentations.push({
    id: presentationId,
    name: name.trim(),
    type,
    flow: "payment_link",
    offerIds,
    priceIds: [...selectedPrices],
    buttonLabel: "Choose plan",
  });
  return { draft: parseExperience(draft), presentationId };
}
function savedSetup(settings, record, experienceLoaded) {
  const manual = /^pk_(test|live)_[A-Za-z0-9]+$/.test(
    settings.publishableKey || "",
  );
  const read = (key, prefix) => {
    const ids = manual ? embedIds(settings, key) : [];
    return ids.length <= 100 &&
      new Set(ids).size === ids.length &&
      ids.every(
        (id) =>
          typeof id === "string" &&
          id.length <= 200 &&
          new RegExp(`^${prefix}[A-Za-z0-9]+$`).test(id),
      )
      ? ids
      : [];
  };
  const pricingTableIds = read("pricingTableIds", "prctbl_");
  const buyButtonIds = read("buyButtonIds", "buy_btn_");
  const published = experienceLoaded ? record.published : settings.storefront;
  const presentations = published?.presentations || [];
  const draft = record.draft?.presentations || [];
  const hasDraft =
    experienceLoaded && record.draftRevision > record.publishedRevision;
  return {
    presentations,
    pricingTableIds,
    buyButtonIds,
    draft: hasDraft ? draft : [],
    hasDraft,
    cached: !experienceLoaded && presentations.length > 0,
    hasSaved:
      presentations.length > 0 ||
      hasDraft ||
      pricingTableIds.length > 0 ||
      buyButtonIds.length > 0,
  };
}
function paymentLinkUsage(url, published) {
  const identity = (value) => {
    try {
      const u = new URL(value);
      return u.origin === "https://buy.stripe.com"
        ? u.origin + u.pathname
        : null;
    } catch {
      return null;
    }
  };
  const key = identity(url);
  if (!key) return [];
  return (published?.presentations || [])
    .filter((presentation) =>
      presentation.offers?.some((offer) =>
        offer.prices?.some((price) => identity(price.paymentLinkUrl) === key),
      ),
    )
    .map((presentation) => ({
      id: presentation.id,
      name: presentation.name,
      type: presentation.type,
    }));
}
module.exports = {
  savedSetup,
  paymentLinkUsage,
  contextIdentity,
  embedIds,
  manualSettings,
  availablePrices,
  createStarterPresentation,
};
