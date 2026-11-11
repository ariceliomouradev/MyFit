<?php
declare(strict_types=1);

/**
 * Catálogo de exercícios: lê database/catalogo/*.json (escrito em português) e grava no banco.
 * Pode rodar quantas vezes quiser: atualiza pelo "slug" e não mexe nos exercícios criados pelo usuário.
 * Uso: install.php (primeira vez) ou  php tools/seed.php  (depois de editar os JSON).
 */
function catalog_seed(PDO $pdo): int
{
    $dir = APP_ROOT . '/database/catalogo';
    $mediaFile = $dir . '/_media.json';
    $media = is_file($mediaFile) ? (json_decode((string) file_get_contents($mediaFile), true) ?: []) : [];

    $sql = 'INSERT INTO exercises
              (user_id,slug,name,muscle,equipment,type,secondary,target,environment,role,level,impact,pace,rep_def,steps,tips,mistakes,media,hold_sec,created_at)
            VALUES (NULL,:slug,:name,:muscle,:equipment,:type,:secondary,:target,:environment,:role,:level,:impact,:pace,:rep_def,:steps,:tips,:mistakes,:media,:hold,NOW())
            ON DUPLICATE KEY UPDATE name=VALUES(name),muscle=VALUES(muscle),equipment=VALUES(equipment),type=VALUES(type),
              secondary=VALUES(secondary),target=VALUES(target),environment=VALUES(environment),role=VALUES(role),level=VALUES(level),
              impact=VALUES(impact),pace=VALUES(pace),rep_def=VALUES(rep_def),steps=VALUES(steps),tips=VALUES(tips),
              mistakes=VALUES(mistakes),media=VALUES(media),hold_sec=VALUES(hold_sec)';
    $st = $pdo->prepare($sql);
    $json = static fn($v) => json_encode(array_values($v ?? []), JSON_UNESCAPED_UNICODE);
    $n = 0;
    $pdo->beginTransaction();
    foreach (glob($dir . '/*.json') ?: [] as $file) {
        if (str_starts_with(basename($file), '_')) continue;
        foreach (json_decode((string) file_get_contents($file), true) ?: [] as $e) {
            $st->execute([
                'slug' => $e['slug'], 'name' => $e['nome'], 'muscle' => $e['grupo'], 'equipment' => $e['equipamento'],
                'type' => ($e['tipo'] ?? 'reps') === 'time' ? 'time' : 'reps',
                'secondary' => implode(',', $e['secundarios'] ?? []) ?: null,
                'target' => $e['alvo'] ?? null,
                'environment' => $e['ambiente'], 'role' => $e['papel'], 'level' => (int) ($e['nivel'] ?? 1),
                'impact' => ($e['impacto'] ?? 'baixo') === 'alto' ? 'alto' : 'baixo',
                'pace' => $e['ritmo'] ?? null, 'rep_def' => $e['repeticao'] ?? null,
                'steps' => $json($e['passos'] ?? []), 'tips' => $json($e['dicas'] ?? []), 'mistakes' => $json($e['erros'] ?? []),
                'media' => isset($media[$e['slug']]) ? (str_starts_with($media[$e['slug']], 'https://') ? $media[$e['slug']] : $media[$e['slug']] . '?v=' . (int) @filemtime(APP_ROOT . '/' . $media[$e['slug']])) : null, // ?v= força o navegador a pegar a versão nova
                'hold' => isset($e['tempo_sugerido']) ? (int) $e['tempo_sugerido'] : null,
            ]);
            $n++;
        }
    }
    $pdo->commit();
    return $n;
}
