=== SmartCloud Commerce ===
Contributors: smartcloud
Tags: stripe, payments, subscriptions, ecommerce, access control
Requires at least: 6.9
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 1.0.0
License: MIT
License URI: https://mit-license.org/
Text Domain: smartcloud-commerce

Add Stripe pricing tables, buy buttons and sales presentations to WordPress.

== Description ==

SmartCloud Commerce provides Gutenberg blocks and settings for Stripe embeds and sales presentations. Save Stripe Pricing Table and Buy Button identifiers once, then select them in the block editor wherever you want to offer a product or subscription.

Commerce is part of the WP Suite product family by Smart Cloud Solutions, Inc. WP Suite keeps WordPress as the CMS and editing layer. Optional integrations add services for identity, content access, workflows, AI and static publishing, including services you can deploy in your own AWS account.

For documentation and setup guidance, visit [WP Suite Docs](https://wpsuite.io/docs/).

== Free and Premium Usage Notice ==

**Free manual embeds.** Use the Stripe Pricing Table and Stripe Buy Button blocks with a publishable key and embed IDs from your own Stripe account. This workflow requires no WP Suite account, paid licence, Stripe App or AWS deployment. Stripe manages the embedded components and hosted payment pages. Stripe's terms and fees apply.

**Free connected catalog.** A free WP Suite site connection through the included Hub and authorization of the free WP Suite Stripe App enable supported catalog and sales presentation workflows when the App is available. A paid WP Suite licence and a separate Commerce deployment are unnecessary for this connection. **The Stripe App is pending Stripe approval. Connecting a new Stripe account through the App may be unavailable until it is approved and published.** Manual embeds are available during this period.

**Free local protection.** WordPress protection rules can use manually managed Cognito groups with a compatible Gatey identity configuration. This local protection does not require a Commerce backend or paid WP Suite licence. Protect alternate URLs and media copies separately.

**Service-backed features.** Automatic Stripe entitlement synchronization to Cognito groups and scopes, authenticated checkout and subscription changes use a Commerce backend deployed in the customer’s AWS account. These services require WP Suite Pro or Agency and the appropriate Gatey and Cognito configuration. The plugin’s API and feature settings configure these external services. [WP Suite pricing](https://wpsuite.io/pricing/) and the separate [AWS Marketplace deployment access product](https://aws.amazon.com/marketplace/pp/prodview-6co4ozyovp2qg) describe the commercial requirements. AWS usage and Stripe charges may also apply.

== Installation ==

1. In WordPress, go to **Plugins → Add New** and install SmartCloud Commerce. For a ZIP installation, use **Upload Plugin**, select the ZIP and activate the plugin.
2. Open **SmartCloud → Commerce**. In **Stripe connection**, choose **Manual embeds** and save your Stripe publishable key.
3. In **Pricing tables** or **Buy buttons**, add the matching public IDs from your Stripe Dashboard. Use a publishable key from the same account and mode as the embeds.
4. Edit a page in Gutenberg, insert a **Stripe pricing table** or **Stripe buy button** block from the **SmartCloud Commerce** category, and choose a saved ID in the block settings. Preview the page to verify the embed before publishing.
5. To use the connected catalog when it becomes available, link your WordPress site in **SmartCloud → Overview**, then open **Commerce → Stripe connection → Connected Stripe catalog** and authorize the App.

== Machine-readable resources ==

* WP Suite AI plugin manifest: https://wpsuite.io/.well-known/ai-plugin.json
* WP Suite OpenAPI description: https://wpsuite.io/.well-known/openapi.json

These resources describe the WP Suite platform. A customer-deployed Commerce API uses the endpoint configured by that site's administrator.

== Frequently Asked Questions ==

= Do manual Stripe embeds require a paid licence or connection? =

No. Manual Pricing Table and Buy Button embeds are free and do not require the WP Suite site connection or Stripe App. Stripe's own terms and fees apply.

= Is the Stripe App free? =

Yes. The optional WP Suite site connection and Stripe App are free. Stripe approval is pending, so new App connections may be unavailable. Service-backed features have separate requirements described above.

= Does hiding a link protect a file or page? =

No. The resource server must enforce access. Configure a supported protected destination and ensure that alternate URLs and media copies are also protected.

== External Services ==

1. **Stripe embeds, Checkout and Customer Portal**
   - **When it applies:** Opening a page with a configured Stripe Pricing Table or Buy Button loads the Stripe embed. Selecting a purchase or billing action opens the relevant Stripe-hosted page.
   - **Data sent:** Embeds use the merchant's publishable key and the selected pricing table or buy button ID. Stripe can receive browser, device and connection information when its scripts load. Customers enter their contact, billing and payment details on Stripe's interface. The plugin does not collect or store card numbers.
   - **Endpoints:** `https://js.stripe.com/v3/pricing-table.js` and `https://js.stripe.com/v3/buy-button.js` for embeds. Payment Links, Checkout, Customer Portal and hosted invoices can open `buy.stripe.com`, `checkout.stripe.com`, `billing.stripe.com` and `invoice.stripe.com`, respectively.
   - **Links:** [Stripe Services Agreement](https://stripe.com/legal/ssa), [Consumer terms](https://stripe.com/legal/consumer), [Privacy policy](https://stripe.com/privacy).

2. **WP Suite platform connection**
   - **When it applies:** An administrator links the WordPress installation to a WP Suite workspace site through the Hub. The linked site then uses the platform to obtain its licence and configuration, and to read or save connected settings.
   - **Data sent:** The platform receives site and workspace identifiers, site URL or domain where needed to link the site, authentication data for the selected linking method, and the scoped site key for authorized site settings requests. Settings saves can include configuration values and revision identifiers. The platform may return licence information and encrypted configuration.
   - **Endpoints:** The configured WP Suite platform over HTTPS, normally `wpsuite.io` and `api.wpsuite.io`. Manual Stripe embed settings are saved in WordPress.
   - **Links:** [WP Suite Terms of Use](https://wpsuite.io/terms-of-use/), [Privacy Policy](https://wpsuite.io/privacy-policy/).

3. **WP Suite Stripe App and connected catalog**
   - **When it applies:** The administrator starts an optional Stripe connection from a linked WP Suite site. After approval on Stripe, opening connected settings or running a catalog action can query the connected account. Confirmed product, price or sales presentation operations may create Stripe objects such as Payment Links.
   - **Data sent:** Site administration sends the workspace ID, site ID, scoped site key, selected catalog resource, and any product, price, feature or sales presentation definitions involved in the action. Stripe sends an OAuth authorization code to the WP Suite service after the administrator authorizes the App. WP Suite exchanges the code server-side and stores the OAuth credentials encrypted. WordPress receives the connection status and public account information such as the Stripe account ID, mode and publishable key. Stripe OAuth credentials stay outside WordPress and its frontend configuration.
   - **Endpoints:** The configured WP Suite Commerce platform endpoint, the Stripe authorization page on `marketplace.stripe.com`, and server-to-server requests from the WP Suite service to `api.stripe.com` within the granted Stripe permissions.
   - **Links:** [Stripe Services Agreement](https://stripe.com/legal/ssa), [Stripe Privacy Policy](https://stripe.com/privacy), [WP Suite Terms of Use](https://wpsuite.io/terms-of-use/), [WP Suite Privacy Policy](https://wpsuite.io/privacy-policy/).

4. **Customer-configured Commerce API and AWS services**
   - **When it applies:** The administrator enables a Commerce backend and configures authenticated checkout, automatic entitlements or subscription management. Local WordPress protection with manually managed Cognito groups does not require this backend. Optional services include AWS EventBridge for Stripe events, Amazon Cognito for identity and group membership, and Amazon SES or a configured adapter for customer email.
   - **Data sent:** Signed-in visitors' requests can send a Gatey/Cognito access token, offer or subscription identifiers, a site-defined subject identifier, and an allowed return URL to the configured API. The backend uses those values to authorize the operation and, when needed, sends purchase or subscription references to Stripe. Stripe events can supply customer, product, price, subscription and entitlement identifiers to the backend for access updates. Where email delivery is enabled, the configured provider receives the customer's email address and rendered notification content.
   - **Endpoints:** The administrator's HTTPS Commerce API, selected by direct URL or a named Gatey API. An AWS deployment can also call the operator's regional AWS endpoints and services. The operator controls its backend, data handling and privacy notices.
   - **Links:** [AWS Customer Agreement](https://aws.amazon.com/agreement/), [AWS Service Terms](https://aws.amazon.com/service-terms/), [AWS Privacy Notice](https://aws.amazon.com/privacy/).

5. **Amazon Cognito identity**
   - **When it applies:** An administrator explicitly uses WP Suite Hub sign-in, Gatey, or configured customer identity. Manual Stripe embeds do not automatically invoke Cognito.
   - **Data sent:** Sign-in and registration can send credentials, authentication challenge responses and requested user attributes to the configured identity service. The browser receives tokens and group claims for authenticated operations; tokens may be sent to configured protected APIs. Server-side token verification fetches public signing keys from Cognito, not user credentials.
   - **Endpoints:** The configured regional `cognito-idp` and `cognito-identity` AWS endpoints and, when configured, the managed login domain such as `*.auth.<region>.amazoncognito.com`. The bundled AWS SDK contains endpoint and partition metadata for many regions; this list is not a record of network requests.
   - **Links:** [Amazon Cognito](https://aws.amazon.com/cognito/), [AWS Customer Agreement](https://aws.amazon.com/agreement/), [AWS Service Terms](https://aws.amazon.com/service-terms/), [AWS Privacy Notice](https://aws.amazon.com/privacy/).

6. **Google reCAPTCHA**
   - **When it applies:** If the shared WP Suite settings enable reCAPTCHA and a plugin requests its frontend provider, the browser loads Google’s reCAPTCHA service. This is optional and is not required for manual Stripe embeds.
   - **Data sent:** Google receives browser and connection information and the configured site key; interactions can request a verification token.
   - **Endpoints and links:** Google reCAPTCHA or, if configured, `recaptcha.net`; [About reCAPTCHA](https://www.google.com/recaptcha/about/), [Google Terms](https://policies.google.com/terms), [Google Privacy](https://policies.google.com/privacy).

7. **Administrator-configured stylesheets**
   - **When it applies:** If an administrator configures validated HTTP(S) or site-relative stylesheet URLs in shared WP Suite settings, the browser requests those URLs as stylesheet links where the configured styles are loaded.
   - **Data sent:** The stylesheet host receives the browser’s connection information, including its IP address. The destination and its terms and privacy policy depend on the URL chosen by the administrator.

== Trademark Notice ==

Stripe is a trademark of Stripe, Inc. WordPress is a trademark of the WordPress Foundation. Amazon Web Services, AWS, Amazon Cognito, and Amazon SES are trademarks of Amazon.com, Inc. or its affiliates. This plugin is not affiliated with or endorsed by Stripe, Amazon Web Services, or the WordPress Foundation.

== Screenshots ==

1. Commerce setup in the WordPress admin.
2. Manage Stripe Pricing Table IDs for reusable embeds.
3. Configure a Commerce block in the Gutenberg editor.

== Source & Build ==

**Public Commerce source.** The [SmartCloud Commerce GitHub repository](https://github.com/smartcloudsol/commerce) contains the readable free source, dependency manifests and build instructions. The installable ZIP also includes readable JavaScript and TypeScript source and build inputs under `source/`. See the repository README for the free build and packaging commands.

**Shared WP Suite Hub.** The Hub handles site connections, licence and configuration delivery, and shared WordPress admin components. Its [source and build tools are on GitHub](https://github.com/smartcloudsol/hub-for-wpsuiteio). WordPress loads the bundled Hub from `smartcloud-wpsuite/`.

== Changelog ==

= 1.0.0 =
* Initial release.
