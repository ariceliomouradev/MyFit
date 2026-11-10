<?php
declare(strict_types=1);

/* =====================================================================
 *  Marca (white-label): logo, nome exibido, slogan e paleta de cores.
 *
 *  Três níveis, do mais forte ao mais fraco:  empresa  >  gestor geral (global)  >  padrão do app.
 *  Campo vazio na empresa = herda do global. Quem edita:
 *    - gestor geral: o global e qualquer empresa
 *    - administrador: só a própria empresa
 *  O tema é escuro; para a leitura nunca quebrar, o servidor exige fundo escuro e contraste mínimo
 *  entre a cor de destaque e o fundo (WCAG 3:1, o mínimo para botões e elementos de interface).
 * ===================================================================== */

const BRAND_DEFAULT = ['app_name' => 'Meus Treinos', 'slogan' => 'Seu diário de treino, rotinas e recordes.', 'accent' => '#f5a524', 'bg' => '#101418', 'logo' => null];

function hex_valid(mixed $v): bool { return is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v) === 1; }

/** Luminância relativa (WCAG 2.x) de uma cor #rrggbb. */
function hex_lum(string $hex): float
{
    $c = [hexdec(substr($hex, 1, 2)), hexdec(substr($hex, 3, 2)), hexdec(substr($hex, 5, 2))];
    foreach ($c as &$v) { $v /= 255; $v = $v <= 0.03928 ? $v / 12.92 : (($v + 0.055) / 1.055) ** 2.4; }
    return 0.2126 * $c[0] + 0.7152 * $c[1] + 0.0722 * $c[2];
}
function contrast_ratio(string $a, string $b): float
{
    [$x, $y] = [hex_lum($a), hex_lum($b)];
    return (max($x, $y) + 0.05) / (min($x, $y) + 0.05);
}

function brand_key(?int $cid): string { return $cid ? 'c' . $cid : 'global'; }

/** Marca que vale para quem está no nível $cid (null = visitante ou sem empresa). */
function brand_effective(?int $cid): array
{
    $keys = $cid ? ['global', brand_key($cid)] : ['global'];
    $rows = [];
    foreach (Db::all('SELECT * FROM brandings WHERE scope_key IN (' . implode(',', array_fill(0, count($keys), '?')) . ')', $keys) as $r) $rows[$r['scope_key']] = $r;
    $b = BRAND_DEFAULT;
    foreach ($keys as $k) {
        foreach (['app_name', 'slogan', 'accent', 'bg', 'logo'] as $f) if (isset($rows[$k][$f]) && $rows[$k][$f] !== '') $b[$f] = $rows[$k][$f];
    }
    $logoRow = null;
    foreach (array_reverse($keys) as $k) if (!empty($rows[$k]['logo'])) { $logoRow = $rows[$k]; break; }
    $b['logo'] = $logoRow ? brand_logo_url($logoRow['logo'], $logoRow['updated_at']) : null;
    return $b;
}
function brand_logo_url(string $file, string $updated): string { return 'uploads/marca/' . basename($file) . '?v=' . strtotime($updated); }

/** Nível que o ator está editando: administrador = a própria empresa; gestor = global ou a empresa escolhida. */
function brand_scope(array $u, mixed $explicit = null): ?int
{
    require_role($u, 'admin', 'super');
    if ($u['role'] === 'admin') return (int) $u['company_id'];
    $cid = (int) ($explicit ?? $_GET['company_id'] ?? 0);
    if ($cid && !Db::val('SELECT 1 FROM companies WHERE id=?', [$cid])) fail('Empresa não encontrada.', 404);
    return $cid ?: null;
}

function h_brand_get(array $p, array $u): void
{
    $cid = brand_scope($u);
    $row = Db::one('SELECT * FROM brandings WHERE scope_key=?', [brand_key($cid)]) ?: [];
    j(['scope' => ['type' => $cid ? 'empresa' : 'global', 'company_id' => $cid, 'company_name' => $cid ? Db::val('SELECT name FROM companies WHERE id=?', [$cid]) : null],
       'raw' => ['app_name' => $row['app_name'] ?? null, 'slogan' => $row['slogan'] ?? null, 'accent' => $row['accent'] ?? null, 'bg' => $row['bg'] ?? null,
                 'logo' => !empty($row['logo']) ? brand_logo_url($row['logo'], $row['updated_at']) : null],
       'effective' => brand_effective($cid),
       'parent' => $cid ? brand_effective(null) : BRAND_DEFAULT]);
}

