<?php
/**
 * Plugin Name:       SmartCloud Commerce
 * Plugin URI:        https://wpsuite.io/commerce/
 * Description:       Stripe embeds, sales presentations, and access integrations for WordPress.
 * Version:           1.0.0
 * Requires PHP:      8.1
 * Requires at least: 6.9
 * Author:            Smart Cloud Solutions Inc.
 * Author URI:        https://wpsuite.io/
 * License:           MIT
 * License URI:       https://mit-license.org/
 * Text Domain:       smartcloud-commerce
 *
 * @package           smartcloud-commerce
 */
namespace SmartCloud\WPSuite\Commerce;
if (!defined('ABSPATH'))
    exit;
require_once __DIR__ . '/includes/logger.php';
require_once __DIR__ . '/hub-loader.php';
require_once __DIR__ . '/includes/plugin.php';
require_once __DIR__ . '/includes/admin.php';
require_once __DIR__ . '/includes/wordpress-protection.php';
WordPressProtection::register();
add_filter('smartcloud_wpsuite_admin_capabilities', [Admin::class, 'register']);
$smartcloud_commerce_hub = \SmartCloud\WPSuite\Hub\CommerceHubLoader::instance(plugin_basename(__FILE__), 'smartcloud-commerce');
add_action('init', [$smartcloud_commerce_hub, 'init'], 15);
add_action('plugins_loaded', [$smartcloud_commerce_hub, 'check'], 20);
add_action('init', [Plugin::class, 'init'], 20);
add_action('rest_api_init', [Plugin::class, 'routes']);
add_action('admin_menu', [Plugin::class, 'menu'], 20);
add_action('plugins_loaded', static function (): void {
    if (!class_exists('\SmartCloud\WPSuite\Hub\Abilities\Product_Provider_Base') && is_file(__DIR__ . '/smartcloud-wpsuite/abilities.php'))
        require_once __DIR__ . '/smartcloud-wpsuite/abilities.php';
    if (class_exists('\SmartCloud\WPSuite\Hub\Abilities\Product_Provider_Base'))
        require_once __DIR__ . '/includes/abilities-provider.php';
}, 30);
