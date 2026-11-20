import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  MantineProvider,
  TextInput,
  Autocomplete,
  Select,
  Button,
  Alert,
  Stack,
  Title,
  Text,
  Card,
  Group,
  NavLink,
  Badge,
  Modal,
  SimpleGrid,
  createTheme,
} from "@mantine/core";
import { __ } from "@wordpress/i18n";
import {
  getWpSuite,
  getBackendProfileContext,
  getSitePluginSettings,
  putSitePluginSettings,
  getConfig,
} from "@smart-cloud/wpsuite-core";
import {
  getGateyPlugin,
  waitForGateyReady,
  loadAuthSession,
  getStoreSelect,
} from "@smart-cloud/gatey-core";
// @ts-ignore Pure shared adapter.
import { createClient } from "../../main/src/client";
// @ts-ignore Shared pure service resolver.
import { resolveGateyEndpoint } from "../../main/src/index-config";
// @ts-ignore Pure shared adapter.
import { createRemote } from "./remote";
// @ts-ignore Pure shared adapter.
import { createConfigurationLoader } from "./configuration";
import {
  SiteStripeConnection,
  type Client as PlatformClient,
} from "./site-stripe-connection";
// @ts-ignore Public authenticated runtime administration client.
import { createStripeAdminClient } from "./stripe-client";
import { ExperienceEditor } from "./experience-editor";
import { CommerceOnboarding } from "./onboarding";
import { StripeCatalogBrowser } from "./catalog-browser";
// @ts-ignore Canonical context identity preserves map semantics and list order.
import { contextIdentity } from "./onboarding-model.cjs";
// @ts-ignore Shared public contract.
import { createEmptyExperience } from "../../main/src/experience";
import "./style.css";
import type { Service } from "./service-types";
const SettingsEditor = React.lazy(() =>
  WPSUITE_COMMERCE_PREMIUM
    ? import("./paid-features/settings-editor")
    : import("./free-features/service-note")
);
const LazyEmailTemplateEditor = React.lazy(() =>
  WPSUITE_COMMERCE_PREMIUM
    ? import("./paid-features/email-template-editor")
    : import("./free-features/service-note")
);
type Settings = {
  storefront?: any;
  publishableKey?: string;
  pricingTableId?: string;
  buyButtonId?: string;
  pricingTableIds?: string[];
  buyButtonIds?: string[];
};
declare global {
  var WpSuiteCommerceAdmin: {
    url: string;
    nonce: string;
    protectionUrl?: string;
    canManage?: boolean;
    hubOverviewUrl?: string;
    pagesUrl?: string;
    advancedUrl?: string;
  };
}
const sections = [
  ["general", __("Overview", "smartcloud-commerce")],
  ["stripe-connection", __("Stripe connection", "smartcloud-commerce")],
  ["plans", __("Sales setup", "smartcloud-commerce")],
  ["pricing-tables", __("Pricing tables", "smartcloud-commerce")],
  ["buy-buttons", __("Buy buttons", "smartcloud-commerce")],
  ["api-settings", __("API Settings", "smartcloud-commerce")],
  ["feature-mappings", __("Feature access", "smartcloud-commerce")],
  ["wordpress-protection", __("WordPress protection", "smartcloud-commerce")],
];
const legacySalesSections = ["presentations", "subscriptions", "notifications"];
const knownSection = (id: string) =>
  sections.some(([key]) => key === id) || legacySalesSections.includes(id);
const canonicalSection = (id: string) =>
  legacySalesSections.includes(id) ? "plans" : id;
