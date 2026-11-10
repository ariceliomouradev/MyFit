<?php
declare(strict_types=1);

/**
 * Planner: a "inteligência" do app. Tudo aqui é regra, sem IA e sem rede.
 *
 *   Planner::analyze()  -> IMC, faixa de peso saudável, pontos de atenção pelas medidas
 *   Planner::build()    -> monta a tabela de treinos a partir do perfil + catálogo de exercícios
 *
 * De onde vem cada ideia (para estudo):
 *  - Divisões de treino (corpo inteiro / superior-inferior / empurrar-puxar-pernas): inspiradas nos
 *    planos iniciais do openGym (frontend/src/lib/starter.js), reescritas por papel muscular e não por id.
 *  - Faixas semanais de séries por músculo: openGym (lib/muscle-targets.js), base Schoenfeld/RP.
 *  - Regra "peso corporal sempre disponível / academia exige equipamento": openGym (lib/equipment.js).
 *  - IMC, relação cintura/altura, proporções e a escolha de séries/repetições por objetivo:
 *    NÃO existem no openGym; são regras simples escritas para este app (referências gerais de
 *    educação física, não substituem avaliação profissional).
 */
final class Planner
{
    /* ------------------------------------------------------------------ */
    /*  1. ANÁLISE (IMC + medidas)                                        */
    /* ------------------------------------------------------------------ */

    /** Classificação do IMC pela OMS: [limite superior exclusivo, rótulo, tom visual]. */
    private const BMI_CLASSES = [
        [16.0, 'Magreza grave', 'bad'],
        [17.0, 'Magreza moderada', 'warn'],
        [18.5, 'Abaixo do peso', 'warn'],
        [25.0, 'Peso normal', 'ok'],
        [30.0, 'Sobrepeso', 'warn'],
        [35.0, 'Obesidade grau I', 'bad'],
        [40.0, 'Obesidade grau II', 'bad'],
        [999., 'Obesidade grau III', 'bad'],
    ];

