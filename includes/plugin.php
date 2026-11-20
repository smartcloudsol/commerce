<?php
namespace SmartCloud\WPSuite\Commerce;
require_once __DIR__ . '/storefront.php';
final class Plugin {
    public static function profileContext(): ?array {
        $context = apply_filters('smartcloud_wpsuite_backend_profile_context', null);
        if ($context === null) return null;
        if (!is_array($context) || !in_array($context['id'] ?? '', ['production', 'development'], true) || !is_int($context['bindingRevision'] ?? null) || $context['bindingRevision'] < 1 || !is_int($context['generation'] ?? null) || $context['generation'] < 1) throw new \RuntimeException('Invalid Commerce backend profile context');
        return ['id' => $context['id'], 'bindingRevision' => $context['bindingRevision'], 'generation' => $context['generation']];
    }
    public static function optionForContext(?array $context): string {
        if ($context === null) return 'smartcloud-commerce/settings';
        return 'smartcloud-commerce/settings/' . $context['id'] . '/bindings/' . $context['bindingRevision'];
    }
    public static function optionName(): string { return self::optionForContext(self::profileContext()); }
    public static function settingsForContext(?array $context): array { $value = get_option(self::optionForContext($context), []); return is_array($value) ? array_intersect_key($value, array_flip(['publishableKey', 'pricingTableId', 'buyButtonId', 'pricingTableIds', 'buyButtonIds', 'storefront'])) : []; }
    public static function settings(): array { return self::settingsForContext(self::profileContext()); }
    public static function readSettings(): array { $profile = self::profileContext(); return ['settings' => self::settingsForContext($profile), 'profile' => $profile]; }
    private static function sameProfile($submitted, ?array $current): bool {
        if ($current === null) return $submitted === null;
        if (!is_array($submitted) || count($submitted) !== count($current)) return false;
        foreach ($current as $key => $value) {
            if (!array_key_exists($key, $submitted) || $submitted[$key] !== $value) return false;
        }
        return true;
    }
    public static function saveSettings($request) {
        $body = $request->get_json_params();
        $current = self::profileContext();
        if (!is_array($body) || !array_key_exists('profile', $body) || !self::sameProfile($body['profile'], $current) || !is_array($body['settings'] ?? null)) {
            return new \WP_Error('commerce_profile_changed', __('The backend profile changed. Reload before saving.', 'smartcloud-commerce'), ['status' => 409]);
        }
        if (array_diff(array_keys($body['settings']), ['publishableKey', 'pricingTableId', 'buyButtonId', 'pricingTableIds', 'buyButtonIds', 'storefront'])) return new \WP_Error('commerce_remote_settings_required', __('Commerce service settings are managed in WP Suite.', 'smartcloud-commerce'), ['status' => 400]);
        if (array_key_exists('storefront', $body['settings'])) { try { Storefront::parse($body['settings']['storefront']); } catch (\Throwable $e) { return new \WP_Error('commerce_invalid_storefront', __('Invalid storefront.', 'smartcloud-commerce'), ['status' => 400]); } }
        foreach (['pricingTableIds' => 'prctbl_', 'buyButtonIds' => 'buy_btn_'] as $key => $prefix) {
            if (array_key_exists($key, $body['settings']) && !self::validIds($body['settings'][$key], $prefix)) return new \WP_Error('commerce_invalid_ids', __('Invalid Stripe IDs.', 'smartcloud-commerce'), ['status' => 400]);
        }
        $settings = self::sanitize(array_replace(self::settingsForContext($current), $body['settings']));
        update_option(self::optionForContext($current), $settings, false);
        return rest_ensure_response(['settings' => $settings, 'profile' => $current]);
    }
    public static function validIds($ids, string $prefix): bool {
        if (!is_array($ids) || !array_is_list($ids) || count($ids) > 100 || count(array_unique($ids, SORT_REGULAR)) !== count($ids)) return false;
        foreach ($ids as $id) if (!is_string($id) || strlen($id) > 200 || !preg_match('/^' . preg_quote($prefix, '/') . '[A-Za-z0-9]+$/D', $id)) return false;
        return true;
    }
    public static function validPaymentLinkUrl($url): bool {
        if (!is_string($url) || strlen($url) > 2048 || preg_match('/[\x00-\x20\x7f\\\\]/', $url)) return false;
        $parts = wp_parse_url($url);
        return is_array($parts) && ($parts['scheme'] ?? '') === 'https' && ($parts['host'] ?? '') === 'buy.stripe.com' && !isset($parts['port']) && !isset($parts['user']) && !isset($parts['pass']) && !isset($parts['fragment']);
    }
    public static function allowedIds(array $settings, string $key, string $legacy, string $prefix): array {
        if (array_key_exists($key, $settings)) return self::validIds($settings[$key], $prefix) ? $settings[$key] : [];
        $value = $settings[$legacy] ?? '';
        return self::validIds([$value], $prefix) ? [$value] : [];
    }
    public static function stripeBlockAllowed(array $block, array $settings): bool {
        $name = $block['blockName'] ?? '';
        if (!in_array($name, ['smartcloud-commerce/stripe-pricing-table', 'smartcloud-commerce/stripe-buy-button'], true)) return true;
        $pricing = $name === 'smartcloud-commerce/stripe-pricing-table';
        $ids = self::allowedIds($settings, $pricing ? 'pricingTableIds' : 'buyButtonIds', $pricing ? 'pricingTableId' : 'buyButtonId', $pricing ? 'prctbl_' : 'buy_btn_');
        return in_array($block['attrs']['value'] ?? '', $ids, true);
    }
    public static function renderStripeBlock(string $content, array $block, array $settings): string {
        $name = $block['blockName'] ?? '';
        if (!in_array($name, ['smartcloud-commerce/stripe-pricing-table', 'smartcloud-commerce/stripe-buy-button'], true)) return $content;
        $key = $settings['publishableKey'] ?? '';
        if (!self::stripeBlockAllowed($block, $settings) || !is_string($key) || !preg_match('/^pk_(?:test|live)_[A-Za-z0-9]+$/D', $key)) return '';
        $pricing = $name === 'smartcloud-commerce/stripe-pricing-table';
        $tag = $pricing ? 'stripe-pricing-table' : 'stripe-buy-button';
        $idAttribute = $pricing ? 'pricing-table-id' : 'buy-button-id';
        $id = $block['attrs']['value'];
        $customClass = $block['attrs']['className'] ?? '';
        if (!is_string($customClass) || strlen($customClass) > 2048 || preg_match('/[\x00-\x1f\x7f]/', $customClass)) $customClass = '';
        $classes = 'wp-block-smartcloud-commerce-' . $tag . ' sc-commerce-stripe-embed sc-commerce-' . $tag . ($customClass !== '' ? ' ' . $customClass : '');
        return '<' . $tag . ' class="' . esc_attr($classes) . '" ' . $idAttribute . '="' . esc_attr($id) . '" publishable-key="' . esc_attr($key) . '"></' . $tag . '>';
    }
    public static function presentationHooks(string $content, array $block): string {
        $classes = match ($block['blockName'] ?? '') {
            'smartcloud-commerce/checkout-button' => ['sc-commerce-button', 'sc-commerce-button-checkout'],
            'smartcloud-commerce/customer-portal-button' => ['sc-commerce-button', 'sc-commerce-button-portal'],
            'smartcloud-commerce/current-entitlements' => ['sc-commerce-status', 'sc-commerce-entitlements'],
            'smartcloud-commerce/protected-content' => ['sc-commerce-status', 'sc-commerce-protected'],
            default => [],
        };
        if (!$classes || !class_exists('WP_HTML_Tag_Processor')) return $content;
        $html = new \WP_HTML_Tag_Processor($content);
        if ($html->next_tag()) foreach ($classes as $class) $html->add_class($class);
        return $html->get_updated_html();
    }
    public static function sanitize($raw): array {
        if (!is_array($raw)) return [];
        $out = [];
        $out['publishableKey'] = preg_match('/^pk_(?:test|live)_[A-Za-z0-9]+$/D', (string) ($raw['publishableKey'] ?? '')) ? $raw['publishableKey'] : '';
        foreach (['pricingTableId','buyButtonId'] as $key) $out[$key] = preg_match('/^[A-Za-z0-9_\-]{0,200}$/D', (string) ($raw[$key] ?? '')) ? (string) ($raw[$key] ?? '') : '';
        foreach (['pricingTableIds' => 'prctbl_', 'buyButtonIds' => 'buy_btn_'] as $key => $prefix) if (array_key_exists($key, $raw)) $out[$key] = self::validIds($raw[$key], $prefix) ? $raw[$key] : [];
        if (array_key_exists('storefront', $raw)) $out['storefront'] = Storefront::parse($raw['storefront']);
        return $out;
    }
    public static function permission($request): bool { return current_user_can('manage_options') && (bool) wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest'); }
    public static function routes(): void {
        register_rest_route('smartcloud-commerce/v1', '/settings', [
            ['methods' => 'GET', 'permission_callback' => [self::class, 'permission'], 'callback' => static fn() => rest_ensure_response(self::readSettings())],
            ['methods' => 'POST', 'permission_callback' => [self::class, 'permission'], 'callback' => [self::class, 'saveSettings']],
        ]);
    }
    public static function assets(string $module, array $deps = []): void {
        $root = dirname(__DIR__);
        $relative = file_exists("$root/$module/index.js") ? "$module/index" : "$module/dist/index";
        if (!file_exists("$root/$relative.js")) return;
        $asset = file_exists("$root/$relative.asset.php") ? include "$root/$relative.asset.php" : ['dependencies' => [], 'version' => '1.0.0'];
        $plugin = $root . '/smartcloud-commerce.php';
        wp_enqueue_script('smartcloud-commerce-' . $module, plugins_url($relative . '.js', $plugin), array_unique(array_merge($deps, $asset['dependencies'] ?? [])), $asset['version'] ?? '1.0.0', true);
        if ($module !== 'main' && file_exists("$root/$relative.css")) wp_enqueue_style('smartcloud-commerce-' . $module, plugins_url($relative . '.css', $plugin), [], $asset['version'] ?? '1.0.0');
    }
    public static function enqueueFrontendStyle(): void {
        $root = dirname(__DIR__); $relative = file_exists("$root/main/index.css") ? 'main/index' : 'main/dist/index';
        if (!file_exists("$root/$relative.css")) return;
        $asset = file_exists("$root/$relative.asset.php") ? include "$root/$relative.asset.php" : [];
        wp_enqueue_style('smartcloud-commerce-main', plugins_url($relative . '.css', $root . '/smartcloud-commerce.php'), [], $asset['version'] ?? '1.0.0');
    }
    public static function registerBlockCategory(array $categories, \WP_Block_Editor_Context $context): array {
        $categories[] = ['slug' => 'smartcloud-commerce', 'title' => __('SmartCloud Commerce', 'smartcloud-commerce'), 'icon' => null];
        return $categories;
    }
    public static function registerBlocks(): void {
        foreach (['stripe-pricing-table', 'stripe-buy-button', 'checkout-button', 'customer-portal-button', 'current-entitlements', 'protected-content', 'subscription-management'] as $name) {
            $button = in_array($name, ['checkout-button', 'customer-portal-button'], true);
            $presentation = $button || in_array($name, ['current-entitlements', 'protected-content', 'subscription-management'], true);
            register_block_type('smartcloud-commerce/' . $name, ['api_version' => 3, 'category' => 'smartcloud-commerce', 'attributes' => [
                'value' => ['type' => 'string', 'default' => ''], 'label' => ['type' => 'string', 'default' => ''],
                'publishableKey' => ['type' => 'string', 'default' => ''], 'requiredGroups' => ['type' => 'string', 'default' => ''],
            ] + ($name === 'checkout-button' ? ['paymentLinkUrl' => ['type' => 'string', 'default' => '']] : []) + ($button ? ['width' => ['type' => 'string', 'default' => 'auto', 'enum' => ['auto', 'full']]] : []),
                'supports' => $presentation ? ['color' => ['background' => true, 'text' => true], 'spacing' => ['margin' => true, 'padding' => true], 'typography' => ['fontSize' => true], '__experimentalBorder' => ['radius' => true, 'style' => true, 'color' => true, 'width' => true]] : [],
            ]);
            if ($presentation) {
                register_block_style('smartcloud-commerce/' . $name, ['name' => $button ? 'fill' : 'card', 'label' => $button ? __('Fill', 'smartcloud-commerce') : __('Card', 'smartcloud-commerce'), 'is_default' => true]);
                register_block_style('smartcloud-commerce/' . $name, ['name' => $button ? 'outline' : 'subtle', 'label' => $button ? __('Outline', 'smartcloud-commerce') : __('Subtle', 'smartcloud-commerce')]);
            }
        }
        register_block_type('smartcloud-commerce/sales-presentation', ['api_version' => 3, 'category' => 'smartcloud-commerce', 'attributes' => ['presentationId' => ['type' => 'string', 'default' => '']], 'supports' => ['color' => ['background' => true, 'text' => true], 'spacing' => ['margin' => true, 'padding' => true], 'typography' => ['fontSize' => true], '__experimentalBorder' => ['radius' => true, 'style' => true, 'color' => true, 'width' => true]], 'render_callback' => [Storefront::class, 'render']]);
        register_block_type('smartcloud-commerce/article-link', [
            'api_version' => 3,
            'category' => 'smartcloud-commerce',
            'attributes' => ['pageId' => ['type' => 'string', 'default' => ''], 'label' => ['type' => 'string', 'default' => '']],
            'render_callback' => [WordPressProtection::class, 'renderArticleLink'],
        ]);
    }
    public static function init(): void {
        add_filter('block_categories_all', [self::class, 'registerBlockCategory'], 20, 2);
        self::registerBlocks();
        require_once __DIR__ . '/patterns.php';
        Patterns::register();
        add_action('enqueue_block_assets', static function () {
            if (is_admin() && wp_should_load_block_editor_scripts_and_styles()) self::enqueueFrontendStyle();
        });
        add_action('wp_enqueue_scripts', static function () {
            // The Stripe scripts are only needed on pages that contain their corresponding block.
            // Stripe owns these stable, unversioned loader URLs; query parameters do not version their contents.
            if (has_block('smartcloud-commerce/stripe-pricing-table')) wp_enqueue_script('stripe-pricing-table', 'https://js.stripe.com/v3/pricing-table.js', [], null, true); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion -- Stripe-managed loader URL must remain unversioned.
            if (has_block('smartcloud-commerce/stripe-buy-button')) wp_enqueue_script('stripe-buy-button', 'https://js.stripe.com/v3/buy-button.js', [], null, true); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion -- Stripe-managed loader URL must remain unversioned.
            self::assets('main', ['smartcloud-gatey-main-script', 'smartcloud-wpsuite-amplify-vendor', 'smartcloud-wpsuite-webcrypto-vendor']);
            foreach (['checkout-button', 'customer-portal-button', 'current-entitlements', 'protected-content', 'subscription-management', 'sales-presentation'] as $block) if (has_block('smartcloud-commerce/' . $block)) { self::enqueueFrontendStyle(); break; }
            wp_add_inline_script('smartcloud-commerce-main', 'globalThis.WpSuiteCommerceConfig = ' . wp_json_encode(self::settings(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';', 'before');
        });
        add_filter('render_block', static function ($content, $block) {
            if (in_array($block['blockName'] ?? '', ['smartcloud-commerce/checkout-button', 'smartcloud-commerce/customer-portal-button', 'smartcloud-commerce/current-entitlements', 'smartcloud-commerce/protected-content', 'smartcloud-commerce/subscription-management', 'smartcloud-commerce/sales-presentation'], true)) self::enqueueFrontendStyle();
            $content = self::renderStripeBlock($content, $block, self::settings());
            if ($content === '') return '';
            // Catch blocks rendered inside synced patterns, which has_block() does not inspect.
            if (($block['blockName'] ?? '') === 'smartcloud-commerce/stripe-pricing-table') wp_enqueue_script('stripe-pricing-table', 'https://js.stripe.com/v3/pricing-table.js', [], null, true); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion -- Stripe-managed loader URL must remain unversioned.
            if (($block['blockName'] ?? '') === 'smartcloud-commerce/stripe-buy-button') wp_enqueue_script('stripe-buy-button', 'https://js.stripe.com/v3/buy-button.js', [], null, true); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion -- Stripe-managed loader URL must remain unversioned.
            return self::presentationHooks($content, $block);
        }, 10, 2);
        add_action('enqueue_block_editor_assets', static function () {
            $dependencies = ['smartcloud-wpsuite-amplify-vendor', 'smartcloud-wpsuite-webcrypto-vendor'];
            if (wp_script_is('smartcloud-gatey-main-script', 'registered')) $dependencies[] = 'smartcloud-gatey-main-script';
            self::assets('blocks', $dependencies);
            wp_add_inline_script('smartcloud-commerce-blocks', 'globalThis.WpSuiteCommerceConfig = ' . wp_json_encode(self::settings(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT)
                . '; globalThis.WpSuiteCommerceArticleRoutes = ' . wp_json_encode(WordPressProtection::articleRoutes(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';', 'before');
        });
    }
    public static function menu(): void {
        $hook = add_submenu_page('smartcloud-wpsuite', __('Commerce', 'smartcloud-commerce'), __('Commerce', 'smartcloud-commerce'), 'manage_options', 'smartcloud-commerce', static function () { echo '<div class="wrap"><div id="smartcloud-commerce-admin"></div></div>'; });
        add_action('admin_enqueue_scripts', static function ($page) use ($hook) { if ($page === $hook) Admin::enqueue(); });
    }
}
