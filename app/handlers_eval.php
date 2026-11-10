<?php
declare(strict_types=1);

/* =====================================================================
 *  Avaliações periódicas: peso + medidas + 4 fotos (frente, lados e costas)
 *
 *  As fotos são privadas: ficam em storage/ (pasta bloqueada pelo servidor) e só saem
 *  por /api/photos/ID depois de conferir quem está pedindo. Cada foto é redimensionada e
 *  regravada como JPEG, o que também apaga dados EXIF (como a localização do celular).
 * ===================================================================== */

const ANGLES = ['frente', 'lado_esq', 'costas', 'lado_dir'];
const MCOLS = ['weight', 'chest', 'waist', 'hip', 'thigh', 'calf', 'arm', 'forearm'];

/** Linha do tempo: cada dia com medidas e/ou fotos. $withPhotos=false esconde os ids das fotos (só conta quantas há). */
function evaluations_for(int $uid, bool $withPhotos): array
{
    $ms = Db::all('SELECT * FROM measurements WHERE user_id=? ORDER BY day DESC LIMIT 200', [$uid]);
    $ph = Db::all('SELECT id,day,angle FROM body_photos WHERE user_id=?', [$uid]);
    $byDay = [];
    foreach ($ph as $r) $byDay[$r['day']][$r['angle']] = (int) $r['id'];
    $out = [];
    $seen = [];
    foreach ($ms as $m) {
        $seen[$m['day']] = true;
        $row = ['id' => (int) $m['id'], 'day' => $m['day']];
        foreach (MCOLS as $c) $row[$c] = $m[$c] === null ? null : (float) $m[$c];
        $photos = $byDay[$m['day']] ?? [];
        $row['photos'] = $withPhotos ? (object) $photos : (object) [];
        $row['photo_count'] = count($photos);
        $out[] = $row;
    }
    foreach ($byDay as $day => $photos) { // fotos de um dia sem medidas
        if (isset($seen[$day])) continue;
        $row = ['id' => null, 'day' => $day] + array_fill_keys(MCOLS, null);
        $row['photos'] = $withPhotos ? (object) $photos : (object) [];
        $row['photo_count'] = count($photos);
        $out[] = $row;
    }
    usort($out, fn($a, $b) => strcmp($b['day'], $a['day']));
    return $out;
}

function h_evaluations(array $p, array $u): void
{
    $uid = (int) $u['id'];
    $es = evaluations_for($uid, true);
    $every = (int) $u['eval_every_days'];
    $last = $es[0]['day'] ?? null;
    $next = $last ? date('Y-m-d', strtotime("$last +$every days")) : date('Y-m-d');
    $profile = profile_row($uid);
    $m = latest_measure($uid);
    j(['entries' => $es, 'every_days' => $every, 'last_day' => $last, 'next_due' => $next, 'due' => $next <= date('Y-m-d'),
       'days_to_due' => (int) floor((strtotime($next) - strtotime(date('Y-m-d'))) / 86400),
       'profile' => $profile, 'analysis' => ($profile && $m) ? analysis_for($profile, $m) : null]);
}

function h_evaluation_save(array $p, array $u): void
{
    $in = body();
    $profile = profile_row((int) $u['id']);
    $b = body_input($in + ['sex' => $profile['sex'] ?? '', 'height_cm' => $profile['height_cm'] ?? null]);
    $day = v_date($in['day'] ?? date('Y-m-d'));
    if ($day > date('Y-m-d')) fail('A data não pode estar no futuro.');
    save_measurement((int) $u['id'], $day, $b['weight'], $b['measures']);
    h_evaluations([], $u);
}

function h_evaluation_delete(array $p, array $u): void
{
    $m = Db::one('SELECT * FROM measurements WHERE id=? AND user_id=?', [(int) $p['id'], $u['id']]);
    if ($m) {
        foreach (Db::all('SELECT id,file FROM body_photos WHERE user_id=? AND day=?', [$u['id'], $m['day']]) as $ph) @unlink(APP_ROOT . '/storage/photos/' . (int) $u['id'] . '/' . basename($ph['file']));
        Db::run('DELETE FROM body_photos WHERE user_id=? AND day=?', [$u['id'], $m['day']]);
        Db::run('DELETE FROM measurements WHERE id=?', [$m['id']]);
        Db::run('DELETE FROM body_weights WHERE user_id=? AND day=?', [$u['id'], $m['day']]);
    }
    h_evaluations([], $u);
}

