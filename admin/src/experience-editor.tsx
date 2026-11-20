import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { __ } from "@wordpress/i18n";
// @ts-ignore Shared pure model.
import {
  parseExperience,
  createEmptyExperience,
} from "../../main/src/experience";

const PlanChanges = React.lazy(() =>
  WPSUITE_COMMERCE_PREMIUM
    ? import("./paid-features/plan-changes")
    : import("./free-features/service-note")
);
const Notifications = React.lazy(() =>
  WPSUITE_COMMERCE_PREMIUM
    ? import("./paid-features/notifications")
    : import("./free-features/service-note")
);

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
};
type Props = {
  initialTab?:
    "families" | "plans" | "presentations" | "rules" | "notifications";
  value: any;
  revision: number;
  busy: boolean;
  catalog: { products: Item[]; prices: Item[]; features: Item[] };
  onSave: (model: any) => Promise<void>;
  onPreview: (model: any) => Promise<unknown>;
  onPublish: () => Promise<void>;
  canPublish: boolean;
  emailTemplates?: React.ReactNode;
};
const slug = (value: string, used: string[]) => {
  const base =
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 45) || "item";
  let id = base,
    n = 2;
  while (used.includes(id)) id = `${base}-${n++}`;
  return id;
};
const clone = (value: any) => JSON.parse(JSON.stringify(value));
// @ts-ignore Shared Stripe minor-unit formatter.
import {
  formatStripePrice,
  isSupportedStripeCurrency,
} from "../../main/src/money.cjs";
const amount = (p: {
  unitAmount: number;
  currency: string;
  interval: string | null;
}) =>
  `${formatStripePrice(p.unitAmount, p.currency)} · ${p.interval || __("one-time", "smartcloud-commerce")}`;