    /**
     * @param array $in {sex:'M'|'F', height_cm, weight, measures:{chest,waist,hip,thigh,calf,arm,forearm}}
     */
    public static function analyze(array $in): array
    {
        $h = (float) $in['height_cm'];
        $w = (float) $in['weight'];
        $sex = $in['sex'] === 'F' ? 'F' : 'M';
        $m = $in['measures'] ?? [];
        $hm = $h / 100;

        $bmi = round($w / ($hm * $hm), 1);
        $label = 'Peso normal'; $tone = 'ok';
        foreach (self::BMI_CLASSES as [$limit, $l, $t]) {
            if ($bmi < $limit) { $label = $l; $tone = $t; break; }
        }
        // Faixa saudável: IMC de 18,5 a 24,9 aplicado à altura da pessoa.
        $minW = round(18.5 * $hm * $hm, 1);
        $maxW = round(24.9 * $hm * $hm, 1);
        $toChange = $w > $maxW ? round($maxW - $w, 1) : ($w < $minW ? round($minW - $w, 1) : 0.0);

        $points = [];     // pontos de atenção (texto simples para o usuário)
        $priority = [];   // grupos musculares que ganham mais volume no plano
        $num = static fn($k) => isset($m[$k]) && $m[$k] !== null && $m[$k] > 0 ? (float) $m[$k] : null;
        [$chest, $waist, $hip, $thigh, $calf, $arm, $fore] = array_map($num, ['chest', 'waist', 'hip', 'thigh', 'calf', 'arm', 'forearm']);

        // Cintura / altura: acima de 0,5 indica gordura concentrada na barriga.
        $whtr = $waist ? round($waist / $h, 2) : null;
        if ($whtr !== null && $whtr >= 0.5) {
            $points[] = ['group' => 'abdomen', 'text' => $whtr >= 0.6
                ? 'Sua cintura está bem acima de metade da sua altura. Vale priorizar caminhada/cardio e fortalecer o abdômen, e conversar com um médico.'
                : 'Sua cintura passou de metade da sua altura. O plano reforça o abdômen e o cardio para reduzir a gordura da barriga.'];
            $priority[] = 'abdomen'; $priority[] = 'cardio';
        }
        // Cintura / quadril (OMS): risco aumentado acima de 0,90 (homens) ou 0,85 (mulheres).
        $rcq = ($waist && $hip) ? round($waist / $hip, 2) : null;
        if ($rcq !== null && $rcq > ($sex === 'M' ? 0.90 : 0.85)) {
            $points[] = ['group' => null, 'text' => 'A proporção cintura/quadril está acima do recomendado pela OMS. Isso costuma melhorar com treino regular e alimentação ajustada.'];
        }
        // Proporções simples em relação à altura (valores típicos menos uma margem). Servem só para
        // decidir onde dar um pouco mais de volume, não para "julgar" o corpo de ninguém.
        $minPerHeight = $sex === 'M'
            ? ['chest' => 0.52, 'arm' => 0.165, 'thigh' => 0.29, 'hip' => 0.52]
            : ['chest' => 0.50, 'arm' => 0.150, 'thigh' => 0.30, 'hip' => 0.54];
        if ($chest && $chest / $h < $minPerHeight['chest']) {
            $points[] = ['group' => 'peito', 'text' => 'Seu tórax está um pouco abaixo do esperado para a sua altura. Peito e costas ganham mais séries.'];
            $priority[] = 'peito'; $priority[] = 'costas';
        }
        if ($arm && $arm / $h < $minPerHeight['arm']) {
            $points[] = ['group' => 'biceps', 'text' => 'Seus braços têm espaço para crescer. Bíceps e tríceps ganham mais séries.'];
            $priority[] = 'biceps'; $priority[] = 'triceps';
        }
        if ($thigh && $thigh / $h < $minPerHeight['thigh']) {
            $points[] = ['group' => 'quadriceps', 'text' => 'Suas coxas estão um pouco abaixo do esperado. As pernas ganham mais séries.'];
            $priority[] = 'quadriceps';
        }
        if ($hip && $hip / $h < $minPerHeight['hip']) {
            $points[] = ['group' => 'gluteos', 'text' => 'Glúteos podem render mais. O plano reforça o bumbum.'];
            $priority[] = 'gluteos';
        }
        // Regra clássica: panturrilha próxima do braço; antebraço em torno de 80% do braço.
        if ($calf && $arm && $calf < $arm * 0.95) {
            $points[] = ['group' => 'panturrilhas', 'text' => 'Suas panturrilhas estão menores que seus braços. Elas ganham mais séries.'];
            $priority[] = 'panturrilhas';
        }
        if ($fore && $arm && $fore < $arm * 0.78) {
            $points[] = ['group' => 'antebracos', 'text' => 'Seus antebraços estão menores em relação ao bíceps. Entram exercícios de antebraço.'];
            $priority[] = 'antebracos';
        }

        // Objetivo sugerido (o usuário sempre escolhe; isto é só uma indicação).
        $suggested = $bmi >= 25 ? 'perder_peso' : ($bmi < 18.5 ? 'ganhar_massa' : null);
        $notes = [];
        if ($bmi >= 35) $notes[] = 'Com esse IMC, comece devagar e converse com um médico antes de iniciar. O plano evita exercícios de impacto.';
        elseif ($bmi >= 30) $notes[] = 'O plano começa leve e sem saltos, para proteger suas articulações.';
        if ($bmi < 18.5) $notes[] = 'Seu IMC está abaixo do ideal: o foco recomendado é ganhar massa, com boa alimentação.';

        return [
            'bmi' => $bmi, 'label' => $label, 'tone' => $tone,
            'healthy_min' => $minW, 'healthy_max' => $maxW, 'to_change_kg' => $toChange,
            'whtr' => $whtr, 'whr' => $rcq,
            'points' => $points, 'priority' => array_values(array_unique($priority)),
            'suggested_goal' => $suggested, 'notes' => $notes,
        ];
    }

