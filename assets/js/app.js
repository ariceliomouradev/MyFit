/* Meus Treinos · SPA sem build (JS puro). Por Aricelio Moura. */
'use strict';

/* ---------- Utilidades ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
class Raw { constructor(s) { this.s = s; } }
const raw = s => new Raw(s);
/** Template que escapa todo valor interpolado (anti-XSS), a menos que venha de raw(). */
const html = (strs, ...vals) => strs.reduce((o, s, i) => {
  let v = vals[i - 1];
  v = v instanceof Raw ? v.s : Array.isArray(v) ? v.map(x => x instanceof Raw ? x.s : esc(x)).join('') : esc(v ?? '');
  return o + v + s;
});
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const MUSCLE = { peito: 'Peito', costas: 'Costas', ombros: 'Ombros', biceps: 'Bíceps', triceps: 'Tríceps', antebracos: 'Antebraços', abdomen: 'Abdômen', quadriceps: 'Quadríceps', posteriores: 'Posteriores', gluteos: 'Glúteos', panturrilhas: 'Panturrilhas', cardio: 'Cardio', corpo_inteiro: 'Corpo inteiro', mobilidade: 'Mobilidade' };
const EQUIP = { barra: 'Barra', halteres: 'Halteres', maquina: 'Máquina', cabo: 'Cabo', peso_corporal: 'Peso corporal', kettlebell: 'Kettlebell', elastico: 'Elástico', outro: 'Outro' };
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS3 = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const fmtNum = (n, d = 1) => (n == null || isNaN(n)) ? '–' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: d });
const fmtVol = n => n >= 10000 ? fmtNum(n / 1000, 1) + ' t' : fmtNum(n, 0);
const fmtDate = (iso, opt = { day: '2-digit', month: 'short' }) => new Date(iso).toLocaleDateString('pt-BR', opt);
const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const mmss = s => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
const hhmmss = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h}h ${String(m).padStart(2, '0')}min` : `${m} min`; };
const unit = () => S.user?.unit || 'kg';
const exLabel = e => e.type === 'time' ? 'seg' : 'reps';
const pl = (n, one, many) => n === 1 ? one : many;

const ICON = {
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.8 0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4C21 6.700 17 3 12 3z"/><circle cx="7.500" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.500" cy="7" r="1"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.6 2.7 2.2 3 4.7"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M2 21h20M8 8h2M8 12h2M8 16h2M17 13h1M17 17h1"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  whats: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.6.1a6.700 6.700 0 0 1-3.300-2.900c-.2-.4.2-.4.7-1.300.1-.2 0-.3 0-.5l-.8-1.800c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.300 3 3 0 0 0-.9 2.200 5.200 5.200 0 0 0 1.100 2.800 11.900 11.900 0 0 0 4.600 4.100c1.700.7 2.400.8 3.200.7a2.700 2.700 0 0 0 1.800-1.300 2.200 2.200 0 0 0 .2-1.300c-.1-.1-.3-.2-.5-.3z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  dumb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h12l-3-3M17 17H5l3 3"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
  hist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

/* ---------- Estado e API ---------- */
const S = { brand: null, user: null, denied: null, pendingMsg: '', profile: null, lastMeasure: null, fresh: null, csrf: '', registration: true, exercises: null, routines: null, active: null };

async function api(method, path, data) {
  const opt = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (method !== 'GET') { opt.headers['Content-Type'] = 'application/json'; opt.headers['X-CSRF-Token'] = S.csrf; opt.body = JSON.stringify(data ?? {}); }
  let res;
  try { res = await fetch('api/' + path, opt); } catch { throw new Error('Sem conexão com o servidor.'); }
  let json = null;
  try { json = await res.json(); } catch { /* resposta não-JSON */ }
  if (res.status === 401 && S.user) { S.user = null; S.denied = json?.error || null; go('#/entrar'); }
  if (!res.ok) throw Object.assign(new Error(json?.error || `Erro ${res.status}`), { code: json?.code, status: res.status, retry: json?.retry_after });
  return json;
}

/** Envia um arquivo (multipart). O cabeçalho CSRF vai junto; o navegador monta o Content-Type sozinho. */
async function apiUpload(path, form) {
  let res;
  try { res = await fetch('api/' + path, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': S.csrf }, body: form }); } catch { throw new Error('Sem conexão com o servidor.'); }
  const json = await res.json().catch(() => null);
  if (res.status === 401 && S.user) { S.user = null; S.denied = json?.error || null; go('#/entrar'); }
  if (!res.ok) throw new Error(json?.error || `Erro ${res.status} ao enviar o arquivo`);
  return json;
}
async function uploadMedia(exId, file) {
  if (file.size > 4 * 1024 * 1024) throw new Error('A animação passa de 4 MB. Use um arquivo menor (GIF, WebP, PNG ou JPG).');
  const f = new FormData(); f.append('file', file);
  return apiUpload(`exercises/${exId}/media`, f);
}

function toast(msg, bad = false) {
  $('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : ''); t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };

async function loadExercises(force = false) {
  if (!S.exercises || force) S.exercises = (await api('GET', 'exercises')).exercises;
  return S.exercises;
}
async function loadRoutines(force = false) {
  if (!S.routines || force) S.routines = (await api('GET', 'routines')).routines;
  return S.routines;
}

/* ---------- Roteador ---------- */
const routes = [];
const route = (re, fn, opts = {}) => routes.push({ re, fn, ...opts });
const go = h => { if (location.hash === h) render(); else location.hash = h; };
let renderToken = 0;

/** Tela inicial de cada perfil e quem pode abrir o quê (o servidor confere de novo em toda chamada). */
const homeFor = role => ({ super: '#/gestor', admin: '#/equipe', personal: '#/alunos' })[role] || '#/';
function canOpen(role, hash) {
  const common = /^#\/(config|exercicios|exercicio\/\d+)$/.test(hash);
  if (role === 'aluno') return !/^#\/(gestor|equipe|alunos|aluno\/|marca|financeiro|planos|aprovacoes|ganhos)/.test(hash);
  if (common) return true;
  if (role === 'super') return /^#\/(gestor|aluno\/\d+|alunos|marca$|planos$|aprovacoes$|financeiro$)/.test(hash);
  if (role === 'admin') return /^#\/(equipe|alunos|aluno\/\d+|marca|financeiro|assinatura)$/.test(hash);
  if (role === 'personal') return /^#\/(alunos|aluno\/\d+|ganhos)$/.test(hash);
  return false;
}

async function render() {
  const token = ++renderToken;
  const hash = location.hash || '#/';
  const app = $('#app');
  const r = routes.find(r => r.re.test(hash));
  if (!r) { location.replace(S.user ? '#/' : '#/entrar'); return; }
  if (!S.user && !r.public) { location.replace('#/entrar'); return; }
  if (S.user && r.public) { location.replace(homeFor(S.user.role)); return; }
  if (S.user && !canOpen(S.user.role, hash)) { location.replace(homeFor(S.user.role)); return; }
  if (S.user?.role === 'aluno' && !S.profile && !/^#\/(comecar|config)$/.test(hash)) { location.replace('#/comecar'); return; }
  if (S.user?.must_change_password) { document.body.classList.remove('focus'); app.innerHTML = forcePwdHtml(); return; }
  applyBrand(S.brand); // descarta qualquer pré-visualização de cores da tela Marca
  stopTimers();
  try {
    const m = hash.match(r.re);
    const out = await r.fn(...m.slice(1));
    if (token !== renderToken) return;
    document.body.classList.toggle('focus', !!r.focus);
    app.innerHTML = r.bare ? out : layout(out, hash, r.focus);
    window.scrollTo(0, 0);
    r.after?.(...m.slice(1));
  } catch (e) {
    if (token !== renderToken) return;
    document.body.classList.remove('focus');
    app.innerHTML = layout(html`<div class="err" role="alert">${e.message}</div><div class="row"><button class="btn" data-act="reload">Tentar de novo</button><a class="btn ghost" href="#/">Voltar ao início</a></div>`, hash);
  }
}
window.addEventListener('hashchange', render);

function layout(content, hash, focus) {
  if (focus) return html`<div class="shell focus"><main>${raw(content)}</main></div>`; // treino: sem barra de topo nem abas
  const tab = (h, label, icon, match) => html`<a href="${h}" ${match.test(hash) ? raw('aria-current="page"') : ''}>${raw(icon)}<span>${label}</span></a>`;
  const role = S.user.role;
  const tabs = {
    aluno: html`
      ${raw(tab('#/', 'Hoje', ICON.home, /^#\/$/))}
      ${raw(tab('#/plano', 'Plano', ICON.plan, /^#\/(plano|rotina)/))}
      <button class="nav-go" data-act="start-today" aria-label="Iniciar ou continuar o treino">${raw(ICON.play)}<span>Iniciar</span></button>
      ${raw(tab('#/progresso', 'Progresso', ICON.chart, /^#\/(progresso|corpo|historico|avaliacao)/))}
      ${raw(tab('#/exercicios', 'Exercícios', ICON.dumb, /^#\/exerc/))}`,
    super: html`
      ${raw(tab('#/gestor', 'Empresas', ICON.building, /^#\/gestor($|\/)/))}
      ${raw(tab('#/planos', 'Planos', ICON.tag, /^#\/planos/))}
      ${raw(tab('#/aprovacoes', 'Aprovações', ICON.check, /^#\/aprovacoes/))}
      ${raw(tab('#/marca', 'Marca', ICON.palette, /^#\/marca/))}
      ${raw(tab('#/config', 'Mais', ICON.more, /^#\/(config|exerc)/))}`,
    admin: html`
      ${raw(tab('#/equipe', 'Equipe', ICON.users, /^#\/equipe/))}
      ${raw(tab('#/alunos', 'Alunos', ICON.chart, /^#\/(alunos|aluno\/)/))}
      ${raw(tab('#/financeiro', 'Financeiro', ICON.wallet, /^#\/(financeiro|assinatura)/))}
      ${raw(tab('#/exercicios', 'Exercícios', ICON.dumb, /^#\/exerc/))}
      ${raw(tab('#/config', 'Mais', ICON.more, /^#\/(config|marca)/))}`,
    personal: html`
      ${raw(tab('#/alunos', 'Alunos', ICON.users, /^#\/(alunos|aluno\/)/))}
      ${raw(tab('#/exercicios', 'Exercícios', ICON.dumb, /^#\/exerc/))}
      ${raw(tab('#/ganhos', 'Ganhos', ICON.wallet, /^#\/ganhos/))}
      ${raw(tab('#/config', 'Mais', ICON.more, /^#\/config/))}`,
  }[role];
  const roleLabel = { super: 'Gestor geral', admin: 'Administrador', personal: 'Personal' }[role];
  return html`
    <div class="shell">
      <header class="topbar">
        ${raw(brandMark(homeFor(role)))}
        <span class="grow"></span>
        ${roleLabel ? raw(html`<span class="badge" title="${S.user.company_name || ''}">${roleLabel}</span>`) : ''}
        ${role === 'aluno' ? raw(html`<a class="icon-btn" href="#/config" aria-label="Configurações e perfil">${raw(ICON.gear)}</a>`) : ''}
      </header>
      <main>${raw(content)}</main>
    </div>
    <nav class="nav" aria-label="Principal"><div class="nav-in">${raw(tabs)}</div></nav>`;
}

/* ---------- Timers (cronômetro do treino e descanso) ---------- */
let wkTick = null, restTick = null, restEnd = 0, restTotal = 0, wakeLock = null;
function stopTimers() { clearInterval(wkTick); wkTick = null; releaseWake(); } // o descanso continua contando ao trocar de tela
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* sem suporte */ } }
function releaseWake() { try { wakeLock?.release(); } catch { /* ok */ } wakeLock = null; }
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, .22, .44].forEach(t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(.15, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + t + .18); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .2); });
  } catch { /* ok */ }
  navigator.vibrate?.([200, 100, 200]);
}
function startRest(sec) {
  if (!sec) return hideRest();
  restTotal = sec; restEnd = Date.now() + sec * 1000;
  let el = $('.rest');
  if (!el) { el = document.createElement('div'); el.className = 'rest'; el.setAttribute('role', 'timer'); document.body.appendChild(el); }
  el.innerHTML = `<div class="bar"><i></i></div><span class="small muted">Descanso</span><b></b><span class="grow"></span><button class="btn sm" data-act="rest-sub" aria-label="Menos 15 segundos">−15s</button><button class="btn sm" data-act="rest-add" aria-label="Mais 15 segundos">+15s</button><button class="btn sm ghost" data-act="rest-skip">Pular</button>`;
  clearInterval(restTick);
  const tick = () => {
    const left = Math.ceil((restEnd - Date.now()) / 1000);
    if (left <= 0) { hideRest(); beep(); return; }
    $('.rest b').textContent = mmss(left);
    $('.rest i').style.width = Math.min(100, (1 - left / restTotal) * 100) + '%';
  };
  tick(); restTick = setInterval(tick, 250);
}
function hideRest() { clearInterval(restTick); restTick = null; $('.rest')?.remove(); }

/* ---------- Gráficos SVG ---------- */
function lineChart(pts, { w = 360, h = 200, fmt = v => fmtNum(v, 1), label = x => fmtDay(x), empty = 'Registre mais alguns treinos para ver a curva.' } = {}) {
  if (pts.length < 2) return `<p class="muted small center">${esc(empty)}</p>`;
  const pad = { l: 40, r: 14, t: 14, b: 26 };
  const ys = pts.map(p => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min; min -= span * .1; max += span * .1;
  const X = i => pad.l + (w - pad.l - pad.r) * i / (pts.length - 1);
  const Y = v => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / (max - min));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const area = `${line}L${X(pts.length - 1).toFixed(1)},${h - pad.b}L${X(0).toFixed(1)},${h - pad.b}Z`;
  const grid = [0, .5, 1].map(f => { const v = min + (max - min) * f, y = Y(v); return `<line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y}" y2="${y}"/><text x="${pad.l - 6}" y="${y + 4}" text-anchor="end">${esc(fmt(v))}</text>`; }).join('');
  const dots = pts.length <= 40 ? pts.map((p, i) => `<circle class="pt" cx="${X(i)}" cy="${Y(p.y)}" r="3.2"><title>${esc(label(p.x))}: ${esc(fmt(p.y))}</title></circle>`).join('') : '';
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Gráfico de evolução">${grid}<path class="ar" d="${area}"/><path class="ln" d="${line}"/>${dots}
    <text x="${pad.l}" y="${h - 6}">${esc(label(pts[0].x))}</text><text x="${w - pad.r}" y="${h - 6}" text-anchor="end">${esc(label(pts[pts.length - 1].x))}</text></svg>`;
}

function heatmap(map, weekStart) {
  const cell = 11, gap = 3, cols = 53, w = cols * (cell + gap) + 24, h = 7 * (cell + gap) + 18;
  const end = new Date(); end.setHours(12, 0, 0, 0);
  const endDow = (end.getDay() - weekStart + 7) % 7;
  const start = new Date(end); start.setDate(end.getDate() - endDow - (cols - 1) * 7);
  let out = '';
  for (let c = 0; c < cols; c++) for (let r = 0; r < 7; r++) {
    const d = new Date(start); d.setDate(start.getDate() + c * 7 + r);
    if (d > end) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const n = map[key] || 0;
    const fill = n === 0 ? 'var(--superficie-2)' : n === 1 ? 'var(--ambar-escuro)' : n === 2 ? 'var(--ambar-meio)' : 'var(--ambar-forte)';
    out += `<rect x="${24 + c * (cell + gap)}" y="${r * (cell + gap)}" width="${cell}" height="${cell}" fill="${fill}"><title>${esc(fmtDay(key))}: ${n} treino(s)</title></rect>`;
  }
  const labels = [0, 2, 4].map(r => `<text x="0" y="${r * (cell + gap) + 9}" style="font-size:9px">${DIAS3[(r + weekStart) % 7][0]}</text>`).join('');
  return `<div class="heat"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Frequência de treinos no último ano">${labels}${out}</svg></div>`;
}

/* ---------- Modal ---------- */
let modalOnClose = null;
function openModal(inner, onMount, onClose) {
  closeModal();
  modalOnClose = onClose || null;
  const m = document.createElement('div');
  m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
  m.innerHTML = `<div class="sheet">${inner}</div>`;
  m.addEventListener('click', e => { if (e.target === m) closeModal(); });
  document.body.appendChild(m);
  onMount?.(m);
  m.querySelector('input,select,textarea,button')?.focus();
  return m;
}
function closeModal() {
  const m = $('.modal'); if (!m) return;
  m.remove();
  const cb = modalOnClose; modalOnClose = null; cb?.();
}

/** Confirmação própria (substitui confirm/prompt do navegador). Devolve true/false, ou a senha digitada. */
function ask(title, text, okLabel = 'Confirmar', { danger = true, password = false } = {}) {
  return new Promise(resolve => {
    const m = openModal(html`<h2>${title}</h2><p class="muted" style="margin:8px 0 16px">${text}</p>
      ${password ? raw('<label class="f">Senha<input class="in" type="password" id="ask-pw" autocomplete="current-password"></label>') : ''}
      <div class="stack"><button class="btn ${danger ? 'danger' : 'primary'} block" data-ok>${okLabel}</button><button class="btn block" data-close>Cancelar</button></div>`,
      null, () => resolve(password ? null : false));
    m.addEventListener('click', e => {
      if (!e.target.closest('[data-ok]')) return;
      resolve(password ? ($('#ask-pw').value || null) : true); // resolve antes de fechar: o onClose vira no-op
      closeModal();
    });
  });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

const envOk = (e, env) => !env || e.mine || (env === 'casa'
  ? ['casa', 'ambos'].includes(e.environment) && ['peso_corporal', 'elastico'].includes(e.equipment)
  : ['academia', 'ambos'].includes(e.environment));

/** Escolhe um exercício. opts.muscle pré-seleciona o grupo (usado em "Trocar"). */
async function pickExercise(opts = {}) {
  const list = (await loadExercises()).filter(e => e.role !== 'aquecimento' && e.role !== 'alongamento' || opts.all);
  return new Promise(resolve => {
    let muscle = opts.muscle || '', q = '', onlyMine = !!S.profile?.environment;
    const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const draw = m => {
      const env = onlyMine ? S.profile?.environment : '';
      const items = list.filter(e => (!muscle || e.muscle === muscle) && envOk(e, env) && (!q || norm(e.name).includes(norm(q))));
      $('.pick-list', m).innerHTML = items.length ? html`<ul class="list">${items.map(e => raw(html`<li><button class="pick" data-pick="${e.id}">${raw(mediaTag(e.media, e.name, 'thumb sm'))}<span class="grow"><span class="t">${e.name}</span><span class="s">${MUSCLE[e.muscle]} · ${EQUIP[e.equipment]}</span></span></button></li>`))}</ul>` : '<p class="empty">Nada encontrado. Tente "Todos os ambientes" ou crie o exercício em Exercícios.</p>';
    };
    openModal(html`
      <div class="row between" style="margin-bottom:10px"><h2>${opts.title || 'Escolher exercício'}</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
      <input class="in" type="search" placeholder="Buscar…" data-q style="margin:0 0 10px" aria-label="Buscar exercício">
      ${S.profile?.environment ? raw(html`<div class="chips"><button class="chip" aria-pressed="true" data-env="1">Só o meu ambiente (${S.profile.environment === 'casa' ? 'casa' : 'academia'})</button></div>`) : ''}
      <div class="chips">${[['', 'Todos'], ...Object.entries(MUSCLE).filter(([k]) => opts.all || k !== 'mobilidade')].map(([k, v]) => raw(html`<button class="chip" aria-pressed="${k === muscle}" data-m="${k}">${v}</button>`))}</div>
      <div class="scroll pick-list"></div>`, m => {
      draw(m);
      m.addEventListener('input', e => { if (e.target.matches('[data-q]')) { q = e.target.value; draw(m); } });
      m.addEventListener('click', e => {
        const chip = e.target.closest('[data-m]'), pick = e.target.closest('[data-pick]'), env = e.target.closest('[data-env]');
        if (chip) { muscle = chip.dataset.m; $$('[data-m]', m).forEach(c => c.setAttribute('aria-pressed', c === chip)); draw(m); }
        if (env) { onlyMine = !onlyMine; env.setAttribute('aria-pressed', onlyMine); env.textContent = onlyMine ? `Só o meu ambiente (${S.profile.environment === 'casa' ? 'casa' : 'academia'})` : 'Todos os ambientes'; draw(m); }
        if (pick) { resolve(list.find(x => x.id == pick.dataset.pick)); closeModal(); }
      });
    }, () => resolve(null));
  });
}

/* =====================================================================
 *  Telas
 * ===================================================================== */

/* ---- Entrar / Criar conta ---- */
route(/^#\/entrar$/, () => authView(authModeVal), { public: true, bare: true });

/* ---- Hoje ---- */
const weekDates = () => { // as 7 datas da semana atual, começando no dia escolhido (segunda ou domingo)
  const t = new Date(); t.setHours(12, 0, 0, 0);
  const back = (t.getDay() - S.user.week_start + 7) % 7;
  return [...Array(7).keys()].map(i => { const d = new Date(t); d.setDate(t.getDate() - back + i); return d; });
};
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

route(/^#\/$/, async () => {
  const [routines, ov, act] = await Promise.all([loadRoutines(true), api('GET', 'stats/overview'), api('GET', 'workouts/active')]);
  S.active = act.active;
  const dow = new Date().getDay(), tdy = todayStr();
  const today = routines.filter(r => r.weekday === dow);
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
  const plannedOn = d => routines.some(r => r.weekday === d.getDay());
  const strip = weekDates().map(d => {
    const iso = isoOf(d), done = !!ov.heat[iso], isT = iso === tdy;
    return html`<div class="wd ${isT ? 'today' : ''}"><span>${DIAS3[d.getDay()]}</span><b>${d.getDate()}</b><i class="${done ? 'done' : plannedOn(d) ? 'plan' : ''}" aria-label="${done ? 'treinou' : plannedOn(d) ? 'treino planejado' : 'descanso'}"></i></div>`;
  }).join('');
  const next = (() => { // próximo treino planejado (para dias de descanso)
    for (let i = 1; i <= 7; i++) { const d = new Date(); d.setDate(d.getDate() + i); const r = routines.find(x => x.weekday === d.getDay()); if (r) return { r, d }; }
    return null;
  })();
  const thumbs = r => r.exercises.filter(e => secOf(e) === 'treino').slice(0, 4).map(e => mediaTag(e.media, e.name, 'thumb sm')).join('');
  const tcard = r => html`<a class="today-card" href="#/rotina/${r.id}"><div class="grow"><div class="eyebrow">Treino de hoje${ov.heat[tdy] ? ' · feito ✓' : ''}</div><h2>${r.name}</h2>
      <div class="small muted">${r.exercises.filter(e => secOf(e) === 'treino').length} exercícios · ${r.description || ''}</div><div class="thumbs">${raw(thumbs(r))}</div></div></a>
    ${act.active ? raw(html`<a class="btn primary block" href="#/treino/${act.active.workout.id}">Continuar treino</a>`) : raw(html`<button class="btn primary block" data-act="start" data-id="${r.id}">Iniciar treino</button>`)}`;
  return html`
    <div class="page-title"><div><div class="eyebrow">${DIAS[dow]}, ${new Date().getDate()}</div><h1>${greet}, ${S.user.name.split(' ')[0]}</h1></div></div>
    <div class="card week"><div class="strip">${raw(strip)}</div>
      ${act.active && !today.some(r => r.id === act.active.workout.routine_id) ? raw(html`<div class="eyebrow" style="margin-top:12px"><span class="ponto"></span> Treino em andamento</div><h3>${act.active.workout.name}</h3><a class="btn primary block" href="#/treino/${act.active.workout.id}" style="margin-top:8px">Continuar treino</a>`)
        : today.length ? raw(html`<div class="stack" style="margin-top:12px">${today.map(r => raw(tcard(r)))}</div>`)
        : routines.length ? raw(html`<div style="margin-top:12px"><div class="eyebrow">Hoje</div><h2>Dia de descanso</h2><p class="muted small" style="margin:4px 0 0">${next ? html`Próximo treino: ${DIAS[next.d.getDay()]}, ${next.r.name}.` : 'Descansar também faz parte do treino.'}</p></div>`)
        : raw(html`<div style="margin-top:12px" class="center"><h3>Você ainda não tem plano</h3><p class="muted small">Responda algumas perguntas e eu monto os seus treinos.</p><a class="btn primary" href="#/comecar">Montar meu plano</a></div>`)}
      ${routines.length && !act.active ? raw('<button class="link" data-act="choose-workout">Escolher outro treino</button>') : ''}
    </div>
    <div class="grid3" style="margin-bottom:14px">
      <div class="stat"><b>${ov.week.workouts}</b><span>${pl(ov.week.workouts, 'treino na semana', 'treinos na semana')}</span></div>
      <div class="stat"><b>${ov.streak_weeks}</b><span>${pl(ov.streak_weeks, 'semana seguida', 'semanas seguidas')}</span></div>
      <div class="stat"><b>${fmtVol(ov.week.volume)}</b><span>${unit()} levantados</span></div>
    </div>
    ${S.profile ? raw(html`<a class="card item bmi-mini" href="#/corpo"><div class="grow"><div class="eyebrow">Meu corpo</div><div class="t">${GOAL[S.profile.goal]} · ${S.profile.days_per_week} dias · ${S.profile.environment === 'casa' ? 'em casa' : 'academia'}</div><div class="s">Toque para ver o IMC e registrar medidas</div></div><span class="chev">›</span></a>`) : ''}
    ${ov.prs.length ? raw(html`<div class="day-h">Recordes recentes</div><div class="card"><ul class="list">${ov.prs.map(p => raw(html`<li><span class="badge pr">PR</span><div class="grow"><div class="t">${p.name}</div><div class="s">${fmtDate(p.at)}</div></div><b class="mono">${p.weight > 0 ? fmtNum(p.weight, 2) + ' ' + unit() + ' × ' : ''}${p.reps}${p.type === 'time' ? ' s' : p.weight > 0 ? '' : ' reps'}</b></li>`))}</ul></div>`) : ''}`;
});

/* ---- Treino ativo ---- */
let W = null; // { workout, exercises }
const DRAFT = {}; // digitado e ainda não marcado: "treino:exercício:série" -> { weight, reps }
const dkey = (exId, n) => `${W.workout.id}:${exId}:${n}`;
const stepW = () => unit() === 'lb' ? 5 : 2.5;
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };
const fmtIn = v => v === '' || v == null ? '' : String(v).replace('.', ',');
const clock = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`; };
const rowsOf = ex => Math.max(1, ex.sets_planned, ...ex.sets.map(s => s.set_no));
const exOf = id => W.exercises.find(e => e.exercise_id === +id);
const noLoad = ex => ex.type === 'time' || ex.equipment === 'peso_corporal'; // sem coluna de carga: só repetições (ou segundos)

route(/^#\/treino\/(\d+)$/, async id => {
  W = await api('GET', `workouts/${id}`);
  return workoutHtml();
}, { focus: true, after: () => {
  if (!W || W.workout.finished_at) return;
  keepAwake();
  const t0 = new Date(W.workout.started_at).getTime();
  const upd = () => { const el = $('#wk-timer'); if (el) el.textContent = clock(Math.max(0, Math.floor((Date.now() - t0) / 1000))); };
  upd(); wkTick = setInterval(upd, 1000);
} });

function wkProgress() {
  let done = 0, total = 0;
  for (const ex of W.exercises) { done += ex.sets.length; total += rowsOf(ex); }
  return { done, total };
}
function updHead() {
  const p = wkProgress(), bar = $('#wk-bar'), cnt = $('#wk-count');
  if (bar) bar.style.width = (p.total ? p.done / p.total * 100 : 0) + '%';
  if (cnt) cnt.textContent = `${p.done}/${p.total} séries`;
}

function workoutHtml() {
  const fin = !!W.workout.finished_at, exs = W.exercises, p = wkProgress();
  const vol = exs.reduce((a, ex) => a + ex.sets.reduce((b, s) => b + s.weight * s.reps, 0), 0);
  const meta = fin ? `${fmtDate(W.workout.started_at, { weekday: 'long', day: '2-digit', month: 'long' })} · ${hhmmss((new Date(W.workout.finished_at) - new Date(W.workout.started_at)) / 1000)} · ${p.done} ${pl(p.done, 'série', 'séries')} · ${fmtVol(vol)} ${unit()}` : '';
  return html`
    <div class="wk-head">
      <div class="row">
        <a class="icon-btn" href="${fin ? '#/historico' : '#/'}" aria-label="${fin ? 'Voltar ao histórico' : 'Minimizar treino (ele continua em andamento)'}">${raw(fin ? ICON.x : ICON.down)}</a>
        <div class="grow" style="min-width:0"><div class="eyebrow">${fin ? 'Treino concluído' : 'Em andamento'}</div><h2 class="clip">${W.workout.name}</h2></div>
        ${fin ? '' : raw('<div class="timer" id="wk-timer">0:00</div><button class="btn primary sm" data-act="wk-finish">Finalizar</button>')}
      </div>
      ${fin ? raw(html`<div class="small muted" style="margin-top:6px">${meta}</div>`)
            : raw(html`<div class="wk-prog"><div class="bar"><i id="wk-bar" style="width:${p.total ? p.done / p.total * 100 : 0}%"></i></div><span class="small muted mono" id="wk-count">${p.done}/${p.total} séries</span></div>`)}
    </div>
    ${exs.length ? '' : raw('<div class="empty">Nenhum exercício ainda. Adicione o primeiro abaixo.</div>')}
    ${exs.map(ex => raw(exerciseCard(ex)))}
    <button class="btn block ghost" data-act="wk-add-ex">${raw(ICON.plus)} Adicionar exercício</button>
    <label class="f" style="margin-top:16px">Anotações do treino<textarea class="in" id="wk-notes" maxlength="500" placeholder="Como foi? Dores, energia, ajustes…">${W.workout.notes || ''}</textarea></label>
    <p class="hint" style="margin-top:-6px">As anotações são salvas sozinhas.</p>
    <div class="stack" style="margin-top:14px">
      ${fin ? raw('<button class="btn danger block" data-act="wk-delete">Excluir este treino</button>')
            : raw('<button class="btn primary block" data-act="wk-finish">Finalizar treino</button><button class="btn danger block" data-act="wk-cancel">Descartar treino</button>')}
    </div>`;
}

function setListHtml(ex) {
  let out = '';
  for (let n = 1; n <= rowsOf(ex); n++) out += setRow(ex, n);
  return out;
}

function exerciseCard(ex) {
  const fin = !!W.workout.finished_at, t = ex.type === 'time', nl = noLoad(ex), sug = ex.suggestion;
  const rx = rxText({ sets: ex.sets_planned, reps_min: ex.reps_min, reps_max: ex.reps_max, rest_sec: ex.rest_sec, type: ex.type, role: ex.role });
  const range = `${ex.reps_min}–${ex.reps_max}`;
  const sugTxt = fin || nl ? '' : sug.weight != null ? `Última vez você foi bem: tente ${fmtNum(sug.weight, 2)} ${unit()}.` : 'Primeira vez neste exercício: escolha uma carga leve e anote.';
  return html`<section class="ex-card" data-ex="${ex.exercise_id}">
    <div class="ex-head">
      <button class="thumb-btn" data-act="ex-info" data-ex="${ex.exercise_id}" data-rx="${rx}" aria-label="Ver como fazer ${ex.name}">${raw(mediaTag(ex.media, ex.name, 'thumb'))}<span class="how-l">Como fazer</span></button>
      <div class="grow" style="min-width:0"><h3><a href="#/exercicio/${ex.exercise_id}">${ex.name}</a></h3><div class="hint">${MUSCLE[ex.muscle]}</div><div class="rx">${rx}</div></div>
      <button class="icon-btn" data-act="wk-rm-ex" data-ex="${ex.exercise_id}" aria-label="Remover ${ex.name} do treino">${raw(ICON.trash)}</button></div>
    ${ex.rep_def ? raw(html`<div class="hint">1 repetição: ${ex.rep_def}</div>`) : ''}
    ${sugTxt ? raw(html`<div class="hint sug">${sugTxt}</div>`) : ''}
    <div class="set set-h ${nl ? 'time' : ''}" aria-hidden="true"><span>#</span>${nl ? '' : raw(html`<span>${unit()}</span>`)}<span>${t ? 'segundos' : 'reps'}</span><span></span></div>
    <div class="set-list">${raw(setListHtml(ex))}</div>
    <div class="row" style="margin-top:8px"><button class="btn sm ghost" data-act="wk-add-set" data-ex="${ex.exercise_id}">${raw(ICON.plus)} Série</button>
      <button class="btn sm ghost" data-act="wk-rm-set" data-ex="${ex.exercise_id}" aria-label="Remover a última série de ${ex.name}">− Série</button></div>
  </section>`;
}

/** Valores iniciais de uma série ainda não marcada. */
function defaults(ex, n) {
  const d = DRAFT[dkey(ex.exercise_id, n)];
  if (d) return d;
  const sug = ex.suggestion, last = ex.last.find(x => x.set_no === n);
  const lastTop = ex.last.length ? Math.max(...ex.last.map(x => x.weight)) : null;
  const bumped = lastTop != null && sug.weight != null && sug.weight > lastTop; // a carga subiu: recomeça no mínimo de reps
  const prevDone = ex.sets.filter(s => s.set_no < n).sort((a, b) => b.set_no - a.set_no)[0]; // herda da série anterior deste treino
  return {
    weight: prevDone ? prevDone.weight : (sug.weight ?? ''),
    reps: (!bumped && last) ? Math.max(ex.reps_min, last.reps) : prevDone ? prevDone.reps : sug.reps,
  };
}

function capHtml(ex, n) {
  const s = ex.sets.find(x => x.set_no === n), last = ex.last.find(x => x.set_no === n);
  if (!last && !s?.is_pr) return '';
  const prev = last ? 'Anterior: ' + (ex.type === 'time' ? `${last.reps}s` : `${fmtNum(last.weight, 2)} × ${last.reps}`) : '';
  return html`<div class="set-cap">${prev}${s?.is_pr ? raw(' <span class="badge pr">Recorde</span>') : ''}</div>`;
}

function setRow(ex, n) {
  const s = ex.sets.find(x => x.set_no === n), t = ex.type === 'time', nl = noLoad(ex);
  const v = s || defaults(ex, n);
  const stp = (f, dir, label) => html`<button type="button" class="stp" data-act="set-step" data-f="${f}" data-dir="${dir}" aria-label="${dir > 0 ? 'Aumentar' : 'Diminuir'} ${label} da série ${n}">${dir > 0 ? '+' : '−'}</button>`;
  const field = (f, val, mode, label) => html`<div class="stepper">${raw(stp(f, -1, label))}<input inputmode="${mode}" data-f="${f}" value="${fmtIn(val)}" aria-label="${label} da série ${n}">${raw(stp(f, 1, label))}</div>`;
  return html`<div class="set ${nl ? 'time' : ''} ${s ? 'done' : ''}" data-set="${n}" data-ex="${ex.exercise_id}">
    <span class="no">${n}</span>
    ${nl ? '' : raw(field('weight', v.weight, 'decimal', 'carga'))}
    ${raw(field('reps', v.reps, 'numeric', t ? 'segundos' : 'repetições'))}
    <button type="button" class="check" data-act="set-toggle" aria-label="${s ? 'Desmarcar' : 'Concluir'} série ${n}" aria-pressed="${!!s}">${raw(ICON.check)}</button>
    ${raw(capHtml(ex, n))}
  </div>`;
}

const rowVals = row => ({ weight: $('input[data-f=weight]', row)?.value ?? '0', reps: $('input[data-f=reps]', row).value });
const repaintSets = ex => { const c = $(`.ex-card[data-ex="${ex.exercise_id}"] .set-list`); if (c) c.innerHTML = setListHtml(ex); updHead(); };

/** Grava a série. isNew = acabou de ser marcada (dispara descanso); senão é edição de série já feita. */
const saveSet = guard(async (ex, n, row, isNew) => {
  const v = rowVals(row), t = ex.type === 'time', nl = noLoad(ex);
  const reps = Math.round(num(v.reps));
  if (reps < 1) return toast(t ? 'Informe os segundos.' : 'Informe as repetições.', true);
  if (!nl && String(v.weight).trim() === '' && ex.equipment !== 'elastico') return toast('Informe a carga (use 0 se for sem peso).', true);
  const { set } = await api('POST', `workouts/${W.workout.id}/sets`, { exercise_id: ex.exercise_id, set_no: n, weight: nl ? 0 : num(v.weight), reps });
  const wasPr = ex.sets.find(s => s.set_no === n)?.is_pr;
  ex.sets = ex.sets.filter(s => s.set_no !== n).concat(set);
  delete DRAFT[dkey(ex.exercise_id, n)];
  if (isNew) {
    repaintSets(ex);
    if (!W.workout.finished_at) startRest(ex.rest_sec);
  } else { // não redesenha a linha para não tirar o foco de quem está editando
    row.querySelector('.set-cap')?.remove();
    row.insertAdjacentHTML('beforeend', capHtml(ex, n));
  }
  if (set.is_pr && !wasPr) { toast('🏆 Novo recorde!'); navigator.vibrate?.(60); }
});

const unmarkSet = guard(async (ex, n, row) => {
  DRAFT[dkey(ex.exercise_id, n)] = rowVals(row); // mantém o que estava digitado
  await api('DELETE', `workouts/${W.workout.id}/sets/${ex.exercise_id}/${n}`);
  ex.sets = ex.sets.filter(s => s.set_no !== n);
  hideRest();
  repaintSets(ex);
});

/** Chamado a cada digitação/toque em − +. commit = terminou de editar o campo. */
function onSetEdit(row, commit) {
  const ex = exOf(row.dataset.ex), n = +row.dataset.set;
  if (!ex) return;
  if (ex.sets.some(s => s.set_no === n)) { if (commit) saveSet(ex, n, row, false); }
  else DRAFT[dkey(ex.exercise_id, n)] = rowVals(row);
}

/** Redesenha o treino inteiro sem perder anotações nem séries extras ainda não marcadas. */
function repaintWorkout(prev) {
  if (prev) {
    W.workout.notes = prev.notes;
    for (const ex of W.exercises) ex.sets_planned = Math.max(ex.sets_planned, prev.planned[ex.exercise_id] || 0);
  }
  $('main').innerHTML = workoutHtml();
}
const wkSnapshot = () => ({ notes: $('#wk-notes')?.value ?? W.workout.notes, planned: Object.fromEntries(W.exercises.map(e => [e.exercise_id, e.sets_planned])) });

/* ---- Plano ---- */
route(/^#\/plano$/, async () => {
  const routines = await loadRoutines(true);
  let prof = null;
  try { prof = await api('GET', 'profile'); S.profile = prof.profile; S.lastMeasure = prof.measure; } catch { /* sem perfil */ }
  const fresh = S.fresh; S.fresh = null;
  const days = [...Array(7).keys()].map(i => (i + S.user.week_start) % 7);
  const dayRow = d => {
    const rs = routines.filter(r => r.weekday === d);
    if (!rs.length) return html`<div class="dayrow off"><b>${DIAS3[d]}</b><span class="grow"><span class="t">Descanso</span><span class="s">Recuperar também faz parte do plano</span></span></div>`;
    return rs.map(r => html`<a class="dayrow" href="#/rotina/${r.id}"><b>${DIAS3[d]}</b>
      <span class="grow"><span class="t">${r.name}</span><span class="s">${r.exercises.filter(e => secOf(e) === 'treino').length} exercícios${r.description ? ' · ' + r.description.split('.')[0] : ''}</span>
      <span class="thumbs">${raw(r.exercises.filter(e => secOf(e) === 'treino').slice(0, 4).map(e => mediaTag(e.media, '', 'thumb xs')).join(''))}</span></span><span class="chev">›</span></a>`).join('');
  };
  const loose = routines.filter(r => r.weekday == null);
  const a = fresh?.analysis || prof?.analysis, cov = fresh?.coverage;
  return html`
    <div class="page-title"><h1>Meu plano</h1><a class="btn sm" href="#/plano/novo">${raw(ICON.plus)} Rotina</a></div>
    ${fresh ? raw(html`<div class="card hl"><div class="eyebrow">Pronto!</div><h3>Seu plano foi montado</h3>
      <p class="small muted" style="margin:4px 0 8px">${GOAL[fresh.profile.goal]} · ${ENV[fresh.profile.environment]} · ${fresh.profile.days_per_week} dias por semana. Toque em um dia para ver os exercícios com animação.</p>
      ${a ? raw(html`<p class="small" style="margin:0">IMC <b>${fmtNum(a.bmi)}</b> (${a.label}).</p>`) : ''}
      ${a?.priority?.length ? raw(html`<p class="small" style="margin:6px 0 0">Mais atenção para: <b>${a.priority.map(g => MUSCLE[g] || g).join(', ')}</b>.</p>`) : ''}
      ${cov ? raw(html`<details style="margin-top:8px"><summary class="small"><b>Séries por músculo na semana</b></summary><div class="bars" style="margin-top:6px">${cov.map(c => raw(html`<div class="b"><span>${MUSCLE[c.group]}</span><span class="tr"><i style="width:${Math.min(100, c.sets / c.max * 100)}%"></i></span><b class="mono right">${c.sets}</b></div>`))}</div><p class="hint">O ideal por semana fica entre ${cov[0].min} e ${cov[0].max} séries por músculo grande.</p></details>`) : ''}</div>`) : ''}
    ${S.profile ? raw(html`<div class="card"><div class="row between wrap"><div><div class="t" style="font-weight:700">${GOAL[S.profile.goal]}</div><div class="small muted">${ENV[S.profile.environment]} · ${S.profile.days_per_week} dias · ${LVL_SHORT[S.profile.level]}</div></div>
      <div class="row wrap"><button class="btn sm" data-act="plan-adjust">Ajustar</button><button class="btn sm ghost" data-act="wz-restart">Refazer perguntas</button></div></div></div>`)
      : raw(html`<div class="card hl center"><h3>Monte seu plano automático</h3><p class="muted small">Informe seus dados e medidas e escolha o objetivo.</p><a class="btn primary" href="#/comecar">Começar</a></div>`)}
    ${routines.length ? raw(html`<div class="day-h">Sua semana</div><div class="card days">${days.map(d => raw(dayRow(d)))}</div>`) : ''}
    ${loose.length ? raw(html`<div class="day-h">Sem dia fixo</div><div class="card days">${loose.map(r => raw(html`<a class="dayrow" href="#/rotina/${r.id}"><b>·</b><span class="grow"><span class="t">${r.name}</span><span class="s">${r.exercises.length} exercícios</span></span><span class="chev">›</span></a>`))}</div>`) : ''}
    <p class="hint center">Quer mudar algo? Abra um treino e toque em <b>Editar</b>: dá para trocar exercícios, séries e repetições.</p>`;
});

let R = null; // rotina em edição
route(/^#\/plano\/(novo|\d+)$/, async id => {
  await loadExercises();
  if (id === 'novo') R = { id: null, name: '', weekday: null, exercises: [] };
  else { const rs = await loadRoutines(true); const f = rs.find(r => r.id == id); if (!f) throw new Error('Rotina não encontrada.'); R = JSON.parse(JSON.stringify(f)); }
  return routineEditor();
});

function routineEditor() {
  return html`
    <div class="page-title"><h1>${R.id ? 'Editar rotina' : 'Nova rotina'}</h1><a class="icon-btn" href="#/plano" aria-label="Voltar">${raw(ICON.x)}</a></div>
    <div class="card">
      <label class="f">Nome<input class="in" id="r-name" value="${R.name}" maxlength="80" placeholder="Ex.: Treino A · Peito e tríceps"></label>
      <label class="f" style="margin:0">Dia da semana<select class="in" id="r-day"><option value="">Sem dia fixo</option>${[...Array(7).keys()].map(k => (k + S.user.week_start) % 7).map(i => raw(html`<option value="${i}" ${R.weekday === i ? raw('selected') : ''}>${DIAS[i]}</option>`))}</select></label>
    </div>
    ${R.exercises.map((e, i) => raw(html`<div class="card" data-i="${i}">
      <div class="row between"><div class="row" style="min-width:0;gap:10px">${raw(mediaTag(e.media, '', 'thumb sm'))}<h3 class="clip">${e.name}</h3></div><div class="row" style="gap:0">
        <button class="icon-btn" data-act="r-swap" data-i="${i}" aria-label="Trocar ${e.name} por outro exercício">${raw(ICON.swap)}</button>
        <button class="icon-btn" data-act="r-up" data-i="${i}" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>${raw(ICON.up)}</button>
        <button class="icon-btn" data-act="r-down" data-i="${i}" aria-label="Descer" ${i === R.exercises.length - 1 ? 'disabled' : ''}>${raw(ICON.down)}</button>
        <button class="icon-btn" data-act="r-rm" data-i="${i}" aria-label="Remover">${raw(ICON.trash)}</button></div></div>
      <div class="grid2" style="margin-top:8px">
        <label class="f" style="margin:0">Séries<input class="in" inputmode="numeric" data-k="sets" value="${e.sets}"></label>
        <label class="f" style="margin:0">Descanso (s)<input class="in" inputmode="numeric" data-k="rest_sec" value="${e.rest_sec}"></label>
        <label class="f" style="margin:8px 0 0">${e.type === 'time' ? 'Seg mín.' : 'Reps mín.'}<input class="in" inputmode="numeric" data-k="reps_min" value="${e.reps_min}"></label>
        <label class="f" style="margin:8px 0 0">${e.type === 'time' ? 'Seg máx.' : 'Reps máx.'}<input class="in" inputmode="numeric" data-k="reps_max" value="${e.reps_max}"></label>
      </div></div>`))}
    <button class="btn block ghost" data-act="r-add">${raw(ICON.plus)} Adicionar exercício</button>
    <div class="stack" style="margin-top:16px">
      <button class="btn primary block" data-act="r-save">Salvar rotina</button>
      ${R.id ? raw('<button class="btn danger block" data-act="r-del">Excluir rotina</button>') : ''}
    </div>`;
}
function syncRoutineForm() {
  R.name = $('#r-name')?.value ?? R.name;
  const d = $('#r-day')?.value; R.weekday = d === '' || d == null ? null : +d;
  $$('[data-i][class=card]').forEach(c => {
    const e = R.exercises[+c.dataset.i]; if (!e) return;
    $$('[data-k]', c).forEach(inp => { e[inp.dataset.k] = Math.max(0, Math.round(num(inp.value))); });
  });
}
const repaintRoutine = () => { $('main').innerHTML = routineEditor(); };

/* ---- Paginação reutilizável (primeira, anterior, números, próxima, última e "ir para a página") ---- */
const PGH = {}; // id -> função(página) que redesenha a lista
const pageInfo = (items, page, per) => {
  const pages = Math.max(1, Math.ceil(items.length / per)), p = Math.min(Math.max(1, Math.round(+page) || 1), pages), from = (p - 1) * per;
  return { page: p, pages, from, total: items.length, slice: items.slice(from, from + per) };
};
const pgBtn = (n, label, off, aria, cur) => html`<button type="button" class="btn sm${cur ? ' primary' : ''}" data-pgn="${n}" ${off ? raw('disabled') : ''} aria-label="${aria || 'Página ' + n}" ${cur ? raw('aria-current="page"') : ''}>${label}</button>`;
/** Barra compacta (topo): « ‹ [página] de N › » */
const pagerMini = (id, pg) => pg.pages < 2 ? '' : html`<nav class="pager mini" data-pager="${id}" aria-label="Paginação">${raw(pgBtn(1, '«', pg.page <= 1, 'Primeira página'))}${raw(pgBtn(pg.page - 1, '‹', pg.page <= 1, 'Página anterior'))}<input class="in pgi" type="number" inputmode="numeric" min="1" max="${pg.pages}" value="${pg.page}" data-pgi aria-label="Ir para a página"><span class="small muted">de ${pg.pages}</span>${raw(pgBtn(pg.page + 1, '›', pg.page >= pg.pages, 'Próxima página'))}${raw(pgBtn(pg.pages, '»', pg.page >= pg.pages, 'Última página'))}</nav>`;
/** Barra completa (rodapé): « ‹ 1 … 6 7 8 … 15 › » + campo "ir para a página" */
const pagerFull = (id, pg) => {
  if (pg.pages < 2) return '';
  const set = new Set([1, pg.pages, pg.page - 1, pg.page, pg.page + 1]); if (pg.page <= 3) { set.add(2); set.add(3); } if (pg.page >= pg.pages - 2) { set.add(pg.pages - 1); set.add(pg.pages - 2); }
  const nums = [...set].filter(n => n >= 1 && n <= pg.pages).sort((a, b) => a - b); let prev = 0, mid = '';
  for (const n of nums) { if (n - prev > 1) mid += '<span class="pg-gap" aria-hidden="true">…</span>'; mid += pgBtn(n, n, false, 'Página ' + n, n === pg.page); prev = n; }
  return html`<nav class="pager" data-pager="${id}" aria-label="Paginação">${raw(pgBtn(1, '«', pg.page <= 1, 'Primeira página'))}${raw(pgBtn(pg.page - 1, '‹', pg.page <= 1, 'Página anterior'))}<span class="pg-nums">${raw(mid)}</span>${raw(pgBtn(pg.page + 1, '›', pg.page >= pg.pages, 'Próxima página'))}${raw(pgBtn(pg.pages, '»', pg.page >= pg.pages, 'Última página'))}<label class="pg-go small muted">Ir para <input class="in pgi" type="number" inputmode="numeric" min="1" max="${pg.pages}" placeholder="${pg.page}" data-pgi aria-label="Ir para a página"> de ${pg.pages}</label></nav>`;
};
const pgCount = (pg, one, many) => html`<b>${pg.total}</b> ${pg.total === 1 ? one : many}${pg.total ? ` · mostrando ${pg.from + 1}–${pg.from + pg.slice.length}` : ''}`;
document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-pager] [data-pgn]'); if (!b || b.disabled) return;
  PGH[b.closest('[data-pager]').dataset.pager]?.(+b.dataset.pgn);
});
document.addEventListener('change', e => {
  const i = e.target.closest?.('[data-pager] [data-pgi]'); if (!i || i.value === '') return;
  PGH[i.closest('[data-pager]').dataset.pager]?.(Math.round(+i.value) || 1);
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('[data-pgi]')) { e.preventDefault(); e.target.dispatchEvent(new Event('change', { bubbles: true })); } });
/** Crédito do desenvolvedor: aparece só na tela Mais/Configurações (antes ficava no rodapé de todas as telas). */
const devCredit = () => html`<footer class="credit"><a href="https://ariceliomoura.com.br/" target="_blank" rel="noopener">Desenvolvido por <img src="assets/img/logo.svg" alt="Aricelio Moura"></a></footer>`;
const backLink = (href = '#/config', label = 'Mais') => html`<a class="back" href="${href}" aria-label="Voltar para ${label}">‹ ${label}</a>`;
const toTop = sel => { const el = $(sel); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); };

/* ---- Biblioteca ---- */
let LIB = { q: '', muscle: '', env: '', page: 1 };
route(/^#\/exercicios$/, async () => { await loadExercises(true); return libraryHtml(); }, { after: () => bindLibrary() });
function libraryHtml() {
  return html`
    ${S.user.role === 'super' ? raw(backLink()) : ''}
    <div class="page-title"><h1>Exercícios</h1>${S.user.role === 'aluno' ? '' : raw(html`<button class="btn primary sm" data-act="ex-new">${raw(ICON.plus)} Novo</button>`)}</div>
    <input class="in" type="search" id="lib-q" placeholder="Buscar exercício…" value="${LIB.q}" style="margin:0 0 10px" aria-label="Buscar exercício">
    <div class="chips">${[['', 'Todos os locais'], ['casa', 'Em casa'], ['academia', 'Academia']].map(([k, v]) => raw(html`<button class="chip" aria-pressed="${k === LIB.env}" data-le="${k}">${v}</button>`))}</div>
    <div class="chips">${[['', 'Todos'], ...Object.entries(MUSCLE)].map(([k, v]) => raw(html`<button class="chip" aria-pressed="${k === LIB.muscle}" data-lm="${k}">${v}</button>`))}</div>
    <div class="card" id="lib-list"></div>`;
}
function bindLibrary() {
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const PER = 20;
  const draw = () => {
    const items = S.exercises.filter(e => (!LIB.muscle || e.muscle === LIB.muscle) && envOk(e, LIB.env) && (!LIB.q || norm(e.name).includes(norm(LIB.q))));
    const pg = pageInfo(items, LIB.page, PER); LIB.page = pg.page;
    const rows = pg.slice.map(e => raw(html`<li><button class="pick" data-act="ex-info" data-ex="${e.id}">${raw(mediaTag(e.media, e.name, 'thumb sm'))}<span class="grow"><span class="t">${e.name}</span><span class="s">${MUSCLE[e.muscle]} · ${EQUIP[e.equipment]}${e.level ? ' · ' + LVL_SHORT[e.level] : ''}${e.type === 'time' ? ' · por tempo' : ''}</span></span></button>
      ${e.mine || (e.shared && S.user.role !== 'aluno') ? raw(html`<span class="badge ${e.share === 'pendente' ? 'tone-warn' : e.share === 'recusado' ? 'tone-bad' : ''}" title="${e.share_note || ''}">${e.shared ? ({ pendente: 'aguardando gestor', recusado: 'recusado' }[e.share] || 'só a empresa') : 'meu'}</span><button class="icon-btn" data-act="ex-edit" data-id="${e.id}" aria-label="Editar">${raw(ICON.edit)}</button>`) : ''}</li>`));
    $('#lib-list').innerHTML = items.length ? html`<div class="row between pg-head"><p class="hint" style="margin:0">${raw(pgCount(pg, 'exercício', 'exercícios'))}</p>${raw(pagerMini('lib', pg))}</div><ul class="list">${rows}</ul>${raw(pagerFull('lib', pg))}` : '<p class="empty">Nenhum exercício encontrado.</p>';
  };
  PGH.lib = n => { LIB.page = n; draw(); toTop('#lib-q'); };
  draw();
  $('#lib-q').addEventListener('input', e => { LIB.q = e.target.value; LIB.page = 1; draw(); });
  $$('[data-lm]').forEach(b => b.addEventListener('click', () => { LIB.muscle = b.dataset.lm; LIB.page = 1; $$('[data-lm]').forEach(c => c.setAttribute('aria-pressed', c === b)); draw(); }));
  $$('[data-le]').forEach(b => b.addEventListener('click', () => { LIB.env = b.dataset.le; LIB.page = 1; $$('[data-le]').forEach(c => c.setAttribute('aria-pressed', c === b)); draw(); }));
}
/** Campo de animação: mostra a atual (se houver) e deixa escolher um arquivo novo com pré-visualização. */
const mediaField = cur => html`<div class="f">Animação do exercício
  <span class="hint" style="display:block;font-weight:400;margin-top:2px">GIF, WebP, PNG ou JPG, até 4 MB. Mostra o movimento para quem vai treinar.</span>
  <div class="media-pick">${raw(cur ? `<img class="thumb" src="${esc(cur)}" alt="Animação atual" id="mp-prev">` : '<span class="thumb ph" id="mp-prev" aria-hidden="true"></span>')}
    <label class="btn sm">${raw(ICON.camera)} Escolher arquivo<input type="file" name="file" accept="image/gif,image/webp,image/png,image/jpeg" class="sr" data-mp></label></div></div>`;
document.addEventListener('change', e => {
  if (!e.target.matches?.('[data-mp]')) return;
  const f = e.target.files?.[0], prev = $('#mp-prev');
  if (!f || !prev) return;
  if (f.size > 4 * 1024 * 1024) { e.target.value = ''; return toast('Esse arquivo passa de 4 MB.', true); }
  const url = URL.createObjectURL(f);
  prev.outerHTML = `<img class="thumb" src="${url}" alt="Pré-visualização" id="mp-prev">`;
});

function exerciseForm(ex) {
  if (S.user.role !== 'aluno') return companyExerciseForm(ex);
  const e = ex || { name: '', muscle: 'peito', equipment: 'barra', type: 'reps' };
  openModal(html`
    <div class="row between" style="margin-bottom:10px"><h2>${ex ? 'Editar exercício' : 'Novo exercício'}</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
    <div class="scroll"><form data-form="exercise" data-id="${ex?.id ?? ''}">
      <label class="f">Nome<input class="in" name="name" value="${e.name}" maxlength="120" required></label>
      <label class="f">Grupo muscular<select class="in" name="muscle">${Object.entries(MUSCLE).filter(([k]) => k !== 'mobilidade').map(([k, v]) => raw(html`<option value="${k}" ${k === e.muscle ? raw('selected') : ''}>${v}</option>`))}</select></label>
      <label class="f">Equipamento<select class="in" name="equipment">${Object.entries(EQUIP).map(([k, v]) => raw(html`<option value="${k}" ${k === e.equipment ? raw('selected') : ''}>${v}</option>`))}</select></label>
      <label class="f">Tipo de medida<select class="in" name="type"><option value="reps" ${e.type === 'reps' ? raw('selected') : ''}>Repetições (e carga)</option><option value="time" ${e.type === 'time' ? raw('selected') : ''}>Tempo (segundos)</option></select></label>
      ${raw(mediaField(e.media))}
      <div class="stack"><button class="btn primary block" type="submit">Salvar</button>${ex ? raw('<button class="btn danger block" type="button" data-act="ex-del" data-id="' + ex.id + '">Excluir exercício</button>') : ''}</div>
    </form></div>`);
}

/* ---- Detalhe do exercício ---- */
route(/^#\/exercicio\/(\d+)$/, async id => {
  const [d, info] = await Promise.all([api('GET', `stats/exercise/${id}`), exerciseDetail(id)]);
  const e = d.exercise, t = e.type === 'time';
  const series = d.series;
  const ol = (a, tag) => a?.length ? `<${tag} class="how">${a.map(x => `<li>${esc(x)}</li>`).join('')}</${tag}>` : '';
  return html`
    <div class="page-title"><div><div class="eyebrow">${MUSCLE[e.muscle]} · ${EQUIP[e.equipment]}</div><h1>${e.name}</h1></div><button class="icon-btn" data-act="back" aria-label="Voltar">${raw(ICON.x)}</button></div>
    <div class="media-box">${raw(mediaTag(info.media, 'Animação: ' + e.name, 'ex-big'))}</div>
    ${info.rep_def ? raw(html`<div class="card"><h3>O que é uma repetição</h3><p style="margin:0">${info.rep_def}</p>${info.pace ? raw(html`<p class="small muted" style="margin:6px 0 0">Ritmo: ${info.pace}</p>`) : ''}</div>`) : ''}
    ${info.steps?.length ? raw(html`<div class="card"><h3>Como fazer</h3>${raw(ol(info.steps, 'ol'))}${info.tips?.length ? raw(html`<h3 style="margin-top:12px">Dicas</h3>${raw(ol(info.tips, 'ul'))}`) : ''}${info.mistakes?.length ? raw(html`<h3 style="margin-top:12px">Evite</h3>${raw(ol(info.mistakes, 'ul'))}`) : ''}</div>`) : ''}
    ${S.user.role !== 'aluno' ? '' : series.length ? raw(html`
      <div class="day-h">Meu histórico</div>
      <div class="grid3" style="margin-bottom:12px">
        ${t ? raw(html`<div class="stat"><b>${d.records.maxreps}s</b><span>melhor tempo</span></div>`) : raw(html`<div class="stat"><b>${fmtNum(d.records.e1rm, 1)}</b><span>1RM estimado (${unit()})</span></div><div class="stat"><b>${fmtNum(d.records.maxw, 2)}</b><span>maior carga (${unit()})</span></div>`)}
        <div class="stat"><b>${series.length}</b><span>treinos</span></div>
      </div>
      <div class="card"><h3>${t ? 'Melhor série por treino' : '1RM estimado por treino'}</h3>${raw(lineChart(series.map(s => ({ x: s.day, y: t ? s.maxreps : s.e1rm }))))}</div>
      ${t ? '' : raw(html`<div class="card"><h3>Volume por treino</h3>${raw(lineChart(series.map(s => ({ x: s.day, y: s.vol })), { fmt: v => fmtNum(v, 0) }))}</div>`)}
      <p class="small muted">1RM estimado pela fórmula de Epley: carga × (1 + reps ÷ 30).</p>`) : raw('<p class="hint center">Você ainda não registrou este exercício em um treino.</p>')}`;
});

/* ---- Progresso ---- */
route(/^#\/progresso$/, async () => {
  const ov = await api('GET', 'stats/overview');
  const t = ov.totals;
  const maxSets = Math.max(1, ...ov.muscles.map(m => m.sets));
  return html`
    <div class="page-title"><h1>Progresso</h1><div class="row"><a class="btn sm" href="#/corpo">Meu corpo</a><a class="btn sm" href="#/historico">Histórico</a></div></div>
    <div class="grid2" style="margin-bottom:12px">
      <div class="stat"><b>${t.workouts}</b><span>${pl(t.workouts, 'treino concluído', 'treinos concluídos')}</span></div>
      <div class="stat"><b>${fmtNum(t.sets, 0)}</b><span>séries</span></div>
      <div class="stat"><b>${fmtVol(t.volume)}</b><span>${unit()} levantados no total</span></div>
      <div class="stat"><b>${ov.streak_weeks}</b><span>${pl(ov.streak_weeks, 'semana seguida', 'semanas seguidas')}</span></div>
    </div>
    <div class="card"><h3>Frequência (12 meses)</h3>${raw(heatmap(ov.heat, S.user.week_start))}</div>
    <div class="card"><h3>Séries por músculo (30 dias)</h3>
      ${ov.muscles.length ? raw(html`<div class="bars">${ov.muscles.map(m => raw(html`<div class="b"><span>${MUSCLE[m.muscle] || m.muscle}</span><span class="tr"><i style="width:${(m.sets / maxSets * 100).toFixed(0)}%"></i></span><b class="mono right">${m.sets}</b></div>`))}</div>`) : raw('<p class="muted small">Conclua um treino para ver a distribuição.</p>')}
    </div>
    <div class="card"><h3>Evolução por exercício</h3><p class="muted small">Escolha um exercício para ver a curva de 1RM e volume.</p><button class="btn block" data-act="prog-pick">Escolher exercício</button></div>`;
}, { after: () => { const h = $('.heat'); if (h) h.scrollLeft = h.scrollWidth; } }); // abre o gráfico já no mês atual

/* ---- Histórico ---- */
route(/^#\/historico$/, async () => {
  const { workouts } = await api('GET', 'workouts?limit=60');
  return html`
    <div class="page-title"><h1>Histórico</h1></div>
    ${workouts.length ? raw(html`<div class="card"><ul class="list">${workouts.map(w => raw(html`<li><a class="item grow" href="#/treino/${w.id}"><div class="grow"><div class="t">${w.name} ${w.prs ? raw(html`<span class="badge pr">${w.prs} PR</span>`) : ''}</div>
      <div class="s">${fmtDate(w.started_at, { weekday: 'short', day: '2-digit', month: 'short' })} · ${w.exercises} exerc. · ${w.sets} ${w.sets === 1 ? 'série' : 'séries'}${w.finished_at ? ' · ' + hhmmss((new Date(w.finished_at) - new Date(w.started_at)) / 1000) : ''}</div></div>
      <b class="mono">${fmtVol(w.volume)}<span class="small muted"> ${unit()}</span></b></a></li>`))}</ul></div>`) : raw('<div class="empty">Seus treinos concluídos aparecem aqui.</div>')}`;
});

/* ---- Mais / Configurações ---- */
route(/^#\/config$/, () => S.user.role === 'aluno' ? configAluno() : configStaff(), { after: () => mountMais() });
const configAluno = () => html`
  <div class="page-title"><h1>Mais</h1></div>
  ${raw(extraMais())}
  ${raw(supportCard())}
  <div class="card"><h3>Perfil</h3>
    <form data-form="profile" style="margin-top:10px">
      <label class="f">Nome<input class="in" name="name" value="${S.user.name}" maxlength="80" required></label>
      <div class="grid2"><label class="f">Unidade de carga<select class="in" name="unit"><option value="kg" ${S.user.unit === 'kg' ? raw('selected') : ''}>Quilos (kg)</option><option value="lb" ${S.user.unit === 'lb' ? raw('selected') : ''}>Libras (lb)</option></select></label>
      <label class="f">Semana começa<select class="in" name="week_start"><option value="1" ${S.user.week_start === 1 ? raw('selected') : ''}>Segunda</option><option value="0" ${S.user.week_start === 0 ? raw('selected') : ''}>Domingo</option></select></label></div>
      ${raw(waField('whatsapp', 'WhatsApp (contato com a academia)', S.user.whatsapp || ''))}
      <label class="f">Avaliações com fotos a cada<select class="in" name="eval_every_days">${[15, 30, 45, 60].map(d => raw(html`<option value="${d}" ${S.user.eval_every_days === d ? raw('selected') : ''}>${d} dias</option>`))}</select></label>
      <p class="small muted">Trocar a unidade muda só o rótulo: os números já registrados não são convertidos.</p>
      <p class="small muted">E-mail: ${S.user.email}${S.user.company_name ? ' · ' + S.user.company_name : ''}${S.user.access_until ? ' · acesso até ' + new Date(S.user.access_until + 'T12:00').toLocaleDateString('pt-BR') : ''}</p>
      <button class="btn primary block" type="submit">Salvar perfil</button></form></div>
  ${S.profile ? raw(html`<div class="card"><h3>Meu plano</h3><p class="small muted">${GOAL[S.profile.goal]} · ${ENV[S.profile.environment]} · ${S.profile.days_per_week} dias por semana</p>
    <div class="grid2 f1"><button class="btn" data-act="plan-adjust">Ajustar plano</button><button class="btn" data-act="wz-restart">Refazer perguntas</button></div></div>`) : raw(html`<div class="card"><h3>Meu plano</h3><a class="btn primary block" href="#/comecar">Montar meu plano</a></div>`)}
  <div class="card"><h3>Seus dados</h3><p class="small muted">Exporte tudo quando quiser. É seu.</p>
    <div class="grid2 f1"><a class="btn" href="api/export.csv" download>Planilha (CSV)</a><a class="btn" href="api/export.json" download>Backup (JSON)</a></div></div>
  <div class="card"><h3>Trocar senha</h3>
    <form data-form="password" style="margin-top:10px">${raw(pwField('current', 'Senha atual'))}
      ${raw(pwField('new', 'Nova senha', { auto: 'new-password', rules: true }))}
      <button class="btn block" type="submit">Trocar senha</button></form></div>
  <div class="card"><div class="stack"><button class="btn block" data-act="logout">Sair</button><button class="btn danger block" data-act="delete-account">Excluir minha conta</button></div></div>
  <p class="center small muted">Meus Treinos · v${S.version || ''}</p>
  ${raw(devCredit())}`;

/* =====================================================================
 *  Eventos (delegação)
 * ===================================================================== */
/** Folha para escolher qual treino iniciar (os de hoje primeiro) ou um treino livre. */
function chooseWorkout(rs, today) {
  const row = r => html`<li><button class="pick" data-act="start" data-id="${r.id}" data-close><span class="grow"><span class="t">${r.name}</span><span class="s">${r.weekday != null ? DIAS[r.weekday] + ' · ' : ''}${r.exercises.filter(e => secOf(e) === 'treino').length} exercícios</span></span><span class="chev">›</span></button></li>`;
  openModal(html`<div class="row between" style="margin-bottom:10px"><h2>Qual treino?</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
    <div class="scroll"><ul class="list">${today.map(r => raw(row(r)))}${rs.filter(r => !today.includes(r)).map(r => raw(row(r)))}
    <li><button class="pick" data-act="start" data-id="" data-close><span class="grow"><span class="t">Treino livre</span><span class="s">Sem rotina: você escolhe os exercícios</span></span><span class="chev">›</span></button></li></ul></div>`);
}

/** Folha para mudar objetivo, local, dias e experiência e refazer o plano. */
function planAdjust() {
  const p = S.profile, st = { ...p };
  const ch = (k, v, label) => html`<button class="chip" data-adj="${k}" data-v="${v}" aria-pressed="${String(st[k]) === String(v)}">${label}</button>`;
  const draw = m => { m.querySelector('.adj').innerHTML = html`
    <div class="f">Objetivo<div class="chips">${Object.entries(GOAL).map(([v, l]) => raw(ch('goal', v, l)))}</div></div>
    <div class="f">Onde treina<div class="chips">${raw(ch('environment', 'casa', 'Em casa'))}${raw(ch('environment', 'academia', 'Academia'))}</div></div>
    <div class="f">Dias por semana<div class="chips">${[2, 3, 4, 5].map(d => raw(ch('days_per_week', d, String(d))))}</div></div>
    <div class="f">Experiência<div class="chips">${[1, 2, 3].map(l => raw(ch('level', l, LVL_SHORT[l])))}</div></div>`; };
  openModal(html`<div class="row between" style="margin-bottom:10px"><h2>Ajustar plano</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
    <div class="adj"></div><p class="hint">Os treinos gerados antes serão substituídos. As rotinas que você criou à mão não mudam.</p>
    <button class="btn primary block" data-adj-go>Refazer o plano</button>`, m => {
    draw(m);
    m.addEventListener('click', guard(async e => {
      const c = e.target.closest('[data-adj]');
      if (c) { st[c.dataset.adj] = isNaN(c.dataset.v) ? c.dataset.v : +c.dataset.v; draw(m); }
      if (e.target.closest('[data-adj-go]')) {
        const r = await api('POST', 'plan/regenerate', { goal: st.goal, environment: st.environment, days_per_week: st.days_per_week, level: st.level });
        S.profile = r.profile; S.routines = null; S.fresh = r; closeModal(); go('#/plano'); render();
      }
    }));
  });
}

const acts = {
  'start-today': guard(async () => {
    const act = (await api('GET', 'workouts/active')).active;
    if (act) return go(`#/treino/${act.workout.id}`);
    const rs = await loadRoutines(true);
    const today = rs.filter(r => r.weekday === new Date().getDay());
    if (today.length === 1) return acts.start({ dataset: { id: today[0].id } });
    chooseWorkout(rs, today);
  }),
  'choose-workout': guard(async () => chooseWorkout(await loadRoutines(true), [])),
  'plan-adjust': () => planAdjust(),
  'r-swap': guard(async el => {
    syncRoutineForm();
    const i = +el.dataset.i, old = R.exercises[i];
    const ex = await pickExercise({ muscle: old.muscle, title: `Trocar ${old.name}` });
    if (!ex) return;
    if (R.exercises.some((e, k) => k !== i && e.exercise_id === ex.id)) return toast('Esse exercício já está na rotina.', true);
    Object.assign(old, { exercise_id: ex.id, name: ex.name, muscle: ex.muscle, type: ex.type, media: ex.media, role: ex.role, equipment: ex.equipment });
    repaintRoutine();
  }),
  reload: () => render(),
  back: () => history.length > 1 ? history.back() : go('#/'),
  'auth-toggle': el => authMode(el.dataset.mode),
  start: guard(async el => {
    const d = await api('POST', 'workouts', { routine_id: el.dataset.id ? +el.dataset.id : null });
    if (d.resumed) toast('Você já tinha um treino em andamento.');
    go(`#/treino/${d.workout.id}`);
  }),
  'set-toggle': el => {
    const row = el.closest('.set'), ex = exOf(row.dataset.ex), n = +row.dataset.set;
    ex.sets.some(s => s.set_no === n) ? unmarkSet(ex, n, row) : saveSet(ex, n, row, true);
  },
  'set-step': el => {
    const inp = $('input', el.parentElement), isW = el.dataset.f === 'weight';
    inp.value = fmtIn(Math.max(0, Math.round((num(inp.value) + (+el.dataset.dir) * (isW ? stepW() : 1)) * 100) / 100));
    onSetEdit(el.closest('.set'), true);
  },
  'wk-add-set': el => { const ex = exOf(el.dataset.ex); ex.sets_planned = rowsOf(ex) + 1; repaintSets(ex); },
  'wk-rm-set': el => {
    const ex = exOf(el.dataset.ex), n = rowsOf(ex);
    if (n <= 1) return toast('O exercício precisa de pelo menos uma série.', true);
    if (ex.sets.some(s => s.set_no === n)) return toast('Desmarque a última série antes de remover.', true);
    ex.sets_planned = n - 1; delete DRAFT[dkey(ex.exercise_id, n)]; repaintSets(ex);
  },
  'wk-add-ex': guard(async () => {
    const snap = wkSnapshot();
    const ex = await pickExercise(); if (!ex) return;
    W = await api('POST', `workouts/${W.workout.id}/exercises`, { exercise_id: ex.id });
    repaintWorkout(snap);
  }),
  'wk-rm-ex': guard(async el => {
    const ex = exOf(el.dataset.ex);
    if (!await ask('Remover exercício?', `${ex.name} e as séries já registradas nele saem deste treino.`, 'Remover')) return;
    const snap = wkSnapshot();
    await api('DELETE', `workouts/${W.workout.id}/exercises/${ex.exercise_id}`);
    W.exercises = W.exercises.filter(e => e !== ex);
    repaintWorkout(snap);
  }),
  'wk-finish': () => {
    const p = wkProgress(), left = p.total - p.done;
    const msg = !p.done ? 'Sem séries marcadas não há o que salvar. Você pode continuar ou descartar o treino.'
      : left > 0 ? `${left} ${pl(left, 'série ainda não foi marcada', 'séries ainda não foram marcadas')}. O que já foi feito fica salvo.`
      : 'Todas as séries foram marcadas. Bom trabalho!';
    openModal(html`<h2>${p.done ? 'Finalizar treino?' : 'Nenhuma série marcada'}</h2>
      <p class="muted" style="margin:8px 0 16px">${msg}</p>
      <div class="stack">${p.done ? raw('<button class="btn primary block" data-act="wk-do-finish">Finalizar e salvar</button>') : ''}
        <button class="btn block" data-close>Continuar treinando</button>
        <button class="btn danger block" data-act="wk-cancel">Descartar treino</button></div>`);
  },
  'wk-do-finish': guard(async () => {
    closeModal();
    const r = await api('POST', `workouts/${W.workout.id}/finish`, { notes: $('#wk-notes')?.value || '' });
    stopTimers(); hideRest();
    if (r.deleted) { toast('Treino vazio descartado.'); return go('#/'); }
    const dur = hhmmss((Date.now() - new Date(W.workout.started_at)) / 1000);
    W.workout.finished_at = new Date().toISOString();
    openModal(html`<div class="center"><div class="eyebrow">Treino concluído</div><h2 style="margin:6px 0 4px">Mandou bem! 💪</h2>
      <p class="muted small">${W.workout.name} · ${dur}</p>
      <div class="grid3" style="margin-bottom:16px"><div class="stat"><b>${r.summary.sets}</b><span>${pl(r.summary.sets, 'série', 'séries')}</span></div><div class="stat"><b>${fmtVol(r.summary.volume)}</b><span>${unit()}</span></div><div class="stat"><b>${r.summary.prs}</b><span>${pl(r.summary.prs, 'recorde', 'recordes')}</span></div></div>
      <button class="btn primary block" data-close>Ver histórico</button></div>`, null, () => go('#/historico'));
  }),
  'wk-cancel': guard(async () => {
    closeModal();
    if (!await ask('Descartar treino?', 'Tudo que foi registrado neste treino será apagado. Não dá para desfazer.', 'Descartar')) return;
    await api('DELETE', `workouts/${W.workout.id}`); stopTimers(); hideRest(); go('#/');
  }),
  'wk-delete': guard(async () => {
    if (!await ask('Excluir este treino?', 'Ele sai do histórico e das estatísticas. Não dá para desfazer.', 'Excluir')) return;
    await api('DELETE', `workouts/${W.workout.id}`); toast('Treino excluído.'); go('#/historico');
  }),
  'rest-add': () => { restEnd += 15000; restTotal += 15; },
  'rest-sub': () => { restEnd -= 15000; },
  'rest-skip': hideRest,

  'r-add': guard(async () => {
    syncRoutineForm();
    const ex = await pickExercise(); if (!ex) return;
    const t = ex.type === 'time';
    R.exercises.push({ exercise_id: ex.id, name: ex.name, muscle: ex.muscle, type: ex.type, sets: 3, reps_min: t ? 30 : 8, reps_max: t ? 60 : 12, rest_sec: t ? 60 : 90 });
    repaintRoutine();
  }),
  'r-rm': el => { syncRoutineForm(); R.exercises.splice(+el.dataset.i, 1); repaintRoutine(); },
  'r-up': el => { syncRoutineForm(); const i = +el.dataset.i; [R.exercises[i - 1], R.exercises[i]] = [R.exercises[i], R.exercises[i - 1]]; repaintRoutine(); },
  'r-down': el => { syncRoutineForm(); const i = +el.dataset.i; [R.exercises[i + 1], R.exercises[i]] = [R.exercises[i], R.exercises[i + 1]]; repaintRoutine(); },
  'r-save': guard(async () => {
    syncRoutineForm();
    if (R.name.trim().length < 2) return toast('Dê um nome à rotina.', true);
    const payload = { name: R.name, weekday: R.weekday, exercises: R.exercises.map(e => ({ exercise_id: e.exercise_id, sets: e.sets || 3, reps_min: e.reps_min || 1, reps_max: Math.max(e.reps_max, e.reps_min) || 1, rest_sec: e.rest_sec })) };
    await api(R.id ? 'PUT' : 'POST', R.id ? `routines/${R.id}` : 'routines', payload);
    S.routines = null; toast('Rotina salva.'); go('#/plano');
  }),
  'r-del': guard(async () => {
    if (!await ask('Excluir rotina?', 'O histórico de treinos já feitos é mantido.', 'Excluir')) return;
    await api('DELETE', `routines/${R.id}`); S.routines = null; go('#/plano');
  }),

  'ex-new': () => exerciseForm(null),
  'ex-edit': el => exerciseForm(S.exercises.find(e => e.id == el.dataset.id)),
  'ex-del': guard(async el => {
    if (!await ask('Excluir exercício?', 'Ele some das suas rotinas e do histórico de treinos.', 'Excluir')) return;
    await api('DELETE', `exercises/${el.dataset.id}`); closeModal(); await loadExercises(true); render();
  }),
  'prog-pick': guard(async () => { const ex = await pickExercise(); if (ex) go(`#/exercicio/${ex.id}`); }),
  'bw-del': guard(async el => { if (await ask('Excluir registro?', 'Este peso sai do histórico.', 'Excluir')) { await api('DELETE', `body-weight/${el.dataset.id}`); render(); } }),
  logout: guard(async () => { await api('POST', 'logout'); hideRest(); authModeVal = 'login'; S.user = null; S.routines = S.exercises = null; await boot(); go('#/entrar'); }),
  'delete-account': guard(async () => {
    const pw = await ask('Excluir sua conta?', 'Isso apaga a conta e todos os treinos, para sempre. Digite sua senha para confirmar.', 'Excluir minha conta', { password: true });
    if (!pw) return;
    await api('DELETE', 'me', { password: pw }); S.user = null; await boot(); go('#/entrar');
  }),
};

