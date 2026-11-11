<?php
declare(strict_types=1);

define('APP_ROOT', dirname(__DIR__));
const APP_NAME = 'Meus Treinos';
const APP_VERSION = '3.7.0';

$GLOBALS['CONFIG'] = is_file(APP_ROOT . '/config.php') ? (require APP_ROOT . '/config.php') : null;

function cfg(string $key, mixed $default = null): mixed
{
    return $GLOBALS['CONFIG'][$key] ?? $default;
}

date_default_timezone_set((string) cfg('timezone', 'America/Fortaleza'));

if (cfg('debug')) {
    ini_set('display_errors', '1');
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', '0');
}

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('mt_sess');
    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 30,
        'path'     => '/',
        'secure'   => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    // Pasta de sessões só deste app: em hospedagem compartilhada, o "faxineiro" de outros sites poderia apagar as nossas.
    $dir = APP_ROOT . '/storage/sessions';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    if (is_dir($dir) && is_writable($dir)) session_save_path($dir);
    ini_set('session.gc_maxlifetime', (string) (60 * 60 * 24 * 30));
    ini_set('session.gc_probability', '1');
    ini_set('session.gc_divisor', '100');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_start();
}

header_remove('X-Powered-By');