const theme = createTheme({
  respectReducedMotion: true,
  components: {
    TextInput: TextInput.extend({
      defaultProps: {
        inputWrapperOrder: ["label", "input", "description", "error"],
      },
    }),
    Select: Select.extend({
      defaultProps: {
        inputWrapperOrder: ["label", "input", "description", "error"],
        comboboxProps: { zIndex: 100020 },
      },
    }),
    Autocomplete: Autocomplete.extend({
      defaultProps: {
        inputWrapperOrder: ["label", "input", "description", "error"],
        comboboxProps: { zIndex: 100020 },
      },
    }),
  },
});
function App({
  simple = false,
  host,
}: {
  simple?: boolean;
  host: HTMLElement;
}) {
  const [remote] = useState(() =>
    createRemote({
      getWpSuite,
      getProfile: getBackendProfileContext,
      getSettings: getSitePluginSettings,
      putSettings: putSitePluginSettings,
    }),
  );

  const [surfaceVisible, setSurfaceVisible] = useState(
    !host.closest("[hidden]"),
  );
  const [detailsOpened, setDetailsOpened] = useState(
    !simple && !host.closest("[hidden]"),
  );
  useEffect(() => {
    const update = () => {
      const visible = !host.closest("[hidden]");
      setSurfaceVisible(visible);
      if (visible && !simple) setDetailsOpened(true);
    };
    const observer = new MutationObserver(update);
    for (let node: HTMLElement | null = host; node; node = node.parentElement)
      observer.observe(node, { attributes: true, attributeFilter: ["hidden"] });
    update();
    return () => observer.disconnect();
  }, [host, simple]);
  const [onboardingDirty, setOnboardingDirty] = useState(false);
  const [catalogState, setCatalogState] = useState("idle");
  const [paymentLinkState, setPaymentLinkState] = useState("idle");
  const catalogRefresh = useRef<() => void>(() => {});
  const localHydrated = useRef(false);
  const [localRefresh, setLocalRefresh] = useState(0);

  const initial =
    new URL(location.href).searchParams.get("section") || "general";
  const [section, setSection] = useState(
    knownSection(initial) ? initial : "general",
  );
  const [stripeSetupMode, setStripeSetupMode] = useState(
    getWpSuite()?.siteSettings?.workspaceId ? "connected" : "manual",
  );
  const [settings, setSettings] = useState<Settings>({});
  const [connectedStripeKey, setConnectedStripeKey] = useState("");
  const [emailDirty, setEmailDirty] = useState(false);
  const [platformClient, setPlatformClient] = useState<PlatformClient>();
  const [catalog, setCatalog] = useState<any>({
    products: [],
    prices: [],
    features: [],
  });
  const [experienceRecord, setExperienceRecord] = useState<any>({
    draftRevision: 0,
    publishedRevision: 0,
  });
  const [experienceLoaded, setExperienceLoaded] = useState(false);
  const [experienceReadState, setExperienceReadState] = useState("idle");
  const [experienceBusy, setExperienceBusy] = useState(false);
  const [experienceMessage, setExperienceMessage] = useState("");
  const publicationId = useRef<{ revision: number; id: string }>();
  const [profile, setProfile] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [localLoading, setLocalLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [service, setService] = useState<Service>({
    schemaVersion: 1,
    apiConnection: "direct",
    apiName: "",
    apiUrl: "",
    mappings: [],
  });
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [configSource, setConfigSource] = useState("");
  const configurationLoader = useRef<any>(null);
  const [remoteMessage, setRemoteMessage] = useState("");
  const [readiness, setReadiness] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  const [apis, setApis] = useState<string[]>([]);
  const [remove, setRemove] = useState<{
    label: string;
    action: () => void;
  } | null>(null);
  const context = useRef("");
  const mounted = useRef(true);
  const cachedStorefront = useRef("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const headers = {
    "X-WP-Nonce": WpSuiteCommerceAdmin.nonce,
    "Content-Type": "application/json",
  };
  const fingerprint = () =>
    mounted.current
      ? contextIdentity({
          profile: getBackendProfileContext(),
          connection: getWpSuite()?.siteSettings,
        })
      : "unmounted";
  const platformContextKey = fingerprint();
  useEffect(() => {
    setExperienceRecord({ draftRevision: 0, publishedRevision: 0 });
    setExperienceLoaded(false);
    setExperienceReadState("idle");
    setExperienceMessage("");
    setExperienceBusy(false);
    publicationId.current = undefined;
    setCatalog({ products: [], prices: [], features: [] });
    setConnectedStripeKey("");
    setEmailDirty(false);
  }, [platformContextKey]);
  const serviceRef = useRef(service);
  serviceRef.current = service;
  const stripeContext = () =>
    JSON.stringify([
      fingerprint(),
      serviceRef.current.apiConnection,
      serviceRef.current.apiName,
      serviceRef.current.apiUrl,
    ]);
  const stripeContextKey = stripeContext();
  useEffect(() => {
    setFeatures([]);
  }, [stripeContextKey]);
  const ensureContext = () => {
    if (context.current !== fingerprint()) {
      setLoaded(false);
      setRemoteLoaded(false);
      remote.reset();
      throw Error("Context changed");
    }
  };
  useEffect(() => {
    if (!surfaceVisible || localHydrated.current) return;
    context.current = fingerprint();
    let active = true;
    fetch(WpSuiteCommerceAdmin.url, { headers, credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((v) => {
        if (!active) return;
        ensureContext();
        if (!v || !("profile" in v) || !v.settings) throw Error();
        setProfile(v.profile);
        setSettings(v.settings);
        cachedStorefront.current = contextIdentity([
          fingerprint(),
          v.settings.storefront,
        ]);
        localHydrated.current = true;
        setLoaded(true);
      })
      .catch(() => {
        if (active)
          setMessage(
            __(
              "Unable to load local settings. Reload the page.",
              "smartcloud-commerce",
            ),
          );
      })
      .finally(() => {
        if (active) setLocalLoading(false);
      });
    waitForGateyReady()
      .then(async () => {
        const c = getGateyPlugin()?.cognito;
        if (!c) return;
        await c.store;
        const names = Object.keys(c.getAmplifyConfig()?.API?.REST || {});
        if (active && context.current === fingerprint()) setApis(names);
      })
      .catch(() => {});
    return () => {
      active = false;
      remote.reset();
    };
  }, [surfaceVisible, localRefresh]);
  useEffect(() => {
    const pop = () => {
      const id =
        new URL(location.href).searchParams.get("section") || "general";
      setSection(knownSection(id) ? id : "general");
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (!simple) return;
    const reload = () => {
      if (onboardingDirty) return;
      localHydrated.current = false;
      setLocalRefresh((value) => value + 1);
    };
    window.addEventListener("wpsuite-product-summary-open", reload);
    return () =>
      window.removeEventListener("wpsuite-product-summary-open", reload);
  }, [simple, onboardingDirty]);
  const navigate = (id: string) => {
    if (
      emailDirty &&
      canonicalSection(section) === "plans" &&
      canonicalSection(id) !== "plans" &&
      !window.confirm(
        __(
          "Your email template has unsaved changes. Leave without saving?",
          "smartcloud-commerce",
        ),
      )
    )
      return;
    setSection(id);
    setMessage("");
    setRemoteMessage("");
    const url = new URL(location.href);
    url.searchParams.set("section", id);
    url.searchParams.set("panel", "details");
    history.pushState({}, "", url);
  };
  const save = async (nextSettings = settings): Promise<boolean> => {
    setBusy(true);
    try {
      ensureContext();
      if (!loaded) throw Error();
      const ph: Record<string, string> = profile
        ? {
            "X-WPSuite-Backend-Profile": profile.id,
            "X-WPSuite-Backend-Generation": String(profile.generation),
            "X-WPSuite-Backend-Binding-Revision": String(
              profile.bindingRevision,
            ),
          }
        : {};
      const r = await fetch(WpSuiteCommerceAdmin.url, {
        method: "POST",
        headers: { ...headers, ...ph },
        credentials: "same-origin",
        body: JSON.stringify({ profile, settings: nextSettings }),
      });
      ensureContext();
      if (r.status === 409) setLoaded(false);
      if (!r.ok) throw Error();
      const data = await r.json();
      setSettings(data.settings);
      setProfile(data.profile);
      setMessage(__("Local settings saved.", "smartcloud-commerce"));
      window.dispatchEvent(new Event("wpsuite-product-saved"));
      return true;
    } catch {
      setMessage(
        __(
          "Local settings could not be saved. Check the identifiers, then reload if the connection changed.",
          "smartcloud-commerce",
        ),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (simple || !detailsOpened) return;
    let active = true;
    const current = () => active && context.current === fingerprint();
    const loader = createConfigurationLoader({
      readCached: () => getConfig("commerce"),
      remote,
      isCurrent: current,
      onValue: (data: Service, state: { source: string; canSave: boolean }) => {
        setService(data);
        setConfigSource(state.source);
        setRemoteLoaded(state.canSave);
      },
      onError: ({ hasCached }: { hasCached: boolean }) =>
        setRemoteMessage(
          hasCached
            ? __(
                "Saved configuration is available. The connected site could not be reached; editing requires its current revision.",
                "smartcloud-commerce",
              )
            : __(
                "Commerce settings could not be loaded. Check the site connection and try again.",
                "smartcloud-commerce",
              ),
        ),
    });
    configurationLoader.current = loader;
    void loader.load().finally(() => {
      if (current()) setRemoteLoading(false);
    });
    return () => {
      active = false;
      loader.reset();
      configurationLoader.current = null;
    };
  }, [detailsOpened, simple]);
  const retryRemote = async () => {
    setRemoteLoading(true);
    setRemoteLoaded(false);
    setRemoteMessage("");
    try {
      ensureContext();
      await configurationLoader.current?.load();
    } catch {
      setRemoteMessage(
        __(
          "The site connection changed. Reload the page before editing.",
          "smartcloud-commerce",
        ),
      );
    } finally {
      setRemoteLoading(false);
    }
  };
  const saveRemote = async () => {
    setBusy(true);
    try {
      ensureContext();
      const data = await remote.save(service);
      ensureContext();
      setService(data);
      setRemoteMessage(
        __(
          "Commerce service settings saved to the connected WP Suite site.",
          "smartcloud-commerce",
        ),
      );
    } catch {
      setRemoteMessage(
        __(
          "Unable to save. Check the connection and feature mappings, then reload site settings if needed.",
          "smartcloud-commerce",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  const check = async () => {
    setReadiness(__("Checking…", "smartcloud-commerce"));
    try {
      ensureContext();
      let url = service.apiUrl;
      if (service.apiConnection === "gatey") {
        await waitForGateyReady();
        const c = getGateyPlugin()?.cognito;
        const store = await c?.store;
        if (!c || !store) throw Error("Gatey unavailable");
        url = resolveGateyEndpoint(
          c,
          getStoreSelect(store).getConfig(),
          service.apiName,
          location.hostname,
        );
        if (!url) throw Error();
      }
      const result = await createClient({
        config: { apiUrl: url },
        origin: location.href,
        fetcher: fetch.bind(globalThis),
        authenticate: async () => undefined,
      }).health();
      ensureContext();
      setReadiness(
        result.capabilities.entityBindings
          ? __(
              "Backend available. Personal and entity entitlements are supported.",
              "smartcloud-commerce",
            )
          : __(
              "Backend available. Personal entitlements are supported.",
              "smartcloud-commerce",
            ),
      );
    } catch {
      setReadiness(
        __("Backend readiness could not be verified.", "smartcloud-commerce"),
      );
    }
  };
  const askRemove = (label: string, action: () => void) =>
    setRemove({ label, action });
  const ids = (key: "pricingTableIds" | "buyButtonIds") =>
    settings[key] ??
    (settings[key === "pricingTableIds" ? "pricingTableId" : "buyButtonId"]
      ? [
          settings[
            key === "pricingTableIds" ? "pricingTableId" : "buyButtonId"
          ]!,
        ]
      : []);
  const editIds = (key: "pricingTableIds" | "buyButtonIds", items: string[]) =>
    setSettings({
      ...settings,
      [key]: items,
      [key === "pricingTableIds" ? "pricingTableId" : "buyButtonId"]: "",
    });
  const idEditor = (key: "pricingTableIds" | "buyButtonIds", label: string) => (
    <Stack>
      <Text>
        {__(
          "Copy the ID from the embed code in your Stripe Dashboard, then choose it in a Commerce Gutenberg block. Stripe does not provide a documented API to list these embed configurations, including through the App connection. Removing an identifier disables its existing embeds after saving; it does not delete the Stripe object.",
          "smartcloud-commerce",
        )}
      </Text>
      {ids(key).map((id, index) => (
        <Card withBorder key={index}>
          <Group align="end" wrap="wrap">
            <TextInput
              style={{ flex: "1 1 250px" }}
              label={`${label} ${index + 1}`}
              value={id}
              placeholder={key === "pricingTableIds" ? "prctbl_…" : "buy_btn_…"}
              disabled={!loaded || busy}
              onChange={(event) =>
                editIds(
                  key,
                  ids(key).map((v, i) =>
                    i === index ? event.currentTarget.value : v,
                  ),
                )
              }
            />
            <Button
              color="red"
              variant="subtle"
              disabled={!loaded || busy}
              onClick={() =>
                askRemove(id || label, () =>
                  editIds(
                    key,
                    ids(key).filter((_, i) => i !== index),
                  ),
                )
              }
            >
              {__("Remove", "smartcloud-commerce")}
            </Button>
          </Group>
        </Card>
      ))}
      <Button
        variant="light"
        disabled={!loaded || busy || ids(key).length >= 100}
        onClick={() => editIds(key, [...ids(key), ""])}
      >
        {__("Add identifier", "smartcloud-commerce")}
      </Button>
      <Group justify="end">
        <Button loading={busy} disabled={!loaded} onClick={() => void save()}>
          {__("Save local settings", "smartcloud-commerce")}
        </Button>
      </Group>
    </Stack>
  );
  const runtimeAdmin = () =>
    createStripeAdminClient({
      getContext: stripeContext,
      fetcher: fetch.bind(globalThis),
      resolveBaseUrl: async () => {
        const current = serviceRef.current;
        if (current.apiConnection === "direct") return current.apiUrl;
        await waitForGateyReady();
        const c = getGateyPlugin()?.cognito;
        const store = await c?.store;
        if (!c || !store) throw Error("Gatey unavailable");
        return resolveGateyEndpoint(
          c,
          getStoreSelect(store).getConfig(),
          current.apiName,
          location.hostname,
        );
      },
      authenticate: async () => {
        await waitForGateyReady();
        return (await loadAuthSession()).tokens?.accessToken?.toString();
      },
    });
  const cachePublicStorefront = async (value: any, before: string) => {
    if (!value.published || before !== fingerprint()) return;
    const cacheKey = contextIdentity([before, value.published]);
    if (cachedStorefront.current === cacheKey) return;
    const response = await fetch(WpSuiteCommerceAdmin.url, {
      method: "POST",
      headers,
      credentials: "same-origin",
      body: JSON.stringify({
        profile,
        settings: { storefront: value.published },
      }),
    });
    if (!response.ok || before !== fingerprint())
      throw Error("Unable to save public snapshot");
    const local = await response.json();
    ensureContext();
    cachedStorefront.current = cacheKey;
    setSettings((current) => ({
      ...current,
      storefront: local.settings.storefront,
    }));
    window.dispatchEvent(new Event("wpsuite-product-saved"));
  };
  const loadExperience = async (client = platformClient) => {
    if (!client) return;
    const before = fingerprint();
    setExperienceBusy(true);
    setExperienceReadState("loading");
    setExperienceMessage("");
    try {
      const value = await client.experience();
      if (before !== fingerprint()) return;
      setExperienceRecord(value);
      setExperienceLoaded(true);
      setExperienceReadState("ready");
      if (
        value.publication &&
        ["preparing", "awaiting_runtime"].includes(value.publication.status)
      )
        publicationId.current = {
          revision: value.publication.revision,
          id: value.publication.id,
        };
      await cachePublicStorefront(value, before);
    } catch {
      if (before === fingerprint()) setExperienceReadState("failed");
      if (before === fingerprint())
        setExperienceMessage(
          __(
            "Check this site's WP Suite Hub connection and try loading the saved plans again. Your published sales presentations remain unchanged.",
            "smartcloud-commerce",
          ),
        );
    } finally {
      if (before === fingerprint()) setExperienceBusy(false);
    }
  };
  const saveExperience = async (model: any) => {
    if (!platformClient) throw Error("Connected site required");
    const before = fingerprint();
    setExperienceBusy(true);
    try {
      const value = await platformClient.saveExperience(
        experienceRecord.draftRevision,
        model,
      );
      if (before !== fingerprint()) throw Error("Context changed");
      setExperienceRecord(value);
      publicationId.current = undefined;
      window.dispatchEvent(new Event("wpsuite-product-saved"));
      setExperienceMessage(
        __(
          "Draft saved. Preview and publish it to change active sales presentations.",
          "smartcloud-commerce",
        ),
      );
    } finally {
      if (before === fingerprint()) setExperienceBusy(false);
    }
  };
  const applyRuntime = async (value: any) => {
    const client = runtimeAdmin(),
      identity = await client.experienceState(),
      connection = getWpSuite()?.siteSettings;
    const projection = value.publication?.projection || value.published;
    if (
      identity.siteId !== connection?.siteId ||
      identity.workspaceId !== connection?.workspaceId ||
      (projection &&
        (identity.accountId !== projection.accountId ||
          identity.mode !== projection.mode))
    )
      throw Error("Backend identity mismatch");
    return client.applyExperience({
      siteId: identity.siteId,
      workspaceId: identity.workspaceId,
      accountId: identity.accountId,
      mode: identity.mode,
    });
  };
  const publishExperience = async () => {
    if (!platformClient) throw Error("Connected site required");
    const before = fingerprint(),
      revision = experienceRecord.draftRevision;
    publicationId.current ||= { revision, id: crypto.randomUUID() };
    if (publicationId.current.revision !== revision)
      throw Error("Draft changed");
    setExperienceBusy(true);
    setExperienceMessage(__("Preparing publication…", "smartcloud-commerce"));
    try {
      let value = await platformClient.publishExperience(
        revision,
        publicationId.current.id,
      );
      const deadline = Date.now() + 60000;
      while (
        value.publication?.status === "preparing" &&
        Date.now() < deadline &&
        before === fingerprint()
      ) {
        setExperienceRecord(value);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (before !== fingerprint()) return;
        value = await platformClient.experience();
      }
      if (before !== fingerprint()) return;
      setExperienceRecord(value);
      if (
        value.publication?.status === "awaiting_runtime" ||
        (value.publication?.status === "active" &&
          value.published?.presentations?.some(
            (p: any) => p.flow === "checkout",
          ))
      ) {
        setExperienceMessage(
          __(
            "Stripe setup is ready. Applying the saved policy to the Commerce backend…",
            "smartcloud-commerce",
          ),
        );
        try {
          await applyRuntime(value);
          value = await platformClient.experience();
          if (before !== fingerprint()) return;
          setExperienceRecord(value);
        } catch {
          setExperienceMessage(
            __(
              "Stripe setup is prepared. Sign in to the configured backend with an administrator account, check its readiness, and retry synchronizing the saved policy.",
              "smartcloud-commerce",
            ),
          );
          return;
        }
      }
      if (value.publishedRevision === revision && value.published) {
        await cachePublicStorefront(value, before);
        setExperienceMessage(
          __(
            "Published sales presentations are available in the Commerce Gutenberg block.",
            "smartcloud-commerce",
          ),
        );
      } else
        setExperienceMessage(
          __(
            "Publication is pending. The active version is unchanged until the required backend confirms this revision. Refresh the saved plans to check its status.",
            "smartcloud-commerce",
          ),
        );
    } finally {
      if (before === fingerprint()) setExperienceBusy(false);
    }
  };
  const remoteIntro = (
    <>
      {remoteLoading && (
        <Text role="status">
          {__("Loading configuration…", "smartcloud-commerce")}
        </Text>
      )}
      {!remoteLoading && configSource === "cached" && (
        <Badge color="gray">
          {__("Saved configuration", "smartcloud-commerce")}
        </Badge>
      )}
      {remoteMessage && <Alert role="status">{remoteMessage}</Alert>}
      {!remoteLoading && !remoteLoaded && (
        <Button variant="light" onClick={retryRemote}>
          {__("Retry connection", "smartcloud-commerce")}
        </Button>
      )}
    </>
  );
  const publicKeySettings = (
    <Card withBorder>
      <Stack>
        <Title order={3}>
          {__("Stripe publishable key", "smartcloud-commerce")}
        </Title>
        <TextInput
          label={__("Publishable key", "smartcloud-commerce")}
          description={__(
            "Copy the pk_test_ or pk_live_ publishable key from Stripe. Never enter a secret or restricted key.",
            "smartcloud-commerce",
          )}
          value={settings.publishableKey || ""}
          disabled={!loaded || busy}
          onChange={(event) =>
            setSettings({
              ...settings,
              publishableKey: event.currentTarget.value,
            })
          }
        />
        {connectedStripeKey && (
          <>
            <Button
              variant="light"
              disabled={!loaded || busy}
              onClick={() =>
                setSettings((current) => ({
                  ...current,
                  publishableKey: connectedStripeKey,
                }))
              }
            >
              {__("Use connected Stripe key", "smartcloud-commerce")}
            </Button>
            <Text size="sm">
              {__(
                "This copies only the publishable key. Save local settings to apply it.",
                "smartcloud-commerce",
              )}
            </Text>
          </>
        )}
        <Group justify="end">
          <Button loading={busy} disabled={!loaded} onClick={() => void save()}>
            {__("Save local settings", "smartcloud-commerce")}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
  const stripeConnection = (
    <SiteStripeConnection
      key={fingerprint()}
      contextKey={fingerprint()}
      recoveryScope={JSON.stringify({
        workspaceId: getWpSuite()?.siteSettings?.workspaceId || "",
        siteId: getWpSuite()?.siteSettings?.siteId || "",
        profileId: getBackendProfileContext()?.id || "production",
        bindingRevision: getBackendProfileContext()?.bindingRevision || 0,
        platformApiBaseUrl:
          getWpSuite()?.siteSettings?.platformApiBaseUrl ||
          "https://api.wpsuite.io",
      })}
      getContext={fingerprint}
      hubUrl={
        WpSuiteCommerceAdmin.hubOverviewUrl ||
        "admin.php?page=smartcloud-wpsuite"
      }
      connectedSite={Boolean(
        getWpSuite()?.siteSettings?.workspaceId &&
        getWpSuite()?.siteSettings?.siteId &&
        getWpSuite()?.siteSettings?.siteKey &&
        getWpSuite()?.siteSettings?.workspaceApiMode === "workspace",
      )}
      disabled={
        !surfaceVisible ||
        !loaded ||
        busy ||
        (simple && stripeSetupMode !== "connected")
      }
      autoCatalog={
        surfaceVisible &&
        stripeSetupMode === "connected" &&
        (simple ||
          [
            "stripe-connection",
            "plans",
            "feature-mappings",
            ...legacySalesSections,
          ].includes(section))
      }
      compact={simple}
      onCatalogState={setCatalogState}
      onPaymentLinkState={setPaymentLinkState}
      onCatalogRefresh={(refresh) => {
        catalogRefresh.current = refresh || (() => {});
      }}
      onConnection={(stripe) =>
        setConnectedStripeKey(stripe?.publishableKey || "")
      }
      onFeatures={setFeatures}
      onClient={setPlatformClient}
      onCatalog={setCatalog}
      onReady={loadExperience}
    />
  );
  useEffect(() => {
    if (!onboardingDirty) return;
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [onboardingDirty]);
  if (simple)
    return (
      <MantineProvider theme={theme}>
        <CommerceOnboarding
          key={platformContextKey}
          contextKey={platformContextKey}
          mode={stripeSetupMode}
          setMode={setStripeSetupMode}
          connectedSite={Boolean(
            getWpSuite()?.siteSettings?.workspaceId &&
            getWpSuite()?.siteSettings?.siteId &&
            getWpSuite()?.siteSettings?.siteKey &&
            getWpSuite()?.siteSettings?.workspaceApiMode === "workspace",
          )}
          connection={stripeConnection}
          stripeKey={connectedStripeKey}
          settings={settings}
          loaded={loaded}
          busy={busy || experienceBusy}
          catalog={catalog}
          catalogState={catalogState}
          record={experienceRecord}
          experienceLoaded={experienceLoaded}
          experienceReadState={experienceReadState}
          catalogView={
            <StripeCatalogBrowser
              catalog={catalog}
              published={
                experienceLoaded
                  ? experienceRecord.published
                  : settings.storefront
              }
              draft={experienceRecord.draft}
              state={catalogState}
              linkState={paymentLinkState}
              onRefresh={() => catalogRefresh.current()}
            />
          }
          message={message || experienceMessage}
          onSaveLocal={save}
          onSaveDraft={saveExperience}
          onPublish={publishExperience}
          onPreview={async (draft) => {
            if (!platformClient) throw Error("Connected site required");
            const before = fingerprint();
            const value = await platformClient.previewExperience(draft);
            if (before !== fingerprint()) throw Error("Context changed");
            return value;
          }}
          onRefresh={() => void loadExperience()}
          onDirty={setOnboardingDirty}
          hubUrl={
            WpSuiteCommerceAdmin.hubOverviewUrl ||
            "admin.php?page=smartcloud-wpsuite"
          }
          editorUrl={WpSuiteCommerceAdmin.pagesUrl || "edit.php?post_type=page"}
          advancedUrl={
            WpSuiteCommerceAdmin.advancedUrl ||
            "admin.php?page=smartcloud-commerce&panel=details&section=plans"
          }
        />
      </MantineProvider>
    );
  return (
    <MantineProvider theme={theme}>
      <div className="commerce-admin">
        <Stack gap="xl">
          {!document
            .getElementById("smartcloud-commerce-admin")
            ?.closest("#wpsuite-product-details") && (
            <div>
              <Title order={1}>{__("Commerce", "smartcloud-commerce")}</Title>
              <Text size="xs" c="dimmed" fs="italic">
                {__("Powered by SmartCloud Commerce", "smartcloud-commerce")}
              </Text>
              <Text mt="sm">
                {__(
                  "Sell with Stripe and manage access to subscribed content.",
                  "smartcloud-commerce",
                )}
              </Text>
            </div>
          )}
          <div className="commerce-layout">
            <Card
              component="nav"
              aria-label={__("Commerce settings", "smartcloud-commerce")}
              withBorder
              className="commerce-sidebar"
            >
              <Text c="dimmed" size="sm" mb="xs">
                {__("Free features", "smartcloud-commerce")}
              </Text>
              {sections.slice(0, 5).map(([id, label]) => (
                <NavLink
                  component="button"
                  type="button"
                  key={id}
                  label={label}
                  active={canonicalSection(section) === id}
                  onClick={() => navigate(id)}
                  aria-current={
                    canonicalSection(section) === id ? "page" : undefined
                  }
                />
              ))}
              <Text c="dimmed" size="sm" mt="md" mb="xs">
                {__("Pro features", "smartcloud-commerce")}
              </Text>
              {sections.slice(5).map(([id, label]) => (
                <NavLink
                  component="button"
                  type="button"
                  key={id}
                  label={label}
                  active={canonicalSection(section) === id}
                  onClick={() => navigate(id)}
                  aria-current={
                    canonicalSection(section) === id ? "page" : undefined
                  }
                />
              ))}
            </Card>
            <Stack className="commerce-content" gap="lg">
              <Title order={2}>
                {sections.find(([id]) => id === canonicalSection(section))?.[1]}
              </Title>
              {message && <Alert role="status">{message}</Alert>}
              {section === "stripe-connection" && (
                <Group
                  role="group"
                  aria-label={__("Stripe setup method", "smartcloud-commerce")}
                >
                  <Button
                    variant={stripeSetupMode === "manual" ? "filled" : "light"}
                    aria-pressed={stripeSetupMode === "manual"}
                    onClick={() => setStripeSetupMode("manual")}
                  >
                    {__("Manual embeds", "smartcloud-commerce")}
                  </Button>
                  <Button
                    variant={
                      stripeSetupMode === "connected" ? "filled" : "light"
                    }
                    aria-pressed={stripeSetupMode === "connected"}
                    onClick={() => setStripeSetupMode("connected")}
                  >
                    {__("Connected Stripe catalog", "smartcloud-commerce")}
                  </Button>
                </Group>
              )}
              {section === "stripe-connection" &&
                stripeSetupMode === "manual" &&
                publicKeySettings}
              <div
                hidden={
                  section !== "stripe-connection" ||
                  stripeSetupMode !== "connected"
                }
              >
                {stripeConnection}
              </div>
              {[
                "plans",
                "presentations",
                "subscriptions",
                "notifications",
              ].includes(section) && (
                <>
                  {experienceMessage && (
                    <Alert role="status">{experienceMessage}</Alert>
                  )}
                  <Group>
                    <Button
                      variant="light"
                      onClick={() => navigate("stripe-connection")}
                    >
                      {__("Manage Stripe connection", "smartcloud-commerce")}
                    </Button>
                    <Button
                      variant="light"
                      loading={experienceBusy}
                      onClick={() => void loadExperience()}
                    >
                      {__("Refresh saved plans", "smartcloud-commerce")}
                    </Button>
                  </Group>
                  {!experienceLoaded && (
                    <Text>
                      {__(
                        "Saved plans load using the connected site. Open Stripe connection to check the connection or load products and prices.",
                        "smartcloud-commerce",
                      )}
                    </Text>
                  )}
                  {(experienceRecord.publication?.status ===
                    "awaiting_runtime" ||
                    (experienceRecord.publication?.status === "active" &&
                      Boolean(service.apiName || service.apiUrl))) && (
                    <Button
                      loading={experienceBusy}
                      onClick={async () => {
                        const before = fingerprint();
                        setExperienceBusy(true);
                        try {
                          await applyRuntime(experienceRecord);
                          await loadExperience();
                        } catch {
                          if (before === fingerprint())
                            setExperienceMessage(
                              __(
                                "The backend could not apply this policy. Check its administrator sign-in, deployment identity, and pending checkouts before retrying.",
                                "smartcloud-commerce",
                              ),
                            );
                        } finally {
                          if (before === fingerprint())
                            setExperienceBusy(false);
                        }
                      }}
                    >
                      {__(
                        "Synchronize Commerce backend",
                        "smartcloud-commerce",
                      )}
                    </Button>
                  )}
                  {experienceLoaded && (
                    <>
                      <Text size="sm">
                        {experienceRecord.draftRevision > 0
                          ? __("Draft saved", "smartcloud-commerce")
                          : __("Draft not saved", "smartcloud-commerce")}{" "}
                        ·{" "}
                        {experienceRecord.publishedRevision > 0
                          ? __("Published", "smartcloud-commerce")
                          : __("Not published", "smartcloud-commerce")}
                      </Text>
                      <details>
                        <summary>
                          {__(
                            "Advanced revision details",
                            "smartcloud-commerce",
                          )}
                        </summary>
                        <Text size="sm">
                          {__("Draft revision", "smartcloud-commerce")}:{" "}
                          {experienceRecord.draftRevision} ·{" "}
                          {__("Published revision", "smartcloud-commerce")}:{" "}
                          {experienceRecord.publishedRevision}
                        </Text>
                      </details>
                      <ExperienceEditor
                        key={platformContextKey}
                        value={
                          experienceRecord.draft || createEmptyExperience()
                        }
                        revision={experienceRecord.draftRevision}
                        initialTab={
                          section === "plans"
                            ? "families"
                            : section === "presentations"
                              ? "presentations"
                              : section === "subscriptions"
                                ? "rules"
                                : "notifications"
                        }
                        emailTemplates={
                          <React.Suspense
                            fallback={
                              <Text>
                                {__(
                                  "Loading email editor…",
                                  "smartcloud-commerce",
                                )}
                              </Text>
                            }
                          >
                            <LazyEmailTemplateEditor
                              key={stripeContextKey}
                              contextKey={stripeContextKey}
                              disabled={
                                !remoteLoaded ||
                                !(service.apiName || service.apiUrl)
                              }
                              getClient={() => runtimeAdmin()}
                              onDirtyChange={setEmailDirty}
                            />
                          </React.Suspense>
                        }
                        busy={experienceBusy}
                        catalog={catalog}
                        onSave={saveExperience}
                        onPreview={async (model) => {
                          if (!platformClient)
                            throw Error("Connected site required");
                          const before = fingerprint();
                          const value =
                            await platformClient.previewExperience(model);
                          if (before !== fingerprint())
                            throw Error("Context changed");
                          return value;
                        }}
                        onPublish={publishExperience}
                        canPublish={
                          experienceRecord.draftRevision > 0 &&
                          experienceRecord.publication?.status !==
                            "awaiting_runtime"
                        }
                      />
                    </>
                  )}
                </>
              )}
              {section === "stripe-connection" && (
                <>
                  {stripeSetupMode === "connected" && connectedStripeKey && (
                    <StripeCatalogBrowser
                      catalog={catalog}
                      published={
                        experienceLoaded
                          ? experienceRecord.published
                          : settings.storefront
                      }
                      draft={experienceRecord.draft}
                      state={catalogState}
                      linkState={paymentLinkState}
                      onRefresh={() => catalogRefresh.current()}
                    />
                  )}
                  <Text>
                    {__(
                      "Use public Stripe embeds with a manually entered publishable key, or connect Stripe through your WP Suite site. The site connection does not require a paid subscription or a Commerce deployment.",
                      "smartcloud-commerce",
                    )}
                  </Text>
                </>
              )}
              {section === "general" && (
                <>
                  <Text>
                    {__(
                      "Choose how to sell: use a Stripe embed for simple sales, or your Commerce deployment for purchases linked to protected content. Your existing embeds and subscriptions keep their current behavior.",
                      "smartcloud-commerce",
                    )}
                  </Text>
                  <Button
                    variant="light"
                    onClick={() => navigate("stripe-connection")}
                  >
                    {__("Manage Stripe connection", "smartcloud-commerce")}
                  </Button>

                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <Card withBorder>
                      <Text fw={600}>
                        {__("Pricing tables", "smartcloud-commerce")}
                      </Text>
                      <Text>
                        {ids("pricingTableIds").length}{" "}
                        {__("allowed identifiers", "smartcloud-commerce")}
                      </Text>
                      <Button
                        variant="light"
                        mt="sm"
                        onClick={() => navigate("pricing-tables")}
                      >
                        {__("Manage pricing tables", "smartcloud-commerce")}
                      </Button>
                    </Card>
                    <Card withBorder>
                      <Text fw={600}>
                        {__("Buy buttons", "smartcloud-commerce")}
                      </Text>
                      <Text>
                        {ids("buyButtonIds").length}{" "}
                        {__("allowed identifiers", "smartcloud-commerce")}
                      </Text>
                      <Button
                        variant="light"
                        mt="sm"
                        onClick={() => navigate("buy-buttons")}
                      >
                        {__("Manage buy buttons", "smartcloud-commerce")}
                      </Button>
                    </Card>
                  </SimpleGrid>
                </>
              )}
              {section === "pricing-tables" &&
                idEditor(
                  "pricingTableIds",
                  __("Pricing table ID", "smartcloud-commerce"),
                )}
              {section === "buy-buttons" &&
                idEditor(
                  "buyButtonIds",
                  __("Buy button ID", "smartcloud-commerce"),
                )}
              {["api-settings", "feature-mappings", "wordpress-protection"].includes(section) && (
                <React.Suspense fallback={<Text role="status">{__("Loading settings…", "smartcloud-commerce")}</Text>}>
                  <SettingsEditor
                    section={section}
                    service={service}
                    setService={setService}
                    remoteIntro={remoteIntro}
                    remoteLoaded={remoteLoaded}
                    busy={busy}
                    features={features}
                    apis={apis}
                    readiness={readiness}
                    check={check}
                    saveRemote={saveRemote}
                    stripeContextKey={stripeContextKey}
                    stripeContext={stripeContext}
                    enroll={(code) => runtimeAdmin().enroll(code)}
                    askRemove={askRemove}
                  />
                </React.Suspense>
              )}
            </Stack>
          </div>
        </Stack>
        <Modal
          opened={!!remove}
          onClose={() => setRemove(null)}
          title={__("Remove from Commerce settings?", "smartcloud-commerce")}
          zIndex={100010}
        >
          <Stack>
            <Text>{remove?.label}</Text>
            <Text>
              {__(
                "This changes the draft. Save the settings to apply removal. The Stripe object is retained.",
                "smartcloud-commerce",
              )}
            </Text>
            <Group justify="end">
              <Button variant="default" onClick={() => setRemove(null)}>
                {__("Cancel", "smartcloud-commerce")}
              </Button>
              <Button
                color="red"
                onClick={() => {
                  ensureContext();
                  remove?.action();
                  setRemove(null);
                }}
              >
                {__("Remove", "smartcloud-commerce")}
              </Button>
            </Group>
          </Stack>
        </Modal>
      </div>
    </MantineProvider>
  );
}
const root = document.getElementById("smartcloud-commerce-admin");
if (root) createRoot(root).render(<App host={root} />);
const surfaces = ((window as any).smartcloudWpSuiteSurfaces ||= {});
surfaces.commerce = (element: HTMLElement) => {
  const surface = createRoot(element);
  surface.render(<App simple host={element} />);
  return () => surface.unmount();
};
window.dispatchEvent(new Event("smartcloud-wpsuite-surface-ready"));