    /* ------------------------------------------------------------------ */
    /*  2. MONTAGEM DO PLANO                                              */
    /* ------------------------------------------------------------------ */

    /**
     * Sessões-modelo. Cada slot é [grupo muscular, papel preferido]. O papel decide se entra um
     * exercício "composto" (vários músculos, mais pesado) ou "isolado" (um músculo só).
     */
    private const SESSIONS = [
        'full_a' => ['Corpo inteiro A', 'Pernas, peito, costas e abdômen', [['quadriceps', 'composto'], ['peito', 'composto'], ['costas', 'composto'], ['gluteos', 'composto'], ['ombros', 'isolado'], ['abdomen', 'core']]],
        'full_b' => ['Corpo inteiro B', 'Posterior de coxa, costas, peito e braços', [['posteriores', 'composto'], ['costas', 'composto'], ['peito', 'composto'], ['quadriceps', 'isolado'], ['biceps', 'isolado'], ['triceps', 'isolado']]],
        'full_c' => ['Corpo inteiro C', 'Glúteos, ombros, costas e panturrilhas', [['gluteos', 'composto'], ['peito', 'composto'], ['costas', 'composto'], ['ombros', 'composto'], ['panturrilhas', 'isolado'], ['abdomen', 'core']]],
        'upper_a' => ['Superior A', 'Peito, costas, ombros e braços', [['peito', 'composto'], ['costas', 'composto'], ['ombros', 'composto'], ['costas', 'isolado'], ['triceps', 'isolado'], ['biceps', 'isolado']]],
        'upper_b' => ['Superior B', 'Costas, peito, ombros e braços', [['costas', 'composto'], ['peito', 'composto'], ['ombros', 'isolado'], ['peito', 'isolado'], ['biceps', 'isolado'], ['triceps', 'isolado']]],
        'lower_a' => ['Inferior A', 'Coxas, glúteos, panturrilhas e abdômen', [['quadriceps', 'composto'], ['posteriores', 'composto'], ['gluteos', 'composto'], ['panturrilhas', 'isolado'], ['abdomen', 'core']]],
        'lower_b' => ['Inferior B', 'Glúteos, coxas e abdômen', [['gluteos', 'composto'], ['quadriceps', 'composto'], ['posteriores', 'isolado'], ['quadriceps', 'isolado'], ['panturrilhas', 'isolado'], ['abdomen', 'core']]],
        'push'  => ['Empurrar', 'Peito, ombros e tríceps', [['peito', 'composto'], ['peito', 'isolado'], ['ombros', 'composto'], ['ombros', 'isolado'], ['triceps', 'isolado'], ['triceps', 'isolado']]],
        'pull'  => ['Puxar', 'Costas, bíceps e antebraço', [['costas', 'composto'], ['costas', 'composto'], ['costas', 'isolado'], ['biceps', 'isolado'], ['biceps', 'isolado'], ['antebracos', 'isolado']]],
        'legs'  => ['Pernas', 'Coxas, glúteos, panturrilhas e abdômen', [['quadriceps', 'composto'], ['posteriores', 'composto'], ['gluteos', 'composto'], ['quadriceps', 'isolado'], ['panturrilhas', 'isolado'], ['abdomen', 'core']]],
    ];

    /** Qual modelo de divisão usar e em quais dias da semana (0=dom ... 6=sáb). */
    private static function split(int $days, string $goal, int $level): array
    {
        return match (true) {
            $days <= 2 => [['full_a', 'full_b'], [1, 4]],
            $days === 3 => ($goal === 'ganhar_massa' && $level >= 2)
                ? [['push', 'pull', 'legs'], [1, 3, 5]]
                : [['full_a', 'full_b', 'full_c'], [1, 3, 5]],
            $days === 4 => [['upper_a', 'lower_a', 'upper_b', 'lower_b'], [1, 2, 4, 5]],
            default => $goal === 'ganhar_massa'
                ? [['push', 'pull', 'legs', 'upper_b', 'lower_b'], [1, 2, 3, 4, 5]]
                : [['full_a', 'full_b', 'full_c', 'upper_a', 'lower_a'], [1, 2, 3, 4, 5]],
        };
    }