let authModeVal = 'login';
function authMode(m) { authModeVal = m; S.denied = null; renderAuth(); }
function renderAuth() { $('#app').innerHTML = authView(authModeVal); }
function authView(mode) { return authViewV3(mode); } // telas de acesso: assets/js/financeiro.js

document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (a && acts[a.dataset.act]) { if (a.tagName === 'A') e.preventDefault(); acts[a.dataset.act](a, e); }
  if (e.target.closest('.modal [data-close]')) closeModal();
});

const forms = {
  login: async d => {
    S.denied = null; S.renew = null;
    try { await api('POST', 'login', d); } catch (e) { if (e.code === 'expired_renewable') S.renew = { email: d.email, password: d.password }; throw e; }
    await boot(); go(homeFor(S.user.role));
  },
  register: async d => { const r = await api('POST', 'register', d); S.pendingMsg = r.message; authModeVal = 'pending'; renderAuth(); },
  exercise: async (d, f) => {
    const id = f.dataset.id, file = d.file; delete d.file;
    const r = await api(id ? 'PUT' : 'POST', id ? `exercises/${id}` : 'exercises', d);
    if (file?.size) await uploadMedia(r.exercise.id, file);
    closeModal(); await loadExercises(true); toast('Exercício salvo.'); render();
  },
  bw: async d => { await api('POST', 'body-weight', { day: d.day, weight: num(d.weight) }); toast('Peso registrado.'); render(); },
  profile: async d => { const r = await api('PATCH', 'me', { ...d, week_start: +(d.week_start ?? S.user.week_start), eval_every_days: +(d.eval_every_days ?? S.user.eval_every_days) }); S.user = { ...S.user, ...r.user }; toast('Perfil salvo.'); render(); },
  password: async (d, f) => { await api('POST', 'password', d); f.reset(); toast('Senha alterada.'); },
};
document.addEventListener('submit', async e => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  const btn = f.querySelector('[type=submit]'); btn && (btn.disabled = true);
  try {
    await forms[f.dataset.form](Object.fromEntries(new FormData(f)), f);
  } catch (err) {
    const box = $('#auth-err');
    if (box && /^(login|register|forgot|reset|renew)/.test(f.dataset.form)) box.innerHTML = `<div class="err" role="alert">${esc(err.message)}</div>${S.renew && f.dataset.form === 'login' ? '<button type="button" class="btn primary block" style="margin-bottom:12px" data-act="renew-open">Renovar a minha assinatura agora</button>' : ''}${err.code === 'throttled' ? throttleActions() : /^(expired|expired_renewable|pending)$/.test(err.code || '') ? supportActions(err.code) : ''}`; else toast(err.message, true);
  } finally { btn && (btn.disabled = false); }
});

