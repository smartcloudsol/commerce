import { initializeWordPressAccess } from "./wordpress-access";
import {
  waitForGateyReady,
  getGateyPlugin,
  loadAuthSession,
  getStore,
  getStoreSelect,
} from "@smart-cloud/gatey-core";
import { subscribe } from "@wordpress/data";
import { __ } from "@wordpress/i18n";
import {
  getConfig,
  getWpSuite,
  getBackendProfileContext,
} from "@smart-cloud/wpsuite-core";
// @ts-ignore The WordPress build extracts the scoped stylesheet.
import "./style.css";
// @ts-ignore CommonJS client is also directly exercised by the Node tests.
import { createClient } from "./client";
// @ts-ignore Shared with the Node regression tests.
import { resolveService, resolveGateyEndpoint } from "./index-config";
// @ts-ignore CommonJS helper is covered by focused Node tests.
import { createPurchaseRefresh } from "./purchase-refresh";
// @ts-ignore Isolated, context-fenced customer account controls.
import { createSubscriptionUI } from "./subscription-ui";
// @ts-ignore Pure DOM presentation hooks, independent of authentication.
import { decoratePresentation } from "./presentation";
declare global {
  var WpSuiteCommerceConfig: {
    publishableKey?: string;
    pricingTableId?: string;
    buyButtonId?: string;
  };
}
const api = Object.assign(
  createClient({
    config: {},
    origin: location.href,
    getContext: () =>
      JSON.stringify({
        connection: getWpSuite()?.siteSettings,
        profile: getBackendProfileContext(),
        identity: activeIdentity,
      }),
    resolveConfig: async () => {
      const connection = getWpSuite()?.siteSettings;
      if (
        !connection ||
        connection.workspaceApiMode !== "workspace" ||
        !connection.platformApiBaseUrl ||
        !connection.platformConfigUrl
      )
        throw new Error("Commerce workspace connection required");
      const before = JSON.stringify({
        connection,
        profile: getBackendProfileContext(),
      });
      const config = await getConfig("commerce");
      if (
        before !==
        JSON.stringify({
          connection: getWpSuite()?.siteSettings,
          profile: getBackendProfileContext(),
        })
      )
        throw new Error("Commerce connection changed");
      const resolved = await resolveService(config, async (name: string) => {
        await waitForGateyReady();
        const cognito = getGateyPlugin()?.cognito;
        const store = await cognito?.store;
        if (!cognito || !store) throw new Error("Gatey unavailable");
        return resolveGateyEndpoint(
          cognito,
          getStoreSelect(store).getConfig(),
          name,
          location.hostname,
        );
      });
      if (
        before !==
        JSON.stringify({
          connection: getWpSuite()?.siteSettings,
          profile: getBackendProfileContext(),
        })
      )
        throw new Error("Commerce connection changed");
      return resolved;
    },
    fetcher: fetch.bind(globalThis),
    authenticate: async () => {
      await waitForGateyReady();
      if (!getGateyPlugin()) throw new Error("Gatey unavailable");
      const session = await loadAuthSession();
      return session.tokens?.accessToken?.toString();
    },
  }),
  { ready: waitForGateyReady() },
);
const runtime = globalThis as unknown as {
  WpSuite: { plugins: Record<string, unknown> };
};
runtime.WpSuite = runtime.WpSuite || { plugins: {} };
runtime.WpSuite.plugins = runtime.WpSuite.plugins || {};
runtime.WpSuite.plugins.commerce = api;
initializeWordPressAccess();
for (const node of document.querySelectorAll<HTMLButtonElement>(
  "button[data-commerce-action]",
)) {
  if (
    !["checkout", "portal"].includes(node.dataset.commerceAction || "") ||
    node.parentElement?.classList.contains("sc-commerce-control")
  )
    continue;
  const wrapper = document.createElement("div");
  wrapper.className = "sc-commerce-control";
  const status = document.createElement("span");
  status.className = "sc-commerce-action-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  node.before(wrapper);
  wrapper.append(node, status);
  node.classList.add("wp-element-button");
}
for (const node of document.querySelectorAll<HTMLElement>(
  "[data-commerce-entitlements], [data-commerce-protected]",
)) {
  node.classList.add("sc-commerce-status");
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
}
decoratePresentation(document);
function navigate(result: any) {
  const raw = result?.url;
  if (typeof raw !== "string") throw new Error("Missing session URL");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Invalid session URL");
  location.assign(url.href);
}
let refreshGeneration = 0;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let watcher: { stop: () => void } | undefined;
let activeIdentity = "";
const subscriptionStrings: Record<string, string> = {
  "Open billing portal": __("Open billing portal", "smartcloud-commerce"),
  "The billing portal is unavailable. Please try again.": __(
    "The billing portal is unavailable. Please try again.",
    "smartcloud-commerce",
  ),
  "Sign in to manage subscriptions.": __(
    "Sign in to manage subscriptions.",
    "smartcloud-commerce",
  ),
  "Loading subscriptions…": __("Loading subscriptions…", "smartcloud-commerce"),
  "Preparing a change preview…": __(
    "Preparing a change preview…",
    "smartcloud-commerce",
  ),
  "Confirm subscription change": __(
    "Confirm subscription change",
    "smartcloud-commerce",
  ),
  "Review this change": __("Review this change", "smartcloud-commerce"),
  "Estimated invoice total": __(
    "Estimated invoice total",
    "smartcloud-commerce",
  ),
  "Plan base price": __("Plan base price", "smartcloud-commerce"),
  "Payment may be required immediately.": __(
    "Payment may be required immediately.",
    "smartcloud-commerce",
  ),
  "No immediate payment is requested by this action.": __(
    "No immediate payment is requested by this action.",
    "smartcloud-commerce",
  ),
  Cancel: __("Cancel", "smartcloud-commerce"),
  "Confirm change": __("Confirm change", "smartcloud-commerce"),
  "This preview expired. Request a new preview.": __(
    "This preview expired. Request a new preview.",
    "smartcloud-commerce",
  ),
  "Applying the confirmed change…": __(
    "Applying the confirmed change…",
    "smartcloud-commerce",
  ),
  "The change is complete. Refresh subscriptions to see its current state.": __(
    "The change is complete. Refresh subscriptions to see its current state.",
    "smartcloud-commerce",
  ),
  "Complete the invoice payment to finish this change.": __(
    "Complete the invoice payment to finish this change.",
    "smartcloud-commerce",
  ),
  "The result needs review. Check your subscription before starting another change.":
    __(
      "The result needs review. Check your subscription before starting another change.",
      "smartcloud-commerce",
    ),
  "Complete payment": __("Complete payment", "smartcloud-commerce"),
  "Refresh subscriptions": __("Refresh subscriptions", "smartcloud-commerce"),
  "The result could not be confirmed. Check your subscription before retrying.":
    __(
      "The result could not be confirmed. Check your subscription before retrying.",
      "smartcloud-commerce",
    ),
  "This change is unavailable. Refresh subscriptions and review the allowed changes.":
    __(
      "This change is unavailable. Refresh subscriptions and review the allowed changes.",
      "smartcloud-commerce",
    ),
  "No active subscriptions.": __(
    "No active subscriptions.",
    "smartcloud-commerce",
  ),
  "Undo scheduled change": __("Undo scheduled change", "smartcloud-commerce"),
  "Keep subscription": __("Keep subscription", "smartcloud-commerce"),
  "Cancel subscription": __("Cancel subscription", "smartcloud-commerce"),
  "Subscription management is unavailable. Sign in and check that this site has an active subscription policy.":
    __(
      "Subscription management is unavailable. Sign in and check that this site has an active subscription policy.",
      "smartcloud-commerce",
    ),
  Retry: __("Retry", "smartcloud-commerce"),
};
const subscriptionsUI = createSubscriptionUI({
  api,
  getContext: () => currentContext(),
  translate: (s: string) => subscriptionStrings[s] || s,
});
let attemptedScopes = new Set<string>();
let checkoutReturn = false;
const currentContext = () =>
  JSON.stringify({
    connection: getWpSuite()?.siteSettings,
    profile: getBackendProfileContext(),
    identity: activeIdentity,
  });
