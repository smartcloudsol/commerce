<?php
namespace SmartCloud\WPSuite\Commerce;
final class Logger {
    public static function __callStatic($name, $arguments): void {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            // Site operators may attach their logger; never write unsolicited production logs.
            do_action('smartcloud_commerce_debug_log', sanitize_key((string) $name), sanitize_text_field((string) ($arguments[0] ?? '')));
        }
    }
}
