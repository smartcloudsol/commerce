<?php
/**
 * Server-side access to private WordPress pages and files.
 *
 * @package smartcloud-commerce
 */

namespace SmartCloud\WPSuite\Commerce;

use SmartCloud\WPSuite\Gatey\BackendProfileSettings;
use SmartCloud\WPSuite\Gatey\CognitoTokenVerifier;
use SmartCloud\WPSuite\Gatey\Configuration;

if (!defined('ABSPATH')) {
    exit;
}

final class WordPressProtection {
    private const REST_NAMESPACE = 'smartcloud-commerce/v1';
    private const MEDIA_PREFIX = '/commerce-private-media/';
    private const SESSION_COOKIE = '__Host-wpsuite-commerce-access';
    private const TTL = 120;
    private static bool $publisherRender = false;

    public static function register(): void {
        add_action('rest_api_init', [self::class, 'routes']);
        add_action('parse_request', [self::class, 'guard'], 0);
        add_action('wp_enqueue_scripts', [self::class, 'enqueueSessionEndpoint'], 30);
        add_filter('wp_insert_post_data', [self::class, 'retainPrivacy'], 10, 2);
    }

    public static function enqueueSessionEndpoint(): void {
        if (self::$publisherRender || !self::policy(Plugin::profileContext())['enabled']) {
            return;
        }
        $url = rest_url(self::REST_NAMESPACE . '/wordpress-access-session');
        wp_add_inline_script('smartcloud-commerce-main', 'globalThis.WpSuiteCommerceAccessUrl = ' . wp_json_encode($url, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';', 'before');
    }

    private static function option(?array $profile): string {
        return Plugin::optionForContext($profile) . '/wordpress-protection';
    }

    private static function policy(?array $profile): array {
        $value = get_option(self::option($profile), []);
        return [
            'enabled' => ($value['enabled'] ?? false) === true,
            'allowPublisher' => ($value['allowPublisher'] ?? false) === true,
            'rules' => $value['rules'] ?? [],
            'featureRoutes' => $value['featureRoutes'] ?? [],
        ];
    }

    private static function noCache(): void {
        if (!defined('DONOTCACHEPAGE')) {
            // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Page-cache plugins recognize this exact integration constant.
            define('DONOTCACHEPAGE', true);
        }
        nocache_headers();
        header('Cache-Control: private, no-store, max-age=0');
        header('X-Robots-Tag: noindex, nofollow');
    }

    private static function response(array $body, int $status = 200): \WP_REST_Response {
        return new \WP_REST_Response($body, $status, ['Cache-Control' => 'private, no-store, max-age=0']);
    }

    private static function identity(): ?array {
        if (!class_exists(BackendProfileSettings::class) || !class_exists(CognitoTokenVerifier::class)) {
            return null;
        }
        $settings = BackendProfileSettings::settings();
        $cognito = $settings->userPoolConfigurations->default->Auth->Cognito;
        $region = Configuration::regionFromUserPoolId($cognito->userPoolId);
        if ($region === '' || !preg_match('/^[a-z0-9]{1,128}$/D', $cognito->userPoolClientId)) {
            return null;
        }
        return [$region, $cognito->userPoolId, $cognito->userPoolClientId];
    }

    private static function scope(?array $profile, array $policy): string {
        return hash('sha256', wp_json_encode([get_current_blog_id(), home_url('/'), $profile, $policy]));
    }

    private static function pathIsValid(string $path): bool {
        return strlen($path) <= 512
            && (bool) preg_match('~^/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*(?:/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*)*/?$~D', $path);
    }

    public static function articleRoutes(): array {
        $policy = self::policy(Plugin::profileContext());
        if (!$policy['enabled']) {
            return [];
        }
        $routes = [];
        foreach ($policy['rules'] as $rule) {
            if (isset($rule['feature']) && self::privatePage($rule['pageId'], $rule['path'])) {
                $routes[] = ['path' => $rule['path'], 'feature' => $rule['feature'], 'pageId' => $rule['pageId']];
            }
        }
        return $routes;
    }

    /** Server-side source descriptors for the AI-Kit protected projection. */
    public static function knowledgeArticles(): array {
        $policy = self::policy(Plugin::profileContext());
        if (!$policy['enabled'] || wp_parse_url(get_option('home', ''), PHP_URL_SCHEME) !== 'https') {
            return [];
        }
        $articles = [];
        foreach ($policy['rules'] as $rule) {
            if (isset($rule['feature']) && self::privatePage($rule['pageId'], $rule['path'])) {
                $articles[$rule['pageId']] = ['url' => self::absolutePath($rule['path'], 'https'), 'group' => $rule['group']];
            }
        }
        return $articles;
    }

    public static function hasKnowledgeArticleRule(int $pageId): bool {
        foreach (self::policy(Plugin::profileContext())['rules'] as $rule) {
            if (isset($rule['feature']) && $rule['pageId'] === $pageId) {
                return true;
            }
        }
        return false;
    }

    public static function renderArticleLink(array $attributes): string {
        $id = $attributes['pageId'] ?? '';
        if ($id === '') {
            return '';
        }
        foreach (self::articleRoutes() as $route) {
            if ((string) $route['pageId'] !== $id) {
                continue;
            }
            Plugin::enqueueFrontendStyle();
            $label = trim($attributes['label'] ?? '') ?: __('Read the full article', 'smartcloud-commerce');
            $wrapper = get_block_wrapper_attributes(['class' => 'sc-commerce-article-link']);
            return '<div ' . $wrapper . '><a class="sc-commerce-button sc-commerce-button-article" href="'
                . esc_url($route['path']) . '">' . esc_html($label) . '</a></div>';
        }
        return '';
    }

    private static function mediaRoot(): ?string {
        if (!defined('SMARTCLOUD_COMMERCE_PRIVATE_MEDIA_DIR') || !is_string(SMARTCLOUD_COMMERCE_PRIVATE_MEDIA_DIR)) {
            return null;
        }
        $root = realpath(SMARTCLOUD_COMMERCE_PRIVATE_MEDIA_DIR);
        // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Read-only filesystem path comparison against the web server document root.
        $documentRoot = realpath(wp_unslash($_SERVER['DOCUMENT_ROOT'] ?? ''));
        $wordpressRoot = realpath(ABSPATH);
        if (!$root || !$documentRoot || !$wordpressRoot || !is_dir($root)) {
            return null;
        }
        foreach ([$documentRoot, $wordpressRoot] as $publicRoot) {
            if (str_starts_with($root . DIRECTORY_SEPARATOR, rtrim($publicRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR)
                || str_starts_with($publicRoot . DIRECTORY_SEPARATOR, rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR)) {
                return null;
            }
        }
        return $root;
    }

    private static function media(string $path): ?array {
        $root = self::mediaRoot();
        if (!$root || !str_starts_with($path, self::MEDIA_PREFIX) || str_ends_with($path, '/')) {
            return null;
        }
        $relative = substr($path, strlen(self::MEDIA_PREFIX));
        if (!self::pathIsValid('/' . $relative)) {
            return null;
        }
        $file = realpath($root . DIRECTORY_SEPARATOR . $relative);
        if (!$file || !str_starts_with($file, $root . DIRECTORY_SEPARATOR) || !is_file($file) || !is_readable($file)) {
            return null;
        }
        $mime = match (strtolower(pathinfo($relative, PATHINFO_EXTENSION))) {
            'png' => 'image/png', 'jpg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif',
            'webp' => 'image/webp', 'avif' => 'image/avif', 'pdf' => 'application/pdf',
            'mp3' => 'audio/mpeg', 'mp4' => 'video/mp4', 'webm' => 'video/webm',
            'txt' => 'text/plain; charset=UTF-8', 'zip' => 'application/zip',
            default => null,
        };
        return $mime !== null ? ['file' => $file, 'mime' => $mime, 'name' => basename($relative)] : null;
    }

    private static function privatePage(int $id, string $path): ?\WP_Post {
        $page = $id > 0 ? get_post($id) : null;
        if (!$page || $page->post_type !== 'page' || $page->post_status !== 'private' || $page->post_password !== ''
            || in_array($id, [(int) get_option('page_on_front'), (int) get_option('page_for_posts')], true)
            || !get_option('permalink_structure')) {
            return null;
        }
        // Core returns a plain query-string link for private pages when an anonymous request is being parsed.
        global $wp_rewrite;
        $structure = $wp_rewrite->get_page_permastruct();
        $pageUri = home_url(user_trailingslashit(str_replace('%pagename%', get_page_uri($page), $structure), 'page'));
        if (wp_parse_url($pageUri, PHP_URL_PATH) !== $path) {
            return null;
        }
        return $page;
    }

    private static function secret(): string {
        $secret = defined('SMARTCLOUD_COMMERCE_PUBLISHER_SECRET') ? SMARTCLOUD_COMMERCE_PUBLISHER_SECRET : '';
        return is_string($secret) && preg_match('/^[a-f0-9]{64}$/D', $secret) ? $secret : '';
    }

    public static function routes(): void {
        register_rest_route(self::REST_NAMESPACE, '/wordpress-protection', [
            ['methods' => 'GET', 'permission_callback' => [Plugin::class, 'permission'], 'callback' => [self::class, 'read']],
            ['methods' => 'POST', 'permission_callback' => [Plugin::class, 'permission'], 'callback' => [self::class, 'save']],
        ]);
        register_rest_route(self::REST_NAMESPACE, '/wordpress-access-session', [
            'methods' => ['POST', 'DELETE'],
            'permission_callback' => '__return_true',
            'callback' => [self::class, 'session'],
        ]);
        register_rest_route(self::REST_NAMESPACE, '/wordpress-render-lease', [
            'methods' => ['POST', 'DELETE'],
            'permission_callback' => [self::class, 'publisherPermission'],
            'callback' => [self::class, 'lease'],
        ]);
    }

    public static function read(): \WP_REST_Response {
        $profile = Plugin::profileContext();
        $policy = self::policy($profile);
        return self::response([
            'policy' => [...$policy, 'rules' => array_values($policy['rules'])], 'revision' => self::scope($profile, $policy),
            'gateyReady' => is_ssl() && self::identity() !== null,
            'mediaReady' => self::mediaRoot() !== null,
            'publisherReady' => self::secret() !== '',
        ]);
    }

    public static function save(\WP_REST_Request $request): \WP_REST_Response {
        $profile = Plugin::profileContext();
        $body = $request->get_json_params();
        $current = self::policy($profile);
        if (!is_array($body) || ($body['revision'] ?? '') !== self::scope($profile, $current)) {
            return self::response(['message' => __('Settings changed. Reload before saving.', 'smartcloud-commerce')], 409);
        }
        $enabled = $body['enabled'] ?? null;
        $allowPublisher = $body['allowPublisher'] ?? null;
        $rows = $body['rules'] ?? null;
        $routeRows = $body['featureRoutes'] ?? $current['featureRoutes'];
        if (!is_bool($enabled) || !is_bool($allowPublisher) || !is_array($rows) || !array_is_list($rows) || count($rows) > 100
            || !is_array($routeRows) || !array_is_list($routeRows) || count($routeRows) > 50) {
            return self::response(['message' => __('Invalid protection settings.', 'smartcloud-commerce')], 400);
        }
        if ($enabled && (!is_ssl() || self::identity() === null || !$rows)) {
            return self::response(['message' => __('Enable HTTPS, configure the Gatey user pool, and add at least one rule.', 'smartcloud-commerce')], 400);
        }
        if ($enabled && $allowPublisher && self::secret() === '') {
            return self::response(['message' => __('Configure the Publisher render secret on the server first.', 'smartcloud-commerce')], 400);
        }

        $featureRoutes = [];
        foreach ($routeRows as $row) {
            $feature = $row['feature'] ?? null;
            $group = $row['group'] ?? null;
            $prefix = $row['prefix'] ?? null;
            if (!is_string($feature) || !preg_match('/^[A-Za-z0-9_.-]{1,128}$/D', $feature) || isset($featureRoutes[$feature])
                || !is_string($group) || !preg_match('/^commerce-[a-z0-9][a-z0-9-]{0,118}$/D', $group)
                || !is_string($prefix) || strlen($prefix) > 201 || !self::pathIsValid($prefix)) {
                return self::response(['message' => __('Select a unique Stripe feature, its Commerce group and a valid path prefix.', 'smartcloud-commerce')], 400);
            }
            $prefix = rtrim($prefix, '/');
            foreach (array_merge(array_column($featureRoutes, 'prefix'), ['/wp-admin', '/wp-json', '/wp-content', '/wp-includes', '/issue-cookie', '/restricted', '/__wpsuite_members', '/smartcloud-wpsuiteio', rtrim(self::MEDIA_PREFIX, '/')]) as $existing) {
                if (str_starts_with($prefix, $existing) || str_starts_with($existing, $prefix)) {
                    return self::response(['message' => __('Article prefixes must be separate and cannot overlap reserved paths.', 'smartcloud-commerce')], 400);
                }
            }
            $featureRoutes[$feature] = ['feature' => $feature, 'group' => $group, 'prefix' => $prefix];
        }
        $rules = [];
        $articlePages = [];
        foreach ($rows as $index => $row) {
            $path = $row['path'] ?? null;
            $feature = $row['feature'] ?? '';
            $featureRoute = is_string($feature) ? ($featureRoutes[$feature] ?? null) : null;
            $group = $featureRoute['group'] ?? ($row['group'] ?? null);
            $id = $row['pageId'] ?? null;
            if (!is_array($row) || !is_string($path) || !self::pathIsValid($path) || isset($rules[rtrim($path, '/')])
                || !is_string($group) || !preg_match('/^commerce-[a-z0-9][a-z0-9-]{0,118}$/D', $group)
                || !is_int($id) || $id < 0) {
                /* translators: %d: rule number. */
                return self::response(['message' => sprintf(__('Rule %d needs a unique path, a Commerce group and a valid page ID or media path.', 'smartcloud-commerce'), $index + 1)], 400);
            }
            $media = str_starts_with($path, self::MEDIA_PREFIX);
            if ($feature !== '' && (!$featureRoute || $media || isset($articlePages[$id])
                || !str_starts_with($path, $featureRoute['prefix'] . '/') || !self::privatePage($id, $path))) {
                return self::response(['message' => __('Each article must be a distinct private Page beneath its feature’s path prefix.', 'smartcloud-commerce')], 400);
            }
            foreach ($featureRoutes as $configuredRoute) {
                if (($path === $configuredRoute['prefix'] || str_starts_with($path, $configuredRoute['prefix'] . '/'))
                    && $configuredRoute['group'] !== $group) {
                    return self::response(['message' => __('A page and its feature path prefix must use the same Cognito group.', 'smartcloud-commerce')], 400);
                }
            }
            if (($media && $id !== 0) || (!$media && $id === 0)
                || ($enabled && ($media ? self::media($path) === null : self::privatePage($id, $path) === null))) {
                /* translators: %d: rule number. */
                return self::response(['message' => sprintf(__('Rule %d must match a private Page permalink or an existing file in the private media directory.', 'smartcloud-commerce'), $index + 1)], 400);
            }
            $rules[rtrim($path, '/')] = ['path' => $path, 'group' => $group, 'pageId' => $id];
            if ($featureRoute) {
                $articlePages[$id] = true;
                $rules[rtrim($path, '/')]['feature'] = $feature;
            }
        }
        $updated = update_option(self::option($profile), ['enabled' => $enabled, 'allowPublisher' => $allowPublisher, 'rules' => $rules, 'featureRoutes' => array_values($featureRoutes)], false);
        if ($updated) {
            $before = $current['enabled'] ? array_column(array_filter($current['rules'], static fn($rule) => isset($rule['feature'])), null, 'pageId') : [];
            $after = $enabled ? array_column(array_filter($rules, static fn($rule) => isset($rule['feature'])), null, 'pageId') : [];
            $changed = array_filter(array_unique(array_merge(array_keys($before), array_keys($after))), static fn($id) => ($before[$id] ?? null) !== ($after[$id] ?? null));
            if ($changed) {
                do_action('smartcloud_commerce_knowledge_articles_changed', array_values($changed));
            }
        }
        return self::read();
    }

    public static function retainPrivacy(array $data, array $post): array {
        $id = (int) ($post['ID'] ?? 0);
        if ($id <= 0 || ($data['post_type'] ?? '') !== 'page'
            || !in_array($data['post_status'] ?? '', ['publish', 'future'], true)) {
            return $data;
        }
        $policy = self::policy(Plugin::profileContext());
        foreach ($policy['rules'] as $rule) {
            if (($policy['enabled'] || isset($rule['feature'])) && $id === $rule['pageId']) {
                $data['post_status'] = 'private';
                break;
            }
        }
        return $data;
    }

    private static function sessionBinding(?array $profile, array $policy, array $identity): string {
        return hash('sha256', wp_json_encode([self::scope($profile, $policy), $identity]));
    }

    private static function signature(string $body): string {
        return hash_hmac('sha256', 'commerce-wordpress-access:' . $body, wp_salt('auth'));
    }

    private static function setSessionCookie(string $value, int $expiration): void {
        setcookie(self::SESSION_COOKIE, $value, [
            'expires' => $expiration, 'path' => '/', 'secure' => true,
            'httponly' => true, 'samesite' => 'Lax',
        ]);
    }

    public static function session(\WP_REST_Request $request): \WP_REST_Response {
        $home = wp_parse_url(home_url('/'));
        $origin = $home['scheme'] . '://' . $home['host'] . (isset($home['port']) ? ':' . $home['port'] : '');
        if (!is_ssl() || $request->get_header('origin') !== $origin) {
            return self::response(['code' => 'commerce_invalid_origin'], 403);
        }
        if ($request->get_method() === 'DELETE') {
            self::setSessionCookie('', time() - 3600);
            return self::response(['cleared' => true]);
        }
        $profile = Plugin::profileContext();
        $policy = self::policy($profile);
        $identity = self::identity();
        $path = $request->get_json_params()['path'] ?? null;
        $rule = is_string($path) ? ($policy['rules'][rtrim($path, '/')] ?? null) : null;
        if (!$policy['enabled'] || !$identity || !$rule || $rule['path'] !== $path) {
            return self::response(['code' => 'commerce_access_unavailable'], 404);
        }
        $authorization = (string) $request->get_header('authorization');
        if (!preg_match('/^Bearer ([A-Za-z0-9_.-]{1,16384})$/D', $authorization, $match)) {
            return self::response(['code' => 'commerce_sign_in_required'], 401);
        }

        try {
            $claims = (new CognitoTokenVerifier(...$identity))->verifyAccessToken($match[1]);
        } catch (\Throwable $error) {
            return self::response(['code' => 'commerce_sign_in_required'], 401);
        }
        $expires = $claims['exp'] ?? null;
        $subject = $claims['sub'] ?? null;
        if (!is_int($expires) || $expires <= time() || !is_string($subject) || $subject === '') {
            return self::response(['code' => 'commerce_sign_in_required'], 401);
        }
        $groups = $claims['cognito:groups'] ?? null;
        if (!is_array($groups) || !in_array($rule['group'], $groups, true)) {
            self::setSessionCookie('', time() - 3600);
            return self::response(['code' => 'commerce_subscription_required'], 403);
        }
        // Store policy indexes instead of Cognito claims, keeping even 100 rules within the cookie size limit.
        $allowed = [];
        foreach (array_values($policy['rules']) as $index => $item) {
            if (in_array($item['group'], $groups, true)) {
                $allowed[] = $index;
            }
        }
        $expires = min($expires, time() + self::TTL);
        $body = rtrim(strtr(base64_encode(wp_json_encode([$expires, self::sessionBinding($profile, $policy, $identity), $allowed])), '+/', '-_'), '=');
        self::setSessionCookie($body . '.' . self::signature($body), $expires);
        return self::response(['authorized' => true]);
    }

    private static function memberAllowed(string $key, ?array $profile, array $policy): bool {
        $cookie = sanitize_text_field(wp_unslash($_COOKIE[self::SESSION_COOKIE] ?? ''));
        if (!preg_match('/^([A-Za-z0-9_-]{1,3000})\.([a-f0-9]{64})$/D', $cookie, $match)
            || !hash_equals(self::signature($match[1]), $match[2])) {
            return false;
        }
        $payload = json_decode(base64_decode(strtr($match[1], '-_', '+/'), true) ?: '', true);
        $identity = self::identity();
        $index = array_search($key, array_keys($policy['rules']), true);
        return $identity && is_array($payload) && count($payload) === 3
            && is_int($payload[0]) && $payload[0] > time()
            && $payload[1] === self::sessionBinding($profile, $policy, $identity)
            && is_array($payload[2]) && in_array($index, $payload[2], true);
    }

    public static function publisherPermission(\WP_REST_Request $request): bool {
        $secret = self::secret();
        return is_ssl() && $secret !== '' && hash_equals($secret, (string) $request->get_header('x-wpsuite-commerce-publisher-secret'));
    }

    private static function leaseKey(string $token): string {
        return preg_match('/^[a-f0-9]{64}$/D', $token) ? 'sc_commerce_lease_' . hash('sha256', $token) : '';
    }

    public static function lease(\WP_REST_Request $request): \WP_REST_Response {
        $token = (string) $request->get_header('x-wpsuite-commerce-render');
        $key = self::leaseKey($token);
        if ($request->get_method() === 'DELETE') {
            if ($key !== '') {
                delete_transient($key);
            }
            return self::response(['released' => true]);
        }
        $profile = Plugin::profileContext();
        $policy = self::policy($profile);
        if (!$policy['enabled'] || !$policy['allowPublisher'] || !$policy['rules']) {
            return self::response(['code' => 'commerce_render_unavailable'], 403);
        }
        $scope = hash('sha256', self::scope($profile, $policy) . self::secret());
        $previous = $key !== '' ? get_transient($key) : false;
        if ($previous !== false && ($previous['scope'] ?? '') !== $scope) {
            return self::response(['code' => 'commerce_render_policy_changed'], 409);
        }
        if ($previous === false) {
            $token = bin2hex(random_bytes(32));
            $key = self::leaseKey($token);
        }
        $next = ['scope' => $scope, 'expires' => time() + self::TTL];
        if ($previous !== $next && !set_transient($key, $next, self::TTL)) {
            return self::response(['code' => 'commerce_render_lease_unavailable'], 503);
        }
        $routes = array_map(static fn(array $row): array => ['path' => $row['path'], 'media' => $row['pageId'] === 0], array_values($policy['rules']));
        return self::response(['token' => $token, 'ttlSeconds' => self::TTL, 'revision' => $scope, 'routes' => $routes]);
    }

    private static function publisherScope(?array $profile, array $policy): ?string {
        if (!$policy['allowPublisher'] || self::secret() === '') {
            return null;
        }
        $token = sanitize_text_field(wp_unslash($_SERVER['HTTP_X_WPSUITE_COMMERCE_RENDER'] ?? ''));
        $key = self::leaseKey($token);
        $lease = $key !== '' ? get_transient($key) : false;
        $scope = hash('sha256', self::scope($profile, $policy) . self::secret());
        return is_array($lease) && $lease['expires'] > time() && $lease['scope'] === $scope ? $scope : null;
    }

    public static function guard(\WP $wp): void {
        // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- The raw path is checked by pathIsValid() before any access is granted.
        $uri = wp_unslash($_SERVER['REQUEST_URI'] ?? '');
        $path = wp_parse_url($uri, PHP_URL_PATH);
        if (!is_string($path) || !self::pathIsValid($path)) {
            return;
        }
        $profile = Plugin::profileContext();
        $policy = self::policy($profile);
        if (!$policy['enabled']) {
            return;
        }
        $key = rtrim($path, '/');
        $rule = $policy['rules'][$key] ?? null;
        if (!$rule) {
            return;
        }
        self::noCache();
        $method = sanitize_text_field(wp_unslash($_SERVER['REQUEST_METHOD'] ?? ''));
        if (!is_ssl() || !in_array($method, ['GET', 'HEAD'], true)) {
            self::stop(403);
        }

        $administratorPreview = $rule['pageId'] > 0 && current_user_can('edit_post', $rule['pageId']);
        $publisher = self::publisherScope($profile, $policy);
        if (!$administratorPreview && !$publisher && !self::memberAllowed($key, $profile, $policy)) {
            if ($method === 'HEAD') {
                self::stop(403);
            }
            self::showGate($rule['path']);
        }

        if ($path !== $rule['path']) {
            wp_safe_redirect(self::absolutePath($rule['path']));
            exit;
        }
        if ($publisher) {
            self::$publisherRender = true;
            header('X-WPSuite-Commerce-Rendered: ' . $publisher);
        }
        if ($rule['pageId'] === 0) {
            self::serveMedia($path, $method);
        }
        if (!self::privatePage($rule['pageId'], $path)) {
            self::stop(404);
        }
        // Discard incoming query variables. This single authorized main query may read its one private Page.
        $wp->query_vars = ['page_id' => $rule['pageId'], 'post_type' => 'page', 'post_status' => 'private'];
        remove_action('wp_head', 'wp_shortlink_wp_head');
        remove_action('template_redirect', 'wp_shortlink_header', 11);
        remove_action('wp_head', 'wp_oembed_add_discovery_links');
        add_filter('redirect_canonical', '__return_false');
        add_filter('page_link', static fn(string $link, int $id): string => $id === $rule['pageId'] ? self::absolutePath($path) : $link, 10, 2);
        add_action('send_headers', static fn() => self::noCache(), PHP_INT_MAX);
    }

    private static function absolutePath(string $path, ?string $scheme = null): string {
        return preg_replace('~^(https?://[^/]+).*$~', '$1', home_url('/', $scheme)) . $path;
    }

    private static function stop(int $status): never {
        status_header($status);
        exit;
    }

    private static function serveMedia(string $path, string $method): never {
        $media = self::media($path);
        if (!$media) {
            self::stop(404);
        }
        status_header(200);
        header('Content-Type: ' . $media['mime']);
        header('X-Content-Type-Options: nosniff');
        header('Cross-Origin-Resource-Policy: same-origin');
        $disposition = $media['mime'] === 'application/zip' ? 'attachment' : 'inline';
        header('Content-Disposition: ' . $disposition . '; filename="' . $media['name'] . '"');
        $size = filesize($media['file']);
        if ($size !== false) {
            header('Content-Length: ' . $size);
        }
        if ($method === 'GET') {
            // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile -- Stream a validated local private file without buffering it in PHP memory.
            readfile($media['file']);
        }
        exit;
    }

    private static function showGate(string $path): never {
        status_header(403);
        Plugin::enqueueFrontendStyle();
        $signIn = class_exists(BackendProfileSettings::class) ? BackendProfileSettings::settings()->signInPage : '';
        $signInUrl = is_string($signIn) && self::pathIsValid($signIn) ? site_url($signIn) : '';
        ?>
        <!doctype html>
        <html <?php language_attributes(); ?>>
        <head>
            <meta charset="<?php bloginfo('charset'); ?>">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title><?php esc_html_e('Subscriber access', 'smartcloud-commerce'); ?></title>
            <?php wp_head(); ?>
        </head>
        <body <?php body_class(); ?>>
            <main class="wp-site-blocks sc-commerce-access-gate">
                <h1><?php esc_html_e('Subscriber access', 'smartcloud-commerce'); ?></h1>
                <p role="status" data-commerce-access-path="<?php echo esc_attr($path); ?>"><?php esc_html_e('Sign in with the account that has access to this content.', 'smartcloud-commerce'); ?></p>
                <?php if ($signInUrl !== '') : ?>
                    <p><a href="<?php echo esc_url(add_query_arg('redirect_to', self::absolutePath($path), $signInUrl)); ?>"><?php esc_html_e('Sign in', 'smartcloud-commerce'); ?></a></p>
                <?php endif; ?>
            </main>
            <?php wp_footer(); ?>
        </body>
        </html>
        <?php
        exit;
    }
}