const clearRefreshTimer = () => {
  if (refreshTimer !== undefined) {
    clearTimeout(refreshTimer);
    refreshTimer = undefined;
  }
};
const scopeList = async (): Promise<string[]> => {
  const token = (await loadAuthSession()).tokens?.accessToken;
  if (!token) throw new Error("Access token unavailable");
  const scope = token.payload?.scope;
  if (scope !== undefined && typeof scope !== "string")
    throw new Error("Invalid access token scopes");
  return typeof scope === "string" ? scope.split(/\s+/).filter(Boolean) : [];
};
function paint(data: any, synchronized: boolean) {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>("[data-commerce-entitlements]"),
  );
  const protectedNodes = Array.from(
    document.querySelectorAll<HTMLElement>("[data-commerce-protected]"),
  );
  if (data?.status === "ready" && data.validUntil * 1000 <= Date.now())
    synchronized = false;
  if (!synchronized) {
    for (const node of [...nodes, ...protectedNodes])
      node.textContent = __("Updating your access…", "smartcloud-commerce");
    return;
  }
  for (const node of nodes)
    node.textContent =
      data.status === "pending"
        ? __("Access is pending.", "smartcloud-commerce")
        : data.entitlements.length
          ? __("Your access is active.", "smartcloud-commerce")
          : __("No active access.", "smartcloud-commerce");
  for (const node of protectedNodes) {
    let groups: unknown;
    try {
      groups = JSON.parse(node.dataset.requiredGroups || "[]");
    } catch {
      groups = [];
    }
    const url = node.dataset.resourceUrl || "";
    let target: URL | undefined;
    try {
      target = new URL(url);
    } catch {}
    const required =
      Array.isArray(groups) &&
      groups.length > 0 &&
      groups.length <= 50 &&
      groups.every(
        (v: unknown) =>
          typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v),
      )
        ? groups
        : [];
    const available = new Set<string>(
      data.entitlements.flatMap((item: any) => item.groups),
    );
    if (
      synchronized &&
      data.status === "ready" &&
      target?.protocol === "https:" &&
      !target.username &&
      !target.password &&
      required.length &&
      required.every((group: string) => available.has(group))
    ) {
      const link = document.createElement("a");
      link.className = "sc-commerce-resource-link";
      link.href = target.href;
      link.rel = "noopener noreferrer";
      link.textContent =
        node.dataset.linkLabel || __("Open resource", "smartcloud-commerce");
      node.replaceChildren(link);
    } else
      node.textContent = __("Access is unavailable.", "smartcloud-commerce");
  }
}
function schedule(data: any) {
  clearRefreshTimer();
  if (data?.status !== "ready") return;
  const remaining = data.validUntil * 1000 - Date.now();
  if (remaining > 0)
    refreshTimer = setTimeout(
      () => {
        refreshTimer = undefined;
        void refresh();
      },
      Math.min(remaining, 60000),
    );
}
function watch(checkout: boolean) {
  if (watcher) return;
  clearRefreshTimer();
  const context = currentContext();
  let lastData: any;
  let lastSynced = false;
  const own = createPurchaseRefresh({
    readEntitlements: () => api.currentEntitlements(),
    readScopes: scopeList,
    forceRefreshSession: async () => {
      const session = await loadAuthSession({ forceRefresh: true });
      if (!session.tokens?.accessToken || currentContext() !== context)
        throw new Error("Session changed");
    },
    isCurrent: () => {
      if (currentContext() !== context && watcher === own) {
        watcher = undefined;
        ++refreshGeneration;
        for (const node of document.querySelectorAll<HTMLElement>(
          "[data-commerce-entitlements], [data-commerce-protected]",
        ))
          node.textContent = __(
            "Access information is unavailable.",
            "smartcloud-commerce",
          );
        return false;
      }
      return watcher === own;
    },
    onUpdate: (value: any) => {
      if (value.entitlements) lastData = value.entitlements;
      lastSynced = value.synchronized === true;
      if (lastData?.status === "ready" && !lastSynced) {
        const required = [
          ...new Set<string>(
            lastData.entitlements.flatMap((item: any) => item.scopes),
          ),
        ].sort();
        if (required.length)
          attemptedScopes.add(JSON.stringify([context, required]));
      }
      if (lastData) paint(lastData, lastSynced);
    },
    onStop: () => {
      if (watcher !== own) return;
      watcher = undefined;
      if (lastData && lastSynced && lastData.validUntil * 1000 > Date.now()) {
        paint(lastData, true);
        schedule(lastData);
      } else {
        for (const node of document.querySelectorAll<HTMLElement>(
          "[data-commerce-entitlements], [data-commerce-protected]",
        ))
          node.textContent = __(
            "Access is still updating. Refresh the page to try again.",
            "smartcloud-commerce",
          );
      }
    },
  });
  watcher = own;
  own.start({ checkoutReturn: checkout });
}
async function refresh() {
  if (watcher) return;
  void subscriptionsUI.refresh();
  const generation = ++refreshGeneration;
  clearRefreshTimer();
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(
      "[data-commerce-entitlements], [data-commerce-protected]",
    ),
  );
  for (const node of nodes)
    node.textContent = __("Checking your access…", "smartcloud-commerce");
  if (!nodes.length) return;
  const context = currentContext();
  try {
    const data = await api.currentEntitlements();
    if (generation !== refreshGeneration || context !== currentContext())
      return;
    if (data.status === "ready" && data.validUntil * 1000 <= Date.now())
      throw new Error("Expired access");
    const required =
      data.status === "ready"
        ? [
            ...new Set<string>(
              data.entitlements.flatMap((item: any) => item.scopes),
            ),
          ].sort()
        : [];
    if (required.length) {
      const scopes = await scopeList();
      if (generation !== refreshGeneration || context !== currentContext())
        return;
      if (!required.every((scope) => scopes.includes(scope))) {
        paint(data, false);
        const key = JSON.stringify([context, required]);
        if (!attemptedScopes.has(key)) {
          attemptedScopes.add(key);
          watch(false);
        } else
          for (const node of nodes)
            node.textContent = __(
              "Access is still updating. Refresh the page to try again.",
              "smartcloud-commerce",
            );
        return;
      }
    }
    paint(data, true);
    schedule(data);
  } catch {
    if (generation !== refreshGeneration || context !== currentContext())
      return;
    for (const node of nodes)
      node.textContent = __(
        "Access information is unavailable.",
        "smartcloud-commerce",
      );
  }
}
const params = new URL(location.href);
const markers = params.searchParams.getAll("session_id");
if (
  markers.length === 1 &&
  /^cs_(?:test|live)_[A-Za-z0-9]{1,200}$/.test(markers[0])
) {
  checkoutReturn = true;
  const kept = params.search
    .slice(1)
    .split("&")
    .filter((part) => !new URLSearchParams(part).has("session_id"));
  const query = kept.length ? `?${kept.join("&")}` : "";
  history.replaceState(
    history.state,
    "",
    `${params.pathname}${query}${params.hash}`,
  );
}
window.addEventListener("pagehide", () => {
  subscriptionsUI.dispose();
  ++refreshGeneration;
  watcher?.stop();
  watcher = undefined;
  clearRefreshTimer();
});
const setSelector = api.setSubjectSelector.bind(api);
api.setSubjectSelector = (selector?: () => unknown) => {
  subscriptionsUI.invalidate();
  ++refreshGeneration;
  watcher?.stop();
  watcher = undefined;
  attemptedScopes = new Set();
  setSelector(selector);
  void refresh();
};

