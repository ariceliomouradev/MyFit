/* Meus Treinos · perfil, IMC, plano gerado e "como fazer".
 * Carregado depois de app.js e usa os mesmos helpers (html, api, route, openModal, ...). */
'use strict';

const GOAL = { perder_peso: 'Perder peso', ganhar_massa: 'Ganhar massa muscular' };
const ENV = { casa: 'Em casa, com o peso do corpo', academia: 'Na academia' };
const LEVEL = { 1: 'Estou começando', 2: 'Treino de vez em quando', 3: 'Treino há mais de 1 ano' };
const LVL_SHORT = { 1: 'Iniciante', 2: 'Intermediário', 3: 'Avançado' };
const MEASURES = [
  ['chest', 'Tórax (peito)', 'Passe a fita na altura dos mamilos, por baixo das axilas, com os braços relaxados.', '98'],
  ['waist', 'Cintura (barriga)', 'Na altura do umbigo, sem encolher a barriga, depois de soltar o ar.', '84'],
  ['hip', 'Quadril (bumbum)', 'Na parte mais larga do bumbum, com os pés juntos.', '98'],
  ['thigh', 'Coxa', 'No meio da coxa, na perna que você mais usa, em pé e relaxado.', '56'],
  ['calf', 'Panturrilha', 'Na parte mais grossa da batata da perna, em pé.', '37'],
  ['arm', 'Braço (bíceps)', 'No meio do braço, relaxado e solto ao lado do corpo.', '33'],
  ['forearm', 'Antebraço', 'Na parte mais grossa do antebraço, perto do cotovelo.', '27'],
];

/* ---------- Textos para leigos ---------- */
/** "3 séries de 12 a 15 repetições, descanso de 45 segundos" */
function rxText(e, long = true) {
  const t = e.type === 'time' || e.role === 'cardio' || e.role === 'aquecimento' || e.role === 'alongamento';
  const sets = e.sets ?? e.sets_planned ?? 1;
  const lo = e.reps_min, hi = e.reps_max;
  const range = lo === hi ? `${lo}` : `${lo} a ${hi}`;
  const what = t ? (hi === 1 ? 'segundo' : 'segundos') : 'repetições';
  const rest = e.rest_sec ? `, descanso de ${e.rest_sec} segundos` : '';
  if (!long) return `${sets} × ${range}${t ? ' s' : ''}`;
  if (e.role === 'alongamento') return `Segure ${range} segundos de cada lado`;
  return `${sets} ${pl(sets, 'série', 'séries')} de ${range} ${what}${rest}`;
}
const secLabel = { aquecimento: 'Aquecimento', alongamento: 'Alongamento', treino: 'Treino' };
const secOf = e => e.role === 'aquecimento' ? 'aquecimento' : e.role === 'alongamento' ? 'alongamento' : 'treino';
const mediaTag = (m, alt, cls = 'ex-img') => m ? `<img class="${cls}" src="${esc(m)}" alt="${esc(alt)}" loading="lazy" decoding="async" width="360" height="360">` : `<span class="${cls} ph" aria-hidden="true"></span>`;

/* ---------- Folha "Como fazer" ---------- */
const EXD = {};
async function exerciseDetail(id) {
  return EXD[id] ??= (await api('GET', `exercises/${id}`)).exercise;
}
async function openExerciseInfo(id, rx) {
  let e;
  try { e = await exerciseDetail(id); } catch (err) { return toast(err.message, true); }
  const list = (arr, tag = 'ul') => arr?.length ? `<${tag} class="how">${arr.map(x => `<li>${esc(x)}</li>`).join('')}</${tag}>` : '';
  openModal(`
    <div class="row between" style="margin-bottom:8px"><h2 class="clip">${esc(e.name)}</h2><button class="icon-btn" data-close aria-label="Fechar">${ICON.x}</button></div>
    <div class="scroll">
      <div class="media-box">${mediaTag(e.media, 'Animação: ' + e.name, 'ex-big')}</div>
      <div class="chips" style="margin:10px 0 4px"><span class="badge">${esc(MUSCLE[e.muscle] || e.muscle)}</span><span class="badge">${esc(EQUIP[e.equipment] || e.equipment)}</span><span class="badge">${LVL_SHORT[e.level] || ''}</span></div>
      ${rx ? `<div class="card hl"><div class="eyebrow">Para você</div><p style="margin:4px 0 0;font-weight:600">${esc(rx)}</p></div>` : ''}
      ${e.rep_def ? `<h3>O que é uma repetição</h3><p>${esc(e.rep_def)}</p>` : ''}
      ${e.pace ? `<h3>Ritmo</h3><p>${esc(e.pace)}</p>` : ''}
      ${e.steps?.length ? `<h3>Como fazer</h3>${list(e.steps, 'ol')}` : ''}
      ${e.tips?.length ? `<h3>Dicas</h3>${list(e.tips)}` : ''}
      ${e.mistakes?.length ? `<h3>Evite</h3>${list(e.mistakes)}` : ''}
      ${S.user?.role === 'aluno' ? `<a class="btn block ghost" href="#/exercicio/${e.id}" data-close style="margin-top:10px">Ver meu histórico neste exercício</a>` : ''}
    </div>`);
}