    /** Músculo do exercício de treino -> alongamento que mais combina (campo "alvo" do catálogo). */
    private const STRETCH_FOR = [
        'peito' => 'peito', 'costas' => 'costas', 'ombros' => 'ombros', 'biceps' => 'ombros', 'triceps' => 'ombros',
        'antebracos' => 'antebracos', 'quadriceps' => 'quadriceps', 'posteriores' => 'posteriores',
        'gluteos' => 'gluteos', 'panturrilhas' => 'panturrilhas', 'abdomen' => 'costas',
    ];

    /** Faixas semanais de séries por músculo (adaptado do openGym, lib/muscle-targets.js). */
    public const WEEKLY_SETS = [
        'peito' => [10, 20], 'costas' => [10, 20], 'ombros' => [8, 20], 'biceps' => [8, 18], 'triceps' => [6, 16],
        'quadriceps' => [8, 18], 'posteriores' => [6, 16], 'gluteos' => [4, 16], 'panturrilhas' => [8, 16], 'abdomen' => [6, 16],
    ];

    /**
     * @param array $profile {goal, environment, days_per_week, level, sex}
     * @param array $analysis resultado de analyze() (usa 'priority' e 'bmi')
     * @param array $catalog  exercícios globais do banco (id, slug, muscle, equipment, environment, role, level, impact, type, target)
     * @return array{routines: array, coverage: array}
     */
    public static function build(array $profile, array $analysis, array $catalog, int $seed): array
    {
        $goal = $profile['goal'];
        $env = $profile['environment'];
        $level = max(1, min(3, (int) $profile['level']));
        $days = max(2, min(5, (int) $profile['days_per_week']));
        $bmi = (float) ($analysis['bmi'] ?? 22);
        $priority = $analysis['priority'] ?? [];
        // IMC alto: sem exercícios de impacto (saltos) e começa no nível 1.
        $lowImpactOnly = $bmi >= 30;
        if ($bmi >= 35) $level = 1;

        $pool = array_values(array_filter($catalog, static function ($e) use ($env) {
            if (in_array($e['role'], ['aquecimento', 'alongamento'], true)) return false;
            if ($env === 'casa') return in_array($e['environment'], ['casa', 'ambos'], true) && in_array($e['equipment'], ['peso_corporal', 'elastico'], true);
            return in_array($e['environment'], ['academia', 'ambos'], true);
        }));
        $warm = array_values(array_filter($catalog, fn($e) => $e['role'] === 'aquecimento'));
        $stretch = array_values(array_filter($catalog, fn($e) => $e['role'] === 'alongamento'));

        [$keys, $weekdays] = self::split($days, $goal, $level);
        $used = [];      // quantas vezes cada exercício já entrou no plano (para variar entre os dias)
        $routines = [];

        foreach ($keys as $i => $key) {
            [$name, $focus, $slots] = self::SESSIONS[$key];
            // Perder peso: cada sessão ganha um bloco de cardio no final.
            if ($goal === 'perder_peso') $slots[] = ['cardio', 'cardio'];
            // Grupos prioritários que ficaram de fora desta sessão entram como slot extra (máx. 1).
            $groupsHere = array_column($slots, 0);
            foreach ($priority as $g) {
                if (isset(self::WEEKLY_SETS[$g]) && !in_array($g, $groupsHere, true) && count($slots) < 8 && self::sessionAllows($key, $g)) {
                    $slots[] = [$g, $g === 'abdomen' ? 'core' : 'isolado']; break;
                }
            }

            $items = [];
            $inSession = [];
            foreach ($slots as [$group, $prefRole]) {
                $ex = self::pick($pool, $group, $prefRole, $level, $lowImpactOnly, $inSession, $used, $seed + $i);
                if (!$ex) continue;
                $inSession[$ex['id']] = true;
                $used[$ex['id']] = ($used[$ex['id']] ?? 0) + 1;
                $isPriority = in_array($group, $priority, true);
                [$sets, $rmin, $rmax, $rest] = self::prescribe($ex, $goal, $env, $level, $isPriority);
                $items[] = ['exercise_id' => (int) $ex['id'], 'sets' => $sets, 'reps_min' => $rmin, 'reps_max' => $rmax, 'rest_sec' => $rest, 'section' => 'treino', '_g' => $group];
            }

            // Aquecimento (2) no começo e alongamento (3) no fim, variando entre os dias.
            $pre = [];
            for ($k = 0; $k < 2 && $warm; $k++) {
                $w = $warm[($seed + $i * 2 + $k) % count($warm)];
                $pre[] = ['exercise_id' => (int) $w['id'], 'sets' => 1, 'reps_min' => 30, 'reps_max' => 30, 'rest_sec' => 0, 'section' => 'aquecimento'];
            }
            $post = [];
            $wanted = [];
            foreach ($slots as [$group]) { $t = self::STRETCH_FOR[$group] ?? null; if ($t && !in_array($t, $wanted, true)) $wanted[] = $t; }
            foreach (array_slice($wanted, 0, 3) as $t) {
                $cands = array_values(array_filter($stretch, fn($e) => ($e['target'] ?? '') === $t));
                if ($cands) {
                    $s = $cands[($seed + $i) % count($cands)];
                    $post[] = ['exercise_id' => (int) $s['id'], 'sets' => 1, 'reps_min' => 30, 'reps_max' => 30, 'rest_sec' => 0, 'section' => 'alongamento'];
                }
            }

            $routines[] = [
                'name' => 'Treino ' . chr(65 + $i) . ' · ' . $name,
                'description' => $focus . ($goal === 'perder_peso' ? ' + cardio. Descanse pouco entre as séries para manter o ritmo.' : '. Descanse o suficiente para repetir a força na série seguinte.'),
                'weekday' => $weekdays[$i],
                'items' => array_merge($pre, $items, $post),
            ];
        }

        // Confere o volume semanal por músculo. Se algum ficou abaixo da faixa mínima, soma 1 série
        // por vez nos exercícios daquele músculo (até 5 por exercício) até chegar ao mínimo.
        $setsOf = static function (array $routines): array {
            $t = [];
            foreach ($routines as $r) foreach ($r['items'] as $it) if (isset($it['_g'])) $t[$it['_g']] = ($t[$it['_g']] ?? 0) + $it['sets'];
            return $t;
        };
        $weeklySets = $setsOf($routines);
        foreach (self::WEEKLY_SETS as $g => [$lo]) {
            for ($guard = 0; ($weeklySets[$g] ?? 0) < $lo && $guard < 12; $guard++) {
                $bumped = false;
                foreach ($routines as &$r) {
                    foreach ($r['items'] as &$it) {
                        if (($it['_g'] ?? null) === $g && $it['sets'] < 5 && ($weeklySets[$g] ?? 0) < $lo) { $it['sets']++; $weeklySets[$g] = ($weeklySets[$g] ?? 0) + 1; $bumped = true; }
                    }
                    unset($it);
                }
                unset($r);
                if (!$bumped) break;
            }
        }
        foreach ($routines as &$r) foreach ($r['items'] as &$it) unset($it['_g']);
        unset($r, $it);

        $coverage = [];
        foreach (self::WEEKLY_SETS as $g => [$lo, $hi]) {
            $n = $weeklySets[$g] ?? 0;
            $coverage[] = ['group' => $g, 'sets' => $n, 'min' => $lo, 'max' => $hi, 'status' => $n < $lo ? 'abaixo' : ($n > $hi ? 'acima' : 'ok')];
        }
        return ['routines' => $routines, 'coverage' => $coverage];
    }

