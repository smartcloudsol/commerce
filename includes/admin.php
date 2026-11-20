<?php
namespace SmartCloud\WPSuite\Commerce;

if (!defined('ABSPATH')) { exit; }

/** Commerce's contribution to the shared WP Suite navigation. */
final class Admin {
    public static function register(array $capabilities): array {
        $url = admin_url('admin.php?page=smartcloud-commerce');
        $capabilities[] = array(
            'schema_version' => 1,
            'id' => 'commerce',
            'product_id' => 'smartcloud-commerce',
            'label' => __('Commerce', 'smartcloud-commerce'),
            'product' => __('SmartCloud Commerce', 'smartcloud-commerce'),
            'description' => __('Configure Stripe embeds and connect Commerce services for your site.', 'smartcloud-commerce'),
            'order' => 50,
            'primary_url' => $url,
            'primary_label' => __('Configure Commerce', 'smartcloud-commerce'),
            'required_capability' => 'manage_options',
            'surface_capability' => 'manage_options',
            'surface_provider' => array(self::class, 'surface'),
            'surface_extension' => 'commerce',
            'surface_enqueue' => array(self::class, 'enqueue'),
            'detail_page' => 'smartcloud-commerce',
            'detail_enqueue' => array(self::class, 'enqueue'),
            'advanced_links' => array(
                array('label' => __('Overview', 'smartcloud-commerce'), 'url' => $url . '&section=general', 'required_capability' => 'manage_options'),
                array('label' => __('Stripe connection', 'smartcloud-commerce'), 'url' => $url . '&section=stripe-connection', 'required_capability' => 'manage_options'),
                array('label' => __('Sales setup', 'smartcloud-commerce'), 'url' => $url . '&section=plans', 'required_capability' => 'manage_options'),
                array('label' => __('Pricing tables', 'smartcloud-commerce'), 'url' => $url . '&section=pricing-tables', 'required_capability' => 'manage_options'),
                array('label' => __('Buy buttons', 'smartcloud-commerce'), 'url' => $url . '&section=buy-buttons', 'required_capability' => 'manage_options'),
                array('label' => __('API settings', 'smartcloud-commerce'), 'url' => $url . '&section=api-settings', 'required_capability' => 'manage_options'),
                array('label' => __('WordPress protection', 'smartcloud-commerce'), 'url' => $url . '&section=wordpress-protection', 'required_capability' => 'manage_options'),
                array('label' => __('Feature mappings', 'smartcloud-commerce'), 'url' => $url . '&section=feature-mappings', 'required_capability' => 'manage_options'),
            ),
            'legacy_menu_slugs' => array('smartcloud-commerce'),
        );
        return $capabilities;
    }

    public static function surface() {
        if (!current_user_can('manage_options')) {
            return new \WP_Error('commerce_forbidden', __('Forbidden', 'smartcloud-commerce'), array('status' => 403));
        }
        try { $settings = Plugin::settings(); }
        catch (\Throwable $error) {
            return new \WP_Error('commerce_profile_unavailable', __('Commerce settings are unavailable for this backend profile.', 'smartcloud-commerce'), array('status' => 409));
        }
        $hasKey = !empty($settings['publishableKey']);
        $presentations = count($settings['storefront']['presentations'] ?? array());
        $embeds = count(Plugin::allowedIds($settings, 'pricingTableIds', 'pricingTableId', 'prctbl_')) + count(Plugin::allowedIds($settings, 'buyButtonIds', 'buyButtonId', 'buy_btn_'));
        $configured = $presentations > 0 || ($hasKey && $embeds > 0);
        return array(
            'schema_version' => 1, 'configured' => $configured, 'can_edit' => false, 'can_setup' => true,
            'revision' => hash('sha256', wp_json_encode($settings)),
            'status' => array('state' => $configured ? 'ready' : 'needs_setup', 'label' => $presentations > 0 ? __('Sales presentations configured', 'smartcloud-commerce') : ($configured ? __('Stripe embeds configured', 'smartcloud-commerce') : __('Choose how to sell', 'smartcloud-commerce'))),
            'notice' => __('Create a sales presentation, connect Stripe or enter public embed identifiers. Payment and access status are checked by your configured services.', 'smartcloud-commerce'),
            'metrics' => array(array('label' => __('Published presentations', 'smartcloud-commerce'), 'value' => (string) $presentations), array('label' => __('Allowed embeds', 'smartcloud-commerce'), 'value' => (string) $embeds), array('label' => __('Stripe publishable key', 'smartcloud-commerce'), 'value' => $hasKey ? __('Saved', 'smartcloud-commerce') : __('Not saved', 'smartcloud-commerce'))),
            'steps' => array(), 'actions' => array(), 'links' => array(),
        );
    }

    public static function enqueue(): void {
        Plugin::assets('admin', array('smartcloud-wpsuite-mantine-vendor', 'smartcloud-wpsuite-webcrypto-vendor', 'smartcloud-wpsuite-amplify-vendor'));
        if (defined('SMARTCLOUD_WPSUITE_URL')) {
            wp_enqueue_style('smartcloud-wpsuite-mantine-vendor-style', SMARTCLOUD_WPSUITE_URL . 'assets/css/mantine-vendor.css', array(), defined('SMARTCLOUD_WPSUITE_VERSION') ? SMARTCLOUD_WPSUITE_VERSION : null);
        }
        wp_add_inline_script('smartcloud-commerce-admin', 'globalThis.WpSuiteCommerceAdmin = ' . wp_json_encode(array('url' => rest_url('smartcloud-commerce/v1/settings'), 'protectionUrl' => rest_url('smartcloud-commerce/v1/wordpress-protection'), 'nonce' => wp_create_nonce('wp_rest'), 'canManage' => current_user_can('manage_options'), 'hubOverviewUrl' => admin_url('admin.php?page=smartcloud-wpsuite'), 'pagesUrl' => admin_url('edit.php?post_type=page'), 'advancedUrl' => admin_url('admin.php?page=smartcloud-wpsuite-capability-commerce&panel=details&section=plans')), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';', 'before');
    }
}