/* =====================================================================
 *  Assistente inicial (#/comecar)
 * ===================================================================== */
let WZ = null;
const WZ_STEPS = ['Sobre você', 'Medidas', 'Fotos', 'Seu IMC', 'Objetivo', 'Treino', 'Resumo'];

function wzFresh() {
  const p = S.profile, m = S.lastMeasure || {};
  return {
    step: 0, busy: false, analysis: null,
    name: S.user?.name || '', sex: p?.sex || '', age: p?.age ?? '', height_cm: p?.height_cm ?? '', weight: m.weight ?? '',
    measures: Object.fromEntries(MEASURES.map(([k]) => [k, m[k] ?? ''])),
    goal: p?.goal || '', environment: p?.environment || '', days_per_week: p?.days_per_week || 3, level: p?.level || 1,
  };
}

route(/^#\/comecar$/, async () => {
  if (!WZ) {
    try { const d = await api('GET', 'profile'); S.profile = d.profile; S.lastMeasure = d.measure; } catch { /* segue sem */ }
    WZ = wzFresh();
  }
  return wizardHtml();
}, { bare: true });

const wzBody = () => ({
  sex: WZ.sex, age: WZ.age === '' ? null : num(WZ.age), height_cm: num(WZ.height_cm), weight: num(WZ.weight),
  measures: Object.fromEntries(MEASURES.map(([k]) => [k, WZ.measures[k] === '' ? null : num(WZ.measures[k])])),
});

function gaugeHtml(bmi) {
  const pct = Math.max(0, Math.min(100, (bmi - 15) / (40 - 15) * 100));
  return `<div class="gauge" role="img" aria-label="IMC ${bmi}">
    <div class="gauge-bar"><i class="z1"></i><i class="z2"></i><i class="z3"></i><i class="z4"></i><b style="left:${pct}%"></b></div>
    <div class="gauge-l"><span>15</span><span>18,5</span><span>25</span><span>30</span><span>40</span></div></div>`;
}

function analysisCard(a, showGoal = false, staff = false) {
  const toChange = a.to_change_kg;
  const range = `${fmtNum(a.healthy_min)} a ${fmtNum(a.healthy_max)} kg`;
  return `<div class="card imc ${a.tone}">
      <div class="eyebrow">${staff ? 'IMC do aluno' : 'Seu IMC'}</div>
      <div class="row" style="align-items:baseline;gap:10px"><b class="imc-n">${fmtNum(a.bmi)}</b><span class="badge tone-${a.tone}">${esc(a.label)}</span></div>
      ${gaugeHtml(a.bmi)}
      <p class="small muted" style="margin:10px 0 0">Para ${staff ? 'a altura do aluno' : 'a sua altura'}, a faixa de peso considerada saudável vai de <b>${range}</b>.
      ${toChange < 0 ? ` ${staff ? 'Ele está' : 'Você está'} ${fmtNum(Math.abs(toChange))} kg acima dela.` : toChange > 0 ? ` ${staff ? 'Ele está' : 'Você está'} ${fmtNum(toChange)} kg abaixo dela.` : ` ${staff ? 'Está' : 'Você está'} dentro dela.`}</p>
      <p class="hint" style="margin:6px 0 0">O IMC é uma referência geral e não separa gordura de músculo. Não substitui avaliação profissional.</p>
    </div>
    ${a.notes.map(n => `<div class="card note">${esc(n)}</div>`).join('')}
    ${a.points.length ? `<div class="card"><h3>O que as suas medidas dizem</h3><ul class="how">${a.points.map(p => `<li>${esc(p.text)}</li>`).join('')}</ul></div>` : ''}`;
}