function h_photo_upload(array $p, array $u): void
{
    if (!function_exists('imagecreatefromstring') || !function_exists('imagejpeg')) fail('O servidor não tem a extensão GD (necessária para as fotos). Ative no hPanel.', 500);
    $day = v_date($_POST['day'] ?? '');
    if ($day > date('Y-m-d')) fail('A data não pode estar no futuro.');
    if ($day < date('Y-m-d', strtotime('-400 days'))) fail('A data da foto é antiga demais (máximo 400 dias).');
    if ((int) Db::val('SELECT COUNT(*) FROM body_photos WHERE user_id=? AND created_at > (NOW() - INTERVAL 1 HOUR)', [$u['id']]) >= 40) fail('Muitas fotos em pouco tempo. Tente de novo daqui a pouco.', 429);
    if ((int) Db::val('SELECT COUNT(*) FROM body_photos WHERE user_id=?', [$u['id']]) >= 400) fail('Limite de fotos atingido. Exclua avaliações antigas.', 422);
    $angle = $_POST['angle'] ?? '';
    if (!in_array($angle, ANGLES, true)) fail('Ângulo inválido.');
    $f = $_FILES['file'] ?? null;
    if (!$f || $f['error'] !== UPLOAD_ERR_OK) fail($f && in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 'A foto passa do limite do servidor.' : 'Não consegui receber a foto. Tente de novo.');
    if ($f['size'] > 15 * 1024 * 1024) fail('Foto grande demais.');
    $info = @getimagesize($f['tmp_name']);
    if (!$info || !in_array($info['mime'], ['image/jpeg', 'image/png', 'image/webp'], true)) fail('Envie uma foto JPG, PNG ou WebP.');
    if ($info[0] * $info[1] > 16_000_000) fail('Foto grande demais (máximo ~16 megapixels).');
    $img = @imagecreatefromstring((string) file_get_contents($f['tmp_name']));
    if (!$img) fail('Não consegui ler essa foto.');
    $w = imagesx($img); $h = imagesy($img); $max = 1280;
    if (max($w, $h) > $max) { $k = $max / max($w, $h); $img = imagescale($img, (int) round($w * $k), (int) round($h * $k)) ?: $img; }
    $dir = APP_ROOT . '/storage/photos/' . (int) $u['id'];
    if (!is_dir($dir)) @mkdir($dir, 0750, true);
    $name = bin2hex(random_bytes(12)) . '.jpg';
    if (!imagejpeg($img, "$dir/$name", 82)) fail('Não consegui salvar a foto (permissão da pasta storage).', 500);
    $old = Db::one('SELECT id,file FROM body_photos WHERE user_id=? AND day=? AND angle=?', [$u['id'], $day, $angle]);
    Db::run('INSERT INTO body_photos (user_id,day,angle,file,created_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE file=VALUES(file), created_at=VALUES(created_at)', [$u['id'], $day, $angle, $name, now()]);
    if ($old) @unlink("$dir/" . basename($old['file']));
    j(['id' => (int) Db::val('SELECT id FROM body_photos WHERE user_id=? AND day=? AND angle=?', [$u['id'], $day, $angle]), 'day' => $day, 'angle' => $angle], 201);
}

function h_photo_get(array $p, array $u): void
{
    $ph = Db::one('SELECT * FROM body_photos WHERE id=?', [(int) $p['id']]);
    if (!$ph) fail('Foto não encontrada.', 404);
    $owner = Db::one('SELECT id,personal_id,company_id FROM users WHERE id=?', [$ph['user_id']]);
    if (!$owner || !can_view_photos($u, $owner)) fail('Foto não encontrada.', 404); // 404 de propósito: não confirma que existe
    if ((int) $u['id'] !== (int) $owner['id']) audit($u, (int) $owner['id'], 'fotos_vistas', '', 60);
    $path = APP_ROOT . '/storage/photos/' . (int) $ph['user_id'] . '/' . basename($ph['file']);
    if (!is_file($path)) fail('Foto não encontrada.', 404);
    header('Content-Type: image/jpeg');
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: no-store'); // foto de corpo não fica no cache do aparelho
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}

function h_photo_delete(array $p, array $u): void
{
    $ph = Db::one('SELECT * FROM body_photos WHERE id=? AND user_id=?', [(int) $p['id'], $u['id']]);
    if ($ph) {
        @unlink(APP_ROOT . '/storage/photos/' . (int) $u['id'] . '/' . basename($ph['file']));
        Db::run('DELETE FROM body_photos WHERE id=?', [$ph['id']]);
    }
    h_evaluations([], $u);
}
