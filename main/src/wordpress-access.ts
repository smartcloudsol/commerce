import { getGateyPlugin, loadAuthSession, waitForGateyReady } from "@smart-cloud/gatey-core";
import { __ } from "@wordpress/i18n";

declare global {
  var WpSuiteCommerceAccessUrl: string | undefined;
}

export function initializeWordPressAccess() {
  if (!globalThis.WpSuiteCommerceAccessUrl) return;
  const endpoint = new URL(globalThis.WpSuiteCommerceAccessUrl, location.href);
  if (endpoint.origin !== location.origin) return;

  const amplify = (globalThis as typeof globalThis & {
    WpSuiteAmplify?: { Hub?: { listen(channel: "auth", callback: (event: { payload: { event: string } }) => void): unknown } };
  }).WpSuiteAmplify;
  amplify?.Hub?.listen("auth", ({ payload }) => {
    if (payload.event === "signedOut") {
      void fetch(endpoint, { method: "DELETE", credentials: "same-origin", redirect: "error", keepalive: true }).catch(() => undefined);
    }
  });

  const status = document.querySelector<HTMLElement>("[data-commerce-access-path]");
  const path = status?.dataset.commerceAccessPath;
  if (!status || !path) return;

  status.textContent = __("Checking your subscription…", "smartcloud-commerce");
  void (async () => {
    try {
      await waitForGateyReady();
      if (!getGateyPlugin()) throw new Error("Gatey unavailable");
      const { tokens } = await loadAuthSession();
      if (!tokens?.accessToken) throw new Error("No active session");
      const fresh = await loadAuthSession({ forceRefresh: true });
      const token = fresh.tokens?.accessToken?.toString();
      if (!token) throw new Error("No active session");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        credentials: "same-origin",
        redirect: "error",
        body: JSON.stringify({ path }),
      });
      // A browser that rejects cookies must retain the gate instead of continually reloading it.
      const attemptKey = `sc-commerce-access:${path}`;
      if (response.ok) {
        const previousAttempt = Number(sessionStorage.getItem(attemptKey) ?? 0);
        if (Date.now() - previousAttempt > 15_000) {
          sessionStorage.setItem(attemptKey, String(Date.now()));
          location.reload();
          return;
        }
        status.textContent = __("Your browser did not retain the access session. Check its cookie settings and try again.", "smartcloud-commerce");
      } else if (response.status === 403) {
        status.textContent = __("Your account does not have access to this content.", "smartcloud-commerce");
      } else {
        throw new Error("Access session unavailable");
      }
    } catch {
      status.textContent = __("Sign in with the account that has access to this content.", "smartcloud-commerce");
    }
  })();
}
