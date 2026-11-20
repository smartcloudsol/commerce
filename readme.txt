=== SmartCloud Commerce ===
Contributors: smartcloudsolutions
Requires at least: 6.9
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 1.0.0
License: MIT
License URI: https://opensource.org/license/mit

Add Stripe pricing tables, buy buttons and sales presentations to WordPress.

== Description ==

SmartCloud Commerce provides Gutenberg blocks and settings for Stripe embeds and sales presentations. Add Stripe Pricing Tables and Buy Buttons using public identifiers copied from Stripe. Manual embeds are free and do not require a WP Suite site connection or the Stripe App. Stripe account and transaction charges may apply under Stripe's terms.

Optionally connect a WP Suite site for free through the included WP Suite Hub and connect Stripe using the free WP Suite Stripe App. This enables supported catalog and sales presentation workflows without placing Stripe secret keys in WordPress. The connection and app do not require a paid WP Suite licence or a customer Commerce deployment. A Stripe account and authorization are required. You can continue to use manual identifiers without connecting.

WP Suite Pro or Agency and a separately configured Commerce service are required for service-backed settings and features such as authenticated checkout, entitlement mappings, subscription management and protected content. There is no separate Commerce licence. Hosting, deployment, AWS, Stripe and other third-party service costs may apply. See https://wpsuite.io/pricing/ for current plan details.

Stripe controls the appearance inside its embedded components. Public embeds alone do not provide authenticated customer binding or protect content. Protected resources require server-side enforcement and an appropriately configured service.

== Installation ==

1. Install and activate SmartCloud Commerce.
2. In Commerce settings, add a Stripe publishable key and the public IDs of the pricing tables or buy buttons you want to use.
3. Add the matching Commerce block in the WordPress editor and choose an allowed ID.
4. Optionally connect your WP Suite site and Stripe account to use supported connected workflows.

== Frequently Asked Questions ==

= Do manual Stripe embeds require a paid licence or connection? =

No. Manual Pricing Table and Buy Button embeds are free and do not require the WP Suite site connection or Stripe App. Stripe's own terms and fees apply.

= Is the Stripe App free? =

Yes. The optional WP Suite site connection and Stripe App are free. Service-backed features have separate requirements as described above.

= Does hiding a link protect a file or page? =

No. The resource server must enforce access. Configure a supported protected destination and ensure that alternate URLs and media copies are also protected.

== External services ==

Stripe Pricing Table and Buy Button blocks load scripts from js.stripe.com and communicate with Stripe when a visitor opens a page containing them. Checkout and billing portal links redirect visitors to Stripe. Stripe may receive browser, transaction and payment information. These services are provided by Stripe under its [terms](https://stripe.com/legal/consumer) and [privacy policy](https://stripe.com/privacy).

The optional WP Suite site connection sends the site identifier, scoped site key, settings and revision to the configured WP Suite platform. The optional Stripe connection sends workspace and site identifiers and the scoped site key to the configured WP Suite Commerce service. Confirmed catalog and publication operations send their definitions to that service. The service stores encrypted Stripe OAuth credentials. These services are provided by WP Suite under its [terms](https://wpsuite.io/terms-of-use/) and [privacy policy](https://wpsuite.io/privacy-policy/).

An administrator may configure a separate Commerce API. When a signed-in visitor makes an entitlement or checkout request, the Gatey access token is sent to that API. Its operator controls its authorization and privacy practices. Optional confirmation emails use a customer's email address through the site operator's configured delivery adapter.

If the site operator deploys that service in their AWS account, AWS hosts the configured API and processes its requests. The deployment can also use Amazon Cognito for access verification and Amazon SES for optional emails. AWS provides these services under its [customer agreement](https://aws.amazon.com/agreement/) and [privacy notice](https://aws.amazon.com/privacy/). Manual Stripe embeds do not require an AWS deployment.

Stripe is a trademark of Stripe, Inc. WordPress is a trademark of the WordPress Foundation. Amazon Web Services, AWS, Amazon Cognito, and Amazon SES are trademarks of Amazon.com, Inc. or its affiliates. This plugin is not affiliated with or endorsed by Stripe, Amazon Web Services, or the WordPress Foundation.

== Screenshots ==

1. Commerce setup in the WordPress admin.
2. Manage Stripe Pricing Table IDs for reusable embeds.
3. Configure a Commerce block in the Gutenberg editor.

== Source and build ==

Readable JavaScript and TypeScript source and build instructions are included in source/. The shared WP Suite Hub source is maintained at https://github.com/smartcloudsol/smartcloud-wpsuite.

== Changelog ==

= 1.0.0 =
* Initial release.
