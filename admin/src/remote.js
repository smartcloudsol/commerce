// Commerce service settings belong to the canonical connected site record.
function createRemote({ getWpSuite, getProfile, getSettings, putSettings }) {
  const current = () => {
    const connection = getWpSuite()?.siteSettings;
    if (
      !connection ||
      connection.workspaceApiMode !== "workspace" ||
      !connection.workspaceId ||
      !connection.siteId ||
      !connection.siteKey
    )
      throw new Error(
        "Connect a workspace site before managing Commerce service settings.",
      );
    for (const value of [
      connection.platformApiBaseUrl,
      connection.platformConfigUrl,
    ]) {
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error("A valid workspace connection is required.");
    }
    const profile = getProfile();
    const fingerprint = JSON.stringify({ connection, profile });
    return {
      fingerprint,
      target: {
        legacyApiBaseUrl: connection.platformApiBaseUrl,
        workspaceId: connection.workspaceId,
        siteId: connection.siteId,
        siteKey: connection.siteKey,
        pluginKey: "commerce",
        connection: { ...connection },
      },
    };
  };
  const validate = (raw) => {
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      Object.keys(raw).some(
        (key) =>
          ![
            "schemaVersion",
            "apiUrl",
            "mappings",
            "apiConnection",
            "apiName",
            "stripe",
          ].includes(key),
      ) ||
      raw.schemaVersion !== 1 ||
      typeof raw.apiUrl !== "string" ||
      raw.apiUrl.length > 2048 ||
      !Array.isArray(raw.mappings) ||
      raw.mappings.length > 100 ||
      /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+/.test(JSON.stringify(raw))
    )
      throw new Error("Invalid Commerce service settings.");
    let stripe;
    if (Object.hasOwn(raw, "stripe")) {
      const value = raw.stripe;
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 3 || Object.keys(value).some((key) => !["accountId", "mode", "publishableKey"].includes(key)) || typeof value.accountId !== "string" || !/^acct_[A-Za-z0-9]{1,128}$/.test(value.accountId) || !["test", "live"].includes(value.mode) || typeof value.publishableKey !== "string" || !(new RegExp(`^pk_${value.mode}_[A-Za-z0-9]{1,256}$`)).test(value.publishableKey)) throw new Error("Invalid Stripe public connection.");
      stripe = { accountId: value.accountId, mode: value.mode, publishableKey: value.publishableKey };
    }
    const apiConnection =
      raw.apiConnection === undefined ? "direct" : raw.apiConnection;
    const apiName = raw.apiName === undefined ? "" : raw.apiName;
    if (
      !["direct", "gatey"].includes(apiConnection) ||
      typeof apiName !== "string" ||
      (apiName !== "" && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(apiName)) ||
      (apiConnection === "gatey" && !apiName)
    )
      throw new Error("Invalid Commerce API connection.");
    const url = raw.apiUrl === "" ? undefined : new URL(raw.apiUrl);
    if (
      url &&
      (url.protocol !== "https:" ||
        url.username ||
        url.password ||
        raw.apiUrl.includes("?") ||
        raw.apiUrl.includes("#"))
    )
      throw new Error("The Commerce API URL must be HTTPS.");
    const seen = new Set();
    if (
      raw.mappings.some((row) => {
        if (
          !row ||
          typeof row !== "object" ||
          Array.isArray(row) ||
          Object.keys(row).length !== 2 ||
          typeof row.feature !== "string" ||
          !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(row.feature) ||
          typeof row.group !== "string" ||
          !/^commerce-[a-z0-9][a-z0-9-]{0,118}$/.test(row.group)
        )
          return true;
        const pair = JSON.stringify([row.feature, row.group]);
        if (seen.has(pair)) return true;
        seen.add(pair);
        return false;
      })
    )
      throw new Error("Invalid feature mapping.");
    return {
      schemaVersion: 1,
      apiUrl: url?.href || "",
      mappings: raw.mappings.map(({ feature, group }) => ({ feature, group })),
      apiConnection,
      apiName,
      ...(stripe ? { stripe } : {}),
    };
  };
  let loaded;
  let generation = 0;
  return {
    async load() {
      const request = ++generation;
      loaded = undefined;
      const before = current();
      const result = await getSettings(before.target);
      if (
        request !== generation ||
        current().fingerprint !== before.fingerprint
      )
        throw new Error("The connected site changed. Reload before saving.");
      if (!Number.isSafeInteger(result.revision) || result.revision < 0)
        throw new Error("Missing site configuration revision.");
      const empty =
        result.settings &&
        typeof result.settings === "object" &&
        !Array.isArray(result.settings) &&
        Object.keys(result.settings).length === 0;
      const settings = empty
        ? {
            schemaVersion: 1,
            apiUrl: "",
            mappings: [],
            apiConnection: "direct",
            apiName: "",
          }
        : validate(result.settings);
      loaded = before.fingerprint;
      return settings;
    },
    async save(raw) {
      const before = current();
      if (!loaded || loaded !== before.fingerprint)
        throw new Error("The connected site changed. Reload before saving.");
      const dto = validate(raw);
      const result = await putSettings(before.target, dto);
      if (current().fingerprint !== before.fingerprint) {
        loaded = undefined;
        throw new Error(
          "The connected site changed. Reload before continuing.",
        );
      }
      return validate(result);
    },
    normalizeCached(raw) {
      if (!raw || typeof raw !== "object" || raw.schemaVersion !== 1)
        return null;
      const { subscriptionType, ...settings } = raw;
      return validate(settings);
    },
    reset() {
      ++generation;
      loaded = undefined;
    },
  };
}
module.exports = { createRemote };
