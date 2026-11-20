import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { __ } from "@wordpress/i18n";
// @ts-ignore Shared pure onboarding model.
import {
  embedIds,
  manualSettings,
  availablePrices,
  createStarterPresentation,
  savedSetup,
} from "./onboarding-model.cjs";
import { SavedSetup } from "./saved-setup";
// @ts-ignore Exact Stripe minor-unit formatter.
import { formatStripePrice } from "../../main/src/money.cjs";

type Props = {
  contextKey: string;
  mode: string;
  setMode: (mode: string) => void;
  connectedSite: boolean;
  connection: React.ReactNode;
  stripeKey: string;
  settings: any;
  loaded: boolean;
  busy: boolean;
  catalog: any;
  catalogState: string;
  record: any;
  experienceLoaded: boolean;
  experienceReadState: string;
  catalogView: React.ReactNode;
  message: string;
  onSaveLocal: (settings: any) => Promise<boolean>;
  onSaveDraft: (draft: any) => Promise<void>;
  onPreview: (draft: any) => Promise<any>;
  onPublish: () => Promise<void>;
  onRefresh: () => void;
  onDirty: (dirty: boolean) => void;
  hubUrl: string;
  editorUrl: string;
  advancedUrl: string;
};
export function CommerceOnboarding(p: Props) {
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [browseCatalog, setBrowseCatalog] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [key, setKey] = useState("");
  const [tables, setTables] = useState("");
  const [buttons, setButtons] = useState("");
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string | null>("table");
  const [prices, setPrices] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [candidate, setCandidate] = useState<any>(null);
  const [savedRevision, setSavedRevision] = useState<number>();
  const [savedId, setSavedId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [working, setWorking] = useState(false);
  const mounted = useRef(true);
  const selectionVersion = useRef(0);
  const currentRevision = useRef(p.record.draftRevision);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  currentRevision.current = p.record.draftRevision;
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  useEffect(() => {
    if (step > 0) stepHeading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (p.loaded && !dirty) {
      setKey(p.settings.publishableKey || "");
      setTables(embedIds(p.settings, "pricingTableIds").join("\n"));
      setButtons(embedIds(p.settings, "buyButtonIds").join("\n"));
    }
  }, [p.loaded, p.settings, dirty]);
  useEffect(() => {
    p.onDirty(dirty);
    return () => p.onDirty(false);
  }, [dirty, p.onDirty]);
  const change = (fn: () => void) => {
    fn();
    setDirty(true);
    setError("");
    setPreview(null);
    setCandidate(null);
    setSavedRevision(undefined);
    setSavedId("");
    selectionVersion.current++;
  };
  const next = (value: number) => {
    setStep(value);
    setError("");
  };
  const busy = p.busy || working;
  const saved = savedSetup(p.settings, p.record, p.experienceLoaded);
  const resolved = p.loaded && (!p.connectedSite || p.experienceLoaded);
  const showWizard = editing || (!saved.hasSaved && resolved);
  const runSetup = () => {
    if (!dirty) {
      setStep(0);
      setName("");
      setPrices([]);
      setPreview(null);
      setCandidate(null);
      setSavedRevision(undefined);
      setSavedId("");
    }
    setEditing(true);
    setCollapsed(false);
    setBrowseCatalog(false);
  };
  const saveManual = async () => {
    let settings;
    try {
      settings = manualSettings(p.settings, key, tables, buttons);
    } catch (e) {
      const code = (e as Error).message;
      setError(
        code === "publishable_key"
          ? __(
              "Enter a valid Stripe publishable key (pk_test_ or pk_live_).",
              "smartcloud-commerce",
            )
          : code === "embed_required"
            ? __(
                "Add at least one buy button or pricing table ID.",
                "smartcloud-commerce",
              )
            : __(
                "Use one valid ID per line, without duplicates (buy_btn_ or prctbl_).",
                "smartcloud-commerce",
              ),
      );
      return;
    }
    if (await p.onSaveLocal(settings)) {
      setDirty(false);
      next(2);
    }
  };
  const check = async () => {
    setWorking(true);
    setError("");
    setPreview(null);
    setCandidate(null);
    const version = selectionVersion.current,
      revision = p.record.draftRevision;
    try {
      if (p.record.draftRevision > 0 && !p.record.draft)
        throw Error("draft_unavailable");
      const result = createStarterPresentation(
        p.record.draft,
        p.catalog,
        name,
        kind,
        prices,
      );
      const value = await p.onPreview(result.draft);
      if (
        !mounted.current ||
        version !== selectionVersion.current ||
        revision !== currentRevision.current
      )
        return;
      setCandidate({ ...result, baseRevision: revision });
      setPreview(value);
    } catch (e) {
      if (mounted.current)
        setError(
          (e as Error).message === "existing_plan"
            ? __(
                "A selected product already has a saved plan. Use Sales setup to reuse that plan without changing its access or subscription rules.",
                "smartcloud-commerce",
              )
            : __(
                "Choose a name and one active price per product, then try the preview again.",
                "smartcloud-commerce",
              ),
        );
    } finally {
      if (mounted.current) setWorking(false);
    }
  };
  const saveDraft = async () => {
    if (
      !candidate ||
      !preview ||
      candidate.baseRevision !== p.record.draftRevision
    ) {
      setError(
        __(
          "The saved setup changed. Preview your selection again before saving.",
          "smartcloud-commerce",
        ),
      );
      return;
    }
    const revision = p.record.draftRevision;
    setWorking(true);
    setError("");
    try {
      await p.onSaveDraft(candidate.draft);
      if (!mounted.current) return;
      setSavedRevision(revision + 1);
      setSavedId(candidate.presentationId);
      setDirty(false);
      setCandidate(null);
    } catch {
      if (mounted.current)
        setError(
          __(
            "The draft could not be saved. Your selections are retained; refresh the saved setup before trying again.",
            "smartcloud-commerce",
          ),
        );
    } finally {
      if (mounted.current) setWorking(false);
    }
  };
  const validPrices = availablePrices(p.catalog);
  const options = validPrices.map((price: any) => ({
    value: price.id,
    label: `${p.catalog.products.find((v: any) => v.id === price.productId)?.name || __("Unnamed product", "smartcloud-commerce")} — ${formatStripePrice(price.amount, price.currency)} · ${price.interval === "month" ? __("monthly", "smartcloud-commerce") : price.interval === "year" ? __("yearly", "smartcloud-commerce") : __("one-time", "smartcloud-commerce")}`,
  }));
  const live =
    savedId &&
    p.record.publishedRevision === savedRevision &&
    p.record.published?.presentations?.some((v: any) => v.id === savedId);
  const titles = [
    __("Choose how to sell", "smartcloud-commerce"),
    p.mode === "manual"
      ? __("Add your Stripe embeds", "smartcloud-commerce")
      : __("Connect Stripe", "smartcloud-commerce"),
    __("Add it to your site", "smartcloud-commerce"),
  ];
  return (
    <Card withBorder radius="md" className="sc-commerce-onboarding">
      <Stack>
        <Group justify="space-between">
          <Title order={2} size="h3">
            {showWizard
              ? __("Getting started with Commerce", "smartcloud-commerce")
              : __("Commerce setup", "smartcloud-commerce")}
          </Title>
          {showWizard && (
            <Button
              variant="subtle"
              size="xs"
              onClick={() => setCollapsed(!collapsed)}
              aria-expanded={!collapsed}
              aria-controls="sc-commerce-setup-body"
            >
              {collapsed
                ? __("Show setup", "smartcloud-commerce")
                : __("Hide setup", "smartcloud-commerce")}
            </Button>
          )}
        </Group>
        <div id="sc-commerce-setup-body" hidden={showWizard && collapsed}>
          <Stack>
            {!showWizard && saved.hasSaved && (
              <>
                <SavedSetup saved={saved} record={p.record} />
                <Group>
                  <Button disabled={busy} onClick={runSetup}>
                    {dirty
                      ? __("Continue setup", "smartcloud-commerce")
                      : __("Run setup again", "smartcloud-commerce")}
                  </Button>
                  <Button component="a" href={p.advancedUrl} variant="light">
                    {__("Manage sales setup", "smartcloud-commerce")}
                  </Button>
                  <Button component="a" href={p.editorUrl} variant="light">
                    {__("Open pages", "smartcloud-commerce")}
                  </Button>
                  {p.connectedSite && (
                    <Button
                      variant="subtle"
                      onClick={() => {
                        p.setMode("connected");
                        setBrowseCatalog(!browseCatalog);
                      }}
                    >
                      {browseCatalog
                        ? __("Hide Stripe catalog", "smartcloud-commerce")
                        : __("Browse Stripe catalog", "smartcloud-commerce")}
                    </Button>
                  )}
                </Group>
              </>
            )}
            {!showWizard && !saved.hasSaved && (
              <Stack>
                <Group role="status">
                  {p.experienceReadState !== "failed" && <Loader size="xs" />}
                  <Text>
                    {p.experienceReadState === "failed"
                      ? __(
                          "Saved setup could not be checked. Your existing configuration has not been reset.",
                          "smartcloud-commerce",
                        )
                      : __(
                          "Checking saved Commerce setup…",
                          "smartcloud-commerce",
                        )}
                  </Text>
                </Group>
                <Group>
                  <Button variant="light" disabled={busy} onClick={p.onRefresh}>
                    {__("Retry loading saved setup", "smartcloud-commerce")}
                  </Button>
                  <Button variant="subtle" onClick={runSetup}>
                    {__("Start setup", "smartcloud-commerce")}
                  </Button>
                </Group>
              </Stack>
            )}
            {showWizard && (
              <ol className="sc-commerce-setup-steps">
                {titles.map((title, i) => (
                  <li key={i} aria-current={step === i ? "step" : undefined}>
                    <Text size="sm" fw={step === i ? 700 : 400}>
                      {i + 1}. {title}
                    </Text>
                  </li>
                ))}
              </ol>
            )}
            {showWizard && (
              <Title ref={stepHeading} order={3} size="h4" tabIndex={-1}>
                {titles[step]}
              </Title>
            )}
            {error && (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            )}
            {p.message && <Alert role="status">{p.message}</Alert>}
            {showWizard && step === 0 && (
              <>
                <Text>
                  {__(
                    "Start with existing Stripe embeds, or build your own buttons and pricing tables from your Stripe catalog.",
                    "smartcloud-commerce",
                  )}
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <Card withBorder>
                    <Stack>
                      <Title order={4}>
                        {__("Use Stripe embeds", "smartcloud-commerce")}
                      </Title>
                      <Text size="sm">
                        {__(
                          "Paste a publishable key and the IDs of buttons or tables you already created in Stripe. No WP Suite site connection is required.",
                          "smartcloud-commerce",
                        )}
                      </Text>
                      <Button
                        onClick={() => {
                          p.setMode("manual");
                          setEditing(true);
                          next(1);
                        }}
                      >
                        {__("Use existing embeds", "smartcloud-commerce")}
                      </Button>
                    </Stack>
                  </Card>
                  <Card withBorder>
                    <Stack>
                      <Title order={4}>
                        {__(
                          "Build from your Stripe catalog",
                          "smartcloud-commerce",
                        )}
                      </Title>
                      <Text size="sm">
                        {__(
                          "Connect Stripe, choose products and prices, and create a button or pricing table here. A free WP Suite site connection is enough to start.",
                          "smartcloud-commerce",
                        )}
                      </Text>
                      <Button
                        onClick={() => {
                          p.setMode("connected");
                          setEditing(true);
                          next(1);
                        }}
                      >
                        {__("Use connected catalog", "smartcloud-commerce")}
                      </Button>
                    </Stack>
                  </Card>
                </SimpleGrid>
              </>
            )}
            {showWizard && step === 1 && p.mode === "manual" && (
              <>
                <TextInput
                  label={__("Publishable key", "smartcloud-commerce")}
                  description={__(
                    "Copy the pk_test_ or pk_live_ key from Stripe. Never paste a secret or restricted key.",
                    "smartcloud-commerce",
                  )}
                  value={key}
                  disabled={!p.loaded || busy}
                  onChange={(e) => change(() => setKey(e.currentTarget.value))}
                />
                <Textarea
                  label={__("Buy button IDs", "smartcloud-commerce")}
                  description={__(
                    "Optional. One buy_btn_ ID per line, copied from Stripe’s embed code.",
                    "smartcloud-commerce",
                  )}
                  value={buttons}
                  autosize
                  minRows={2}
                  disabled={!p.loaded || busy}
                  onChange={(e) =>
                    change(() => setButtons(e.currentTarget.value))
                  }
                />
                <Textarea
                  label={__("Pricing table IDs", "smartcloud-commerce")}
                  description={__(
                    "Optional. One prctbl_ ID per line. Either buttons or tables are enough.",
                    "smartcloud-commerce",
                  )}
                  value={tables}
                  autosize
                  minRows={2}
                  disabled={!p.loaded || busy}
                  onChange={(e) =>
                    change(() => setTables(e.currentTarget.value))
                  }
                />
                <Text size="sm">
                  {__(
                    "Use identifiers from the same Stripe account and test/live mode as the publishable key.",
                    "smartcloud-commerce",
                  )}
                </Text>
                <Button
                  disabled={!p.loaded || busy}
                  loading={busy}
                  onClick={() => void saveManual()}
                >
                  {__("Save embeds and continue", "smartcloud-commerce")}
                </Button>
              </>
            )}
            {/* Keep the single connection controller mounted while stepping; popup watches must survive navigation. */}
            <div
              hidden={
                p.mode !== "connected" ||
                (showWizard ? step === 0 : !browseCatalog)
              }
            >
              <details open={!showWizard || step === 1}>
                <summary hidden={step !== 2}>
                  {__("Stripe connection and catalog", "smartcloud-commerce")}
                </summary>
                {p.connection}
              </details>
            </div>
            {!showWizard && browseCatalog && p.catalogView}
            {showWizard && step === 1 && p.mode === "connected" && (
              <>
                {!p.connectedSite && (
                  <Text size="sm">
                    {__(
                      "Use the Hub to connect this WordPress site, then return here. You can also go back and use manual embeds.",
                      "smartcloud-commerce",
                    )}
                  </Text>
                )}
                {p.stripeKey && (
                  <Text size="sm">
                    {__(
                      "The publishable key is supplied by the connection. You do not need to enter it.",
                      "smartcloud-commerce",
                    )}
                  </Text>
                )}
                <Button
                  disabled={
                    busy ||
                    !p.stripeKey ||
                    p.catalogState !== "ready" ||
                    !p.experienceLoaded
                  }
                  onClick={() => next(2)}
                >
                  {__("Choose products and prices", "smartcloud-commerce")}
                </Button>
                {p.stripeKey && !p.experienceLoaded && (
                  <Button variant="light" disabled={busy} onClick={p.onRefresh}>
                    {__("Retry loading saved setup", "smartcloud-commerce")}
                  </Button>
                )}
              </>
            )}
            {showWizard && step === 2 && p.mode === "manual" && (
              <>
                <Alert color="green">
                  {__(
                    "Your Stripe embeds are saved and available in the block editor.",
                    "smartcloud-commerce",
                  )}
                </Alert>
                <Text>
                  {__(
                    "Edit a page and insert Commerce: Stripe buy button or Commerce: Stripe pricing table. Select one of your saved IDs in the block settings, then preview the page.",
                    "smartcloud-commerce",
                  )}
                </Text>
                <Button component="a" href={p.editorUrl}>
                  {__("Open pages", "smartcloud-commerce")}
                </Button>
              </>
            )}
            {showWizard && step === 2 && p.mode === "connected" && (
              <>
                <Text size="sm">
                  {__(
                    "Choose one price per product. Commerce displays your button or pricing table; its offers open Stripe Payment Links. Protected content and subscription change rules can be configured later in Advanced settings.",
                    "smartcloud-commerce",
                  )}
                </Text>
                {p.catalogState === "loading" && (
                  <Group role="status">
                    <Loader size="xs" />
                    <Text>
                      {__(
                        "Loading products and prices…",
                        "smartcloud-commerce",
                      )}
                    </Text>
                  </Group>
                )}
                {p.catalogState === "ready" && !options.length && (
                  <Text>
                    {__(
                      "No supported active prices were found. Create a product and a fixed monthly, yearly or one-time price in Stripe, then refresh the catalog.",
                      "smartcloud-commerce",
                    )}
                  </Text>
                )}
                <TextInput
                  label={__("Button or table name", "smartcloud-commerce")}
                  value={name}
                  disabled={busy || savedRevision !== undefined}
                  onChange={(e) => change(() => setName(e.currentTarget.value))}
                />
                <Select
                  label={__("Display as", "smartcloud-commerce")}
                  data={[
                    {
                      value: "button",
                      label: __("Buy button", "smartcloud-commerce"),
                    },
                    {
                      value: "table",
                      label: __("Pricing table", "smartcloud-commerce"),
                    },
                  ]}
                  value={kind}
                  disabled={busy || savedRevision !== undefined}
                  onChange={(v) =>
                    change(() => {
                      setKind(v);
                      setPrices([]);
                    })
                  }
                />
                <MultiSelect
                  searchable
                  label={__("Products and prices", "smartcloud-commerce")}
                  data={options}
                  value={prices}
                  maxValues={kind === "button" ? 1 : 20}
                  disabled={
                    busy ||
                    savedRevision !== undefined ||
                    p.catalogState !== "ready"
                  }
                  onChange={(v) => change(() => setPrices(v))}
                  comboboxProps={{ zIndex: 100020 }}
                />
                {preview && (
                  <Card
                    withBorder
                    aria-label={__("Sales preview", "smartcloud-commerce")}
                  >
                    <Stack gap="xs">
                      {preview.offers?.map((offer: any) => (
                        <div key={offer.name}>
                          <Text fw={600}>{offer.name}</Text>
                          <Text size="sm">{offer.prices.join(" · ")}</Text>
                          {offer.marketingFeatures?.length > 0 && (
                            <ul>
                              {offer.marketingFeatures.map(
                                (v: string, i: number) => (
                                  <li key={i}>{v}</li>
                                ),
                              )}
                            </ul>
                          )}
                        </div>
                      ))}
                      {preview.warnings?.map((v: string, i: number) => (
                        <Text key={i} size="sm">
                          {v}
                        </Text>
                      ))}
                    </Stack>
                  </Card>
                )}
                <Group>
                  <Button
                    variant="light"
                    disabled={
                      busy ||
                      !p.stripeKey ||
                      p.catalogState !== "ready" ||
                      !p.experienceLoaded ||
                      !name.trim() ||
                      !prices.length ||
                      savedRevision !== undefined
                    }
                    onClick={() => void check()}
                  >
                    {__("Preview selection", "smartcloud-commerce")}
                  </Button>
                  <Button
                    disabled={
                      busy ||
                      !p.stripeKey ||
                      p.catalogState !== "ready" ||
                      !candidate ||
                      !preview ||
                      candidate.baseRevision !== p.record.draftRevision
                    }
                    onClick={() => void saveDraft()}
                  >
                    {__("Save draft", "smartcloud-commerce")}
                  </Button>
                  <Button
                    disabled={
                      busy ||
                      !p.stripeKey ||
                      p.catalogState !== "ready" ||
                      savedRevision === undefined ||
                      savedRevision !== p.record.draftRevision ||
                      Boolean(live)
                    }
                    onClick={() => setConfirm(true)}
                  >
                    {__("Publish", "smartcloud-commerce")}
                  </Button>
                </Group>
                {savedRevision !== undefined && !live && (
                  <Text size="sm">
                    {__(
                      "Draft saved. Publishing makes this Commerce button or pricing table available and creates its Stripe Payment Links. It does not publish a WordPress page.",
                      "smartcloud-commerce",
                    )}
                  </Text>
                )}
                {live && (
                  <>
                    <Alert color="green">
                      {__(
                        "Published. Insert the Commerce: Sales presentation block and select your new button or table.",
                        "smartcloud-commerce",
                      )}
                    </Alert>
                    <Button component="a" href={p.editorUrl}>
                      {__("Open pages", "smartcloud-commerce")}
                    </Button>
                  </>
                )}
              </>
            )}
            {showWizard && (
              <Group>
                {step > 0 && (
                  <Button
                    variant="default"
                    disabled={busy}
                    onClick={() => next(step - 1)}
                  >
                    {__("Back", "smartcloud-commerce")}
                  </Button>
                )}
                <Button component="a" href={p.advancedUrl} variant="subtle">
                  {__("Advanced settings", "smartcloud-commerce")}
                </Button>
                {saved.hasSaved && (
                  <Button
                    variant="light"
                    disabled={busy}
                    onClick={() => {
                      setEditing(false);
                      setBrowseCatalog(false);
                    }}
                  >
                    {__("View saved setup", "smartcloud-commerce")}
                  </Button>
                )}
              </Group>
            )}
          </Stack>
        </div>
      </Stack>
      <Modal
        opened={confirm}
        onClose={() => setConfirm(false)}
        title={__("Publish saved sales setup?", "smartcloud-commerce")}
        centered
      >
        <Stack>
          <Text>
            {__(
              "This publishes the entire saved sales draft and creates the required Stripe Payment Links and subscription portal configurations. Review existing changes in Advanced settings if this draft already contains other edits.",
              "smartcloud-commerce",
            )}
          </Text>
          <Group>
            <Button variant="default" onClick={() => setConfirm(false)}>
              {__("Cancel", "smartcloud-commerce")}
            </Button>
            <Button
              disabled={
                busy ||
                savedRevision === undefined ||
                savedRevision !== p.record.draftRevision ||
                !p.stripeKey ||
                p.catalogState !== "ready"
              }
              onClick={async () => {
                if (
                  savedRevision === undefined ||
                  savedRevision !== p.record.draftRevision ||
                  !p.stripeKey ||
                  p.catalogState !== "ready"
                )
                  return;
                setConfirm(false);
                setWorking(true);
                try {
                  await p.onPublish();
                } catch {
                  if (mounted.current)
                    setError(
                      __(
                        "Publication could not be confirmed. Refresh the saved setup before trying again.",
                        "smartcloud-commerce",
                      ),
                    );
                } finally {
                  if (mounted.current) setWorking(false);
                }
              }}
            >
              {__("Confirm publication", "smartcloud-commerce")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
