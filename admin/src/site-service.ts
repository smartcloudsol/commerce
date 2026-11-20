import {
  assertBackendProfileCurrent,
  assertBackendProfileFresh,
  getBackendProfileContext,
  type SiteConfigurationTarget,
} from "@smart-cloud/wpsuite-core";

type CommerceSiteRequest = {
  serviceBaseUrl: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signal: AbortSignal;
};

/** Send a validated Commerce route with the Hub connection's site credentials. */
export async function requestCommerceSiteService(
  target: SiteConfigurationTarget,
  { serviceBaseUrl, path, method, body, signal }: CommerceSiteRequest,
): Promise<unknown> {
  const profile = getBackendProfileContext();
  if (method !== "GET") await assertBackendProfileFresh(profile);
  assertBackendProfileCurrent(profile);
  const response = await fetch(serviceBaseUrl + path, {
    method,
    credentials: "omit",
    redirect: "error",
    headers: {
      "X-Site-Key": target.siteKey,
      "X-Plugin": "commerce",
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  });
  assertBackendProfileCurrent(profile);
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403
      ? "site_service_not_authorized"
      : response.status === 409
        ? "site_service_conflict"
        : "site_service_failed";
    throw Object.assign(new Error(code), { code });
  }
  const data = await response.json();
  assertBackendProfileCurrent(profile);
  return data;
}
