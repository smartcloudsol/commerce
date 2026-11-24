import { contextIdentity } from "./onboarding-model.cjs";
import { useEffect, useState } from "react";
import { Alert, Autocomplete, Button, Card, Group, Loader, NumberInput, Select, SimpleGrid, Stack, Switch, Text, TextInput } from "@mantine/core";
import { __ } from "@wordpress/i18n";

type Rule = { path: string; group: string; pageId: number; feature?: string };
type FeatureRoute = { feature: string; group: string; prefix: string };
type Policy = { enabled: boolean; allowPublisher: boolean; rules: Rule[]; featureRoutes: FeatureRoute[] };
type Settings = { policy: Policy; revision: string; gateyReady: boolean; mediaReady: boolean; publisherReady: boolean };

export function WordPressProtection({ url, nonce, mappings }: { url: string; nonce: string; mappings: { feature: string; group: string }[] }) {
  const [saved, setSaved] = useState<Settings>();
  const [draft, setDraft] = useState<Policy>();
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setNotice("");
    setSaved(undefined);
    setDraft(undefined);
    void fetch(url, { headers: { "X-WP-Nonce": nonce }, signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Settings unavailable");
        const value: Settings = await response.json();
        if (controller.signal.aborted) return;
        const policy = { ...value.policy, featureRoutes: value.policy.featureRoutes ?? [] };
        setDraft(policy);
        setSaved({ ...value, policy });
      })
      .catch(() => {
        if (!controller.signal.aborted) setNotice(__("WordPress protection settings could not be loaded.", "smartcloud-commerce"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, nonce]);

  if (!saved || !draft) return loading ? <Loader aria-label={__("Loading protection settings", "smartcloud-commerce")} /> : <Alert role="status">{notice}</Alert>;

  const update = (index: number, change: Partial<Rule>) =>
    setDraft({ ...draft, rules: draft.rules.map((rule, current) => current === index ? { ...rule, ...change } : rule) });
  const updateRoute = (index: number, change: Partial<FeatureRoute>) =>
    setDraft({ ...draft, featureRoutes: draft.featureRoutes.map((route, current) => current === index ? { ...route, ...change } : route) });
  const byFeature = new Map(mappings.filter(({ feature, group }) => feature && group).map(({ feature, group }) => [feature, group]));
  const savedRouteMap = Object.fromEntries(saved.policy.featureRoutes.map(route => [route.prefix, [route.group]]));

  async function save() {
    setLoading(true);
    setNotice("");
    setCopied(false);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "X-WP-Nonce": nonce, "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, revision: saved?.revision }),
        cache: "no-store",
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message || __("Protection settings could not be saved.", "smartcloud-commerce"));
      setSaved(value);
      setDraft(value.policy);
      setNotice(__("Protection settings saved.", "smartcloud-commerce"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : __("Protection settings could not be saved.", "smartcloud-commerce"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack>
      <Text>{__("Allow members to open private WordPress pages and files using their Gatey account. An operator can manage Cognito group membership manually. Automatic Stripe entitlement requires the Commerce backend.", "smartcloud-commerce")}</Text>
      <Switch
        label={__("Enable WordPress protection", "smartcloud-commerce")}
        description={__("Pages configured here must have Private visibility in WordPress. Keep protected routes out of shared page caches.", "smartcloud-commerce")}
        checked={draft.enabled}
        disabled={loading || (!draft.enabled && !saved.gateyReady)}
        onChange={(event) => setDraft({ ...draft, enabled: event.currentTarget.checked })}
      />
      {!saved.gateyReady && <Alert>{__("Configure the default Gatey user pool and HTTPS to enable WordPress protection.", "smartcloud-commerce")}</Alert>}
      <Switch
        label={__("Allow authenticated Static Publisher renders", "smartcloud-commerce")}
        description={saved.publisherReady
          ? __("The Exporter can obtain a short lease for these routes. Publish protected content only to a target that enforces the same access groups.", "smartcloud-commerce")
          : __("Configure SMARTCLOUD_COMMERCE_PUBLISHER_SECRET on the WordPress server to enable render leases.", "smartcloud-commerce")}
        checked={draft.allowPublisher}
        disabled={loading || (!draft.allowPublisher && !saved.publisherReady)}
        onChange={(event) => setDraft({ ...draft, allowPublisher: event.currentTarget.checked })}
      />
      {!saved.mediaReady && <Text size="sm" c="dimmed">{__("To protect files, configure a private server directory outside the web root.", "smartcloud-commerce")}</Text>}
      <Text fw={600}>{__("Article paths", "smartcloud-commerce")}</Text>
      <Text size="sm">{__("Enter a feature key, its Commerce Cognito group, and a prefix such as /basic. Put each full article in a private Page beneath that prefix. Add the Read full article block to its public teaser.", "smartcloud-commerce")}</Text>
      {draft.featureRoutes.map((route, index) => (
        <Card withBorder key={index}>
          <Stack>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Autocomplete label={__("Feature key", "smartcloud-commerce")}
                data={[...new Set([...byFeature.keys(), ...(route.feature ? [route.feature] : [])])]}
                value={route.feature} disabled={loading || draft.rules.some(rule => rule.feature && rule.feature === route.feature)}
                error={route.feature && !/^[A-Za-z0-9_.-]{1,128}$/.test(route.feature) ? __("Use 1–128 letters, numbers, underscores, periods or hyphens.", "smartcloud-commerce") : undefined}
                onChange={(feature) => updateRoute(index, { feature, group: byFeature.get(feature) ?? route.group })} />
              <TextInput label={__("Article path prefix", "smartcloud-commerce")} placeholder="/basic"
                value={route.prefix} disabled={loading} onChange={(event) => updateRoute(index, { prefix: event.currentTarget.value })} />
            </SimpleGrid>
            <Autocomplete label={__("Cognito group", "smartcloud-commerce")} data={[...new Set(byFeature.values())]} value={route.group} disabled={loading}
              error={route.group && !/^commerce-[a-z0-9][a-z0-9-]{0,118}$/.test(route.group) ? __("Use a commerce- group name with lowercase letters, numbers and hyphens.", "smartcloud-commerce") : undefined}
              onChange={(group) => updateRoute(index, { group })} />
            {byFeature.has(route.feature) && byFeature.get(route.feature) !== route.group && (
              <Button variant="light" disabled={loading} onClick={() => updateRoute(index, { group: byFeature.get(route.feature) })}>
                {__("Use the current feature group", "smartcloud-commerce")}
              </Button>
            )}
            <Group justify="flex-end">
              <Button variant="subtle" color="red" disabled={loading || draft.rules.some(rule => rule.feature && rule.feature === route.feature)}
                onClick={() => setDraft({ ...draft, featureRoutes: draft.featureRoutes.filter((_, current) => current !== index) })}>
                {__("Remove article prefix", "smartcloud-commerce")}
              </Button>
            </Group>
          </Stack>
        </Card>
      ))}
      <Button variant="light" disabled={loading || draft.featureRoutes.length >= 50}
        onClick={() => setDraft({ ...draft, featureRoutes: [...draft.featureRoutes, { feature: "", group: "", prefix: "" }] })}>
        {__("Add article prefix", "smartcloud-commerce")}
      </Button>
      {saved.policy.featureRoutes.length > 0 && (
        <Group>
          <Button variant="default" disabled={!navigator.clipboard} onClick={() => {
            void navigator.clipboard.writeText(JSON.stringify(savedRouteMap, null, 2))
              .then(() => setCopied(true), () => setNotice(__("The path map could not be copied.", "smartcloud-commerce")));
          }}>{copied ? __("Copied", "smartcloud-commerce") : __("Copy Site Guardian path groups", "smartcloud-commerce")}</Button>
          <Text size="sm" c="dimmed">{__("Apply these groups to the same protected prefixes in Site Guardian before publishing those pages.", "smartcloud-commerce")}</Text>
        </Group>
      )}
      <Text fw={600}>{__("Protected pages and files", "smartcloud-commerce")}</Text>
      {draft.rules.map((rule, index) => (
        <Card withBorder key={index}>
          <Stack>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput
                label={__("Path", "smartcloud-commerce")}
                description={__("Use the exact page permalink path or /commerce-private-media/filename.pdf.", "smartcloud-commerce")}
                value={rule.path}
                disabled={loading}
                onChange={(event) => update(index, { path: event.currentTarget.value })}
              />
              {draft.featureRoutes.some(route => route.feature) && <Select label={__("Article feature", "smartcloud-commerce")}
                placeholder={__("Select for a premium article", "smartcloud-commerce")}
                clearable data={[...new Set(draft.featureRoutes.map(route => route.feature).filter(Boolean))]}
                value={rule.feature || null} disabled={loading} onChange={(feature) => update(index, { feature: feature ?? "" })} />}
              {!rule.feature && <Autocomplete
                label={__("Cognito group", "smartcloud-commerce")}
                data={[...new Set(byFeature.values())]}
                value={rule.group}
                disabled={loading}
                onChange={(group) => update(index, { group })}
              />}
              <NumberInput
                label={__("WordPress page ID", "smartcloud-commerce")}
                description={__("Enter 0 for a private file.", "smartcloud-commerce")}
                min={0}
                allowDecimal={false}
                value={rule.pageId}
                disabled={loading}
                onChange={(pageId) => update(index, { pageId: typeof pageId === "number" ? pageId : 0 })}
              />
            </SimpleGrid>
            <Group justify="flex-end">
              <Button variant="subtle" color="red" disabled={loading} onClick={() => setDraft({ ...draft, rules: draft.rules.filter((_, current) => current !== index) })}>
                {__("Remove rule", "smartcloud-commerce")}
              </Button>
            </Group>
          </Stack>
        </Card>
      ))}
      {notice && <Alert role="status">{notice}</Alert>}
      <Group justify="space-between">
        <Button variant="light" disabled={loading || draft.rules.length >= 100} onClick={() => setDraft({ ...draft, rules: [...draft.rules, { path: "", group: "", pageId: 0 }] })}>
          {__("Add rule", "smartcloud-commerce")}
        </Button>
        <Button loading={loading} disabled={contextIdentity(draft) === contextIdentity(saved.policy) || draft.featureRoutes.some(route => !/^[A-Za-z0-9_.-]{1,128}$/.test(route.feature) || !/^commerce-[a-z0-9][a-z0-9-]{0,118}$/.test(route.group))} onClick={() => void save()}>
          {__("Save WordPress protection", "smartcloud-commerce")}
        </Button>
      </Group>
    </Stack>
  );
}
