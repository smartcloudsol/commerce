import React from "react";
import {
  Badge,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { __ } from "@wordpress/i18n";
import { priceText } from "./catalog-browser";

export function SavedSetup({ saved, record }: { saved: any; record: any }) {
  const presentations = [
    ...saved.presentations.map((p: any) => ({
      ...p,
      stage: saved.cached ? "cached" : "published",
    })),
    ...saved.draft.map((p: any) => ({
      ...p,
      stage: "draft",
      offers: (record.draft?.offers || [])
        .filter((o: any) => p.offerIds.includes(o.id))
        .map((o: any) => ({
          ...o,
          prices: o.prices.filter((price: any) =>
            p.priceIds.includes(price.id),
          ),
        })),
    })),
  ];
  return (
    <Stack
      className="sc-commerce-saved-setup"
      aria-label={__("Saved Commerce setup", "smartcloud-commerce")}
    >
      <Text>
        {__(
          "Your saved buttons and pricing tables are shown below. Continue using them in the block editor, or run setup again to add another sales presentation.",
          "smartcloud-commerce",
        )}
      </Text>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {presentations.map((p: any) => (
          <Card
            withBorder
            key={`${p.stage}-${p.id}`}
            className="sc-commerce-saved-presentation"
          >
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={3} size="h4">
                  {p.name}
                </Title>
                <Badge color={p.stage === "published" ? "teal" : "gray"}>
                  {p.stage === "published"
                    ? __("Published", "smartcloud-commerce")
                    : p.stage === "draft"
                      ? __("Saved draft", "smartcloud-commerce")
                      : __("Saved on this site", "smartcloud-commerce")}
                </Badge>
              </Group>
              <Text size="sm">
                {p.type === "table"
                  ? __("Pricing table", "smartcloud-commerce")
                  : __("Buy button", "smartcloud-commerce")}
              </Text>
              {(p.offers || []).map((o: any) => (
                <div key={o.id}>
                  <Text size="sm" fw={600}>
                    {o.name}
                  </Text>
                  {o.prices.map((price: any) => (
                    <Text key={price.id} size="sm" c="dimmed">
                      {priceText(price)}
                    </Text>
                  ))}
                </div>
              ))}
              <Text size="sm">
                {p.flow === "payment_link"
                  ? __(
                      "Displayed by Commerce; its offers open Stripe Payment Links.",
                      "smartcloud-commerce",
                    )
                  : __(
                      "Uses authenticated Commerce Checkout.",
                      "smartcloud-commerce",
                    )}
              </Text>
              <Text size="xs">
                {p.stage === "draft"
                  ? __(
                      "Review and publish this draft in Sales setup before using it on a page.",
                      "smartcloud-commerce",
                    )
                  : __(
                      "Insert the Commerce: Sales presentation block and select this name.",
                      "smartcloud-commerce",
                    )}
              </Text>
            </Stack>
          </Card>
        ))}
        {[
          ...saved.pricingTableIds.map((id: string, i: number) => ({
            id,
            i,
            type: "table",
          })),
          ...saved.buyButtonIds.map((id: string, i: number) => ({
            id,
            i,
            type: "button",
          })),
        ].map((item: any) => (
          <Card withBorder key={item.id}>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text fw={600}>
                  {item.type === "table"
                    ? __("Stripe pricing table", "smartcloud-commerce")
                    : __("Stripe buy button", "smartcloud-commerce")}{" "}
                  {item.i + 1}
                </Text>
                <Badge variant="light">
                  {__("Saved embed", "smartcloud-commerce")}
                </Badge>
              </Group>
              <Text size="sm">
                {__(
                  "Available in the corresponding Commerce Stripe embed block.",
                  "smartcloud-commerce",
                )}
              </Text>
              <details>
                <summary>
                  {__("Embed identifier", "smartcloud-commerce")}
                </summary>
                <Text size="xs" style={{ overflowWrap: "anywhere" }}>
                  {item.id}
                </Text>
              </details>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
      {saved.hasDraft && !saved.draft.length && (
        <Text>
          {__(
            "A sales draft is saved. Open Sales setup to continue editing it.",
            "smartcloud-commerce",
          )}
        </Text>
      )}
      {saved.cached && (
        <Text size="sm" c="dimmed">
          {__(
            "Showing the last saved version on this site while the connected setup is checked.",
            "smartcloud-commerce",
          )}
        </Text>
      )}
    </Stack>
  );
}