document.addEventListener("click", async (event) => {
  const node = (event.target as Element)?.closest<HTMLButtonElement>(
    "button[data-commerce-action]",
  );
  if (
    !node ||
    !["checkout", "portal"].includes(node.dataset.commerceAction || "")
  )
    return;
  event.preventDefault();
  if (node.disabled) return;
  const status = node.parentElement?.querySelector<HTMLElement>(
    ".sc-commerce-action-status",
  );
  node.disabled = true;
  node.setAttribute("aria-busy", "true");
  if (status)
    status.textContent =
      node.dataset.commerceAction === "checkout"
        ? __("Opening secure checkout…", "smartcloud-commerce")
        : __("Opening customer portal…", "smartcloud-commerce");
  try {
    if (node.dataset.commerceAction === "checkout")
      navigate(await api.checkout(node.dataset.offerId || "", location.href));
    else navigate(await api.portal(location.href));
  } catch {
    if (status)
      status.textContent = __(
        "Unable to continue. Please try again.",
        "smartcloud-commerce",
      );
  } finally {
    node.disabled = false;
    node.removeAttribute("aria-busy");
  }
});
api.ready
  .then(async () => {
    const store = await getStore();
    const identity = () => {
      const state = getStoreSelect(store).getState();
      return JSON.stringify([state.signedIn, state.account?.username]);
    };
    activeIdentity = identity();
    if (
      checkoutReturn &&
      document.querySelector(
        "[data-commerce-entitlements], [data-commerce-protected]",
      )
    ) {
      void subscriptionsUI.refresh();
      watch(true);
    } else await refresh();
    subscribe(() => {
      const next = identity();
      if (next !== activeIdentity) {
        subscriptionsUI.invalidate();
        ++refreshGeneration;
        watcher?.stop();
        watcher = undefined;
        activeIdentity = next;
        attemptedScopes = new Set();
        void refresh();
      }
    }, store);
  })
  .catch(() => {
    void refresh();
  });
