import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { __ } from "@wordpress/i18n";
import {
  getWpSuite,
  assertBackendProfileConfiguration,
} from "@smart-cloud/wpsuite-core";
import { CatalogSetup } from "./catalog-setup";
import { requestCommerceSiteService } from "./site-service";
// @ts-ignore Injected, independently tested site service client.
import { createPlatformCommerceClient } from "./platform-client";
// @ts-ignore Injected, independently tested lifecycle helper.
import { watchStripeConnection } from "./stripe-watch";

type StripeInfo = {
  accountId: string;
  mode: "test" | "live";
  publishableKey: string;
};
type Connection = {
  connected: boolean;
  stripe?: StripeInfo;
  connectionRevision?: string;
};
type Item = {
  id: string;
  name?: string;
  productId?: string;
  amount?: number;
  currency?: string;
  interval?: string;
  intervalCount?: number;
  taxBehavior?: "inclusive" | "exclusive" | "unspecified";
  active?: boolean;
  lookupKey?: string;
  marketingFeatures?: string[];
  url?: string;
  lineItems?: any[];
  hasMoreLineItems?: boolean;
};
type Props = {
  autoCatalog?: boolean;
  compact?: boolean;
  onCatalogState?: (state: "idle" | "loading" | "ready" | "failed") => void;
  onPaymentLinkState?: (state: "idle" | "loading" | "ready" | "failed") => void;
  onCatalogRefresh?: (refresh: (() => void) | undefined) => void;
  recoveryScope?: string;
  onReady?: (client: Client) => void;
  onCatalog?: (catalog: {
    products: Item[];
    prices: Item[];
    features: Item[];
    paymentLinks?: Item[];
  }) => void;
  onClient?: (client: Client | undefined) => void;
  contextKey: string;
  getContext: () => string;
  hubUrl: string;
  connectedSite: boolean;
  disabled: boolean;
  onConnection: (stripe: StripeInfo | null) => void;
  onFeatures: (items: string[]) => void;
};
export type Client = {
  resumeCatalogSetup: (operationId: string) => Promise<any>;
  previewCatalogSetup: (model: any) => Promise<any>;
  createCatalogSetup: (model: any, operationId: string) => Promise<any>;
  catalogSetupStatus: (operationId: string) => Promise<any>;
  publishExperience: (
    expectedRevision: number,
    publicationId: string,
  ) => Promise<any>;
  experience: () => Promise<any>;
  saveExperience: (expectedRevision: number, model: any) => Promise<any>;
  previewExperience: (model: any) => Promise<any>;
  dispose: () => void;
  connection: () => Promise<Connection>;
  connect: () => Promise<{ authorizationUrl: string; expiresAt: number }>;
  disconnect: () => Promise<Connection>;
  catalog: (
    resource: string,
    cursor?: string,
  ) => Promise<{ items: Item[]; nextCursor?: string }>;
};
function messageFor(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (
    code === "site_connection_required" ||
    code === "site_service_not_authorized"
  )
    return __(
      "Check this site's connection and permissions in the Hub overview.",
      "smartcloud-commerce",
    );
  if (code === "platform_context_changed")
    return __(
      "The site or profile changed. Reload this page.",
      "smartcloud-commerce",
    );
  if (code === "platform_timeout")
    return __(
      "The Commerce service did not respond. Try refreshing the connection status.",
      "smartcloud-commerce",
    );
  if (code === "site_service_conflict")
    return __(
      "The Stripe setup changed. Refresh it before continuing.",
      "smartcloud-commerce",
    );
  if (code === "stripe_authorization_time_mismatch")
    return __(
      "Stripe authorization could not start because the expiry time differs from your device clock. Check the clock and start a new connection.",
      "smartcloud-commerce",
    );
  return __(
    "The Stripe connection is unavailable. Check the site connection and try again.",
    "smartcloud-commerce",
  );
}
export function SiteStripeConnection(props: Props) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [message, setMessage] = useState("");
  const [hubAccessRequired, setHubAccessRequired] = useState(false);
  const [working, setWorking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const initialStatus = useRef<string>();
  const initialCatalog = useRef<string>();
  const [confirm, setConfirm] = useState(false);
  const [counts, setCounts] = useState<{
    products: number;
    prices: number;
    features: number;
  }>();
  const [catalogFeatures, setCatalogFeatures] = useState<Item[]>([]);
  const client = useRef<Client>();
  const watch = useRef<() => void>();
  const generation = useRef(0);
  const catalogCallback = useRef(props.onCatalog);
  catalogCallback.current = props.onCatalog;
  const clientCallback = useRef(props.onClient);
  clientCallback.current = props.onClient;
  const contextGetter = useRef(props.getContext);
  contextGetter.current = props.getContext;
  const connectionCallback = useRef(props.onConnection);
  connectionCallback.current = props.onConnection;
  const connectionIdentity = connection?.connected
    ? [
        connection.stripe?.accountId,
        connection.stripe?.mode,
        connection.connectionRevision,
      ].join("|")
    : "";
  const catalogGrant = useRef(connectionIdentity);
  catalogGrant.current = connectionIdentity;
  useEffect(() => {
    initialCatalog.current = undefined;
    setCounts(undefined);
    setCatalogFeatures([]);
    catalogCallback.current?.({
      products: [],
      prices: [],
      features: [],
      paymentLinks: [],
    });
    props.onCatalogState?.("idle");
    props.onPaymentLinkState?.("idle");
  }, [connectionIdentity]);
  useEffect(() => {
    connectionCallback.current(
      connection?.connected ? (connection.stripe ?? null) : null,
    );
  }, [connection]);
  const current = (version: number) =>
    generation.current === version &&
    contextGetter.current() === props.contextKey;
  useEffect(() => {
    const version = ++generation.current;
    const instance: Client = createPlatformCommerceClient({
      getContext: () => contextGetter.current(),
      getConnection: () => getWpSuite()?.siteSettings,
      requestService: requestCommerceSiteService,
      assertConfiguration: assertBackendProfileConfiguration,
    });
    initialStatus.current = undefined;
    initialCatalog.current = undefined;
    client.current = instance;
    clientCallback.current?.(instance);
    setConnection(null);
    setMessage("");
    setHubAccessRequired(false);
    setWorking(false);
    setConnecting(false);
    setCounts(undefined);
    setCatalogFeatures([]);
    setConfirm(false);
    return () => {
      if (generation.current === version) generation.current++;
      watch.current?.();
      watch.current = undefined;
      instance.dispose();
      if (client.current === instance) {
        client.current = undefined;
        clientCallback.current?.(undefined);
      }
    };
  }, [props.contextKey]);
  const run = async (
    fn: (instance: Client, version: number) => Promise<void>,
  ) => {
    const version = generation.current,
      instance = client.current;
    if (!instance) return;
    setWorking(true);
    setMessage("");
    setHubAccessRequired(false);
    try {
      await fn(instance, version);
    } catch (error) {
      if (current(version)) {
        setMessage(messageFor(error));
        setHubAccessRequired(
          ["site_connection_required", "site_service_not_authorized"].includes(
            (error as { code?: string })?.code || "",
          ),
        );
      }
    } finally {
      if (current(version)) setWorking(false);
    }
  };
  const refresh = () =>
    void run(async (instance, version) => {
      const value = await instance.connection();
      if (current(version)) {
        setConnection(value);
        props.onReady?.(instance);
      }
    });
  useEffect(() => {
    if (
      props.disabled ||
      !props.connectedSite ||
      initialStatus.current === props.contextKey
    )
      return;
    initialStatus.current = props.contextKey;
    refresh();
  }, [props.disabled, props.connectedSite, props.contextKey]);
  const connect = () => {
    const popup = window.open("", "_blank");
    if (!popup) {
      setMessage(__("Allow popups to connect Stripe.", "smartcloud-commerce"));
      return;
    }
    popup.opener = null;
    void run(async (instance, version) => {
      try {
        watch.current?.();
        const result = await instance.connect();
        if (!current(version) || popup.closed) {
          popup.close();
          return;
        }
        popup.location.assign(result.authorizationUrl);
        setConnecting(true);
        watch.current = watchStripeConnection({
          initialConnection: connection,
          expiresAt: result.expiresAt,
          readConnection: () => instance.connection(),
          isCurrent: () => current(version),
          onConnection: (value: Connection) => {
            if (current(version)) setConnection(value);
          },
          onComplete: () => {
            if (current(version)) props.onReady?.(instance);
          },
          onStop: () => {
            if (current(version)) setConnecting(false);
          },
        });
      } catch (error) {
        popup.close();
        throw error;
      }
    });
  };
  const loadCatalog = async () => {
    const requestedVersion = generation.current;
    const requestedGrant = catalogGrant.current;
    const catalogCurrent = (version: number) =>
      current(version) && requestedGrant === catalogGrant.current;
    props.onCatalogState?.("loading");
    let succeeded = false;
    await run(async (instance, version) => {
      const totals = { products: 0, prices: 0, features: 0 },
        keys: string[] = [];
      const catalog: { products: Item[]; prices: Item[]; features: Item[] } = {
        products: [],
        prices: [],
        features: [],
      };
      for (const resource of ["products", "prices", "features"] as const) {
        let cursor: string | undefined;
        const seen = new Set<string>();
        do {
          const page = await instance.catalog(resource, cursor);
          if (!catalogCurrent(version)) return;
          totals[resource] += page.items.length;
          catalog[resource].push(...page.items);
          if (resource === "features")
            keys.push(
              ...page.items
                .map((item) => item.lookupKey)
                .filter((key): key is string => typeof key === "string"),
            );
          cursor = page.nextCursor;
          if (cursor && seen.has(cursor)) throw Error("repeated cursor");
          if (cursor) seen.add(cursor);
        } while (cursor && totals[resource] < 500);
      }
      if (catalogCurrent(version)) {
        setCounts(totals);
        setCatalogFeatures(catalog.features);
        props.onFeatures([...new Set(keys)]);
        catalogCallback.current?.(catalog);
        succeeded = true;
      }
      if (!catalogCurrent(version)) return;
      props.onPaymentLinkState?.("loading");
      try {
        const paymentLinks: Item[] = [];
        let cursor: string | undefined;
        const seen = new Set<string>();
        do {
          const page = await instance.catalog("paymentLinks", cursor);
          if (!catalogCurrent(version)) return;
          paymentLinks.push(...page.items);
          cursor = page.nextCursor;
          if (cursor && seen.has(cursor)) throw Error("repeated cursor");
          if (cursor) seen.add(cursor);
        } while (cursor && paymentLinks.length < 500);
        if (catalogCurrent(version)) {
          catalogCallback.current?.({ ...catalog, paymentLinks });
          props.onPaymentLinkState?.("ready");
        }
      } catch {
        if (catalogCurrent(version)) props.onPaymentLinkState?.("failed");
      }
    });
    if (catalogCurrent(requestedVersion))
      props.onCatalogState?.(succeeded ? "ready" : "failed");
  };
  const refreshCatalog = useRef<() => void>(() => {});
  refreshCatalog.current = () => void loadCatalog();
  useEffect(() => {
    props.onCatalogRefresh?.(() => refreshCatalog.current());
    return () => props.onCatalogRefresh?.(undefined);
  }, [props.contextKey]);
  useEffect(() => {
    if (
      !props.autoCatalog ||
      props.disabled ||
      working ||
      !connection?.connected
    )
      return;
    const identity = [
      props.contextKey,
      connection.stripe?.accountId,
      connection.stripe?.mode,
      connection.connectionRevision,
    ].join("|");
    if (initialCatalog.current === identity) return;
    initialCatalog.current = identity;
    void loadCatalog();
  }, [props.autoCatalog, props.disabled, working, connection]);
  const unavailable = props.disabled || !props.connectedSite || working;
  return (
    <Card withBorder>
      <Stack>
        <Title order={3}>
          {__("Site Stripe connection", "smartcloud-commerce")}
        </Title>
        <Text>
          {__(
            "Stripe is managed using this site’s existing Hub connection and permissions.",
            "smartcloud-commerce",
          )}
        </Text>
        {!props.connectedSite && (
          <Text>
            {__(
              "Connect this site to a WP Suite workspace first.",
              "smartcloud-commerce",
            )}
          </Text>
        )}
        {(!props.connectedSite || hubAccessRequired) && (
          <Button component="a" href={props.hubUrl} variant="light">
            {__("Open Hub overview", "smartcloud-commerce")}
          </Button>
        )}
        {working && (
          <Group role="status" aria-live="polite" gap="xs">
            <Loader size="xs" aria-hidden="true" />
            <Text>{__("Loading…", "smartcloud-commerce")}</Text>
          </Group>
        )}
        {connection && (
          <Text role="status">
            {connection.connected
              ? __("Connected", "smartcloud-commerce")
              : __("Not connected", "smartcloud-commerce")}
          </Text>
        )}
        {connection?.stripe && (
          <>
            <Text>
              {connection.stripe.accountId} ({connection.stripe.mode})
            </Text>
            {!props.compact && (
              <Text size="sm" c="dimmed">
                {__(
                  "To deploy the Commerce backend, open Deployments in your WP Suite dashboard and select this WordPress site in the deployment wizard. The wizard reads the connected Stripe account and mode.",
                  "smartcloud-commerce",
                )}
              </Text>
            )}
          </>
        )}
        {connecting && (
          <Group role="status" aria-live="polite" gap="xs">
            <Loader size="xs" aria-hidden="true" />
            <Text size="sm">
              {__(
                "Waiting for Stripe authorization. This page updates automatically when the connection is saved.",
                "smartcloud-commerce",
              )}
            </Text>
            <Button
              size="xs"
              variant="subtle"
              onClick={() => watch.current?.()}
            >
              {__("Stop checking", "smartcloud-commerce")}
            </Button>
          </Group>
        )}
        {message && <Alert role="status">{message}</Alert>}
        <Group>
          <Button variant="light" disabled={unavailable} onClick={refresh}>
            {__("Refresh", "smartcloud-commerce")}
          </Button>
          {(!props.compact || !connection?.connected) && (
            <Button
              disabled={unavailable || connecting || connection === null}
              onClick={connect}
            >
              {__("Connect Stripe", "smartcloud-commerce")}
            </Button>
          )}
          {!props.compact && (
            <Button
              color="red"
              variant="light"
              disabled={unavailable || !connection?.connected}
              onClick={() => setConfirm(true)}
            >
              {__("Disconnect", "smartcloud-commerce")}
            </Button>
          )}
        </Group>
        <Button
          variant="light"
          disabled={unavailable || !connection?.connected}
          onClick={() => void loadCatalog()}
        >
          {props.autoCatalog
            ? __("Refresh catalog", "smartcloud-commerce")
            : __("Load catalog summary", "smartcloud-commerce")}
        </Button>
        {!props.compact && connection?.connected && client.current && (
          <CatalogSetup
            key={props.contextKey}
            client={client.current}
            recoveryScope={props.recoveryScope}
            accountId={connection.stripe?.accountId}
            mode={connection.stripe?.mode}
            features={catalogFeatures}
            featuresLoaded={Boolean(counts)}
            disabled={unavailable}
            onCreated={() => void loadCatalog()}
            isCurrent={() => contextGetter.current() === props.contextKey}
          />
        )}
        {counts && (
          <Text size="sm">
            {__("Products", "smartcloud-commerce")}: {counts.products} ·{" "}
            {__("Prices", "smartcloud-commerce")}: {counts.prices} ·{" "}
            {__("Features", "smartcloud-commerce")}: {counts.features}
          </Text>
        )}
        <Modal
          opened={confirm}
          onClose={() => setConfirm(false)}
          title={__("Disconnect this site from Stripe?", "smartcloud-commerce")}
          zIndex={100010}
        >
          <Stack>
            <Text>
              {__(
                "This disconnects the site connection. The standalone Commerce runtime connection is unchanged.",
                "smartcloud-commerce",
              )}
            </Text>
            <Group>
              <Button variant="default" onClick={() => setConfirm(false)}>
                {__("Cancel", "smartcloud-commerce")}
              </Button>
              <Button
                color="red"
                onClick={() => {
                  setConfirm(false);
                  watch.current?.();
                  void run(async (instance, version) => {
                    await instance.disconnect();
                    if (current(version)) {
                      setConnection({ connected: false });
                      setCounts(undefined);
                      props.onFeatures([]);
                      props.onPaymentLinkState?.("idle");
                      catalogCallback.current?.({
                        products: [],
                        prices: [],
                        features: [],
                        paymentLinks: [],
                      });
                    }
                  });
                }}
              >
                {__("Disconnect", "smartcloud-commerce")}
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Card>
  );
}