function wizardHtml() {
  const s = WZ.step, w = WZ;
  const dots = `<div class="wz-dots" aria-label="Passo ${s + 1} de ${WZ_STEPS.length}">${WZ_STEPS.map((n, i) => `<i class="${i === s ? 'on' : i < s ? 'done' : ''}"></i>`).join('')}</div>`;
  const nav = (next = 'Continuar', back = true, extra = '') => `<div class="wz-nav">${back ? '<button class="btn" data-act="wz-back">Voltar</button>' : '<span></span>'}${extra}<button class="btn primary" data-act="wz-next" ${w.busy ? 'disabled' : ''}>${next}</button></div>`;
  const choice = (act, val, cur, title, sub) => `<button class="choice" data-act="${act}" data-v="${val}" aria-pressed="${String(cur) === String(val)}"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</button>`;
  let body = '';
  if (s === 0) body = `
    <h1>Vamos montar o seu treino</h1><p class="muted">Algumas perguntas rápidas para o plano ser feito para você.</p>
    <label class="f">Seu nome<input class="in" data-wz="name" value="${esc(w.name)}" maxlength="80" autocomplete="name"></label>
    <div class="f">Sexo<div class="choices two">${choice('wz-sex', 'M', w.sex, 'Masculino')}${choice('wz-sex', 'F', w.sex, 'Feminino')}</div></div>
    <div class="grid3">
      <label class="f">Idade<input class="in" data-wz="age" inputmode="numeric" value="${esc(w.age)}" placeholder="30"></label>
      <label class="f">Altura (cm)<input class="in" data-wz="height_cm" inputmode="decimal" value="${esc(fmtIn(w.height_cm))}" placeholder="175"></label>
      <label class="f">Peso (kg)<input class="in" data-wz="weight" inputmode="decimal" value="${esc(fmtIn(w.weight))}" placeholder="78"></label>
    </div>${nav('Continuar', false)}`;
  else if (s === 1) body = `
    <h1>Suas medidas</h1><p class="muted">Use uma fita métrica, sem apertar. Em centímetros. Pode pular o que não souber: elas só ajudam a dar mais atenção aos pontos certos.</p>
    ${MEASURES.map(([k, label, hint, ph]) => `<label class="f">${label}<span class="hint">${hint}</span><input class="in" data-wzm="${k}" inputmode="decimal" value="${esc(fmtIn(w.measures[k]))}" placeholder="Ex.: ${ph}"></label>`).join('')}
    ${nav('Ver meu IMC', true, '<button class="btn ghost" data-act="wz-skip">Pular</button>')}`;
  else if (s === 2) body = `<h1>Fotos do começo</h1><p class="muted">Elas viram o ponto de partida: daqui a algumas semanas você compara o antes e o depois. São privadas (só você e seu personal veem).</p>
    <details class="card" open><summary><b>Como tirar as fotos</b></summary>${guideHtml()}</details>${photoSlots(PHOTOS)}
    ${nav('Continuar', true, '<button class="btn ghost" data-act="wz-skip-photos">Pular</button>')}`;
  else if (s === 3) body = `<h1>Seu resultado</h1>${w.analysis ? analysisCard(w.analysis) : '<p class="muted">Calculando…</p>'}${nav('Continuar')}`;
  else if (s === 4) {
    const sg = w.analysis?.suggested_goal;
    body = `<h1>Qual é o seu objetivo?</h1><p class="muted">Isso muda séries, repetições, descanso e o tipo de exercício.</p>
      <div class="choices">${choice('wz-goal', 'perder_peso', w.goal, 'Perder peso', 'Mais repetições, descanso curto e cardio no fim.' + (sg === 'perder_peso' ? ' Indicado para o seu IMC.' : ''))}
      ${choice('wz-goal', 'ganhar_massa', w.goal, 'Ganhar massa muscular', 'Mais carga, séries mais pesadas e descanso maior.' + (sg === 'ganhar_massa' ? ' Indicado para o seu IMC.' : ''))}</div>
      ${w.analysis && w.goal === 'perder_peso' && w.analysis.bmi < 18.5 ? '<div class="card note">Seu IMC já está abaixo do ideal. Perder mais peso pode prejudicar a saúde: considere ganhar massa.</div>' : ''}
      ${nav()}`;
  } else if (s === 5) body = `<h1>Como você vai treinar?</h1>
      <div class="f">Onde<div class="choices">${choice('wz-env', 'casa', w.environment, 'Em casa', 'Só o peso do corpo (e um elástico, se tiver).')}${choice('wz-env', 'academia', w.environment, 'Na academia', 'Halteres, barras, máquinas e cabos.')}</div></div>
      <div class="f">Dias por semana<div class="choices four">${[2, 3, 4, 5].map(d => choice('wz-days', d, w.days_per_week, String(d), 'dias')).join('')}</div></div>
      <div class="f">Sua experiência<div class="choices">${[1, 2, 3].map(l => choice('wz-level', l, w.level, LEVEL[l])).join('')}</div></div>${nav()}`;
  else body = `<h1>Tudo certo, ${esc(w.name.split(' ')[0] || '')}!</h1><p class="muted">Confira e monte o seu plano.</p>
      <div class="card"><ul class="list sum">
        <li><span class="muted">Objetivo</span><b>${GOAL[w.goal]}</b></li><li><span class="muted">Treino</span><b>${ENV[w.environment]}</b></li>
        <li><span class="muted">Frequência</span><b>${w.days_per_week} dias por semana</b></li><li><span class="muted">Experiência</span><b>${LEVEL[w.level]}</b></li>
        <li><span class="muted">IMC</span><b>${w.analysis ? fmtNum(w.analysis.bmi) + ' · ' + esc(w.analysis.label) : '–'}</b></li></ul></div>
      <p class="hint">Você poderá trocar qualquer exercício, série ou repetição depois.</p>${nav(w.busy ? 'Montando…' : 'Montar meu plano')}`;
  return `<div class="wz"><div class="wz-top">${brandMark(S.profile ? '#/' : '#/comecar')}${dots}</div><div id="wz-err"></div>${body}</div>`;
}
const wzPaint = () => { $('#app').innerHTML = wizardHtml(); window.scrollTo(0, 0); };
const wzErr = msg => { const b = $('#wz-err'); if (b) b.innerHTML = `<div class="err" role="alert">${esc(msg)}</div>`; window.scrollTo(0, 0); };