// Séries: guarda o que foi digitado; em série já concluída, grava ao sair do campo.
document.addEventListener('input', e => { const row = e.target.closest?.('.set[data-set]'); if (row) onSetEdit(row, false); });
document.addEventListener('change', e => { const row = e.target.closest?.('.set[data-set]'); if (row) onSetEdit(row, true); });
// Anotações do treino: salvam sozinhas ao sair do campo.
document.addEventListener('focusout', guard(async e => {
  if (e.target.id !== 'wk-notes' || !W) return;
  const v = e.target.value.trim();
  if (v === (W.workout.notes || '')) return;
  W.workout.notes = (await api('PATCH', `workouts/${W.workout.id}`, { notes: v })).notes;
}));

// Faixas de filtro (.chips): arrastar com o mouse e girar a rodinha rolam para o lado; no celular o dedo já rola sozinho.
let chipDrag = null, chipSuppressUntil = 0;
document.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  const c = e.target.closest?.('.chips');
  if (c && c.scrollWidth > c.clientWidth + 2) chipDrag = { c, x: e.clientX, left: c.scrollLeft, moved: false };
});
document.addEventListener('pointermove', e => {
  if (!chipDrag) return;
  const dx = e.clientX - chipDrag.x;
  if (Math.abs(dx) > 5) { chipDrag.moved = true; chipDrag.c.classList.add('dragging'); }
  if (chipDrag.moved) chipDrag.c.scrollLeft = chipDrag.left - dx;
});
const chipDragEnd = () => { if (!chipDrag) return; if (chipDrag.moved) chipSuppressUntil = Date.now() + 80; chipDrag.c.classList.remove('dragging'); chipDrag = null; };
document.addEventListener('pointerup', chipDragEnd); document.addEventListener('pointercancel', chipDragEnd);
document.addEventListener('click', e => { if (Date.now() < chipSuppressUntil) { e.preventDefault(); e.stopPropagation(); } }, true);
document.addEventListener('wheel', e => {
  const c = e.target.closest?.('.chips');
  if (!c || c.scrollWidth <= c.clientWidth + 2 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  const max = c.scrollWidth - c.clientWidth, next = c.scrollLeft + e.deltaY;
  if ((e.deltaY > 0 && c.scrollLeft < max) || (e.deltaY < 0 && c.scrollLeft > 0)) { e.preventDefault(); c.scrollLeft = Math.max(0, Math.min(max, next)); }
}, { passive: false });

/* ---------- Partida ---------- */
async function boot() {
  try {
    const r = await api('GET', 'me');
    Object.assign(S, { user: r.user, profile: r.profile, denied: r.denied, csrf: r.csrf, registration: r.registration, version: r.version, support: r.support });
    applyBrand(r.brand);
  } catch (e) {
    $('#app').innerHTML = `<div class="auth"><div class="err">${esc(e.message)}</div><button class="btn block" onclick="location.reload()">Tentar de novo</button></div>`;
    throw e;
  }
}
boot().then(() => {
  if (!location.hash || location.hash === '#') location.replace(S.user ? '#/' : '#/entrar');
  render();
}).catch(() => {});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker?.register('sw.js').catch(() => {});
}