function h_brand_save(array $p, array $u): void
{
    $in = body();
    $cid = brand_scope($u, $in['company_id'] ?? null);
    $key = brand_key($cid);
    $old = Db::one('SELECT * FROM brandings WHERE scope_key=?', [$key]) ?: [];
    $text = static function (string $f, string $label, int $max, int $min) use ($in, $old) {
        if (!array_key_exists($f, $in)) return $old[$f] ?? null;
        $v = trim(preg_replace('/\s+/u', ' ', (string) $in[$f]) ?? '');
        if ($v === '') return null;
        if (preg_match('/[\x00-\x1f\x7f<>]/u', $v)) fail("$label não pode ter símbolos < > nem caracteres de controle.");
        $len = mb_strlen($v);
        if ($len < $min || $len > $max) fail("$label deve ter entre $min e $max caracteres.");
        return $v;
    };
    $name = $text('app_name', 'O nome', 40, 2);
    $slogan = $text('slogan', 'O slogan', 90, 2);
    $color = static function (string $f, string $label) use ($in, $old) {
        if (!array_key_exists($f, $in)) return $old[$f] ?? null;
        $v = $in[$f];
        if ($v === '' || $v === null) return null;
        if (!hex_valid($v)) fail("$label inválida. Use o formato #rrggbb.");
        return strtolower($v);
    };
    $accent = $color('accent', 'A cor de destaque');
    $bg = $color('bg', 'A cor de fundo');

    // valida a combinação que vai valer de fato (herdando o que a empresa não definiu)
    $parent = $cid ? brand_effective(null) : BRAND_DEFAULT;
    $effAccent = $accent ?? $parent['accent'];
    $effBg = $bg ?? $parent['bg'];
    if (hex_lum($effBg) > 0.12) fail('O fundo precisa ser escuro (o app tem tema escuro). Escolha uma cor mais escura.');
    if (contrast_ratio($effAccent, $effBg) < 3.0) fail('A cor de destaque tem pouco contraste com o fundo e o texto ficaria difícil de ler. Escolha uma mais clara ou mais viva.');

    Db::run('INSERT INTO brandings (scope_key,company_id,app_name,slogan,accent,bg,updated_at) VALUES (?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE app_name=VALUES(app_name), slogan=VALUES(slogan), accent=VALUES(accent), bg=VALUES(bg), updated_at=VALUES(updated_at)',
        [$key, $cid, $name, $slogan, $accent, $bg, now()]);
    j(['effective' => brand_effective($cid), 'mine' => $u['role'] === 'admin' || (int) ($u['company_id'] ?? 0) === (int) $cid]);
}

function logo_dir(): string { return APP_ROOT . '/uploads/marca'; }

/** Logo: PNG, JPG ou WebP até 3 MB. Sempre regravada como PNG (máx. 512 px), o que descarta qualquer conteúdo escondido. SVG não é aceito de propósito. */
function h_brand_logo(array $p, array $u): void
{
    $cid = brand_scope($u, $_POST['company_id'] ?? null);
    if (!function_exists('imagecreatefromstring')) fail('O servidor não tem a extensão GD (necessária para a logo).', 500);
    $f = $_FILES['file'] ?? null;
    if (!$f || $f['error'] !== UPLOAD_ERR_OK) fail($f && in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 'O arquivo passa do limite do servidor. Use um de até 3 MB.' : 'Não consegui receber o arquivo. Tente de novo.');
    if ($f['size'] > 3 * 1024 * 1024) fail('A logo passa de 3 MB.');
    $info = @getimagesize($f['tmp_name']);
    if (!$info || !in_array($info['mime'], ['image/png', 'image/jpeg', 'image/webp'], true)) fail('Formato não aceito. Envie PNG, JPG ou WebP (SVG não é aceito).');
    if ($info[0] * $info[1] > 25_000_000) fail('Imagem grande demais.');
    $src = @imagecreatefromstring((string) file_get_contents($f['tmp_name']));
    if (!$src) fail('Não consegui ler essa imagem.');
    $w = imagesx($src); $h = imagesy($src); $k = min(1, 512 / max($w, $h));
    $nw = max(1, (int) round($w * $k)); $nh = max(1, (int) round($h * $k));
    $dst = imagecreatetruecolor($nw, $nh);
    imagealphablending($dst, false); imagesavealpha($dst, true);
    imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    if (!is_dir(logo_dir())) @mkdir(logo_dir(), 0755, true);
    $name = brand_key($cid) . '-' . bin2hex(random_bytes(6)) . '.png';
    if (!imagepng($dst, logo_dir() . '/' . $name, 6)) fail('Não consegui salvar a logo (permissão da pasta uploads).', 500);
    $old = Db::val('SELECT logo FROM brandings WHERE scope_key=?', [brand_key($cid)]);
    Db::run('INSERT INTO brandings (scope_key,company_id,logo,updated_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE logo=VALUES(logo), updated_at=VALUES(updated_at)', [brand_key($cid), $cid, $name, now()]);
    if ($old) @unlink(logo_dir() . '/' . basename($old));
    j(['effective' => brand_effective($cid)]);
}

function h_brand_logo_delete(array $p, array $u): void
{
    $cid = brand_scope($u);
    $old = Db::val('SELECT logo FROM brandings WHERE scope_key=?', [brand_key($cid)]);
    if ($old) { @unlink(logo_dir() . '/' . basename($old)); Db::run('UPDATE brandings SET logo=NULL, updated_at=? WHERE scope_key=?', [now(), brand_key($cid)]); }
    j(['effective' => brand_effective($cid)]);
}

function h_health(array $p): void
{
    try { Db::val('SELECT 1'); } catch (Throwable $e) { error_log('[meus-treinos] saude: ' . $e->getMessage()); fail('Banco de dados indisponível.', 503); }
    j(['ok' => true, 'db' => true, 'version' => APP_VERSION]);
}