Object.assign(acts, {
  'wz-sex': el => { WZ.sex = el.dataset.v; wzPaint(); },
  'wz-goal': el => { WZ.goal = el.dataset.v; wzPaint(); },
  'wz-env': el => { WZ.environment = el.dataset.v; wzPaint(); },
  'wz-days': el => { WZ.days_per_week = +el.dataset.v; wzPaint(); },
  'wz-level': el => { WZ.level = +el.dataset.v; wzPaint(); },
  'wz-back': () => { WZ.step = Math.max(0, WZ.step - 1); wzPaint(); },
  'wz-skip-photos': () => { PHOTOS = {}; WZ.step++; wzPaint(); },
  'wz-skip': () => { MEASURES.forEach(([k]) => WZ.measures[k] = ''); acts['wz-next'](); },
  'wz-next': guard(async () => {
    const s = WZ.step;
    if (s === 0) {
      if (WZ.name.trim().length < 2) return wzErr('Informe seu nome.');
      if (!WZ.sex) return wzErr('Escolha o sexo.');
      const h = num(WZ.height_cm), p = num(WZ.weight);
      if (h < 100 || h > 250) return wzErr('Informe a altura em centímetros (ex.: 175).');
      if (p < 20 || p > 400) return wzErr('Informe o peso em quilos (ex.: 78).');
    }
    if (s === 1 || (s === 0 && false)) {
      try { WZ.analysis = (await api('POST', 'analyze', wzBody())).analysis; } catch (e) { return wzErr(e.message); }
    }
    if (s === 4 && !WZ.goal) return wzErr('Escolha o seu objetivo.');
    if (s === 5 && !WZ.environment) return wzErr('Escolha onde você vai treinar.');
    if (s === 6) {
      WZ.busy = true; wzPaint();
      try {
        const r = await api('POST', 'onboarding', { ...wzBody(), name: WZ.name, goal: WZ.goal, environment: WZ.environment, days_per_week: WZ.days_per_week, level: WZ.level });
        S.profile = r.profile; S.user.name = WZ.name.trim(); S.routines = null; S.fresh = r; WZ = null;
        if (Object.keys(PHOTOS).length) { const up = await uploadPhotos(todayStr(), PHOTOS); if (up.fail) toast(`${up.fail} ${pl(up.fail, 'foto não foi enviada', 'fotos não foram enviadas')}. Envie depois em Meu corpo.`, true); }
        PHOTOS = {};
        return go('#/plano');
      } catch (e) { WZ.busy = false; wzPaint(); return wzErr(e.message); }
    }
    WZ.step++; wzPaint();
  }),
  'wz-restart': () => { WZ = null; PHOTOS = {}; S.fresh = null; go('#/comecar'); },
  'ex-info': el => openExerciseInfo(el.dataset.ex, el.dataset.rx || ''),
});

// Campos de texto do assistente: guarda o que foi digitado sem redesenhar a tela.
document.addEventListener('input', e => {
  if (!WZ) return;
  const f = e.target.dataset?.wz, m = e.target.dataset?.wzm;
  if (f) WZ[f] = e.target.value;
  if (m) WZ.measures[m] = e.target.value;
});

/* =====================================================================
 *  Rotina em modo leitura (#/rotina/ID): a "tabela de treino"
 * ===================================================================== */
route(/^#\/rotina\/(\d+)$/, async id => {
  const rs = await loadRoutines(true);
  const r = rs.find(x => x.id == id);
  if (!r) throw new Error('Rotina não encontrada.');
  const act = (await api('GET', 'workouts/active')).active;
  const groups = ['aquecimento', 'treino', 'alongamento'].map(sec => [sec, r.exercises.filter(e => secOf(e) === sec)]).filter(([, l]) => l.length);
  return html`
    <div class="page-title"><div><div class="eyebrow">${r.weekday != null ? DIAS[r.weekday] : 'Sem dia fixo'}</div><h1>${r.name}</h1></div><a class="icon-btn" href="#/plano" aria-label="Voltar">${raw(ICON.x)}</a></div>
    ${r.description ? raw(html`<p class="muted">${r.description}</p>`) : ''}
    <div class="row wrap" style="margin-bottom:14px">
      ${act ? raw(html`<a class="btn primary" href="#/treino/${act.workout.id}">Continuar treino em andamento</a>`) : raw(html`<button class="btn primary" data-act="start" data-id="${r.id}">Iniciar este treino</button>`)}
      <a class="btn" href="#/plano/${r.id}">Editar</a></div>
    ${groups.map(([sec, list]) => raw(html`<div class="day-h">${secLabel[sec]}</div><div class="card tbl">${list.map((e, i) => raw(html`
      <button class="trow" data-act="ex-info" data-ex="${e.exercise_id}" data-rx="${rxText(e)}">
        ${raw(mediaTag(e.media, e.name, 'thumb'))}
        <span class="grow"><span class="t">${e.name}</span><span class="s">${rxText(e)}</span></span><span class="chev" aria-hidden="true">›</span></button>`))}</div>`))}
    <details class="card"><summary><b>Como ler esta tabela</b></summary>
      <p><b>Repetição</b> é fazer o movimento completo uma vez (por exemplo, descer e subir no agachamento).</p>
      <p><b>Série</b> é um bloco de repetições seguidas. "3 séries de 12" = 12 repetições, descansa, mais 12, descansa, mais 12.</p>
      <p><b>Descanso</b> é o tempo parado entre as séries. O cronômetro aparece sozinho quando você marca uma série.</p>
      <p><b>Toque em um exercício</b> para ver a animação, o passo a passo e o ritmo certo.</p></details>`;
});

