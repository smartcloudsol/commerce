# SmartCloud Commerce source

From the packaged `source/` directory,
install dependencies with `npm ci --ignore-scripts`, then run `npm run build`.
The Node and npm versions used for this build are Node 24 and npm 11.
The three outputs are `main/dist`, `admin/dist`, and `blocks/dist`; the installed
plugin uses their contents in its `main/`, `admin/`, and `blocks/` directories.
WordPress supplies React and WordPress packages; the shared Hub supplies the
Mantine, Amplify and cryptography globals. The family assembler supplies that Hub
payload for a complete distributable. Its source is available in the
`wpsuite-admin`, `wpsuite-main` and vendor modules of
[WP Suite Hub](https://github.com/smartcloudsol/hub-for-wpsuiteio). Commerce source is available in the [SmartCloud Commerce repository](https://github.com/smartcloudsol/commerce).
The full development workspace also has `npm test`; its test harness is excluded
from the installed ZIP. Readable Commerce source and the build lockfile are
included.

The default build is Free. It includes the Stripe connection, catalog, sales
presentations, manual embeds and local WordPress protection with manually managed Cognito groups. The public source and review ZIP omit
`admin/src/paid-features`. The private demo build loads its Pro settings,
subscription rules and email editor as separate admin chunks. Set
`WPSUITE_PREMIUM=true` only in the private workspace with those sources available.
The backend verifies authenticated requests for Commerce services.

Stripe embed identifiers are local public settings. Commerce service configuration is stored in the connected workspace site and delivered through verified WP Suite configuration. Mappings are reference configuration; saving them does not reconcile the effective access policy. Protected resources must enforce authorization server-side. See the plugin root's `readme.txt` for external-service and privacy disclosures.

## Getting started

The Hub's simplified Commerce page offers three steps: choose how to sell, configure the selected connection, and add the result to a page. **Use existing embeds** needs only a publishable key and one or more Stripe buy button and/or pricing table IDs; it works without a connected WP Suite site. These IDs are copied from Stripe and remain available in the corresponding Gutenberg blocks.

**Use connected catalog** uses the existing Hub site connection, including delegated site-key administration. Missing site connections lead to the Hub overview; Commerce never adds another WP Suite sign-in. Existing Stripe authorization is detected automatically. Products, prices and product features populate the available choices automatically, with an explicit Refresh catalog action for retries and later changes. Loading choices does not select prices or create a sales draft.

The starter builder creates a Payment Link button or pricing table from explicitly selected prices. It supports one active fixed monthly, yearly or one-time price per product. Preview, Save draft and confirmed Publish are separate actions. Publish provisions the required Stripe objects for the **entire saved sales draft**, not a WordPress page. After publication, insert the **Sales presentation** block and select the saved presentation. Existing plans, rules and notification settings are retained; products already used by a saved plan are managed through Advanced settings. Access features, protected Checkout, upgrade/downgrade rules and email configuration remain in the detailed settings. Marketing feature text never grants access.
## WordPress route protection

Local WordPress protection uses server-side authorization with a compatible Gatey and Cognito configuration. Administrators can assign Cognito groups manually without a Commerce backend or paid WP Suite licence. Automatic synchronization of Stripe entitlements to Cognito groups and scopes requires the separately configured Commerce backend in the customer’s AWS account. Ensure alternate URLs and media copies are protected separately.

# Frontend CSS hooks

These classes are presentation hooks. They do not grant access or select a checkout offer. Use your theme stylesheet or WordPress Additional CSS; keep the classes when editing an inserted pattern. Pattern content contains the structural classes, while runtime controls gain their hooks when rendered. Existing Gutenberg saved markup remains compatible.

| Element | CSS class |
| --- | --- |
| Pricing section, heading, introduction | `sc-commerce-plans`, `sc-commerce-plans-title`, `sc-commerce-plans-description` |
| Plan grid and column | `sc-commerce-plan-grid`, `sc-commerce-plan-column` |
| Card and featured card | `sc-commerce-plan`, `sc-commerce-plan-featured` |
| Plan title, name, separate price | `sc-commerce-plan-title`, `sc-commerce-plan-name`, `sc-commerce-plan-price` |
| Plan description | `sc-commerce-plan-description` |
| Marketing list, item, check marker | `sc-commerce-plan-features`, `sc-commerce-plan-feature`, `sc-commerce-plan-feature::marker` |
| Card action area | `sc-commerce-plan-action` |
| Action wrapper | `sc-commerce-control` |
| Button, checkout button, portal button | `sc-commerce-button`, `sc-commerce-button-checkout`, `sc-commerce-button-portal` |
| Button label and loading/error message | `sc-commerce-button-label`, `sc-commerce-action-status` |
| Account panel, heading, description | `sc-commerce-account`, `sc-commerce-account-title`, `sc-commerce-account-description` |
| Access display and protected link container | `sc-commerce-status`, `sc-commerce-entitlements`, `sc-commerce-protected` |
| Available resource link | `sc-commerce-resource-link` |
| Stripe embed host, table, buy button | `sc-commerce-stripe-embed`, `sc-commerce-stripe-pricing-table`, `sc-commerce-stripe-buy-button` |

The separate name/price hooks apply when those are separate elements, as in the pricing pattern. A combined title and price remains one title element. WordPress's existing `wp-block-*`, custom classes and native style attributes are retained. The button-label span is added by the frontend runtime. Stripe controls styling inside its hosted/embed component; the host classes style its placement, not Stripe's internal UI.

Marketing features default to 0.875em text, 1.45 line height and 0.25em spacing. Override the variables without increasing CSS specificity:

```css
.sc-commerce-plans {
  --sc-commerce-feature-font-size: 14px;
  --sc-commerce-feature-line-height: 1.4;
  --sc-commerce-feature-gap: 0.2em;
}
.sc-commerce-plan-feature::marker { color: #16834a; }
.sc-commerce-button-checkout { border-radius: 999px; }
```


## Guided Commerce setup (development)

The Free **Stripe connection** page supports manual embeds or a linked WP Suite site's OAuth connection. Site administration uses the Hub’s existing workspace/site/site-key connection, exactly as the shared Pro configuration transport does. Agency clients do not need workspace membership or another login. An unconnected site links to the Hub overview. Gatey remains the separate customer runtime identity; Stripe OAuth credentials stay on the backend. Only Stripe authorization opens an authorization window.

**Plans and prices** and **Sales presentations** use the shared `main/src/experience.js` schema. Create a family, select existing products/prices or use the explicit product-creation wizard, and select payment-link or authenticated checkout flow. Draft saves do not write Stripe. Preview verifies actual catalog objects. Publish provisions append-only Payment Links and per-family portal configurations. Protected Checkout publication waits for the runtime's hash-checked policy acknowledgement; its acknowledgement is atomically fenced against the canonical Commerce configuration revision. The runtime keeps a durable prepared marker and activates only after that acknowledgement succeeds. During an uncertain acknowledgement, previous access continues while new purchases/billing changes wait; use Synchronize Commerce backend to complete recovery. New drafts never rewrite the active policy.

The **Sales presentation** Gutenberg block stores only a presentation ID and renders a strict, public local snapshot. The **Subscription management** block renders a context-fenced preview/confirm UI. Existing six save formats and native patterns are unchanged. Product marketing features remain editable display text, distinct from access features.

New account hooks include `sc-commerce-subscriptions`, `sc-commerce-subscription`, `sc-commerce-subscriptions-status`, `sc-commerce-subscription-action`, `sc-commerce-change-preview`, `sc-commerce-payment-link`, and default `sc-commerce-subscription-p`/`sc-commerce-subscription-h3` text hooks. Native custom classes and global styles continue to apply.

The initial managed billing adapter supports fixed licensed quantity-one single-item subscriptions with the same currency and interval. Taxes, discounts, external schedules and other complex settings fail closed. It creates at most two phases for a period-end change, keeps the current price until the boundary and releases the schedule after the target phase. Only a schedule carrying this deployment/customer's ownership markers can be undone. If a provider write becomes uncertain (including a migrated schedule whose second step failed), its one-use intent remains review-only; do not start another change until Stripe is inspected. External Dashboard changes can still race Stripe's non-transactional subscription API.

Notification profiles require a qualified server-side adapter ARN on the standalone Commerce extension. The reference SES adapter uses an already verified sender and scoped IAM permissions. Seven lifecycle templates are derived from retrieved Stripe events, not page visits or user-submitted payment states. No historical welcome blast is emitted when notifications are enabled. Durable outbox retries only definite rejections; ambiguous delivery is held for operator review. No real email is sent by installing the WordPress plugin.

The contract copy in Foundation is checked with `node scripts/sync-experience-contract.cjs`; use `--write` only when deliberately updating the canonical contract. Runtime policies support more currencies than the initial guided UI only when configured independently; the guided UI currently accepts the 32 explicit currencies in `main/src/money.cjs`, including Stripe's ISK/UGX minor-unit rules.

Stripe App source version **0.0.2** requests product/price/Payment Link/subscription writes and invoice previews. Existing 0.0.1 installations require an explicit version upgrade and renewed authorization before these operations can succeed. These source features do not by themselves establish deployment or sandbox E2E acceptance.

The Commerce **1.0.0** release candidate carries Hub **2.7.15**; final package qualification remains necessary. The Hub's ordinary version and ownership updates preserve the site's connection.

Before Commerce is submitted for approval, the shared Hub changes must also be incorporated into Gatey, AI-Kit, Flow, Static Publisher and Agent Composer, with canonical rebuilds and complete Plugin Check coverage for every package. See `docs/RELEASE-CHECKLIST.md`; the private demo update does not replace this release gate.

The Free and private demo builds use the registered Hub connection for Stripe administration. They use WP Suite Core's backend-profile checks and the current site's scoped key for requests to the configured Commerce service.


## Commerce email templates (private service editor)

This section describes the separately distributed private service editor and configured Commerce API. The public Free build does not provide a local HTML email template editor.

Configure delivery in the Commerce Cloud Deployment stack: either select the built-in SES adapter with an already verified sender identity in the deployment account and region, or supply a qualified external notification adapter ARN. The wizard exports the matching parameters. No Stripe credentials or additional Quick Launch secret entries are required for email setup.

The built-in adapter creates a private, encrypted, versioned S3 bucket. It seeds English and Hungarian defaults for subscription start/end, scheduled/undone cancellation, and scheduled/undone/applied plan changes. Stack updates seed only missing defaults; saved overrides are retained. Existing delivery attempts keep their first rendered snapshot when retrying.

In **Sales setup → Emails**, use the existing Commerce API connection to edit subject, HTML and plain text. The visual editor displays supported variables as pills; HTML source remains available. Select an event and language, edit, preview, then choose **Save email template**. The save uses a revision check: if another administrator saved first, keep or copy your draft and reload the current version. Template saves are separate from **Save draft / Publish**, which applies notification enablement, default language, sender display name and reply-to preferences.

Supported variables: `{{senderName}}`, `{{planName}}`, `{{previousPlanName}}`, `{{nextPlanName}}`, `{{effectiveDate}}`, `{{billingUrl}}`. Preview uses example values in an isolated frame and does not send email. The From address and verified sender identity are deployment settings. Template content stays in the private backend and is not copied to public Pro configuration.

Connected Stripe catalog operations do not require a manually entered publishable key. For native Stripe embeds, switch to **Manual embeds** and use **Use connected Stripe key** or enter the key manually, then save local settings. The copy action only fills the unsaved local form.
