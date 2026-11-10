<?php
declare(strict_types=1);

/* ---------- Banco ---------- */
final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo) return self::$pdo;
        $dsn = 'mysql:host=' . cfg('db_host', 'localhost') . (cfg('db_port') ? ';port=' . (int) cfg('db_port') : '') . ';dbname=' . cfg('db_name') . ';charset=utf8mb4';
        self::$pdo = new PDO($dsn, (string) cfg('db_user'), (string) cfg('db_pass'), [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
        // Mantém o MySQL no mesmo fuso do PHP (datas gravadas e lidas coerentes).
        self::$pdo->exec("SET time_zone = '" . (new DateTime())->format('P') . "'");
        return self::$pdo;
    }

    public static function run(string $sql, array $p = []): PDOStatement
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($p);
        return $st;
    }
    public static function all(string $sql, array $p = []): array { return self::run($sql, $p)->fetchAll(); }
    public static function one(string $sql, array $p = []): ?array { $r = self::run($sql, $p)->fetch(); return $r === false ? null : $r; }
    public static function val(string $sql, array $p = []): mixed { $r = self::run($sql, $p)->fetchColumn(); return $r === false ? null : $r; }
    public static function id(): int { return (int) self::pdo()->lastInsertId(); }
}

/* ---------- HTTP ---------- */
function j(mixed $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function fail(string $msg, int $code = 422): never { j(['error' => $msg], $code); }
/** Responde já e segue trabalhando (ex.: enviar mensagem): o tempo de resposta não revela se o e-mail existe. */
function respond_then_continue(array $data): void
{
    $json = (string) json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    ignore_user_abort(true);
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); header('Connection: close'); header('Content-Length: ' . strlen($json));
    echo $json;
    while (ob_get_level() > 0) @ob_end_flush();
    flush();
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();
}

function body(): array
{
    static $b = null;
    if ($b !== null) return $b;
    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > 1_000_000) fail('Requisição grande demais.', 413);
    $d = json_decode($raw, true);
    return $b = is_array($d) ? $d : [];
}

/* ---------- Validação ---------- */
function v_str(mixed $v, string $label, int $min = 1, int $max = 120): string
{
    if (!is_string($v)) fail("$label inválido.");
    $v = trim(preg_replace('/\s+/u', ' ', $v) ?? '');
    $len = mb_strlen($v);
    if ($len < $min || $len > $max) fail("$label deve ter entre $min e $max caracteres.");
    return $v;
}
function v_num(mixed $v, string $label, float $min, float $max): float
{
    if (!is_numeric($v)) fail("$label inválido.");
    $n = (float) $v;
    if ($n < $min || $n > $max) fail("$label fora do intervalo ($min a $max).");
    return $n;
}
function v_int(mixed $v, string $label, int $min, int $max): int { return (int) round(v_num($v, $label, $min, $max)); }
function v_date(mixed $v, string $label = 'Data'): string
{
    if (!is_string($v) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) fail("$label inválida.");
    [$y, $m, $d] = array_map('intval', explode('-', $v));
    if (!checkdate($m, $d, $y)) fail("$label inválida.");
    return $v;
}

/* ---------- Datas ---------- */
function now(): string { return date('Y-m-d H:i:s'); }
function iso(?string $dt): ?string
{
    return $dt === null ? null : str_replace(' ', 'T', $dt) . (new DateTime())->format('P');
}

/* ---------- Auth / CSRF ---------- */
function csrf_token(): string
{
    start_session();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(24));
    return $_SESSION['csrf'];
}
function csrf_check(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($sent) || !hash_equals(csrf_token(), $sent)) fail('Sessão expirada. Recarregue a página.', 403);
}
/** Motivo pelo qual esta conta NÃO pode entrar agora (null = pode). O gestor geral nunca expira. */
function access_denied_reason(array $u): ?string
{
    if ($u['role'] === 'super') return null;
    if ($u['status'] === 'pendente') return 'Seu cadastro ainda aguarda a aprovação da sua empresa.';
    if ($u['status'] === 'bloqueado') return EXPIRED_MSG;
    if ($u['company_id'] && ($u['company_status'] ?? 'ativa') === 'suspensa') return EXPIRED_MSG;
    $today = date('Y-m-d');
    if (!empty($u['company_until']) && $u['company_until'] < $today) return EXPIRED_MSG;
    if (!empty($u['access_until']) && $u['access_until'] < $today) return EXPIRED_MSG;
    return null;
}
const EXPIRED_MSG = 'Sua assinatura expirou. Entre em contato com o seu personal ou com a sua academia para renovar o acesso.';
/** O usuário pode renovar sozinho? Só quando o acesso DELE venceu (não quando foi bloqueado à mão, nem quando a empresa venceu/foi suspensa). */
function can_self_renew(array $u): bool
{
    return $u['role'] === 'aluno' && $u['status'] === 'ativo' && !empty($u['company_id']) && ($u['company_status'] ?? 'ativa') === 'ativa'
        && (empty($u['company_until']) || $u['company_until'] >= date('Y-m-d')) && !empty($u['access_until']) && $u['access_until'] < date('Y-m-d');
}