/* =====================================================================
 *  Avaliações: peso, medidas e fotos por período (#/corpo e #/avaliacao)
 * ===================================================================== */
const ANGLE = { frente: 'Frente', lado_esq: 'Lado esquerdo', costas: 'Costas', lado_dir: 'Lado direito' };
const ANGLES = Object.keys(ANGLE);
const MET = [['weight', 'Peso', 'kg'], ...MEASURES.map(([k, l]) => [k, l.replace(/ \(.*\)/, ''), 'cm'])];

/** Guia animado: visto de cima, a pessoa gira 90° a cada passo e o celular fica parado, a 2 metros. */
function guideHtml() {
  return `<div class="guide" role="img" aria-label="Animação: fique de pé a 2 metros do celular e gire um quarto de volta a cada foto: frente, lado esquerdo, costas e lado direito.">
    <svg viewBox="0 0 320 250" class="guide-svg" aria-hidden="true">
      <defs><linearGradient id="gg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f5a524" stop-opacity=".22"/><stop offset="1" stop-color="#f5a524" stop-opacity="0"/></linearGradient></defs>
      <path d="M160 214 L88 24 L232 24 Z" fill="url(#gg)"/>
      <line x1="160" y1="206" x2="160" y2="58" stroke="#9aa3ad" stroke-width="1.5" stroke-dasharray="4 6"/>
      <text x="170" y="136" class="gt">2 metros</text>
      <g transform="translate(160 62)"><g class="g-rot"><ellipse rx="42" ry="15" fill="#2a323b" stroke="#f5a524" stroke-width="3"/><circle r="10.500" fill="#e8e6e1"/><path d="M-7 -13 L0 -30 L7 -13 Z" fill="#f5a524"/>
        <circle cx="-50" cy="2" r="6" fill="#2a323b" stroke="#f5a524" stroke-width="2"/><circle cx="50" cy="2" r="6" fill="#2a323b" stroke="#f5a524" stroke-width="2"/></g></g>
      <g transform="translate(160 226)"><rect x="-14" y="-6" width="28" height="44" rx="5" fill="#171d24" stroke="#e8e6e1" stroke-width="2.500"/><circle cy="29" r="3" fill="#e8e6e1"/><rect x="-10" y="-2" width="20" height="28" rx="2" fill="#f5a524" opacity=".25"/></g>
      <g class="g-labels"><text x="160" y="16" class="gl gl1">1 · Frente (nariz para o celular)</text><text x="160" y="16" class="gl gl2">2 · Lado esquerdo</text><text x="160" y="16" class="gl gl3">3 · Costas</text><text x="160" y="16" class="gl gl4">4 · Lado direito</text></g>
    </svg>
    <ol class="how guide-tips">
      <li><b>2 metros</b> de distância, celular em pé, na altura do peito (apoie em uma cadeira ou prateleira).</li>
      <li>Corpo <b>inteiro</b> na foto, da cabeça aos pés, em um fundo liso e bem iluminado.</li>
      <li>Braços <b>soltos</b> ao lado do corpo, pés juntos, olhar para a frente. Não contraia nem faça pose.</li>
      <li>A cada foto, gire <b>um quarto de volta</b> (frente, lado esquerdo, costas, lado direito).</li>
      <li>Sempre <b>no mesmo lugar, na mesma luz, no mesmo horário</b> (de manhã, antes de comer) e com roupa justa ou de treino.</li>
      <li>Use o <b>temporizador</b> da câmera (10 segundos) ou peça ajuda a alguém.</li></ol></div>`;
}