    /** Evita enfiar grupos de perna num dia de empurrar, etc. */
    private static function sessionAllows(string $sessionKey, string $group): bool
    {
        $upper = ['peito', 'costas', 'ombros', 'biceps', 'triceps', 'antebracos'];
        $lower = ['quadriceps', 'posteriores', 'gluteos', 'panturrilhas'];
        return match (true) {
            str_starts_with($sessionKey, 'upper') || $sessionKey === 'push' || $sessionKey === 'pull' => in_array($group, $upper, true) || $group === 'abdomen',
            str_starts_with($sessionKey, 'lower') || $sessionKey === 'legs' => in_array($group, $lower, true) || $group === 'abdomen',
            default => true,
        };
    }

    /**
     * Escolhe um exercício para o slot: respeita ambiente, nível e impacto; prefere o papel pedido,
     * o nível mais próximo do usuário e exercícios ainda pouco usados no plano. O desempate usa
     * crc32(seed+slug), assim o mesmo usuário recebe sempre o mesmo plano, mas usuários diferentes variam.
     */
    private static function pick(array $pool, string $group, string $role, int $level, bool $lowImpact, array $inSession, array $used, int $seed): ?array
    {
        foreach ([$level, min(3, $level + 1)] as $maxLevel) { // se faltar opção fácil, aceita um nível acima
            $c = array_values(array_filter($pool, static fn($e) =>
                $e['muscle'] === $group && (int) $e['level'] <= $maxLevel && !isset($inSession[$e['id']])
                && (!$lowImpact || $e['impact'] === 'baixo')));
            if (!$c) continue;
            usort($c, static function ($a, $b) use ($role, $level, $used, $seed) {
                $ka = [$a['role'] === $role ? 0 : 1, abs((int) $a['level'] - $level), $used[$a['id']] ?? 0, crc32($seed . $a['slug'])];
                $kb = [$b['role'] === $role ? 0 : 1, abs((int) $b['level'] - $level), $used[$b['id']] ?? 0, crc32($seed . $b['slug'])];
                return $ka <=> $kb;
            });
            return $c[0];
        }
        return null;
    }