/* ---------- Senha forte e dados de contato ---------- */
/** Regra única de senha: 12 a 72 caracteres ASCII visíveis (sem espaço), com minúscula, maiúscula, número e símbolo. (72 = limite do bcrypt.) */
function pw_policy_error(mixed $p): ?string
{
    if (!is_string($p)) return 'Senha inválida.';
    if (strlen($p) < 12) return 'A senha precisa ter no mínimo 12 caracteres.';
    if (strlen($p) > 72) return 'A senha pode ter no máximo 72 caracteres.';
    if (!preg_match('/^[\x21-\x7E]+$/', $p)) return 'Use só letras sem acento, números e símbolos (sem espaços).';
    if (!preg_match('/[a-z]/', $p)) return 'A senha precisa ter uma letra minúscula.';
    if (!preg_match('/[A-Z]/', $p)) return 'A senha precisa ter uma letra MAIÚSCULA.';
    if (!preg_match('/\d/', $p)) return 'A senha precisa ter um número.';
    if (!preg_match('/[^A-Za-z0-9]/', $p)) return 'A senha precisa ter um símbolo, como # @ ! $ % & * ?';
    return null;
}
function require_strong_password(mixed $p): string { if ($e = pw_policy_error($p)) fail($e); return $p; }
function valid_email(mixed $v, string $label = 'E-mail'): string
{
    $e = strtolower(v_str($v, $label, 5, 190));
    if (!filter_var($e, FILTER_VALIDATE_EMAIL) || preg_match('/\s/', $e)) fail("$label inválido: use o formato nome@dominio.com.");
    return $e;
}
/** CPF (11 dígitos) ou CNPJ (14) com dígitos verificadores. Devolve só os números. */
function valid_tax_id(mixed $v): string
{
    $d = preg_replace('/\D+/', '', (string) $v) ?? '';
    $ok = false;
    if (strlen($d) === 11 && !preg_match('/^(\d)\1{10}$/', $d)) {
        $ok = true;
        for ($t = 9; $t < 11; $t++) { $s = 0; for ($i = 0; $i < $t; $i++) $s += (int) $d[$i] * ($t + 1 - $i); if (((10 * $s) % 11) % 10 !== (int) $d[$t]) $ok = false; }
    } elseif (strlen($d) === 14 && !preg_match('/^(\d)\1{13}$/', $d)) {
        $ok = true;
        foreach ([[12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]], [13, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]] as [$pos, $w]) {
            $s = 0; foreach ($w as $i => $k) $s += (int) $d[$i] * $k; $r = $s % 11; $dv = $r < 2 ? 0 : 11 - $r;
            if ($dv !== (int) $d[$pos]) $ok = false;
        }
    }
    if (!$ok) fail('Informe um CPF ou CNPJ válido.');
    return $d;
}
function referral_code_for(int $uid): string
{
    $c = Db::val('SELECT referral_code FROM users WHERE id=?', [$uid]);
    if ($c) return $c;
    $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for ($try = 0; $try < 20; $try++) {
        $c = 'IND-'; for ($i = 0; $i < 6; $i++) $c .= $abc[random_int(0, strlen($abc) - 1)];
        if (Db::run('UPDATE users SET referral_code=? WHERE id=? AND referral_code IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT 1 FROM users WHERE referral_code=?) x)', [$c, $uid, $c])->rowCount()) return $c;
        $got = Db::val('SELECT referral_code FROM users WHERE id=?', [$uid]); if ($got) return $got;
    }
    fail('Não consegui gerar o código de indicação. Tente de novo.', 500);
}
function brl(int $cents): string { return 'R$ ' . number_format($cents / 100, 2, ',', '.'); }

const USER_SELECT = 'SELECT u.id,u.name,u.email,u.unit,u.week_start,u.role,u.status,u.company_id,u.personal_id,u.whatsapp,u.access_until,u.eval_every_days,u.must_change_password,u.pwd_version,u.password_hash,
                            c.name company_name, c.status company_status, c.access_until company_until
                     FROM users u LEFT JOIN companies c ON c.id=u.company_id ';