/** Reduz a foto no próprio aparelho (até 1280 px, JPEG): envia rápido e respeita o limite do servidor. */
async function shrinkImage(file, max = 1280, q = 0.85) {
  try {
    const bmp = await createImageBitmap(file); // já respeita a orientação do celular
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(b => res(b || file), 'image/jpeg', q));
  } catch { return file; }
}
async function uploadPhotos(day, files, onProgress) {
  let ok = 0, fail = 0, i = 0;
  for (const ang of ANGLES) {
    const f = files[ang]; if (!f) continue;
    onProgress?.(++i, Object.keys(files).filter(k => files[k]).length, ANGLE[ang]);
    try { const fd = new FormData(); fd.append('day', day); fd.append('angle', ang); fd.append('file', await shrinkImage(f), `${ang}.jpg`); await apiUpload('photos', fd); ok++; } catch (e) { fail++; console.warn(e); }
  }
  return { ok, fail };
}

/** As 4 fotos (frente, lados, costas): toque para escolher ou tirar. */
function photoSlots(files) {
  return `<div class="slots">${ANGLES.map(a => `<label class="slot ${files[a] ? 'has' : ''}" data-angle="${a}">
    ${files[a] ? `<img src="${files[a]._url}" alt="Foto ${ANGLE[a]}">` : `<span class="slot-ph">${ICON.camera}</span>`}
    <span class="slot-l">${ANGLE[a]}${files[a] ? ' ✓' : ''}</span><input type="file" accept="image/*" class="sr" data-slot="${a}" aria-label="Foto ${ANGLE[a]}"></label>`).join('')}</div>`;
}
let PHOTOS = {}; // File por ângulo da avaliação em andamento
document.addEventListener('change', e => {
  const a = e.target.dataset?.slot; if (!a) return;
  const f = e.target.files?.[0]; if (!f) return;
  if (!f.type.startsWith('image/')) return toast('Escolha uma foto.', true);
  if (f.size > 25 * 1024 * 1024) return toast('Essa foto é grande demais.', true);
  f._url = URL.createObjectURL(f); PHOTOS[a] = f;
  const box = $('.slots')?.parentElement; if (box) $('.slots').outerHTML = photoSlots(PHOTOS);
});

/* ---- comparação: antes x depois ---- */
let CMP = null;
const better = (m, d, goal) => {
  if (!d) return '';
  const lowerGood = goal === 'perder_peso' ? ['weight', 'waist', 'hip'] : [];
  const upGood = goal === 'ganhar_massa' ? ['weight', 'chest', 'thigh', 'calf', 'arm', 'forearm'] : [];
  if (lowerGood.includes(m)) return d < 0 ? 'good' : 'bad';
  if (upGood.includes(m)) return d > 0 ? 'good' : 'bad';
  return '';
};
function compareHtml(entries, photosVisible, goal) {
  const es = entries.filter(e => e.weight != null || e.photo_count);
  if (!es.length) return `<div class="empty">Ainda não há avaliações.</div>`;
  const asc = [...es].reverse();
  CMP = { es, asc, vis: photosVisible, goal, a: asc[0].day, b: asc[asc.length - 1].day };
  return `<div class="card"><h3>Comparar períodos</h3>${asc.length < 2 ? '<p class="hint">Faça uma segunda avaliação para ver a evolução lado a lado.</p>' : ''}
    <div class="grid2"><label class="f" style="margin:0">Antes<select class="in" data-cmp="a">${asc.map(e => `<option value="${e.day}" ${e.day === CMP.a ? 'selected' : ''}>${fmtD(e.day)}</option>`).join('')}</select></label>
    <label class="f" style="margin:0">Depois<select class="in" data-cmp="b">${asc.map(e => `<option value="${e.day}" ${e.day === CMP.b ? 'selected' : ''}>${fmtD(e.day)}</option>`).join('')}</select></label></div>
    <div id="cmp-box">${compareBox()}</div></div>
    ${es.filter(e => e.weight != null).length > 1 ? `<div class="card"><h3>Peso</h3>${lineChart(es.filter(e => e.weight != null).reverse().map(e => ({ x: e.day, y: e.weight })))}</div>` : ''}`;
}
function compareBox() {
  const { es, a, b, vis, goal } = CMP;
  const A = es.find(e => e.day === a), B = es.find(e => e.day === b);
  const cell = (e, ang) => {
    const id = e?.photos?.[ang];
    return id && vis ? `<button class="cmp-ph" data-act="ph-zoom" data-id="${id}" aria-label="Ampliar foto ${ANGLE[ang]} de ${fmtD(e.day)}"><img src="api/photos/${id}" alt="${ANGLE[ang]} em ${fmtD(e.day)}" loading="lazy"></button>`
      : `<div class="cmp-ph none">${vis ? 'sem foto' : (e?.photo_count ? 'foto privada' : 'sem foto')}</div>`;
  };
  const photos = (vis || es.some(e => e.photo_count)) ? ANGLES.map(ang => `<div class="cmp-row"><div class="cmp-l">${ANGLE[ang]}</div>${cell(A, ang)}${cell(B, ang)}</div>`).join('') : '';
  const rows = MET.map(([k, l, u]) => {
    const x = A?.[k], y = B?.[k]; if (x == null && y == null) return '';
    const d = (x != null && y != null) ? Math.round((y - x) * 10) / 10 : null;
    return `<tr><td>${l}</td><td>${x != null ? fmtNum(x) : '–'}</td><td>${y != null ? fmtNum(y) : '–'}</td><td class="delta ${better(k, d, goal)}">${d == null ? '–' : (d > 0 ? '+' : '') + fmtNum(d) + ' ' + u}</td></tr>`;
  }).join('');
  return `${photos ? `<div class="cmp"><div class="cmp-h"><span></span><b>${fmtD(a)}</b><b>${fmtD(b)}</b></div>${photos}</div>` : ''}
    <table class="mt"><thead><tr><th></th><th>${fmtD(a)}</th><th>${fmtD(b)}</th><th>Diferença</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="hint">Verde: caminho do seu objetivo. Vermelho: na direção contrária.</p>`;
}
document.addEventListener('change', e => {
  const k = e.target.dataset?.cmp; if (!k || !CMP) return;
  CMP[k] = e.target.value; $('#cmp-box').innerHTML = compareBox();
});

