import React, { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { __ } from "@wordpress/i18n";
import { paymentLinkUsage } from "./onboarding-model.cjs";
// @ts-ignore Shared exact minor-unit formatter.
import { formatStripePrice } from "../../main/src/money.cjs";

export function priceText(price: any): string {
  let amount: string;
  try {
    amount = formatStripePrice(
      price.unitAmount ?? price.amount,
      price.currency,
    );
  } catch {
    return __("See checkout for price", "smartcloud-commerce");
  }
  const intervals: Record<string, string> = {
    month: __("month", "smartcloud-commerce"),
    year: __("year", "smartcloud-commerce"),
    week: __("week", "smartcloud-commerce"),
    day: __("day", "smartcloud-commerce"),
  };
  return price.interval
    ? `${amount} / ${price.intervalCount > 1 ? price.intervalCount + " × " : ""}${intervals[price.interval] || price.interval}`
    : `${amount} · ${__("one-time", "smartcloud-commerce")}`;
}
function Identifier({ value }: { value: string }) {
  return (
    <details>
      <summary>{__("Technical details", "smartcloud-commerce")}</summary>
      <Text size="xs" style={{ overflowWrap: "anywhere" }}>
        {value}
      </Text>
    </details>
  );
}
export function StripeCatalogBrowser({
  catalog,
  published,
  draft,
  state,
  linkState,
  onRefresh,
}: {
  catalog: any;
  published?: any;
  draft?: any;
  state: string;
  linkState: string;
  onRefresh?: () => void;
}) {
  const [tab, setTab] = useState<string | null>("products"),
    [search, setSearch] = useState(""),
    [inactive, setInactive] = useState(false),
    [usage, setUsage] = useState<string | null>("all"),
    [copied, setCopied] = useState("");
  const products = catalog.products || [],
    prices = catalog.prices || [],
    links = catalog.paymentLinks || [],
    features = catalog.features || [];
  const query = search.trim().toLocaleLowerCase();
  const matches = (...values: unknown[]) =>
    values.some(
      (value) =>
        typeof value === "string" && value.toLocaleLowerCase().includes(query),
    );
  const available = (item: any) => inactive || item.active !== false;
  const productName = (id: string) =>
    products.find((p: any) => p.id === id)?.name ||
    __("Product details unavailable", "smartcloud-commerce");
  const activeOffers = new Set(
    (published?.presentations || []).flatMap((p: any) =>
      (p.offers || []).map((o: any) => o.id),
    ),
  );
  const inDraft = (draft?.offers || []).filter(
    (o: any) => !activeOffers.has(o.id),
  );
  const productUses = (id: string) => [
    ...new Set([
      ...(published?.presentations || [])
        .filter((p: any) =>
          p.offers.some(
            (o: any) =>
              o.prices.some(
                (price: any) =>
                  prices.find((p: any) => p.id === price.id)?.productId === id,
              ) ||
              draft?.offers?.find((d: any) => d.id === o.id)?.productId === id,
          ),
        )
        .map((p: any) => p.name),
      ...inDraft.filter((o: any) => o.productId === id).map((o: any) => o.name),
    ]),
  ];
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
    } catch {
      setCopied("failed");
    }
  };
  const productCards = products.filter(
    (p: any) => available(p) && matches(p.name, p.id),
  );
  const priceCards = prices.filter(
    (p: any) =>
      available(p) && matches(productName(p.productId), p.id, p.currency),
  );
  const linkCards = links
    .map((link: any) => ({ link, used: paymentLinkUsage(link.url, published) }))
    .filter(
      ({ link, used }: any) =>
        available(link) &&
        (usage !== "used" || used.length > 0) &&
        (usage !== "unused" || !used.length) &&
        matches(
          link.url,
          link.id,
          ...used.map((u: any) => u.name),
          ...(link.lineItems || []).map(
            (item: any) => item.name || productName(item.productId),
          ),
        ),
    );
  return (
    <Card withBorder className="sc-commerce-catalog">
      <Stack>
        <Title order={3}>{__("Stripe catalog", "smartcloud-commerce")}</Title>
        <Text size="sm">
          {__(
            "Browse the connected Stripe account. Used labels refer to this site’s saved sales setup. Browsing does not change Stripe or your published content.",
            "smartcloud-commerce",
          )}
        </Text>
        <Group align="end">
          <TextInput
            label={__("Search catalog", "smartcloud-commerce")}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: "1 1 240px" }}
          />
          <Checkbox
            label={__("Include inactive items", "smartcloud-commerce")}
            checked={inactive}
            onChange={(e) => setInactive(e.currentTarget.checked)}
          />
        </Group>
        {state === "loading" && (
          <Text role="status">
            {__("Loading Stripe catalog…", "smartcloud-commerce")}
          </Text>
        )}
        {state === "failed" && (
          <Alert color="yellow">
            {__(
              "The catalog could not be refreshed. Previously loaded items are retained; use Refresh catalog to try again.",
              "smartcloud-commerce",
            )}
          </Alert>
        )}
        <Tabs value={tab} onChange={setTab}>
          <Tabs.List>
            <Tabs.Tab value="products">
              {__("Products", "smartcloud-commerce")}
            </Tabs.Tab>
            <Tabs.Tab value="prices">
              {__("Prices", "smartcloud-commerce")}
            </Tabs.Tab>
            <Tabs.Tab value="links">
              {__("Payment Links", "smartcloud-commerce")}
            </Tabs.Tab>
            <Tabs.Tab value="features">
              {__("Product features", "smartcloud-commerce")}
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="products" pt="md">
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {productCards.map((p: any) => (
                <Card withBorder key={p.id}>
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Text fw={600}>
                        {p.name || __("Unnamed product", "smartcloud-commerce")}
                      </Text>
                      <Badge color={p.active === false ? "gray" : "teal"}>
                        {p.active === false
                          ? __("Inactive", "smartcloud-commerce")
                          : __("Active", "smartcloud-commerce")}
                      </Badge>
                    </Group>
                    {prices
                      .filter(
                        (price: any) =>
                          price.productId === p.id && available(price),
                      )
                      .map((price: any) => (
                        <Text key={price.id} size="sm">
                          {priceText(price)}
                        </Text>
                      ))}
                    {p.marketingFeatures?.length > 0 && (
                      <ul className="sc-commerce-catalog-features">
                        {p.marketingFeatures.map((name: string, i: number) => (
                          <li key={i}>{name}</li>
                        ))}
                      </ul>
                    )}
                    {productUses(p.id).map((name: any) => (
                      <Badge key={name} variant="light">
                        {name}
                      </Badge>
                    ))}
                    <Identifier value={p.id} />
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
            {!productCards.length && state === "ready" && (
              <Text>{__("No matching products.", "smartcloud-commerce")}</Text>
            )}
          </Tabs.Panel>
          <Tabs.Panel value="prices" pt="md">
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {priceCards.map((p: any) => (
                <Card withBorder key={p.id}>
                  <Stack gap="sm">
                    <Text fw={600}>{productName(p.productId)}</Text>
                    <Text>{priceText(p)}</Text>
                    <Badge color={p.active === false ? "gray" : "teal"}>
                      {p.active === false
                        ? __("Inactive", "smartcloud-commerce")
                        : __("Active", "smartcloud-commerce")}
                    </Badge>
                    <Identifier value={p.id} />
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
            {!priceCards.length && state === "ready" && (
              <Text>{__("No matching prices.", "smartcloud-commerce")}</Text>
            )}
          </Tabs.Panel>
          <Tabs.Panel value="links" pt="md">
            <Stack>
              <Text size="sm">
                {__(
                  "These include Payment Links created directly in Stripe and links created for Commerce buttons and pricing tables. A Commerce pricing table is displayed by WordPress; each offer can open its own Stripe Payment Link.",
                  "smartcloud-commerce",
                )}
              </Text>
              <Select
                label={__("Payment Link usage", "smartcloud-commerce")}
                value={usage}
                onChange={setUsage}
                data={[
                  {
                    value: "all",
                    label: __("All Payment Links", "smartcloud-commerce"),
                  },
                  {
                    value: "used",
                    label: __("Used in published sales", "smartcloud-commerce"),
                  },
                  {
                    value: "unused",
                    label: __(
                      "Not used in published sales",
                      "smartcloud-commerce",
                    ),
                  },
                ]}
              />
              {linkState === "loading" && (
                <Text role="status">
                  {__("Loading Payment Links…", "smartcloud-commerce")}
                </Text>
              )}
              {linkState === "failed" && (
                <Alert color="yellow">
                  <Text>
                    {__(
                      "Payment Links could not be loaded. Check the Stripe connection and its permissions, then retry. Products and prices remain available.",
                      "smartcloud-commerce",
                    )}
                  </Text>
                  {onRefresh && (
                    <Button variant="light" onClick={onRefresh}>
                      {__("Retry Payment Links", "smartcloud-commerce")}
                    </Button>
                  )}
                </Alert>
              )}
              {copied === "failed" && (
                <Alert>
                  {__(
                    "Copying is unavailable in this browser. Open the Payment Link and copy its URL.",
                    "smartcloud-commerce",
                  )}
                </Alert>
              )}
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                {linkCards.map(({ link, used }: any) => (
                  <Card withBorder key={link.id}>
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Text fw={600}>
                          {link.lineItems?.length
                            ? link.lineItems
                                .slice(0, 2)
                                .map(
                                  (item: any) =>
                                    products.find(
                                      (p: any) => p.id === item.productId,
                                    )?.name || item.name,
                                )
                                .join(" + ")
                            : used[0]?.name ||
                              __("Payment Link", "smartcloud-commerce")}
                        </Text>
                        <Badge
                          color={
                            link.active === false
                              ? "gray"
                              : link.active === true
                                ? "teal"
                                : "gray"
                          }
                        >
                          {link.active === false
                            ? __("Inactive", "smartcloud-commerce")
                            : link.active === true
                              ? __("Active", "smartcloud-commerce")
                              : __("Status unavailable", "smartcloud-commerce")}
                        </Badge>
                      </Group>
                      {(link.lineItems || []).map((item: any, i: number) => (
                        <div key={i}>
                          <Text size="sm">
                            {products.find((p: any) => p.id === item.productId)
                              ?.name || item.name}
                          </Text>
                          <Text size="sm" c="dimmed">
                            {priceText(item)}
                            {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                          </Text>
                        </div>
                      ))}
                      {link.hasMoreLineItems && (
                        <Text size="xs">
                          {__(
                            "More items are available at checkout.",
                            "smartcloud-commerce",
                          )}
                        </Text>
                      )}
                      <Badge
                        variant="light"
                        color={used.length ? "blue" : "gray"}
                      >
                        {used.length
                          ? __("Used in published sales", "smartcloud-commerce")
                          : __(
                              "Not used in published sales",
                              "smartcloud-commerce",
                            )}
                      </Badge>
                      {used.map((u: any) => (
                        <Text key={u.id} size="sm">
                          {u.name} ·{" "}
                          {u.type === "table"
                            ? __("Pricing table", "smartcloud-commerce")
                            : __("Buy button", "smartcloud-commerce")}
                        </Text>
                      ))}
                      <Text size="xs" style={{ overflowWrap: "anywhere" }}>
                        {link.url}
                      </Text>
                      <Group>
                        <Button
                          component="a"
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="light"
                        >
                          {__("Open checkout", "smartcloud-commerce")}
                        </Button>
                        <Button
                          variant="subtle"
                          onClick={() => void copy(link.url)}
                        >
                          {copied === link.url
                            ? __("Copied", "smartcloud-commerce")
                            : __("Copy link", "smartcloud-commerce")}
                        </Button>
                      </Group>
                      <Identifier value={link.id} />
                    </Stack>
                  </Card>
                ))}
              </SimpleGrid>
              {!linkCards.length && linkState === "ready" && (
                <Text>
                  {__("No matching Payment Links.", "smartcloud-commerce")}
                </Text>
              )}
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="features" pt="md">
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              {features
                .filter((f: any) => matches(f.name, f.lookupKey))
                .map((f: any) => (
                  <Card withBorder key={f.id}>
                    <Stack gap="xs">
                      <Text fw={600}>{f.name || f.lookupKey}</Text>
                      <Text size="sm">
                        {__("Access feature", "smartcloud-commerce")}
                      </Text>
                      {(draft?.offers || [])
                        .filter((o: any) => o.features.includes(f.lookupKey))
                        .map((o: any) => (
                          <Badge key={o.id} variant="light">
                            {o.name}
                          </Badge>
                        ))}
                      <Identifier value={f.lookupKey || f.id} />
                    </Stack>
                  </Card>
                ))}
            </SimpleGrid>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Card>
  );
}