function current_user(): ?array
{
    start_session();
    if (empty($_SESSION['uid'])) return null;
    static $cache = [];
    $id = (int) $_SESSION['uid'];
    if (!array_key_exists($id, $cache)) {
        $row = Db::one(USER_SELECT . 'WHERE u.id=?', [$id]);
        $reason = $row ? access_denied_reason($row) : 'Conta não encontrada.';
        // senha trocada em outro aparelho: esta sessão deixa de valer
        if (!$reason && ((int) ($_SESSION['pv'] ?? 0)) !== (int) $row['pwd_version']) $reason = 'Sua senha foi alterada. Entre novamente.';
        if ($reason) { $GLOBALS['ACCESS_DENIED'] = $reason; $_SESSION = []; $row = null; }
        if ($row) unset($row['password_hash']);
        $cache[$id] = $row;
    }
    return $cache[$id];
}
function require_user(): array
{
    $u = current_user();
    if (!$u) fail($GLOBALS['ACCESS_DENIED'] ?? 'Faça login para continuar.', 401);
    return $u;
}
function require_role(array $u, string ...$roles): void
{
    if (!in_array($u['role'], $roles, true)) fail('Você não tem permissão para isso.', 403);
}
/** Dados do usuário que o front pode ver (nunca a senha). */
function user_public(array $u): array
{
    return numify(array_intersect_key($u, array_flip(['id', 'name', 'email', 'unit', 'week_start', 'role', 'company_id', 'company_name', 'personal_id', 'whatsapp', 'access_until', 'eval_every_days', 'must_change_password'])),
        [], ['id', 'week_start', 'company_id', 'personal_id', 'eval_every_days'], ['must_change_password']);
}
/** Converte o período escolhido na data de fim do acesso. $from = validade atual, ao renovar (soma a partir dela se ainda for futura). */
function period_to_date(mixed $kind, mixed $custom, ?string $from = null): string
{
    $base = new DateTimeImmutable($from && $from > date('Y-m-d') ? $from : date('Y-m-d'));
    $map = ['30d' => '+30 days', '2m' => '+2 months', '3m' => '+3 months', '6m' => '+6 months', '12m' => '+12 months', '24m' => '+24 months'];
    if ($kind === 'custom') {
        $d = v_date($custom, 'Data de validade');
        if ($d < date('Y-m-d')) fail('A validade precisa ser uma data futura.');
        return $d;
    }
    if (!is_string($kind) || !isset($map[$kind])) fail('Escolha o período de acesso.');
    return $base->modify($map[$kind])->format('Y-m-d');
}

function client_ip(): string { return substr((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45); }

/* ---------- Senhas ---------- */
const PW_COST = 11; // custo do bcrypt: ~100 ms por conferência, alto o bastante contra força bruta e leve para hospedagem compartilhada
const DUMMY_HASH = '$2y$11$qryv.fKFmvLXlew47jcDeeVfAWPB6atRKqV/x5PEp8oRl2H.QWZGW'; // hash válido de uma senha que ninguém tem: usado quando o e-mail não existe, para o login demorar igual
function hash_pw(string $plain): string { return password_hash($plain, PASSWORD_BCRYPT, ['cost' => PW_COST]); }

/* ---------- Treino: cálculos ---------- */
function epley(float $w, int $r): float { return $r > 0 ? $w * (1 + $r / 30) : 0.0; }

/** Linhas do banco com colunas numéricas (DECIMAL vem como string) */
function numify(array $row, array $floats = [], array $ints = [], array $bools = []): array
{
    foreach ($floats as $k) if (array_key_exists($k, $row) && $row[$k] !== null) $row[$k] = (float) $row[$k];
    foreach ($ints as $k)   if (array_key_exists($k, $row) && $row[$k] !== null) $row[$k] = (int) $row[$k];
    foreach ($bools as $k)  if (array_key_exists($k, $row)) $row[$k] = (bool) $row[$k];
    return $row;
}


/** Registra um acesso ou uma alteração sensível. $throttleMin evita encher o registro com o mesmo ato repetido. */
function audit(array $actor, ?int $targetId, string $action, string $detail = '', int $throttleMin = 0): void
{
    if ($throttleMin > 0 && Db::val('SELECT 1 FROM audit_log WHERE actor_id=? AND target_id=? AND action=? AND created_at > (NOW() - INTERVAL ' . (int) $throttleMin . ' MINUTE) LIMIT 1', [$actor['id'], $targetId, $action])) return;
    $cid = $targetId ? Db::val('SELECT company_id FROM users WHERE id=?', [$targetId]) : ($actor['company_id'] ?? null);
    Db::run('INSERT INTO audit_log (company_id,actor_id,target_id,action,detail,created_at) VALUES (?,?,?,?,?,?)', [$cid ?: ($actor['company_id'] ?? null), $actor['id'], $targetId, $action, mb_substr($detail, 0, 200) ?: null, now()]);
}