export function ExperienceEditor(props: Props) {
  const [draft, setDraft] = useState<any>(() =>
    clone(props.value || createEmptyExperience()),
  );
  const [tab, setTab] = useState<string | null>(props.initialTab || "families");
  const [emailVisited, setEmailVisited] = useState(
    props.initialTab === "notifications",
  );
  useEffect(() => {
    if (tab === "notifications") setEmailVisited(true);
  }, [tab]);
  useEffect(() => {
    if (props.initialTab) setTab(props.initialTab);
  }, [props.initialTab]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    families: string[];
    offers: { name: string; prices: string[]; marketingFeatures: string[] }[];
    presentations: { name: string; flow: string; kind: string }[];
    warnings: string[];
  } | null>(null);
  const [publish, setPublish] = useState(false);
  const [remove, setRemove] = useState<{
    label: string;
    action: (d: any) => void;
  }>();
  const [familyName, setFamilyName] = useState("");
  const [product, setProduct] = useState<string | null>(null);
  const [presentationName, setPresentationName] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setDraft(clone(props.value || createEmptyExperience()));
    setDirty(false);
    setError("");
    setPreview(null);
    setPublish(false);
  }, [props.revision]);
  const update = (fn: (model: any) => void) => {
    const next = clone(draft);
    fn(next);
    setDraft(next);
    setDirty(true);
    setPreview(null);
    setError("");
  };
  const validate = () => {
    try {
      return parseExperience(draft);
    } catch {
      setError(
        __(
          "Check names, prices, selected plans, subscription rules, and notification details before saving or previewing.",
          "smartcloud-commerce",
        ),
      );
      return undefined;
    }
  };
  const save = async () => {
    const model = validate();
    if (!model) return;
    const g = generation.current;
    try {
      await props.onSave(model);
      if (g === generation.current) {
        setDirty(false);
        setError("");
      }
    } catch {
      if (g === generation.current)
        setError(
          __(
            "The draft could not be saved. Refresh and try again.",
            "smartcloud-commerce",
          ),
        );
    }
  };
  const checkPreview = async () => {
    const model = validate();
    if (!model) return;
    const g = generation.current;
    try {
      const result = (await props.onPreview(model)) as typeof preview;
      if (g === generation.current) setPreview(result);
    } catch {
      if (g === generation.current)
        setError(
          __(
            "The draft could not be previewed. Check the catalog and try again.",
            "smartcloud-commerce",
          ),
        );
    }
  };
  const featureOptions = props.catalog.features
    .filter((f) => f.lookupKey)
    .map((f) => ({ value: f.lookupKey!, label: f.name || f.lookupKey! }));
  const families = draft.families || [],
    offers = draft.offers || [],
    presentations = draft.presentations || [];
  const selectedProduct = props.catalog.products.find((p) => p.id === product);
  const productOptions = props.catalog.products
    .filter((p) => !offers.some((o: any) => o.productId === p.id))
    .map((p) => ({
      value: p.id,
      label: p.name || __("Unnamed product", "smartcloud-commerce"),
    }));
  const addOffer = () => {
    if (!selectedProduct || !families.length) return;
    update((d) => {
      d.offers.push({
        id: slug(
          selectedProduct.name || "plan",
          d.offers.map((o: any) => o.id),
        ),
        familyId: d.families[0].id,
        productId: selectedProduct.id,
        name: selectedProduct.name || __("New plan", "smartcloud-commerce"),
        description: "",
        marketingFeatures: selectedProduct.marketingFeatures || [],
        prices: [],
        features: [],
      });
    });
    setProduct(null);
  };
  const askRemove = (label: string, action: (d: any) => void) =>
    setRemove({ label, action });
  const disabled = props.busy;
  return (
    <Stack>
      <Text size="sm">
        {__(
          "Start with 1. subscription types, 2. plans and prices, then 3. buttons and tables. Save and preview your draft before publishing. A draft does not change Stripe or the active setup.",
          "smartcloud-commerce",
        )}
      </Text>
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      {!props.catalog.products.length && (
        <Alert>
          {__(
            "Connect Stripe and load the catalog to select products and prices. Existing selections remain in this draft.",
            "smartcloud-commerce",
          )}
        </Alert>
      )}
      <Tabs value={tab} onChange={setTab}>
        <Tabs.List>
          <Tabs.Tab value="families">
            {__("Subscription types", "smartcloud-commerce")}
          </Tabs.Tab>
          <Tabs.Tab value="plans">
            {__("Plans and prices", "smartcloud-commerce")}
          </Tabs.Tab>
          <Tabs.Tab value="presentations">
            {__("Buttons and tables", "smartcloud-commerce")}
          </Tabs.Tab>
          <Tabs.Tab value="rules">
            {__("Plan changes", "smartcloud-commerce")}
          </Tabs.Tab>
          <Tabs.Tab value="notifications">
            {__("Emails", "smartcloud-commerce")}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="families">
          <Stack mt="md">
            <Text size="sm">
              {__(
                "A subscription type is an independent set of plans. For example, Knowledge base membership could contain Basic and Pro; Training could be a separate type.",
                "smartcloud-commerce",
              )}
            </Text>
            {!families.length && (
              <Text>
                {__(
                  "No subscription types yet. Add one to start building your plans.",
                  "smartcloud-commerce",
                )}
              </Text>
            )}
            {families.map((f: any, index: number) => (
              <Card withBorder key={f.id}>
                <Stack>
                  <TextInput
                    label={__("Subscription type name", "smartcloud-commerce")}
                    value={f.name}
                    error={
                      !f.name.trim()
                        ? __("Enter a name", "smartcloud-commerce")
                        : undefined
                    }
                    onChange={(e) =>
                      update((d) => {
                        d.families[index].name = e.currentTarget.value;
                      })
                    }
                  />
                  <Select
                    label={__(
                      "Purchases in this subscription type",
                      "smartcloud-commerce",
                    )}
                    value={f.purchasePolicy}
                    data={[
                      {
                        value: "single",
                        label: __("One subscription", "smartcloud-commerce"),
                      },
                      {
                        value: "multiple",
                        label: __(
                          "Multiple subscriptions",
                          "smartcloud-commerce",
                        ),
                      },
                    ]}
                    onChange={(v) =>
                      update((d) => {
                        d.families[index].purchasePolicy = v;
                      })
                    }
                  />
                  <Switch
                    label={__(
                      "Use Stripe Tax (automatic)",
                      "smartcloud-commerce",
                    )}
                    checked={f.automaticTax === true}
                    onChange={(e) =>
                      update((d) => {
                        if (e.currentTarget.checked)
                          d.families[index].automaticTax = true;
                        else delete d.families[index].automaticTax;
                      })
                    }
                  />
                  <Text size="sm">
                    {__(
                      "Stripe Tax requires appropriate active tax registrations. This setting does not register your business.",
                      "smartcloud-commerce",
                    )}
                  </Text>
                  <Button
                    variant="subtle"
                    color="red"
                    onClick={() =>
                      askRemove(f.name, (d) => {
                        d.families.splice(index, 1);
                      })
                    }
                    disabled={offers.some((o: any) => o.familyId === f.id)}
                  >
                    {__("Remove subscription type", "smartcloud-commerce")}
                  </Button>
                </Stack>
              </Card>
            ))}
            <TextInput
              label={__("New subscription type name", "smartcloud-commerce")}
              value={familyName}
              onChange={(e) => setFamilyName(e.currentTarget.value)}
            />
            <Button
              disabled={disabled || !familyName.trim()}
              onClick={() => {
                update((d) => {
                  d.families.push({
                    id: slug(
                      familyName,
                      d.families.map((f: any) => f.id),
                    ),
                    name: familyName.trim(),
                    purchasePolicy: "single",
                    transitions: [],
                    cancellation: { enabled: false, atPeriodEnd: true },
                  });
                });
                setFamilyName("");
              }}
            >
              {__("Add subscription type", "smartcloud-commerce")}
            </Button>
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="plans">
          <Stack mt="md">
            <Text size="sm">
              {__(
                "Choose an existing Stripe product and its prices for each plan. Its subscription type determines which plans can be offered as switches.",
                "smartcloud-commerce",
              )}
            </Text>
            {!families.length && (
              <Group>
                <Text>
                  {__(
                    "Add a subscription type before adding plans.",
                    "smartcloud-commerce",
                  )}
                </Text>
                <Button variant="light" onClick={() => setTab("families")}>
                  {__("Go to subscription types", "smartcloud-commerce")}
                </Button>
              </Group>
            )}
            <Select
              label={__("Existing Stripe product", "smartcloud-commerce")}
              searchable
              data={productOptions}
              value={product}
              onChange={setProduct}
            />
            <Button
              disabled={disabled || !selectedProduct || !families.length}
              onClick={addOffer}
            >
              {__("Add plan", "smartcloud-commerce")}
            </Button>
            {offers.map((o: any, index: number) => {
              const productItem = props.catalog.products.find(
                (p) => p.id === o.productId,
              );
              const validPrices = props.catalog.prices.filter(
                (p) =>
                  p.productId === o.productId &&
                  p.active === true &&
                  isSupportedStripeCurrency(p.currency) &&
                  Number.isSafeInteger(p.amount) &&
                  p.amount! >= 0 &&
                  (!["isk", "ugx"].includes(p.currency || "") ||
                    p.amount! % 100 === 0) &&
                  typeof p.currency === "string" &&
                  (p.interval === undefined ||
                    ((p.interval === "month" || p.interval === "year") &&
                      p.intervalCount === 1)),
              );
              const options = validPrices.map((p) => ({
                value: p.id,
                label: amount({
                  unitAmount: p.amount!,
                  currency: p.currency!,
                  interval: p.interval || null,
                }),
              }));
              for (const p of o.prices)
                if (!options.some((v) => v.value === p.id))
                  options.push({
                    value: p.id,
                    label: `${amount(p)} (${__("unavailable in catalog", "smartcloud-commerce")})`,
                  });
              const featureData = [...featureOptions];
              for (const key of o.features)
                if (!featureData.some((x) => x.value === key))
                  featureData.push({
                    value: key,
                    label: `${key} (${__("unavailable in catalog", "smartcloud-commerce")})`,
                  });
              return (
                <Card withBorder key={o.id}>
                  <Stack>
                    <Text fw={600}>
                      {productItem?.name ||
                        __(
                          "Previously selected product unavailable",
                          "smartcloud-commerce",
                        )}
                    </Text>
                    <TextInput
                      label={__("Plan name", "smartcloud-commerce")}
                      value={o.name}
                      error={
                        !o.name.trim()
                          ? __("Enter a name", "smartcloud-commerce")
                          : undefined
                      }
                      onChange={(e) =>
                        update((d) => {
                          d.offers[index].name = e.currentTarget.value;
                        })
                      }
                    />
                    <Textarea
                      label={__("Description", "smartcloud-commerce")}
                      value={o.description}
                      onChange={(e) =>
                        update((d) => {
                          d.offers[index].description = e.currentTarget.value;
                        })
                      }
                    />
                    <Select
                      label={__("Subscription type", "smartcloud-commerce")}
                      value={o.familyId}
                      data={families.map((f: any) => ({
                        value: f.id,
                        label: f.name,
                      }))}
                      onChange={(v) =>
                        update((d) => {
                          d.offers[index].familyId = v;
                        })
                      }
                    />
                    <MultiSelect
                      label={__("Prices", "smartcloud-commerce")}
                      description={__(
                        "Only active fixed prices with verified billing intervals can be added.",
                        "smartcloud-commerce",
                      )}
                      data={options}
                      value={o.prices.map((p: any) => p.id)}
                      onChange={(values) =>
                        update((d) => {
                          d.offers[index].prices = values.map(
                            (id) =>
                              o.prices.find((p: any) => p.id === id) ||
                              (() => {
                                const p = validPrices.find((v) => v.id === id)!;
                                return {
                                  id: p.id,
                                  currency: p.currency,
                                  unitAmount: p.amount,
                                  interval: p.interval || null,
                                  intervalCount: 1,
                                  ...(p.taxBehavior === undefined
                                    ? {}
                                    : { taxBehavior: p.taxBehavior }),
                                };
                              })(),
                          );
                        })
                      }
                    />
                    <Textarea
                      label={__(
                        "Marketing features, one per line",
                        "smartcloud-commerce",
                      )}
                      description={__(
                        "Display text only; it does not grant access.",
                        "smartcloud-commerce",
                      )}
                      value={o.marketingFeatures.join("\n")}
                      onChange={(e) =>
                        update((d) => {
                          d.offers[index].marketingFeatures =
                            e.currentTarget.value.split("\n");
                        })
                      }
                    />
                    <MultiSelect
                      label={__("Product features", "smartcloud-commerce")}
                      description={__(
                        "Select the features used for access; these are separate from marketing text.",
                        "smartcloud-commerce",
                      )}
                      data={featureData}
                      value={o.features}
                      onChange={(v) =>
                        update((d) => {
                          d.offers[index].features = v;
                        })
                      }
                    />
                    <details>
                      <summary>
                        {__("Advanced identifiers", "smartcloud-commerce")}
                      </summary>
                      <Text size="xs">{o.productId}</Text>
                    </details>
                    <Button
                      color="red"
                      variant="subtle"
                      onClick={() =>
                        askRemove(o.name, (d) => {
                          d.offers.splice(index, 1);
                        })
                      }
                    >
                      {__("Remove plan", "smartcloud-commerce")}
                    </Button>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="presentations">
          <Stack mt="md">
            <Text size="sm">
              {__(
                "Choose plans and prices for a named button or table that can be used in Gutenberg. Manual Stripe embeds are configured separately.",
                "smartcloud-commerce",
              )}
            </Text>
            {!offers.length && (
              <Group>
                <Text>
                  {__(
                    "Add a plan and its prices first.",
                    "smartcloud-commerce",
                  )}
                </Text>
                <Button variant="light" onClick={() => setTab("plans")}>
                  {__("Go to plans and prices", "smartcloud-commerce")}
                </Button>
              </Group>
            )}
            <TextInput
              label={__("New presentation name", "smartcloud-commerce")}
              value={presentationName}
              onChange={(e) => setPresentationName(e.currentTarget.value)}
            />
            <Button
              disabled={disabled || !presentationName.trim()}
              onClick={() => {
                update((d) => {
                  d.presentations.push({
                    id: slug(
                      presentationName,
                      d.presentations.map((p: any) => p.id),
                    ),
                    name: presentationName.trim(),
                    type: "table",
                    flow: "checkout",
                    offerIds: [],
                    priceIds: [],
                    buttonLabel: __("Buy", "smartcloud-commerce"),
                  });
                });
                setPresentationName("");
              }}
            >
              {__("Add presentation", "smartcloud-commerce")}
            </Button>
            {presentations.map((p: any, index: number) => {
              const priceOptions = offers
                .filter((o: any) => p.offerIds.includes(o.id))
                .flatMap((o: any) =>
                  o.prices.map((price: any) => ({
                    value: price.id,
                    label: `${o.name} · ${amount(price)}`,
                  })),
                );
              return (
                <Card withBorder key={p.id}>
                  <Stack>
                    <TextInput
                      label={__("Name", "smartcloud-commerce")}
                      value={p.name}
                      onChange={(e) =>
                        update((d) => {
                          d.presentations[index].name = e.currentTarget.value;
                        })
                      }
                    />
                    <Select
                      label={__("Layout", "smartcloud-commerce")}
                      value={p.type}
                      data={[
                        {
                          value: "button",
                          label: __("Button", "smartcloud-commerce"),
                        },
                        {
                          value: "table",
                          label: __("Table", "smartcloud-commerce"),
                        },
                      ]}
                      onChange={(v) =>
                        update((d) => {
                          d.presentations[index].type = v;
                        })
                      }
                    />
                    <Select
                      label={__("Purchase flow", "smartcloud-commerce")}
                      value={p.flow}
                      data={[
                        {
                          value: "payment_link",
                          label: __("Payment link", "smartcloud-commerce"),
                        },
                        {
                          value: "checkout",
                          label: __("Commerce checkout", "smartcloud-commerce"),
                        },
                      ]}
                      onChange={(v) =>
                        update((d) => {
                          d.presentations[index].flow = v;
                        })
                      }
                    />
                    {p.flow === "payment_link" && (
                      <Text size="sm">
                        {__(
                          "Payment links do not grant Commerce access automatically.",
                          "smartcloud-commerce",
                        )}
                      </Text>
                    )}
                    <MultiSelect
                      label={__("Plans", "smartcloud-commerce")}
                      data={offers.map((o: any) => ({
                        value: o.id,
                        label: o.name,
                      }))}
                      value={p.offerIds}
                      onChange={(v) =>
                        update((d) => {
                          const x = d.presentations[index];
                          x.offerIds = v;
                          x.priceIds = x.priceIds.filter((id: string) =>
                            d.offers.some(
                              (o: any) =>
                                v.includes(o.id) &&
                                o.prices.some((price: any) => price.id === id),
                            ),
                          );
                          if (
                            x.featuredOfferId &&
                            !v.includes(x.featuredOfferId)
                          )
                            delete x.featuredOfferId;
                        })
                      }
                    />
                    <MultiSelect
                      label={__("Prices", "smartcloud-commerce")}
                      data={priceOptions}
                      value={p.priceIds}
                      onChange={(v) =>
                        update((d) => {
                          d.presentations[index].priceIds = v;
                        })
                      }
                    />
                    <Select
                      clearable
                      label={__("Featured plan", "smartcloud-commerce")}
                      data={offers
                        .filter((o: any) => p.offerIds.includes(o.id))
                        .map((o: any) => ({ value: o.id, label: o.name }))}
                      value={p.featuredOfferId || null}
                      onChange={(v) =>
                        update((d) => {
                          if (v) d.presentations[index].featuredOfferId = v;
                          else delete d.presentations[index].featuredOfferId;
                        })
                      }
                    />
                    <TextInput
                      label={__("Button label", "smartcloud-commerce")}
                      value={p.buttonLabel}
                      onChange={(e) =>
                        update((d) => {
                          d.presentations[index].buttonLabel =
                            e.currentTarget.value;
                        })
                      }
                    />
                    <Button
                      color="red"
                      variant="subtle"
                      onClick={() =>
                        askRemove(p.name, (d) => {
                          d.presentations.splice(index, 1);
                        })
                      }
                    >
                      {__("Remove presentation", "smartcloud-commerce")}
                    </Button>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="rules">
          {tab === "rules" && (
            <React.Suspense fallback={null}>
              <PlanChanges families={families} offers={offers} setTab={setTab} update={update} askRemove={askRemove} />
            </React.Suspense>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="notifications">
          {emailVisited && (
            <React.Suspense fallback={null}>
              <Notifications draft={draft} update={update} emailTemplates={props.emailTemplates} />
            </React.Suspense>
          )}
        </Tabs.Panel>
      </Tabs>
      <Group>
        <Button disabled={disabled || !dirty} onClick={() => void save()}>
          {__("Save draft", "smartcloud-commerce")}
        </Button>
        <Button
          variant="light"
          disabled={disabled}
          onClick={() => void checkPreview()}
        >
          {__("Preview changes", "smartcloud-commerce")}
        </Button>
        <Button
          variant="outline"
          disabled={disabled || dirty || !props.canPublish}
          onClick={() => setPublish(true)}
        >
          {__("Publish", "smartcloud-commerce")}
        </Button>
      </Group>
      {preview && (
        <Alert title={__("Draft preview", "smartcloud-commerce")}>
          <Stack gap="xs">
            <Text fw={600}>
              {__("Subscription types", "smartcloud-commerce")}
            </Text>
            {preview.families.map((name, i) => (
              <Text key={i}>{name}</Text>
            ))}
            <Text fw={600}>{__("Plans", "smartcloud-commerce")}</Text>
            {preview.offers.map((offer, i) => (
              <Stack gap={0} key={i}>
                <Text>{offer.name}</Text>
                {offer.prices.map((price, j) => (
                  <Text size="sm" key={j}>
                    {price}
                  </Text>
                ))}
                {offer.marketingFeatures.map((feature, j) => (
                  <Text size="sm" key={j}>
                    {feature}
                  </Text>
                ))}
              </Stack>
            ))}
            <Text fw={600}>
              {__("Buttons and tables", "smartcloud-commerce")}
            </Text>
            {preview.presentations.map((item, i) => (
              <Text key={i}>
                {item.name} ·{" "}
                {item.kind === "button"
                  ? __("Button", "smartcloud-commerce")
                  : __("Table", "smartcloud-commerce")}{" "}
                ·{" "}
                {item.flow === "checkout"
                  ? __("Commerce checkout", "smartcloud-commerce")
                  : __("Payment link", "smartcloud-commerce")}
              </Text>
            ))}
            {preview.warnings.map((warning, i) => (
              <Text key={i}>{warning}</Text>
            ))}
            <Text size="sm">
              {__(
                "Publishing applies the saved, validated draft to the selected site.",
                "smartcloud-commerce",
              )}
            </Text>
          </Stack>
        </Alert>
      )}
      <Modal
        opened={!!remove}
        onClose={() => setRemove(undefined)}
        title={__("Remove item?", "smartcloud-commerce")}
      >
        <Stack>
          <Text>{remove?.label}</Text>
          <Text>
            {__(
              "References to this item may need to be updated before saving.",
              "smartcloud-commerce",
            )}
          </Text>
          <Group>
            <Button variant="default" onClick={() => setRemove(undefined)}>
              {__("Cancel", "smartcloud-commerce")}
            </Button>
            <Button
              color="red"
              onClick={() => {
                if (remove) update(remove.action);
                setRemove(undefined);
              }}
            >
              {__("Remove", "smartcloud-commerce")}
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={publish}
        onClose={() => setPublish(false)}
        title={__("Publish this experience?", "smartcloud-commerce")}
      >
        <Stack>
          <Text>
            {__(
              "The saved draft will be validated and applied to this site. Review the connected account and mode before continuing.",
              "smartcloud-commerce",
            )}
          </Text>
          <Group>
            <Button variant="default" onClick={() => setPublish(false)}>
              {__("Cancel", "smartcloud-commerce")}
            </Button>
            <Button
              disabled={disabled || dirty || !props.canPublish}
              onClick={() => {
                setPublish(false);
                void props
                  .onPublish()
                  .catch(() =>
                    setError(
                      __(
                        "Publication failed. Review the draft and try again.",
                        "smartcloud-commerce",
                      ),
                    ),
                  );
              }}
            >
              {__("Publish", "smartcloud-commerce")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