/* ---- tela "Meu corpo" ---- */
route(/^#\/corpo$/, async () => {
  const d = await api('GET', 'evaluations');
  S.profile = d.profile ?? S.profile;
  const es = d.entries, last = es[0];
  return html`
    <div class="page-title"><h1>Meu corpo</h1><a class="icon-btn" href="#/progresso" aria-label="Voltar">${raw(ICON.x)}</a></div>
    <div class="card ${d.due ? 'hl' : ''}"><div class="eyebrow">Avaliação</div>
      <h3>${!es.length ? 'Faça sua primeira avaliação' : d.due ? 'Está na hora da sua avaliação' : `Próxima avaliação em ${d.days_to_due} ${pl(d.days_to_due, 'dia', 'dias')}`}</h3>
      <p class="small muted" style="margin:4px 0 10px">${last ? `Última: ${fmtD(last.day)}. ` : ''}Peso, medidas e 4 fotos a cada ${d.every_days} dias mostram sua evolução de verdade. Seu personal também acompanha.</p>
      <a class="btn primary block" href="#/avaliacao">${raw(ICON.camera)} Nova avaliação</a></div>
    ${d.analysis ? raw(analysisCard(d.analysis)) : raw(html`<div class="card hl center"><h3>Descubra o seu IMC</h3><a class="btn primary" href="#/comecar">Começar</a></div>`)}
    ${raw(compareHtml(es, true, d.profile?.goal))}
    ${es.length ? raw(html`<div class="day-h">Histórico</div><div class="card"><ul class="list">${es.slice(0, 20).map(e => raw(html`<li><div class="grow"><div class="t">${fmtDay(e.day)}${e.weight != null ? ' · ' + fmtNum(e.weight) + ' kg' : ''}</div>
      <div class="s">${e.photo_count ? e.photo_count + ' ' + pl(e.photo_count, 'foto', 'fotos') + ' · ' : ''}${MEASURES.filter(([k]) => e[k]).map(([k, l]) => l.split(' ')[0] + ' ' + fmtNum(e[k])).join(' · ') || 'só o peso'}</div></div>
      ${e.id ? raw(html`<button class="icon-btn" data-act="ms-del" data-id="${e.id}" aria-label="Excluir avaliação">${raw(ICON.trash)}</button>`) : ''}</li>`))}</ul></div>`) : ''}`;
}, { after: async () => {
  // Transparência: quem acessou as minhas fotos e a minha ficha
  try {
    const { log } = await api('GET', 'privacy/log');
    const box = document.createElement('div');
    box.innerHTML = `<div class="day-h">Quem acessou os meus dados</div><div class="card"><p class="hint" style="margin-top:0">As fotos e a ficha são privadas. Aqui aparece cada acesso e cada alteração feita por outras pessoas.</p>${log.length
      ? `<ul class="list">${log.slice(0, 12).map(l => `<li><div class="grow"><div class="t">${esc(l.actor)} <span class="badge">${esc({ personal: 'Personal', admin: 'Administrador', super: 'Gestor' }[l.actor_role] || '')}</span></div><div class="s">${esc(l.text)} · ${esc(fmtDate(l.when, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}</div></div></li>`).join('')}</ul>`
      : '<p class="muted small" style="margin:0">Ninguém acessou os seus dados até agora.</p>'}</div>`;
    $('main')?.appendChild(box);
  } catch { /* sem registro */ }
} });

/* ---- nova avaliação (#/avaliacao) ---- */
let EV = null;
route(/^#\/avaliacao$/, async () => {
  const d = await api('GET', 'evaluations');
  const last = d.entries.find(e => e.weight != null) || {};
  EV = { step: 0, busy: false, day: todayStr(), weight: last.weight ?? '', m: Object.fromEntries(MEASURES.map(([k]) => [k, last[k] ?? ''])) };
  PHOTOS = {};
  return evHtml();
}, { bare: true });

