<?php
/** Read-only Composer component provider. */
namespace SmartCloud\WPSuite\Commerce\Abilities;

use SmartCloud\WPSuite\Commerce\Plugin;
use SmartCloud\WPSuite\Commerce\WordPressProtection;
use SmartCloud\WPSuite\Hub\Abilities\Product_Provider_Base;
use WP_Error;

if (!defined('ABSPATH')) exit;

final class Provider extends Product_Provider_Base {
    private const COMPONENTS = ['stripe-pricing-table', 'stripe-buy-button', 'checkout-button', 'customer-portal-button', 'current-entitlements', 'protected-content', 'sales-presentation', 'subscription-management', 'article-link'];
    public function __construct() { parent::__construct('smartcloud-commerce', 'SmartCloud Commerce', 'smartcloud-commerce', 'smartcloud-commerce', '1.0.0', '1.0.0', 'smartcloud-commerce', ['smartcloud-commerce/']); }
    private function error(): WP_Error { return new WP_Error('smartcloud_commerce_invalid_component', __('Invalid Commerce component.', 'smartcloud-commerce')); }
    public function get_runtime_capabilities(array $input = []): array {
        $names = array_map(static fn($id) => 'smartcloud-commerce/' . $id, self::COMPONENTS);
        $registration = $this->block_registration_status($names);
        $missing = []; foreach ($registration as $name => $registered) if (!$registered) $missing[] = 'block-not-registered:' . $name;
        return ['provider' => $this->provider_id, 'provider_version' => $this->plugin_version, 'contract_version' => $this->contract_version, 'components' => self::COMPONENTS, 'block_registration' => $registration, 'readiness' => ['block_materialization' => !$missing], 'runtime_ready' => !$missing, 'missing_requirements' => $missing, 'warnings' => ['Commerce Pro actions require an independently configured and authorized backend.']];
    }
    public function list_components(array $input = []): array {
        return ['provider' => $this->provider_id, 'contract_version' => $this->contract_version, 'components' => array_map(static fn($id) => ['id' => $id, 'label' => $id, 'block_names' => ['smartcloud-commerce/' . $id], 'required_registered_block_types' => ['smartcloud-commerce/' . $id], 'materializable' => true], self::COMPONENTS)];
    }
    public function get_component_schema(array $input): array|WP_Error {
        $id = $input['component'] ?? null;
        if (!is_string($id) || !in_array($id, self::COMPONENTS, true)) return $this->error();
        $properties = [];
        foreach ($this->keys($id) as $key) {
            $max = in_array($key, ['requiredGroups','paymentLinkUrl'], true) || ($key === 'value' && $id === 'protected-content') ? 2048 : ($key === 'value' && $id === 'checkout-button' ? 128 : 200);
            $properties[$key] = ['type' => 'string', 'maxLength' => $max];
            if ($key === 'width') $properties[$key]['enum'] = ['auto', 'full'];
        }
        $native = [];
        foreach (['value', 'label', 'publishableKey', 'requiredGroups'] as $key) $native[$key] = ['type' => 'string', 'default' => ''];
        if ($id === 'checkout-button') $native['paymentLinkUrl'] = ['type' => 'string', 'default' => ''];
        if (in_array($id, ['checkout-button','customer-portal-button'], true)) $native['width'] = ['type' => 'string', 'default' => 'auto', 'enum' => ['auto','full']];
        if ($id === 'sales-presentation') $native = ['presentationId' => ['type' => 'string', 'default' => '']];
        if ($id === 'article-link') $native = ['pageId' => ['type' => 'string', 'default' => ''], 'label' => ['type' => 'string', 'default' => '']];
        return ['provider' => $this->provider_id, 'contract_version' => $this->contract_version, 'component' => $id, 'semantic_schema' => ['type' => 'object', 'properties' => $properties, 'additionalProperties' => false], 'block_contract' => ['label' => $id, 'block_names' => ['smartcloud-commerce/' . $id], 'attributes' => ['smartcloud-commerce/' . $id => $native]]];
    }
    private function keys(string $id): array {
        return match ($id) { 'sales-presentation' => ['presentationId'], 'article-link' => ['pageId', 'label'], 'stripe-pricing-table', 'stripe-buy-button' => ['value'], 'checkout-button' => ['value', 'label', 'paymentLinkUrl', 'width'], 'customer-portal-button' => ['label', 'width'], 'protected-content' => ['value', 'label', 'requiredGroups'], default => [] };
    }
    private function canonical(string $id, array $spec, bool $draft = false): array|WP_Error {
        if (array_diff(array_keys($spec), $this->keys($id))) return $this->error();
        foreach ($spec as $value) if (!is_string($value) || strlen($value) > 2048 || preg_match('/[\x00-\x1f\x7f]/', $value)) return $this->error();
        if (isset($spec['width']) && !in_array($spec['width'], ['auto','full'], true)) return $this->error();
        foreach ($spec as $key => $value) if ($value === '' || ($key === 'width' && $value === 'auto')) unset($spec[$key]);
        $label = $spec['label'] ?? '';
        if (strlen($label) > 200 || wp_strip_all_tags($label) !== $label) return $this->error();
        $name = 'smartcloud-commerce/' . $id; $class = 'wp-block-smartcloud-commerce-' . $id; $attrs = $spec;
        if ($id === 'article-link') {
            $pageId = $spec['pageId'] ?? '';
            if (($pageId !== '' || !$draft) && !preg_match('/^[1-9][0-9]{0,18}$/D', $pageId)) return $this->error();
            if (!$draft && !in_array($pageId, array_map('strval', array_column(WordPressProtection::articleRoutes(), 'pageId')), true)) return $this->error();
            return $this->block($name, $attrs, [], '', []);
        } elseif ($id === 'sales-presentation') {
            $presentation = $spec['presentationId'] ?? '';
            if (!preg_match('/^[a-z0-9][a-z0-9._-]{0,63}$/D', $presentation)) return $this->error();
            $ids = array_column(Plugin::settings()['storefront']['presentations'] ?? [], 'id');
            if (!in_array($presentation, $ids, true)) return $this->error();
            return $this->block($name, $attrs, [], '', []);
        } elseif ($id === 'subscription-management') {
            $html = '<div class="' . esc_attr($class) . '" data-commerce-subscriptions="">' . esc_html(__('Sign in to manage subscriptions.', 'smartcloud-commerce')) . '</div>';
        } elseif ($id === 'stripe-pricing-table' || $id === 'stripe-buy-button') {
            $settings = Plugin::settings(); $pricing = $id === 'stripe-pricing-table';
            $value = $spec['value'] ?? ''; $key = $settings['publishableKey'] ?? '';
            $ids = Plugin::allowedIds($settings, $pricing ? 'pricingTableIds' : 'buyButtonIds', $pricing ? 'pricingTableId' : 'buyButtonId', $pricing ? 'prctbl_' : 'buy_btn_');
            if (!in_array($value, $ids, true) || !is_string($key) || strlen($key) > 256 || !preg_match('/^pk_(test|live)_[A-Za-z0-9]+$/D', $key)) return $this->error();
            $attrs['publishableKey'] = $key;
            $html = '<' . $id . ' class="' . esc_attr($class) . '" ' . ($pricing ? 'pricing-table-id' : 'buy-button-id') . '="' . esc_attr($value) . '" publishable-key="' . esc_attr($key) . '"></' . $id . '>';
        } elseif ($id === 'checkout-button') {
            $value = $spec['value'] ?? '';
            if (!empty($spec['paymentLinkUrl'])) {
                if ($value !== '' || !Plugin::validPaymentLinkUrl($spec['paymentLinkUrl'])) return $this->error();
                $html = '<a class="' . esc_attr($class) . '" href="' . esc_attr($spec['paymentLinkUrl']) . '">' . esc_html($label !== '' ? $label : __('Checkout button', 'smartcloud-commerce')) . '</a>';
            } else {
                if (!($draft && $value === '') && !preg_match('/^[a-z0-9][a-z0-9._-]{0,127}$/D', $value)) return $this->error();
                $html = '<button class="' . esc_attr($class) . '" type="button" data-commerce-action="checkout" data-offer-id="' . esc_attr($value) . '">' . esc_html($label !== '' ? $label : __('Checkout button', 'smartcloud-commerce')) . '</button>';
            }
        } elseif ($id === 'customer-portal-button') {
            $html = '<button class="' . esc_attr($class) . '" type="button" data-commerce-action="portal">' . esc_html($label !== '' ? $label : __('Customer portal button', 'smartcloud-commerce')) . '</button>';
        } elseif ($id === 'protected-content') {
            $url = $spec['value'] ?? ''; $parts = wp_parse_url($url); $groups = array_map('trim', explode(',', $spec['requiredGroups'] ?? ''));
            if (strlen($url) > 2048 || !is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || count($groups) > 50 || count(array_unique($groups)) !== count($groups)) return $this->error();
            foreach ($groups as $group) if (!preg_match('/^commerce-[a-z0-9][a-z0-9-]{0,118}$/D', $group)) return $this->error();
            $attrs['requiredGroups'] = implode(',', $groups);
            $html = '<div class="' . esc_attr($class) . '" data-commerce-protected="" data-resource-url="' . esc_attr($url) . '" data-required-groups="' . esc_attr(wp_json_encode($groups)) . '" data-link-label="' . esc_attr($label !== '' ? $label : __('Protected resource link', 'smartcloud-commerce')) . '">' . esc_html(__('Sign in to view access.', 'smartcloud-commerce')) . '</div>';
        } else $html = '<div class="' . esc_attr($class) . '" data-commerce-entitlements="">' . esc_html(__('Sign in to view access.', 'smartcloud-commerce')) . '</div>';
        if (($spec['width'] ?? '') === 'full') $html = preg_replace('/>/', ' data-commerce-width="full">', $html, 1);
        return $this->block($name, $attrs, [], $html, [$html]);
    }
    public function materialize_component(array $input): array|WP_Error {
        $id = $input['component'] ?? null; $spec = $input['spec'] ?? [];
        if (!is_string($id) || !in_array($id, self::COMPONENTS, true) || !is_array($spec)) return $this->error();
        $block = $this->canonical($id, $spec); if (is_wp_error($block)) return $block;
        $runtime = $this->get_runtime_capabilities();
        return $this->materialization_result($id, [$block], $runtime['runtime_ready'], $runtime['missing_requirements'], $runtime['warnings']);
    }
    public function validate_block_tree(array $input): array {
        $blocks = $input['blocks'] ?? null; $errors = [];
        if (!is_array($blocks) || !array_is_list($blocks) || count($blocks) > 100) return $this->validation_result([], [$this->validation_issue('smartcloud_commerce_invalid_tree', 'Invalid Commerce block tree.', '')]);
        foreach ($blocks as $index => $block) {
            $id = is_array($block) && is_string($block['blockName'] ?? null) && str_starts_with($block['blockName'], 'smartcloud-commerce/') ? substr($block['blockName'], strlen('smartcloud-commerce/')) : '';
            if (!in_array($id, self::COMPONENTS, true) || !is_array($block['attrs'] ?? null) || ($block['innerBlocks'] ?? null) !== [] || array_diff(array_keys($block), ['blockName', 'attrs', 'innerBlocks', 'innerHTML', 'innerContent'])) { $errors[] = $this->validation_issue('smartcloud_commerce_invalid_tree', 'Invalid Commerce block.', (string) $index); continue; }
            // Gutenberg omits defaults when serializing; explicit empty defaults
            // describe the same block and must not make a browser draft invalid.
            $actual_attrs = $block['attrs'];
            foreach (['value', 'label', 'publishableKey', 'requiredGroups', 'presentationId', 'paymentLinkUrl', 'pageId'] as $key) if (($actual_attrs[$key] ?? null) === '') unset($actual_attrs[$key]);
            if (($actual_attrs['width'] ?? null) === 'auto') unset($actual_attrs['width']);
            $attrs = $actual_attrs; $stripe = in_array($id, ['stripe-pricing-table', 'stripe-buy-button'], true);
            if ($stripe) unset($attrs['publishableKey']);
            if ($stripe && (empty($actual_attrs['value']) || empty($actual_attrs['publishableKey']))) {
                // An unconfigured native editor block saves only this inert
                // placeholder. Materialization still requires an allowed ID/key.
                $allowed = ['value', 'publishableKey']; $valid = !array_diff(array_keys($actual_attrs), $allowed);
                foreach ($actual_attrs as $key => $value) if (!is_string($value) || strlen($value) > ($key === 'publishableKey' ? 256 : 200) || preg_match('/[\x00-\x1f\x7f]/', $value)) $valid = false;
                $html = '<div class="wp-block-smartcloud-commerce-' . $id . '">' . esc_html(__('Stripe embed is not configured.', 'smartcloud-commerce')) . '</div>';
                $expected = $valid ? $this->block($block['blockName'], $actual_attrs, [], $html, [$html]) : $this->error();
            } elseif ($id === 'sales-presentation' && !$actual_attrs) {
                $expected = $this->block($block['blockName'], [], [], '', []);
            } else $expected = $this->canonical($id, $attrs, true);
            if (is_wp_error($expected)) { $errors[] = $this->validation_issue('smartcloud_commerce_invalid_tree', 'Invalid Commerce block.', (string) $index); continue; }
            $expected_attrs = $expected['attrs']; ksort($actual_attrs); ksort($expected_attrs);
            // The native editor adds boundary newlines around saved leaf markup.
            // Preserve exact tags, attributes and text within that boundary.
            $actual_html = $block['innerHTML'] ?? null;
            $actual_content = $block['innerContent'] ?? null;
            if (is_string($actual_html)) $actual_html = trim($actual_html);
            if (is_array($actual_content) && count($actual_content) === 1 && is_string($actual_content[0] ?? null)) $actual_content = [trim($actual_content[0])];
            if ($actual_attrs !== $expected_attrs || $actual_html !== $expected['innerHTML'] || $actual_content !== $expected['innerContent']) $errors[] = $this->validation_issue('smartcloud_commerce_invalid_tree', 'Invalid Commerce block.', (string) $index);
        }
        return $this->validation_result($blocks, $errors);
    }
}
(new Provider())->bootstrap();
