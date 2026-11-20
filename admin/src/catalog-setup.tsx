import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { __ } from "@wordpress/i18n";
import type { Client } from "./site-stripe-connection";
const currencies =
  "usd aed ars aud brl cad chf cop czk dkk eur gbp hkd huf idr ils inr jpy krw mxn myr nok nzd php pln ron rub sek sgd thb zar isk ugx".split(
    " ",
  );
type Row = {
  interval: "once" | "month" | "year";
  amount: string;
  taxBehavior?: "inclusive" | "exclusive";
};
type Feature = { id: string; name?: string; lookupKey?: string };
export function parseMajorAmount(value: string, currency: string): number {
  if (!currencies.includes(currency)) throw Error("invalid");
  const zero = ["jpy", "krw", "isk", "ugx"].includes(currency);
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value.replace(",", "."));
  if (!match || (zero && match[2] && !/^0+$/.test(match[2])))
    throw Error("invalid");
  const digits = ["jpy", "krw"].includes(currency)
    ? match[1]
    : match[1] + (match[2] || "").padEnd(2, "0");
  const n = Number(digits);
  if (!Number.isSafeInteger(n)) throw Error("invalid");
  return n;
}
function recoveryKey(
  scope?: string,
  accountId?: string,
  mode?: string,
): string | undefined {
  if (
    !scope ||
    !accountId ||
    !/^acct_[A-Za-z0-9]{1,128}$/.test(accountId) ||
    !["test", "live"].includes(mode || "")
  )
    return;
  try {
    const v = JSON.parse(scope);
    if (
      !v ||
      typeof v !== "object" ||
      Array.isArray(v) ||
      Object.keys(v).sort().join(",") !==
        "bindingRevision,platformApiBaseUrl,profileId,siteId,workspaceId" ||
      !["production", "development"].includes(v.profileId) ||
      !Number.isSafeInteger(v.bindingRevision) ||
      v.bindingRevision < 1 ||
      typeof v.workspaceId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(v.workspaceId) ||
      typeof v.siteId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(v.siteId)
    )
      return;
    const url = new URL(v.platformApiBaseUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return;
    return (
      "wpsuite-commerce-catalog:" +
      encodeURIComponent(
        JSON.stringify([
          v.workspaceId,
          v.siteId,
          v.profileId,
          v.bindingRevision,
          url.href,
          accountId,
          mode,
        ]),
      )
    );
  } catch {
    return;
  }
}
export function CatalogSetup({
  client,
  features,
  featuresLoaded = false,
  disabled,
  onCreated,
  isCurrent,
  recoveryScope,
  accountId,
  mode,
}: {
  client: Client;
  features: Feature[];
  featuresLoaded?: boolean;
  disabled: boolean;
  onCreated: () => void;
  isCurrent: () => boolean;
  recoveryScope?: string;
  accountId?: string;
  mode?: string;
}) {
  const [opened, setOpened] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [marketing, setMarketing] = useState(""),
    [currency, setCurrency] = useState("eur"),
    [rows, setRows] = useState<Row[]>([{ interval: "month", amount: "" }]),
    [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<any>(),
    [operation, setOperation] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [storageWarning, setStorageWarning] = useState(false);
  const [availableFeatures, setAvailableFeatures] =
    useState<Feature[]>(features);
  const [featuresState, setFeaturesState] = useState<
    "idle" | "loading" | "ready" | "error"
  >(features.length ? "ready" : "idle");
  useEffect(() => {
    if (featuresLoaded || features.length > 0) {
      setAvailableFeatures(features);
      setFeaturesState("ready");
    }
  }, [features, featuresLoaded]);
  const mounted = useRef(true),
    timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(
    () => () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const current = () => mounted.current && isCurrent();
  const key = recoveryKey(recoveryScope, accountId, mode);
  useEffect(() => {
    if (!key || !current()) return;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const v = JSON.parse(raw);
      if (
        !v ||
        Object.keys(v).sort().join(",") !== "operationId,startedAt" ||
        typeof v.operationId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          v.operationId,
        ) ||
        !Number.isSafeInteger(v.startedAt) ||
        v.startedAt < 0
      )
        return;
      setOperation(v.operationId);
      setStatus("preparing");
      void poll(v.operationId, Date.now() + 60000);
    } catch {
      setStorageWarning(true);
    }
  }, [key]);
  const loadFeatures = async () => {
    setFeaturesState("loading");
    try {
      const all: Feature[] = [];
      let cursor: string | undefined;
      const seen = new Set<string>();
      do {
        const page = await client.catalog("features", cursor);
        if (!current()) return;
        all.push(...page.items);
        cursor = page.nextCursor;
        if (cursor && seen.has(cursor)) throw Error("Repeated cursor");
        if (cursor) seen.add(cursor);
      } while (cursor && all.length < 500);
      if (current()) {
        setAvailableFeatures(all.slice(0, 500));
        setFeaturesState("ready");
      }
    } catch {
      if (current()) setFeaturesState("error");
    }
  };
  useEffect(() => {
    if (opened && featuresState === "idle") void loadFeatures();
  }, [opened, featuresState]);
  const update = (fn: () => void) => {
    setPreview(undefined);
    setMessage("");
    fn();
  };
  const model = () => ({
    name,
    description,
    marketingFeatures: marketing
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean),
    prices: rows.map((r) => ({
      currency,
      unitAmount: parseMajorAmount(r.amount, currency),
      interval: r.interval === "once" ? null : r.interval,
      intervalCount: 1,
      ...(r.taxBehavior ? { taxBehavior: r.taxBehavior } : {}),
    })),
    featureLookupKeys: selected,
  });
  const inspect = async () => {
    setMessage("");
    if (
      !name.trim() ||
      Array.from(name).length > 200 ||
      /[<>\x00-\x1f\x7f]/.test(name)
    ) {
      setMessage(
        __(
          "Enter a product name of up to 200 characters.",
          "smartcloud-commerce",
        ),
      );
      return;
    }
    if (
      Array.from(description).length > 2000 ||
      /[<>\x00-\x1f\x7f]/.test(description)
    ) {
      setMessage(__("Check the product description.", "smartcloud-commerce"));
      return;
    }
    const featureNames = marketing
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    if (
      featureNames.length > 15 ||
      featureNames.some(
        (x) => Array.from(x).length > 80 || /[<>\x00-\x1f\x7f]/.test(x),
      )
    ) {
      setMessage(
        __(
          "Enter up to 15 marketing features, each up to 80 characters.",
          "smartcloud-commerce",
        ),
      );
      return;
    }
    if (new Set(rows.map((r) => r.interval)).size !== rows.length) {
      setMessage(
        __(
          "Choose a different billing period for each price.",
          "smartcloud-commerce",
        ),
      );
      return;
    }
    let definition;
    try {
      definition = model();
    } catch {
      setMessage(
        __("Enter a valid amount for each price.", "smartcloud-commerce"),
      );
      return;
    }
    setBusy(true);
    try {
      const result = await client.previewCatalogSetup(definition);
      if (current()) setPreview(result);
    } catch {
      if (current())
        setMessage(
          __(
            "The Commerce service could not preview this product. Try again.",
            "smartcloud-commerce",
          ),
        );
    } finally {
      if (current()) setBusy(false);
    }
  };
  const poll = async (id: string, deadline: number) => {
    if (timer.current) clearTimeout(timer.current);
    try {
      const result = await client.catalogSetupStatus(id);
      if (!current()) return;
      setStatus(result.status);
      if (result.status === "ready") {
        setMessage(
          `${__("Product created:", "smartcloud-commerce")} ${result.result.product.name} ${__("The catalog is refreshing.", "smartcloud-commerce")}`,
        );
        onCreated();
        return;
      }
      if (result.status === "requires_review") {
        setMessage(
          __(
            "This setup needs review before it can continue.",
            "smartcloud-commerce",
          ),
        );
        return;
      }
      if (Date.now() < deadline)
        timer.current = setTimeout(() => void poll(id, deadline), 2000);
      else
        setMessage(
          __(
            "Setup is still running. Use Refresh status to check again.",
            "smartcloud-commerce",
          ),
        );
    } catch {
      if (current())
        setMessage(
          __(
            "Status is unavailable. Use Refresh status to try again.",
            "smartcloud-commerce",
          ),
        );
    }
  };
  const create = async () => {
    if (!preview) return;
    const id = crypto.randomUUID();
    if (key && current())
      try {
        sessionStorage.setItem(
          key,
          JSON.stringify({ operationId: id, startedAt: Date.now() }),
        );
      } catch {
        setStorageWarning(true);
      }
    setOperation(id);
    setStatus("preparing");
    setBusy(true);
    setMessage("");
    try {
      const result = await client.createCatalogSetup(model(), id);
      if (!current()) return;
      setStatus(result.status);
      if (result.status === "ready") {
        setMessage(
          `${__("Product created:", "smartcloud-commerce")} ${result.result.product.name} ${__("The catalog is refreshing.", "smartcloud-commerce")}`,
        );
        onCreated();
      } else if (result.status === "requires_review")
        setMessage(
          __(
            "This setup needs review before it can continue.",
            "smartcloud-commerce",
          ),
        );
      else void poll(id, Date.now() + 60000);
    } catch {
      if (current())
        setMessage(
          __(
            "Setup status is uncertain. Use Refresh status before starting another setup.",
            "smartcloud-commerce",
          ),
        );
    } finally {
      if (current()) setBusy(false);
    }
  };
  const pending = !!operation && status !== "ready";
  const reset = () => {
    if (key && current())
      try {
        sessionStorage.removeItem(key);
      } catch {
        setStorageWarning(true);
      }
    setOperation("");
    setStatus("");
    setPreview(undefined);
    setName("");
    setDescription("");
    setMarketing("");
    setRows([{ interval: "month", amount: "" }]);
    setSelected([]);
    setMessage("");
  };
  return (
    <>
      <Button
        variant="light"
        disabled={disabled}
        onClick={() => setOpened(true)}
      >
        {__("Create a product and prices", "smartcloud-commerce")}
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={__("Create a product and prices", "smartcloud-commerce")}
        zIndex={100010}
      >
        <Stack>
          <TextInput
            label={__("Product name", "smartcloud-commerce")}
            value={name}
            disabled={pending || busy}
            onChange={(e) => update(() => setName(e.currentTarget.value))}
          />
          <Textarea
            label={__("Description", "smartcloud-commerce")}
            value={description}
            disabled={pending || busy}
            onChange={(e) =>
              update(() => setDescription(e.currentTarget.value))
            }
          />
          <Textarea
            label={__(
              "Marketing features, one per line",
              "smartcloud-commerce",
            )}
            value={marketing}
            disabled={pending || busy}
            onChange={(e) => update(() => setMarketing(e.currentTarget.value))}
          />
          <Select
            label={__("Currency", "smartcloud-commerce")}
            data={currencies.map((c) => ({ value: c, label: c.toUpperCase() }))}
            value={currency}
            disabled={pending || busy}
            onChange={(v) => update(() => setCurrency(v || "eur"))}
          />
          {rows.map((row, i) => (
            <Group key={i} align="end">
              <Select
                label={__("Billing", "smartcloud-commerce")}
                data={[
                  {
                    value: "once",
                    label: __("One time", "smartcloud-commerce"),
                  },
                  {
                    value: "month",
                    label: __("Monthly", "smartcloud-commerce"),
                  },
                  { value: "year", label: __("Yearly", "smartcloud-commerce") },
                ]}
                value={row.interval}
                disabled={pending || busy}
                onChange={(v) =>
                  update(() =>
                    setRows(
                      rows.map((r, j) =>
                        j === i
                          ? { ...r, interval: (v || "once") as Row["interval"] }
                          : r,
                      ),
                    ),
                  )
                }
              />
              <TextInput
                label={__("Amount", "smartcloud-commerce")}
                value={row.amount}
                disabled={pending || busy}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  update(() =>
                    setRows(
                      rows.map((r, j) =>
                        j === i ? { ...r, amount: value } : r,
                      ),
                    ),
                  );
                }}
              />
              <Select
                label={__("Tax behavior", "smartcloud-commerce")}
                data={[
                  {
                    value: "default",
                    label: __("Use Stripe default", "smartcloud-commerce"),
                  },
                  {
                    value: "inclusive",
                    label: __("Tax included", "smartcloud-commerce"),
                  },
                  {
                    value: "exclusive",
                    label: __("Tax added", "smartcloud-commerce"),
                  },
                ]}
                value={row.taxBehavior || "default"}
                disabled={pending || busy}
                onChange={(v) =>
                  update(() =>
                    setRows(
                      rows.map((r, j) =>
                        j === i
                          ? {
                              ...r,
                              taxBehavior:
                                v === "inclusive" || v === "exclusive"
                                  ? v
                                  : undefined,
                            }
                          : r,
                      ),
                    ),
                  )
                }
              />
              {rows.length > 1 && (
                <Button
                  variant="subtle"
                  disabled={pending || busy}
                  onClick={() =>
                    update(() => setRows(rows.filter((_, j) => j !== i)))
                  }
                >
                  {__("Remove", "smartcloud-commerce")}
                </Button>
              )}
            </Group>
          ))}
          <Button
            variant="subtle"
            disabled={pending || busy || rows.length >= 3}
            onClick={() =>
              update(() => setRows([...rows, { interval: "year", amount: "" }]))
            }
          >
            {__("Add price", "smartcloud-commerce")}
          </Button>
          <MultiSelect
            label={__("Existing access features", "smartcloud-commerce")}
            comboboxProps={{ zIndex: 100020 }}
            data={availableFeatures
              .filter((f) => Boolean(f.lookupKey))
              .map((f) => ({
                value: f.lookupKey!,
                label: /^[a-z0-9][a-z0-9._-]{0,127}$/.test(f.lookupKey!)
                  ? f.name || f.lookupKey!
                  : `${f.name || f.lookupKey!} (${__("unsupported lookup key format", "smartcloud-commerce")})`,
                disabled: !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(f.lookupKey!),
              }))}
            value={selected}
            maxValues={15}
            disabled={pending || busy}
            onChange={(v) => update(() => setSelected(v))}
          />
          {availableFeatures.some(
            (f) =>
              f.lookupKey && !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(f.lookupKey),
          ) && (
            <Text size="sm">
              {__(
                "Commerce access lookup keys currently support lowercase letters, digits, dots, hyphens and underscores. Features with other lookup key formats are shown but cannot be selected.",
                "smartcloud-commerce",
              )}
            </Text>
          )}
          {featuresState === "loading" && (
            <Text size="sm" role="status">
              {__("Loading access features…", "smartcloud-commerce")}
            </Text>
          )}
          {featuresState === "ready" && availableFeatures.length === 0 && (
            <Text size="sm">
              {__("No existing access features found.", "smartcloud-commerce")}
            </Text>
          )}
          {featuresState === "error" && (
            <Group>
              <Text size="sm" role="status">
                {__(
                  "Access features could not be loaded.",
                  "smartcloud-commerce",
                )}
              </Text>
              <Button variant="light" onClick={() => void loadFeatures()}>
                {__("Retry", "smartcloud-commerce")}
              </Button>
            </Group>
          )}
          {preview && (
            <Alert>
              <Text fw={600}>{preview.name}</Text>
              {preview.prices.map((x: string) => (
                <Text key={x}>{x}</Text>
              ))}
              {preview.marketingFeatures.map((x: string) => (
                <Text key={x}>{x}</Text>
              ))}
              {preview.features.map((x: string) => (
                <Text key={x}>{x}</Text>
              ))}
              {preview.warnings.map((x: string) => (
                <Text key={x}>{x}</Text>
              ))}
            </Alert>
          )}
          {storageWarning && (
            <Alert role="status">
              {__(
                "Recovery storage is unavailable. Keep this page open to check the setup.",
                "smartcloud-commerce",
              )}
            </Alert>
          )}
          {message && <Alert role="status">{message}</Alert>}
          {!operation && (
            <Group>
              <Button
                variant="light"
                loading={busy}
                onClick={() => void inspect()}
              >
                {__("Preview", "smartcloud-commerce")}
              </Button>
              <Button disabled={!preview || busy} onClick={() => void create()}>
                {__("Confirm creation", "smartcloud-commerce")}
              </Button>
            </Group>
          )}
          {pending && (
            <Group>
              <Button
                variant="light"
                disabled={busy}
                onClick={() => void poll(operation, Date.now() + 60000)}
              >
                {__("Refresh status", "smartcloud-commerce")}
              </Button>
              <Button
                variant="light"
                disabled={busy || status === "requires_review"}
                onClick={() => {
                  setBusy(true);
                  void client
                    .resumeCatalogSetup(operation)
                    .then((result) => {
                      if (!current()) return;
                      setStatus(result.status);
                      if (result.status === "ready") {
                        setMessage(
                          `${__("Product created:", "smartcloud-commerce")} ${result.result.product.name}`,
                        );
                        onCreated();
                      } else if (result.status === "requires_review")
                        setMessage(
                          __(
                            "This setup needs review before it can continue.",
                            "smartcloud-commerce",
                          ),
                        );
                      else void poll(operation, Date.now() + 60000);
                    })
                    .catch(() => {
                      if (current())
                        setMessage(
                          __(
                            "Unable to resume. Try again.",
                            "smartcloud-commerce",
                          ),
                        );
                    })
                    .finally(() => {
                      if (current()) setBusy(false);
                    });
                }}
              >
                {__("Resume setup", "smartcloud-commerce")}
              </Button>
            </Group>
          )}
          {(status === "ready" || status === "requires_review") && (
            <Button variant="light" onClick={reset}>
              {status === "requires_review"
                ? __("Clear setup after review", "smartcloud-commerce")
                : __("Create another product", "smartcloud-commerce")}
            </Button>
          )}
        </Stack>
      </Modal>
    </>
  );
}