function evHtml() {
  const s = EV.step;
  const nav = (next, back = true) => `<div class="wz-nav">${back ? '<button class="btn" data-act="ev-back">Voltar</button>' : '<a class="btn" href="#/corpo">Cancelar</a>'}<button class="btn primary" data-act="ev-next" ${EV.busy ? 'disabled' : ''}>${next}</button></div>`;
  let body;
  if (s === 0) body = `<h1>Nova avaliação</h1><p class="muted">Leva uns 5 minutos. Assista como tirar as fotos para a comparação ficar certinha.</p>${guideHtml()}${nav('Entendi, continuar', false)}`;
  else if (s === 1) body = `<h1>Peso e medidas</h1><p class="muted">Use a mesma fita e meça nos mesmos pontos de sempre. Pode pular as medidas.</p>
    <label class="f">Data<input class="in" type="date" data-ev="day" value="${EV.day}" max="${todayStr()}"></label>
    <label class="f">Peso (kg)<input class="in" data-ev="weight" inputmode="decimal" value="${esc(fmtIn(EV.weight))}" placeholder="Ex.: 78,5"></label>
    ${MEASURES.map(([k, l, hint, ph]) => `<label class="f">${l} (cm)<span class="hint">${hint}</span><input class="in" data-evm="${k}" inputmode="decimal" value="${esc(fmtIn(EV.m[k]))}" placeholder="Ex.: ${ph}"></label>`).join('')}${nav('Continuar')}`;
  else if (s === 2) body = `<h1>Fotos</h1><p class="muted">Toque em cada quadro para tirar ou escolher a foto. Elas são privadas: só você e o seu personal veem.</p>
    <details class="card"><summary><b>Rever como tirar</b></summary>${guideHtml()}</details>${photoSlots(PHOTOS)}
    <p class="hint">Dá para salvar só com algumas fotos e completar depois, mas as 4 deixam a comparação mais fiel.</p>${nav(EV.busy ? 'Salvando…' : 'Salvar avaliação')}`;
  return `<div class="wz"><div class="wz-top">${brandMark('#/corpo')}
    <div class="wz-dots">${[0, 1, 2].map(i => `<i class="${i === s ? 'on' : i < s ? 'done' : ''}"></i>`).join('')}</div></div><div id="ev-err"></div>${body}</div>`;
}
const evPaint = () => { $('#app').innerHTML = evHtml(); window.scrollTo(0, 0); };
document.addEventListener('input', e => {
  if (!EV || !$('#ev-err')) return;
  const f = e.target.dataset?.ev, m = e.target.dataset?.evm;
  if (f) EV[f] = e.target.value; if (m) EV.m[m] = e.target.value;
});
const evPhotoPaint = () => { if ($('.slots')) $('.slots').outerHTML = photoSlots(PHOTOS); };
Object.assign(acts, {
  'ev-back': () => { EV.step = Math.max(0, EV.step - 1); evPaint(); },
  'ev-next': guard(async () => {
    const err = m => { $('#ev-err').innerHTML = `<div class="err" role="alert">${esc(m)}</div>`; window.scrollTo(0, 0); };
    if (EV.step === 1) {
      const w = num(EV.weight); if (w < 20 || w > 400) return err('Informe o peso em quilos (ex.: 78,5).');
      if (EV.day > todayStr()) return err('A data não pode estar no futuro.');
    }
    if (EV.step < 2) { EV.step++; return evPaint(); }
    EV.busy = true; evPaint();
    try {
      await api('POST', 'evaluations', { day: EV.day, weight: num(EV.weight), measures: Object.fromEntries(MEASURES.map(([k]) => [k, EV.m[k] === '' ? null : num(EV.m[k])])) });
      const n = Object.keys(PHOTOS).length;
      let res = { ok: 0, fail: 0 };
      if (n) res = await uploadPhotos(EV.day, PHOTOS, (i, t, a) => { const b = $('[data-act=ev-next]'); if (b) b.textContent = `Enviando foto ${i} de ${t}…`; });
      toast(res.fail ? `Avaliação salva, mas ${res.fail} ${pl(res.fail, 'foto não foi enviada', 'fotos não foram enviadas')}.` : 'Avaliação salva!', !!res.fail);
      PHOTOS = {}; go('#/corpo');
    } catch (e) { EV.busy = false; evPaint(); err(e.message); }
  }),
  'ph-zoom': el => openModal(`<div class="row between" style="margin-bottom:8px"><h2>Foto</h2><button class="icon-btn" data-close aria-label="Fechar">${ICON.x}</button></div><div class="scroll"><img src="api/photos/${esc(el.dataset.id)}" alt="Foto ampliada" style="width:100%;border-radius:12px"></div>`),
  'ms-del': guard(async el => { if (await ask('Excluir avaliação?', 'As medidas e as fotos dessa data serão apagadas.', 'Excluir')) { await api('DELETE', `evaluations/${el.dataset.id}`); render(); } }),
});
