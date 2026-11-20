# WordPress protection

Enable this in **Commerce → WordPress protection** to serve private WordPress Pages and files to subscribers. It uses the selected backend profile's default Gatey Cognito pool. Use each Stripe feature's managed Cognito group from **Feature access** when setting up the routes.

## Enable and test

1. Configure Gatey on an HTTPS site. Make its sign-in page public and set its path in Gatey.
2. Set the WordPress Page's visibility to **Private**. Copy its permalink path, including any trailing slash. Add the path, page ID and required `commerce-…` group in the Commerce settings.
3. If using protected files, configure `SMARTCLOUD_COMMERCE_PRIVATE_MEDIA_DIR` in `wp-config.php` to an absolute directory outside WordPress and the web server document root. Place the file there and link to `/commerce-private-media/<relative-file-path>`. Add that path with page ID `0` and its own group. Use letters, digits, hyphens, underscores and dots in route segments. Existing uploads must be moved out of public storage and old copies removed before linking to the private route.
4. Exclude the protected URLs from reverse proxy and full-page caches and purge previously public copies. Enable WordPress protection and save.
5. In a browser without a WordPress editor session, open the directly protected URL. Sign in through Gatey with an eligible account and check the page and its files. Also try an ineligible account and an anonymous window.

Gatey access tokens are verified server-side. A successful check creates a secure HttpOnly cookie valid for at most two minutes and never beyond the access token expiry. The gate requests a fresh token when it needs a new session. WordPress editors retain normal private-page preview access. Each path has one required group and private file rules apply to their exact file.

## Public teaser with a subscriber article

1. Map the Stripe Product Feature to a Cognito group under **Feature access**.
2. Under **WordPress protection → Article paths**, select that feature and save a prefix such as `/basic`. Keep the prefix distinct from the other paid tiers.
3. Create a **Private** WordPress Page for the full article. Use the normal page hierarchy to place its permalink under the prefix, for example `/basic/story/`. Add a protected page rule for that permalink and page ID and select the article feature. Commerce uses the group's value from the feature route.
4. On the public teaser page, include only the text and images you want visitors to see. Add the **Read full article** block and select the private page. Use a separate **Checkout button** or **Sales presentation** block to offer subscriptions next to the link.
5. For static delivery, copy the saved Site Guardian path groups and apply them to the same prefixes in the Site Guardian stack before deploying any of the complete articles. Retest the direct file paths at the destination after a change to the feature's group.

The teaser and full article have separate WordPress records. The link stores the ID only. The private Page stays outside the existing public Knowledge Sync source set. A protected KB projection for these private Pages needs its own compatible ingestion capability.

With the Commerce switch off, public Pages follow normal WordPress behavior and the standard Publisher crawl needs no Commerce credentials. The WordPress visibility of existing private Pages is preserved. WordPress, CloudFront and Knowledge Base protection apply at their respective serving points.

## Export while WordPress protection is enabled

1. Configure the destination's Site Guardian protection and verify it before deploying paid content. Include each exported page path and its direct output-file aliases, and every private media route. Use an origin restricted to CloudFront. Keep local export files in a directory unavailable to web visitors.
2. Generate a dedicated 32-byte random secret encoded as 64 lowercase hexadecimal characters. Set `SMARTCLOUD_COMMERCE_PUBLISHER_SECRET` in WordPress server configuration and supply the same value as an environment secret to the Exporter process for this source. The source must use verified HTTPS and expose the WordPress REST API under `/wp-json`. Keep the value out of publisher JSON snapshots, WordPress admin settings and command history.
3. Turn on **Allow authenticated Static Publisher renders** in Commerce. Start a crawl with the updated local Exporter. Select `--local-render` if the publishing configuration normally uses Lambda rendering.
4. Check the exported files and deploy to the prepared Site Guardian target. Verify access with and without the matching group at the target, including direct file URLs.

The Exporter exchanges its server credential for a two-minute lease. It adds the lease only to GET and HEAD requests on the configured paths at the exact source origin. It seeds the protected routes on a full-site crawl, renews the lease if needed and releases it when the run ends. A stopped process leaves the lease valid only until expiration. A protected response must carry proof from the active WordPress policy to be accepted. Remote Lambda render workers receive no Commerce lease.

If a source has additional HTTP authentication at the proxy, configure the Publisher's source access so the lease endpoint and the protected requests reach WordPress. Commerce cannot authorize a request that the proxy rejects before PHP.

For CloudFront login recovery, configure Gatey's sign-in hook for the Site Guardian's same-origin HTTPS `/issue-cookie?action=signin` endpoint. With a compatible Gatey and Guardian, a protected return can refresh the existing Cognito session and obtain a cookie for the authorized destination without a second sign-in.