    /** Séries, repetições e descanso por objetivo, papel do exercício e nível. @return array{int,int,int,int} */
    private static function prescribe(array $ex, string $goal, string $env, int $level, bool $priority): array
    {
        $role = $ex['role'];
        $timed = $ex['type'] === 'time';
        if ($timed || $role === 'cardio') { // medido em segundos
            $secs = $role === 'cardio' ? [[20, 30], [30, 40], [40, 50]][$level - 1] : [[20, 30], [30, 45], [45, 60]][$level - 1];
            return [3, $secs[0], $secs[1], $role === 'cardio' ? 30 : 45];
        }
        if ($goal === 'ganhar_massa') {
            [$sets, $rmin, $rmax, $rest] = match ($role) {
                'composto' => [$level === 1 ? 3 : 4, $level === 1 ? 8 : 6, $level === 1 ? 12 : 10, $level === 1 ? 90 : 120],
                'core'     => [3, 15, 20, 45],
                default    => [$level === 1 ? 2 : 3, 10, 15, 60],
            };
            if ($env === 'casa' && $role !== 'core') { $rmin = 10; $rmax = 15; $rest = min($rest, 75); } // sem anilhas, a carga é o corpo: mais repetições
        } else { // perder_peso: mais repetições, menos descanso, mantém o ritmo alto
            [$sets, $rmin, $rmax, $rest] = match ($role) {
                'composto' => [$level >= 3 ? 4 : 3, 12, 15, 45],
                'core'     => [3, 15, 20, 30],
                default    => [$level >= 2 ? 3 : 2, 15, 20, 30],
            };
        }
        if ($priority) $sets = min(5, $sets + 1); // ponto de atenção das medidas: uma série a mais
        return [$sets, $rmin, $rmax, $rest];
    }
}
