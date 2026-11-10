/* Meus Treinos V2 · gestão em rede: gestor geral, administrador da empresa e personal.
 * A tela só mostra o que cada perfil pode fazer; quem decide de verdade é o servidor (api/). */
'use strict';

const PERIODS = [['30d', '30 dias'], ['2m', '2 meses'], ['3m', '3 meses'], ['6m', '6 meses'], ['12m', '12 meses'], ['24m', '2 anos'], ['custom', 'Outro (escolher data)']];
const STATUS = { pendente: 'Aguardando aprovação', ativo: 'Ativo', bloqueado: 'Bloqueado' };
const ROLE = { aluno: 'Aluno', personal: 'Personal', admin: 'Administrador' };
const fmtD = d => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '–';
const daysLabel = n => n == null ? 'sem prazo' : n < 0 ? `vencido há ${-n} ${pl(-n, 'dia', 'dias')}` : n === 0 ? 'vence hoje' : `faltam ${n} ${pl(n, 'dia', 'dias')}`;
const daysTone = n => n == null ? 'ok' : n < 0 ? 'bad' : n <= 7 ? 'warn' : 'ok';
const ago = iso => { if (!iso) return 'nunca'; const d = Math.floor((Date.now() - new Date(iso)) / 864e5); return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`; };
const waLink = wa => wa ? `https://wa.me/${wa.length <= 11 ? '55' + wa : wa}` : null;
const waFmt = wa => wa ? (wa.length >= 10 ? `(${wa.slice(-11, -9)}) ${wa.slice(-9, -4)}-${wa.slice(-4)}` : wa) : '';
const waBtn = (wa, label = 'WhatsApp') => wa ? html`<a class="btn sm wa" href="${waLink(wa)}" target="_blank" rel="noopener">${raw(ICON.whats)} ${label}</a>` : '';
const isStaff = () => S.user && S.user.role !== 'aluno';

/** Escolha do período de acesso (30 dias ... 2 anos, ou uma data). `keep` adiciona a opção "não alterar". */
function periodFields({ keep = false, extend = false, cur = '' } = {}) {
  return html`<div class="f">Período de acesso
    <select class="in" name="period" data-period>${keep ? raw('<option value="">Não alterar</option>') : ''}${PERIODS.map(([v, l]) => raw(html`<option value="${v}" ${!keep && v === (cur || '3m') ? raw('selected') : ''}>${l}</option>`))}</select>
    <span class="period-custom" data-custom-wrap hidden><span class="lbl">Acesso válido até</span><input class="in" type="date" name="custom" data-custom min="${todayStr()}" aria-label="Acesso válido até"></span>
    ${extend ? raw('<label class="chk"><input type="checkbox" name="extend" value="1" checked> Somar à validade atual (renovar)</label>') : ''}</div>`;
}
document.addEventListener('change', e => {
  if (!e.target.matches?.('[data-period]')) return;
  const w = e.target.closest('form')?.querySelector('[data-custom-wrap]'), c = w?.querySelector('[data-custom]');
  if (w) { w.hidden = e.target.value !== 'custom'; if (c) { c.required = !w.hidden; if (!w.hidden) c.focus(); } }
});
// Perfil escolhido no cadastro de usuário: "personal responsável" só existe para aluno.
document.addEventListener('change', e => {
  if (!e.target.matches?.('[data-role-sel]')) return;
  for (const el of $$('[data-only-role]', e.target.closest('form'))) el.hidden = el.dataset.onlyRole !== e.target.value;
});
const periodBody = d => d.period ? { period: d.period, custom: d.custom || null, extend: !!d.extend } : {};
const personalSelect = (personals, cur = '') => html`<label class="f">Personal responsável<select class="in" name="personal_id"><option value="">Sem personal</option>${personals.map(p => raw(html`<option value="${p.id}" ${String(p.id) === String(cur) ? raw('selected') : ''}>${p.name}</option>`))}</select></label>`;

const validTag = u => u.effective_until ? html`<span class="badge tone-${daysTone(u.days_left)}">${daysLabel(u.days_left)} · ${fmtD(u.effective_until)}</span>` : html`<span class="badge">sem prazo</span>`;
const statusTag = u => html`<span class="badge ${u.status === 'ativo' ? 'tone-ok' : u.status === 'pendente' ? 'tone-warn' : 'tone-bad'}">${STATUS[u.status]}</span>`;

/* =====================================================================
 *  Gestor geral: empresas
 * ===================================================================== */
route(/^#\/gestor$/, async () => {
  const { companies } = await api('GET', 'companies');
  const tot = companies.reduce((a, c) => ({ users: a.users + c.users, pending: a.pending + c.pending }), { users: 0, pending: 0 });
  return html`
    <div class="page-title"><div><div class="eyebrow">Gestor geral</div><h1>Empresas</h1></div><div class="row"><button class="btn sm" data-act="direct-new">${raw(ICON.plus)} Cliente direto</button><button class="btn primary sm" data-act="co-new">${raw(ICON.plus)} Empresa</button></div></div>
    <div class="grid3" style="margin-bottom:14px"><div class="stat"><b>${companies.length}</b><span>empresas</span></div><div class="stat"><b>${tot.users}</b><span>usuários</span></div><div class="stat"><b>${tot.pending}</b><span>aguardando aprovação</span></div></div>
    ${companies.length ? '' : raw('<div class="empty">Nenhuma empresa ainda. Crie a primeira e defina o administrador dela.</div>')}
    ${companies.map(c => raw(html`<div class="card co ${c.status}">
      <div class="row between wrap"><div style="min-width:0"><h3>${c.name}</h3>
        <div class="small muted">${c.alunos} ${pl(c.alunos, 'aluno', 'alunos')} · ${c.personals} ${pl(c.personals, 'personal', 'personais')} · ${c.users} usuários${c.pending ? ' · ' : ''}${c.pending ? raw(html`<b class="warn-t">${c.pending} aguardando</b>`) : ''}</div></div>
        <span class="row">${c.kind === 'solo' ? raw('<span class="badge">Personal solo</span>') : c.kind === 'direta' ? raw('<span class="badge">Clientes diretos</span>') : ''}<span class="badge ${c.status === 'ativa' ? 'tone-ok' : 'tone-bad'}">${c.status === 'ativa' ? 'Ativa' : 'Suspensa'}</span></span></div>
      <div class="row wrap" style="margin:8px 0"><span class="badge ${c.plan_name ? 'tone-ok' : ''}">${c.plan_name ? 'Plano ' + c.plan_name : 'sem plano'}</span><span class="badge ${c.max_students != null && c.alunos_ativos >= c.max_students ? 'tone-bad' : ''}">${c.alunos_ativos}${c.max_students != null ? ' de ' + c.max_students : ''} alunos · ${c.personals}${c.max_personals != null ? ' de ' + c.max_personals : ''} ${pl(c.personals, 'personal', 'personais')}</span><span class="badge tone-${daysTone(c.days_left)}">${c.access_until ? `${daysLabel(c.days_left)} · até ${fmtD(c.access_until)}` : 'sem prazo'}</span>
        <button class="badge code" data-act="copy" data-v="${c.code}" aria-label="Copiar código ${c.code}">Código ${c.code} ⧉</button>${c.partner_code ? raw(html`<button class="badge code" data-act="copy-text" data-v="${c.partner_code}" aria-label="Copiar código de parceiro ${c.partner_code}">Parceiro ${c.partner_code} ⧉</button>`) : ''}</div>
      <div class="small muted">Administrador${c.admins.length > 1 ? 'es' : ''}: ${c.admins.map(a => a.name + ' (' + a.email + ')').join(', ')}</div>
      <div class="row wrap" style="margin-top:10px"><a class="btn sm primary" href="#/gestor/empresa/${c.id}">Gerenciar</a>
        ${c.kind === 'direta' ? raw('<span class="small muted">Empresa interna: reúne os alunos que pagam direto à plataforma. Os preços ficam em Financeiro.</span>') : raw(html`<button class="btn sm" data-act="co-valid" data-id="${c.id}">Validade</button>
        <button class="btn sm" data-act="co-plan" data-id="${c.id}">Plano</button>
        <button class="btn sm ghost" data-act="co-toggle" data-id="${c.id}" data-st="${c.status}">${c.status === 'ativa' ? 'Suspender' : 'Reativar'}</button>
        <button class="btn sm ghost" data-act="co-code" data-id="${c.id}">Novo código</button>`)}</div></div>`))}`;
});

route(/^#\/gestor\/usuarios$/, async () => {
  const [{ users }, { companies }] = await Promise.all([api('GET', 'manage/users'), api('GET', 'companies')]);
  TEAM = { cid: 0, tab: 'todos', q: '', users, companies, personals: [], summary: null, all: true };
  return html`<div class="page-title"><div><div class="eyebrow">Gestor geral</div><h1>Todos os usuários</h1></div><a class="btn sm" href="api/manage/export.csv" download>Exportar contatos</a></div>
    ${raw(teamBody())}`;
}, { after: () => bindTeam() });

/* =====================================================================
 *  Equipe da empresa (administrador da empresa, ou gestor olhando uma empresa)
 * ===================================================================== */
let TEAM = null;
const teamQs = cid => cid ? `?company_id=${cid}` : '';

route(/^#\/equipe$/, () => teamView(S.user.company_id), { after: () => { bindTeam(); loadAudit(); loadOutbox(); } });
route(/^#\/gestor\/empresa\/(\d+)$/, id => teamView(+id), { after: () => { bindTeam(); loadAudit(); loadOutbox(); } });

/** Registro de atividades da empresa: quem viu ficha/fotos, trocou personal, redefiniu senha, aprovou, excluiu. */
async function loadAudit() {
  try {
    const { log } = await api('GET', `manage/audit${teamQs(S.user.role === 'super' ? TEAM.cid : 0)}`);
    const box = $('#audit-box'); if (!box) return;
    box.innerHTML = `<details class="card"><summary><b>Registro de atividades</b> <span class="muted small">(últimas ${log.length})</span></summary>${log.length
      ? `<ul class="list" style="margin-top:8px">${log.map(l => `<li><div class="grow"><div class="t">${esc(l.actor)} ${esc(l.text)}${l.target ? ' · ' + esc(l.target) : ''}</div><div class="s">${esc(fmtDate(l.when, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}</div></div></li>`).join('')}</ul>`
      : '<p class="muted small">Nada registrado ainda.</p>'}</details>`;
  } catch { /* sem registro */ }
}

async function teamView(cid) {
  const [{ users }, sm] = await Promise.all([api('GET', `manage/users${teamQs(S.user.role === 'super' ? cid : 0)}`), api('GET', `manage/summary${teamQs(S.user.role === 'super' ? cid : 0)}`)]);
  TEAM = { cid, tab: sm.summary.pendentes ? 'pendente' : 'aluno', q: '', users, personals: sm.personals, summary: sm.summary, company: sm.company };
  const c = sm.company, s = sm.summary;
  return html`
    <div class="page-title"><div><div class="eyebrow">${S.user.role === 'super' ? 'Empresa' : 'Administrador'}</div><h1>${c.name}</h1></div>
      ${S.user.role === 'super' ? raw('<a class="icon-btn" href="#/gestor" aria-label="Voltar">' + ICON.x + '</a>') : ''}</div>
    <div class="card"><div class="row wrap" style="margin-bottom:8px"><span class="badge tone-${daysTone(c.days_left)}">${c.access_until ? `Empresa ${daysLabel(c.days_left)} · até ${fmtD(c.access_until)}` : 'Empresa sem prazo'}</span>
        <button class="badge code" data-act="copy" data-v="${c.code}" aria-label="Copiar código">Código para os alunos: <b>${c.code}</b> ⧉</button></div>
      <p class="hint" style="margin:0 0 10px">Passe este código ao aluno. Ele se cadastra e aparece aqui em "Aguardando aprovação".</p>
      <div class="grid3"><div class="stat"><b>${s.pendentes}</b><span>aguardando</span></div><div class="stat"><b>${s.alunos}</b><span>alunos ativos</span></div><div class="stat"><b>${s.expirando}</b><span>vencem em 7 dias</span></div></div>
      <div class="row wrap" style="margin-top:12px"><button class="btn primary sm" data-act="user-new">${raw(ICON.plus)} Novo usuário</button>
        <a class="btn sm" href="api/manage/export.csv${teamQs(S.user.role === 'super' ? cid : 0)}" download>Exportar contatos (CSV)</a>
        <button class="btn sm" data-act="unlock-all">Liberar login de todos</button></div></div>
    <div id="outbox-box"></div>
    ${raw(teamBody())}
    <div id="audit-box"></div>`;
}

function teamBody() {
  const t = TEAM, u = t.users;
  const n = r => u.filter(x => x.role === r).length;
  const tabs = t.all ? [['todos', 'Todos', u.length], ['pendente', 'Aguardando', u.filter(x => x.status === 'pendente').length]]
    : [['pendente', 'Aguardando', u.filter(x => x.status === 'pendente').length], ['aluno', 'Alunos', u.filter(x => x.role === 'aluno' && x.status !== 'pendente').length], ['personal', 'Personais', n('personal')], ...(S.user.role === 'super' ? [['admin', 'Admins', n('admin')]] : []), ['todos', 'Todos', u.length]];
  return html`<div class="seg" role="tablist">${tabs.map(([k, l, c]) => raw(html`<button role="tab" aria-selected="${t.tab === k}" data-team-tab="${k}">${l}${c ? raw(html` <i>${c}</i>`) : ''}</button>`))}</div>
    <input class="in" type="search" id="team-q" placeholder="Buscar por nome, e-mail ou WhatsApp…" value="${t.q}" style="margin:0 0 12px" aria-label="Buscar usuário">
    <div id="team-list">${raw(teamList())}</div>`;
}

function teamList() {
  const t = TEAM, q = (t.q || '').toLowerCase();
  const rows = t.users.filter(x => (t.tab === 'todos' || (t.tab === 'pendente' ? x.status === 'pendente' : x.role === t.tab && x.status !== 'pendente'))
    && (!q || `${x.name} ${x.email} ${x.whatsapp || ''}`.toLowerCase().includes(q)));
  if (!rows.length) return html`<div class="empty">${t.tab === 'pendente' ? 'Nenhum cadastro aguardando aprovação.' : 'Nenhum usuário encontrado.'}</div>`;
  return html`<div class="card days">${rows.map(x => raw(html`<div class="urow">
    <button class="urow-main" data-act="user-open" data-id="${x.id}" aria-label="Gerenciar ${x.name}">
      <span class="t">${x.name} <span class="badge">${ROLE[x.role]}</span></span>
      <span class="s">${x.email}${x.whatsapp ? ' · ' + waFmt(x.whatsapp) : ''}${TEAM.all && x.company_name ? ' · ' + x.company_name : ''}</span>
      <span class="tags">${raw(statusTag(x))}${x.status !== 'pendente' ? raw(validTag(x)) : ''}${x.role === 'aluno' && x.personal_name ? raw(html`<span class="badge">Personal: ${x.personal_name}</span>`) : ''}${x.goal ? raw(html`<span class="badge">${GOAL[x.goal]}${x.bmi ? ' · IMC ' + fmtNum(x.bmi) : ''}</span>`) : ''}</span></button>
    <span class="uact">${x.status === 'pendente' ? raw(html`<button class="btn sm primary" data-act="user-approve" data-id="${x.id}">Aprovar</button>`) : ''}${raw(waBtn(x.whatsapp, ''))}</span></div>`))}</div>`;
}

function bindTeam() {
  $$('[data-team-tab]').forEach(b => b.addEventListener('click', () => { TEAM.tab = b.dataset.teamTab; $$('[data-team-tab]').forEach(x => x.setAttribute('aria-selected', x === b)); $('#team-list').innerHTML = teamList(); }));
  $('#team-q')?.addEventListener('input', e => { TEAM.q = e.target.value; $('#team-list').innerHTML = teamList(); });
}
const teamUser = id => TEAM.users.find(u => u.id == id);
const teamReload = async () => { // atualiza só a lista (mantém aba e busca)
  const r = await api('GET', `manage/users${teamQs(S.user.role === 'super' ? TEAM.cid : 0)}`); TEAM.users = r.users;
  if (!TEAM.all) { const sm = await api('GET', `manage/summary${teamQs(S.user.role === 'super' ? TEAM.cid : 0)}`); TEAM.summary = sm.summary; TEAM.personals = sm.personals; }
  render();
};

function openUserManage(u) {
  const canRole = u.role !== 'admin' || S.user.role === 'super';
  const roles = S.user.role === 'super' ? ['aluno', 'personal', 'admin'] : ['aluno', 'personal'];
  openModal(html`
    <div class="row between" style="margin-bottom:6px"><h2 class="clip">${u.name}</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
    <div class="scroll">
      <div class="row wrap" style="margin-bottom:8px">${raw(statusTag(u))}<span class="badge">${ROLE[u.role]}</span>${u.status !== 'pendente' ? raw(validTag(u)) : ''}</div>
      <div class="card"><ul class="list sum"><li><span class="muted">E-mail</span><b>${u.email}</b></li>
        <li><span class="muted">WhatsApp</span><b>${u.whatsapp ? waFmt(u.whatsapp) : '–'}</b></li>
        <li><span class="muted">Cadastro</span><b>${fmtD(u.created_at)}</b></li><li><span class="muted">Último acesso</span><b>${ago(u.last_login)}</b></li>
        ${u.role === 'aluno' ? raw(html`<li><span class="muted">Objetivo</span><b>${u.goal ? GOAL[u.goal] : 'ainda não escolheu'}</b></li><li><span class="muted">IMC</span><b>${u.bmi ? fmtNum(u.bmi) : '–'}</b></li><li><span class="muted">Último treino</span><b>${ago(u.last_workout)}</b></li>`) : ''}</ul>
        <div class="row wrap" style="margin-top:10px">${raw(waBtn(u.whatsapp, 'Chamar no WhatsApp'))}<a class="btn sm" href="mailto:${u.email}">E-mail</a>${u.role === 'aluno' && u.status === 'ativo' ? raw(html`<a class="btn sm" href="#/aluno/${u.id}" data-close>Ver ficha</a>`) : ''}</div></div>
      <form data-form="user-edit" data-id="${u.id}">
        <label class="f">Nome<input class="in" name="name" value="${u.name}" maxlength="80" required></label>
        ${raw(waField('whatsapp', 'WhatsApp', u.whatsapp || ''))}
        ${raw(periodFields({ keep: true, extend: true }))}
        ${u.role === 'aluno' ? raw(personalSelect(TEAM.personals, u.personal_id)) : ''}
        ${u.role === 'aluno' ? raw(html`<div class="f">Perfil<div class="locked">${ROLE.aluno}<span class="muted small"> · não pode ser alterado</span></div></div>`)
          : canRole ? raw(html`<label class="f">Perfil<select class="in" name="role">${roles.filter(r => r !== 'aluno').map(r => raw(html`<option value="${r}" ${r === u.role ? raw('selected') : ''}>${ROLE[r]}</option>`))}</select></label>`) : ''}
        ${raw(pwField('new_password', 'Nova senha (deixe em branco para manter)', { auto: 'new-password', rules: true, req: false }))}
        <div class="stack"><button class="btn primary block" type="submit">Salvar alterações</button>
          ${u.status === 'bloqueado' ? raw(html`<button class="btn block" type="button" data-act="user-status" data-id="${u.id}" data-st="ativo">Reativar acesso</button>`) : u.status === 'ativo' ? raw(html`<button class="btn block" type="button" data-act="user-status" data-id="${u.id}" data-st="bloqueado">Bloquear acesso</button>`) : ''}
          ${u.status === 'ativo' ? raw(html`<button class="btn block" type="button" data-act="user-unlock" data-id="${u.id}">Liberar tentativas de login (acesso volta agora)</button>`) : ''}
          ${u.id !== S.user.id ? raw(html`<button class="btn danger block" type="button" data-act="user-del" data-id="${u.id}">Excluir usuário</button>`) : ''}</div>
      </form></div>`);
}

function openUserApprove(u) {
  openModal(html`<div class="row between" style="margin-bottom:6px"><h2>Aprovar cadastro</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
    <p class="muted">${u.name} · ${u.email}${u.whatsapp ? ' · ' + waFmt(u.whatsapp) : ''}</p>
    <form data-form="user-approve" data-id="${u.id}">${raw(periodFields({ cur: '3m' }))}${raw(personalSelect(TEAM.personals))}
      <p class="hint">O acesso começa agora e vale pelo período escolhido (nunca além da validade da empresa).</p>
      <div class="stack"><button class="btn primary block" type="submit">Aprovar e liberar acesso</button>
      <button class="btn danger block" type="button" data-act="user-del" data-id="${u.id}">Recusar e excluir cadastro</button></div></form>`);
}

function openUserNew() {
  openModal(html`<div class="row between" style="margin-bottom:6px"><h2>Novo usuário</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
    <div class="scroll"><form data-form="user-new">
      <label class="f">Perfil<select class="in" name="role" data-role-sel><option value="aluno">Aluno</option><option value="personal">Personal</option>${S.user.role === 'super' ? raw('<option value="admin">Administrador</option>') : ''}</select></label>
      <label class="f">Nome completo<input class="in" name="name" required maxlength="80"></label>
      ${raw(emailField('email'))}
      ${raw(waField())}
      ${raw(pwField('password', 'Senha provisória', { auto: 'new-password', rules: true }))}
      ${raw(periodFields({ cur: '3m' }))}
      <span data-only-role="aluno">${raw(personalSelect(TEAM.personals))}</span>
      <p class="hint">Quem você cria aqui já entra liberado, sem precisar de aprovação, e troca a senha no primeiro acesso. Personal e administrador não têm "personal responsável".</p>
      <button class="btn primary block" type="submit">Criar usuário</button></form></div>`);
}

/* =====================================================================
 *  Alunos e ficha completa (personal; administrador e gestor só leem)
 * ===================================================================== */
route(/^#\/alunos$/, async () => {
  const { students } = await api('GET', 'students');
  const role = S.user.role;
  return html`
    <div class="page-title"><div><div class="eyebrow">${role === 'personal' ? 'Meus alunos' : 'Alunos'}</div><h1>${students.length} ${pl(students.length, 'aluno', 'alunos')}</h1></div></div>
    <input class="in" type="search" id="stu-q" placeholder="Buscar aluno…" style="margin:0 0 12px" aria-label="Buscar aluno">
    ${students.length ? '' : raw(`<div class="empty">${role === 'personal' ? 'Nenhum aluno atribuído a você ainda. O administrador da empresa faz a atribuição.' : 'Nenhum aluno ativo.'}</div>`)}
    <div id="stu-list" class="card days">${students.map(x => raw(stuRow(x)))}</div>`;
}, { after: () => {
  $('#stu-q')?.addEventListener('input', e => { const q = e.target.value.toLowerCase(); $$('#stu-list [data-q]').forEach(r => r.hidden = !r.dataset.q.includes(q)); });
} });

const stuRow = x => {
  const due = x.last_eval ? Math.floor((Date.now() - new Date(x.last_eval + 'T12:00')) / 864e5) : null;
  return html`<div class="urow" data-q="${(x.name + ' ' + x.email).toLowerCase()}"><a class="urow-main" href="#/aluno/${x.id}">
    <span class="t">${x.name}</span><span class="s">${x.goal ? GOAL[x.goal] + ' · ' + (x.environment === 'casa' ? 'em casa' : 'academia') : 'ainda não montou o plano'}${x.bmi ? ' · IMC ' + fmtNum(x.bmi) : ''}</span>
    <span class="tags"><span class="badge">Treino: ${ago(x.last_workout)}</span><span class="badge ${due != null && due > (x.eval_every_days || 30) ? 'tone-warn' : ''}">Avaliação: ${due == null ? 'nenhuma' : ago(x.last_eval + 'T12:00')}</span>${raw(validTag(x))}</span></a>
    <span class="uact">${raw(waBtn(x.whatsapp, ''))}</span></div>`;
};

let FI = null; // ficha aberta
route(/^#\/aluno\/(\d+)$/, async id => {
  const d = await api('GET', `students/${id}`);
  FI = { id: +id, tab: FI?.id === +id ? FI.tab : 'resumo', d, edit: {} };
  return fichaHtml();
});

function fichaHtml() {
  const { d } = FI, s = d.student;
  const tabs = [['resumo', 'Resumo'], ['aval', 'Avaliações'], ['treino', 'Treino'], ['hist', 'Histórico']];
  return html`
    <div class="page-title"><div><div class="eyebrow">Ficha do aluno</div><h1>${s.name}</h1></div><a class="icon-btn" href="#/alunos" aria-label="Voltar">${raw(ICON.x)}</a></div>
    <div class="row wrap" style="margin-bottom:10px">${raw(waBtn(s.whatsapp, 'Chamar no WhatsApp'))}<a class="btn sm" href="mailto:${s.email}">E-mail</a>${raw(statusTag(s))}${raw(validTag(s))}</div>
    <div class="seg" role="tablist">${tabs.map(([k, l]) => raw(html`<button role="tab" aria-selected="${FI.tab === k}" data-act="fi-tab" data-t="${k}">${l}</button>`))}</div>
    <div id="fi-body">${raw(fichaTab())}</div>`;
}

function fichaTab() {
  const { d } = FI, s = d.student, p = d.profile, ov = d.overview;
  if (FI.tab === 'resumo') return html`
    ${d.analysis ? raw(analysisCard(d.analysis, false, true)) : raw('<div class="card note">O aluno ainda não respondeu as perguntas iniciais.</div>')}
    <div class="card"><ul class="list sum">
      <li><span class="muted">Contato</span><b>${s.email}${s.whatsapp ? ' · ' + waFmt(s.whatsapp) : ''}</b></li>
      <li><span class="muted">Personal</span><b>${s.personal_name || '–'}</b></li>
      ${p ? raw(html`<li><span class="muted">Objetivo</span><b>${GOAL[p.goal]}</b></li><li><span class="muted">Local</span><b>${ENV[p.environment]}</b></li><li><span class="muted">Frequência</span><b>${p.days_per_week} dias · ${LVL_SHORT[p.level]}</b></li><li><span class="muted">Sexo / idade</span><b>${p.sex === 'F' ? 'Feminino' : 'Masculino'}${p.age ? ' · ' + p.age + ' anos' : ''}</b></li>`) : ''}
      <li><span class="muted">Último treino</span><b>${ago(s.last_workout)}</b></li></ul></div>
    <div class="grid3"><div class="stat"><b>${ov.totals.workouts}</b><span>treinos feitos</span></div><div class="stat"><b>${ov.streak_weeks}</b><span>semanas seguidas</span></div><div class="stat"><b>${ov.week.workouts}</b><span>nesta semana</span></div></div>
    ${ov.prs.length ? raw(html`<div class="day-h">Recordes recentes</div><div class="card"><ul class="list">${ov.prs.map(x => raw(html`<li><span class="badge pr">PR</span><div class="grow"><div class="t">${x.name}</div><div class="s">${fmtDate(x.at)}</div></div><b class="mono">${x.weight > 0 ? fmtNum(x.weight, 2) + ' kg × ' : ''}${x.reps}${x.type === 'time' ? ' s' : ''}</b></li>`))}</ul></div>`) : ''}`;
  if (FI.tab === 'aval') return html`${d.photos_visible ? '' : raw('<div class="card note">As fotos são privadas: só o aluno e o personal responsável podem vê-las. Você vê as medidas.</div>')}${raw(compareHtml(d.evaluations, d.photos_visible, p?.goal))}`;
  if (FI.tab === 'hist') return d.workouts.length ? html`<div class="card"><ul class="list">${d.workouts.map(w => raw(html`<li><div class="grow"><div class="t">${w.name}${w.prs ? raw(html` <span class="badge pr">${w.prs} PR</span>`) : ''}</div><div class="s">${fmtDate(w.started_at, { weekday: 'short', day: '2-digit', month: 'short' })} · ${w.sets} séries · ${hhmmss((new Date(w.finished_at) - new Date(w.started_at)) / 1000)}</div></div><b class="mono">${fmtVol(w.volume)} kg</b></li>`))}</ul></div>` : html`<div class="empty">O aluno ainda não concluiu treinos.</div>`;
  // treino
  if (!d.routines.length) return html`<div class="empty">O aluno ainda não tem plano.</div>`;
  return html`${d.can_edit ? raw('<p class="hint">Você pode trocar exercícios, séries, repetições e descanso. O nome e o dia de cada treino ficam como o aluno montou.</p>') : raw('<p class="hint">Somente o personal responsável edita o treino.</p>')}
    ${d.routines.map(r => raw(routineCard(r)))}`;
}

function routineCard(r) {
  const e = FI.edit[r.id] ?? r.exercises;
  const dirty = !!FI.edit[r.id];
  return html`<details class="card rt" ${dirty ? raw('open') : ''}><summary><b>${r.name}</b> <span class="muted small">${r.weekday != null ? DIAS3[r.weekday] + ' · ' : ''}${e.length} exercícios</span></summary>
    <div class="rt-body">${e.map((x, i) => raw(html`<div class="rt-row"><div class="rt-name">${raw(mediaTag(x.media, '', 'thumb xs'))}<span class="clip">${x.name}</span>
      ${FI.d.can_edit ? raw(html`<span class="rt-act"><button class="icon-btn sm" data-act="fi-swap" data-r="${r.id}" data-i="${i}" aria-label="Trocar ${x.name}">${raw(ICON.swap)}</button><button class="icon-btn sm" data-act="fi-rm" data-r="${r.id}" data-i="${i}" aria-label="Remover ${x.name}">${raw(ICON.trash)}</button></span>`) : ''}</div>
      ${FI.d.can_edit ? raw(html`<div class="rt-fields" data-r="${r.id}" data-i="${i}">
        <label>Séries<input class="in" inputmode="numeric" data-fk="sets" value="${x.sets}"></label>
        <label>${x.type === 'time' ? 'Seg mín.' : 'Reps mín.'}<input class="in" inputmode="numeric" data-fk="reps_min" value="${x.reps_min}"></label>
        <label>${x.type === 'time' ? 'Seg máx.' : 'Reps máx.'}<input class="in" inputmode="numeric" data-fk="reps_max" value="${x.reps_max}"></label>
        <label>Descanso (s)<input class="in" inputmode="numeric" data-fk="rest_sec" value="${x.rest_sec}"></label></div>`) : raw(html`<div class="small muted">${rxText(x)}</div>`)}</div>`))}
      ${FI.d.can_edit ? raw(html`<div class="row wrap" style="margin-top:10px"><button class="btn sm ghost" data-act="fi-add" data-r="${r.id}">${raw(ICON.plus)} Exercício</button><button class="btn sm primary" data-act="fi-save" data-r="${r.id}" ${dirty ? '' : 'disabled'}>Salvar alterações</button></div>`) : ''}</div></details>`;
}
/** Guarda no rascunho o que o personal digitou nos campos (sem enviar ainda). */
function fiCollect(rid) {
  const list = (FI.edit[rid] ?? FI.d.routines.find(r => r.id == rid).exercises).map(x => ({ ...x }));
  $$(`.rt-fields[data-r="${rid}"]`).forEach(f => { const x = list[+f.dataset.i]; $$('[data-fk]', f).forEach(i => { x[i.dataset.fk] = Math.max(0, Math.round(num(i.value))); }); });
  FI.edit[rid] = list; return list;
}
document.addEventListener('input', e => { const f = e.target.closest?.('.rt-fields'); if (f) { fiCollect(f.dataset.r); const b = $(`[data-act=fi-save][data-r="${f.dataset.r}"]`); if (b) b.disabled = false; } });
const fiRepaint = () => { const open = new Set($$('details.rt[open] summary b').map(b => b.textContent)); $('#fi-body').innerHTML = fichaTab(); $$('details.rt').forEach(d => { if (open.has($('summary b', d).textContent)) d.open = true; }); };

/* =====================================================================
 *  Exercícios da empresa (personal e administrador) com animação
 * ===================================================================== */
const ENV_OPT = { casa: 'Em casa', academia: 'Academia', ambos: 'Casa e academia' };
const ROLE_OPT = { composto: 'Composto', isolado: 'Isolado', core: 'Abdômen', cardio: 'Cardio', aquecimento: 'Aquecimento', alongamento: 'Alongamento' };
async function companyExerciseForm(ex) {
  let d = ex ? { ...ex } : { name: '', muscle: 'peito', equipment: 'halteres', environment: 'academia', role: 'isolado', level: 1, type: 'reps', impact: 'baixo', steps: [], tips: [], mistakes: [], pace: '', rep_def: '' };
  if (ex) { try { delete EXD[ex.id]; d = { ...d, ...(await exerciseDetail(ex.id)) }; } catch { /* usa o resumo */ } }
  const sel = (name, opts, cur) => html`<select class="in" name="${name}">${Object.entries(opts).map(([k, v]) => raw(html`<option value="${k}" ${String(k) === String(cur) ? raw('selected') : ''}>${v}</option>`))}</select>`;
  openModal(html`<div class="row between" style="margin-bottom:10px"><h2>${ex ? 'Editar exercício' : 'Novo exercício da empresa'}</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
    <div class="scroll"><form data-form="cexercise" data-id="${ex?.id ?? ''}">
      <p class="hint" style="margin-top:0">Todos os alunos da sua empresa passam a ver este exercício, com a animação e o passo a passo.</p>
      <label class="f">Nome<input class="in" name="name" value="${d.name}" maxlength="120" required></label>
      <div class="grid2"><label class="f">Grupo muscular${raw(sel('muscle', Object.fromEntries(Object.entries(MUSCLE)), d.muscle))}</label>
        <label class="f">Equipamento${raw(sel('equipment', EQUIP, d.equipment))}</label>
        <label class="f">Onde se faz${raw(sel('environment', ENV_OPT, d.environment))}</label>
        <label class="f">Tipo${raw(sel('role', ROLE_OPT, d.role))}<span class="hint">Composto = vários músculos. Isolado = um só.</span></label>
        <label class="f">Dificuldade${raw(sel('level', { 1: 'Iniciante', 2: 'Intermediário', 3: 'Avançado' }, d.level))}</label>
        <label class="f">Medido em${raw(sel('type', { reps: 'Repetições', time: 'Tempo (segundos)' }, d.type))}</label></div>
      <label class="f">Tem impacto (saltos)?${raw(sel('impact', { baixo: 'Não, é de baixo impacto', alto: 'Sim, tem saltos ou impacto' }, d.impact))}</label>
      ${raw(mediaField(ex?.media))}
      <label class="f">O que conta como 1 repetição<input class="in" name="rep_def" value="${d.rep_def || ''}" maxlength="300" placeholder="Ex.: Descer até as coxas ficarem paralelas ao chão e subir."></label>
      <label class="f">Ritmo<input class="in" name="pace" value="${d.pace || ''}" maxlength="190" placeholder="Ex.: 2 segundos descendo, 1 segundo subindo"></label>
      <label class="f">Como fazer (um passo por linha, mínimo 2)<textarea class="in" name="steps" rows="5" required>${(d.steps || []).join('\n')}</textarea></label>
      <label class="f">Dicas (uma por linha)<textarea class="in" name="tips" rows="3">${(d.tips || []).join('\n')}</textarea></label>
      <label class="f">Erros comuns (um por linha)<textarea class="in" name="mistakes" rows="3">${(d.mistakes || []).join('\n')}</textarea></label>
      ${ex && ex.share === 'recusado' ? raw(html`<div class="err">Recusado pelo gestor: ${ex.share_note}</div>`) : ''}
      ${ex && ex.share === 'pendente' ? raw('<div class="infobox"><span>Aguardando a aprovação do gestor geral para entrar na lista geral do app.</span></div>') : ''}
      <div class="stack"><button class="btn primary block" type="submit">Salvar exercício</button>
        ${ex && S.user.role !== 'super' && ex.shared && ex.share !== 'pendente' ? raw(html`<button class="btn block" type="button" data-act="ex-submit" data-id="${ex.id}">Enviar para a lista geral do app</button>`) : ''}
        ${ex ? raw(html`<button class="btn danger block" type="button" data-act="ex-del" data-id="${ex.id}">Excluir exercício</button>`) : ''}</div></form></div>`);
}

/* ---- Configurações de quem gerencia ---- */
const configStaff = () => html`
  <div class="page-title"><h1>Mais</h1></div>
  ${raw(extraMais())}
  ${raw(supportCard())}
  <div class="card"><h3>Meu perfil</h3><form data-form="profile" style="margin-top:10px">
    <label class="f">Nome<input class="in" name="name" value="${S.user.name}" maxlength="80" required></label>
    ${raw(waField('whatsapp', S.user.role === 'super' ? 'WhatsApp (opcional)' : 'WhatsApp (contato com a academia)', S.user.whatsapp || '', { req: S.user.role !== 'super' }))}
    <p class="small muted">${ROLE[S.user.role] || 'Gestor geral'}${S.user.company_name ? ' · ' + S.user.company_name : ''} · ${S.user.email}</p>
    <button class="btn primary block" type="submit">Salvar</button></form></div>
  <div class="card"><h3>Trocar senha</h3><form data-form="password" style="margin-top:10px">${raw(pwField('current', 'Senha atual'))}
    ${raw(pwField('new', 'Nova senha', { auto: 'new-password', rules: true }))}<button class="btn block" type="submit">Trocar senha</button></form></div>
  <div class="card"><button class="btn block" data-act="logout">Sair</button></div>
  <p class="center small muted">Meus Treinos · v${S.version || ''}</p>`;

/* =====================================================================
 *  Ações e formulários
 * ===================================================================== */
Object.assign(acts, {
  copy: guard(async el => { try { await navigator.clipboard.writeText(el.dataset.v); toast('Código copiado: ' + el.dataset.v); } catch { toast('Código: ' + el.dataset.v); } }),

  'co-new': guard(async () => { const { plans } = await api('GET', 'plans'); const m = openModal(html`<div class="row between" style="margin-bottom:6px"><h2>Nova empresa</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
    <div class="scroll"><form data-form="co-new">
      <label class="f">Nome da empresa<input class="in" name="name" required maxlength="120" placeholder="Ex.: Academia Ritmo"></label>
      ${raw(periodFields({ cur: '12m' }))}
      <h3 style="margin:6px 0 2px">Administrador da empresa</h3><p class="hint" style="margin-top:0">Ele aprova os alunos, cria usuários e define a validade de cada um.</p>
      <label class="f">Plano da plataforma<select class="in" name="plan_id" id="co-plan-sel"><option value="">Sem plano (sem limite)</option></select></label>
      <label class="f">Indicada por (código de parceiro, opcional)<input class="in" name="referred_by" autocomplete="off" autocapitalize="characters" maxlength="16" placeholder="PAR-XXXXXX"><span class="hint">Se outra empresa indicou esta, as duas ganham desconto na mensalidade, dentro do teto de margem do plano.</span></label>
      <label class="f">Nome<input class="in" name="a_name" required maxlength="80"></label>
      ${raw(emailField('a_email', 'E-mail (será o login)'))}
      ${raw(waField('a_whatsapp'))}
      ${raw(pwField('a_password', 'Senha provisória', { auto: 'new-password', rules: true }))}
      <button class="btn primary block" type="submit">Criar empresa</button></form></div>`);
    $('#co-plan-sel', m).insertAdjacentHTML('beforeend', plans.filter(p => p.active).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')); }),
  'direct-new': guard(async () => { const { plans } = await api('GET', 'plans'); const solo = plans.filter(p => p.active && p.audience === 'solo');
    const m = openModal(html`<div class="row between" style="margin-bottom:6px"><h2>Novo cliente direto</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
    <p class="hint" style="margin-top:0">Para quem não vem por academia: paga direto à plataforma, como numa assinatura.</p>
    <div class="scroll"><form data-form="direct-new" class="formv">
      <label class="f">Tipo<select class="in" name="type" id="dn-type"><option value="aluno">Aluno solo (treina sozinho)</option><option value="personal" ${solo.length ? '' : raw('disabled')}>Personal solo (atende os próprios alunos)</option></select></label>
      <label class="f" id="dn-plan" style="display:none">Plano do personal solo<select class="in" name="plan_id">${solo.map(p => raw(html`<option value="${p.id}">${p.name} · ${money(p.price_cents)}/mês${p.max_students != null ? ' · até ' + p.max_students + ' alunos' : ''}</option>`))}</select></label>
      ${raw(periodFields({ cur: '3m' }))}
      <label class="f">Nome<input class="in" name="name" required maxlength="80"></label>
      ${raw(emailField('email', 'E-mail (será o login)'))}
      ${raw(waField('whatsapp'))}
      ${raw(pwField('password', 'Senha provisória', { auto: 'new-password', rules: true }))}
      <p class="hint">A pessoa troca a senha no primeiro acesso. Quem é personal solo ganha a própria área para cadastrar alunos.</p>
      <button class="btn primary block" type="submit">Criar cliente</button></form></div>`);
    $('#dn-type', m).addEventListener('change', e => { $('#dn-plan', m).style.display = e.target.value === 'personal' ? '' : 'none'; }); }),
  'co-valid': guard(async el => {
    const { companies } = await api('GET', 'companies'); const c = companies.find(x => x.id == el.dataset.id);
    openModal(html`<div class="row between" style="margin-bottom:6px"><h2>Validade de ${c.name}</h2><button class="icon-btn" data-close aria-label="Fechar">${raw(ICON.x)}</button></div>
      <p class="muted">Hoje: ${c.access_until ? `${daysLabel(c.days_left)} (até ${fmtD(c.access_until)})` : 'sem prazo'}. Quando vence, a empresa e todos os usuários dela perdem o acesso.</p>
      <form data-form="co-valid" data-id="${c.id}">${raw(periodFields({ keep: false, extend: true, cur: '12m' }))}<button class="btn primary block" type="submit">Aplicar validade</button></form>`);
  }),
  'co-toggle': guard(async el => {
    const susp = el.dataset.st === 'ativa';
    if (susp && !await ask('Suspender a empresa?', 'Todos os usuários dela perdem o acesso imediatamente. Você pode reativar quando quiser.', 'Suspender')) return;
    await api('PATCH', `companies/${el.dataset.id}`, { status: susp ? 'suspensa' : 'ativa' }); toast(susp ? 'Empresa suspensa.' : 'Empresa reativada.'); render();
  }),
  'co-code': guard(async el => {
    if (!await ask('Gerar novo código?', 'O código antigo deixa de valer para novos cadastros. Quem já está cadastrado não é afetado.', 'Gerar novo código', { danger: false })) return;
    const r = await api('PATCH', `companies/${el.dataset.id}`, { new_code: true }); toast('Novo código: ' + r.company.code); render();
  }),

  'user-new': () => openUserNew(),
  'user-open': el => openUserManage(teamUser(el.dataset.id)),
  'user-approve': el => openUserApprove(teamUser(el.dataset.id)),
  'user-status': guard(async el => {
    const block = el.dataset.st === 'bloqueado';
    if (block && !await ask('Bloquear acesso?', 'A pessoa perde o acesso na hora. Os dados dela ficam guardados.', 'Bloquear')) return;
    await api('PATCH', `manage/users/${el.dataset.id}`, { status: el.dataset.st }); closeModal(); toast(block ? 'Acesso bloqueado.' : 'Acesso reativado.'); await teamReload();
  }),
  'user-del': guard(async el => {
    const u = teamUser(el.dataset.id);
    closeModal();
    if (!await ask(`Excluir ${u.name}?`, 'Os treinos, medidas e fotos dessa pessoa serão apagados para sempre. Não dá para desfazer.', 'Excluir')) return;
    await api('DELETE', `manage/users/${u.id}`); toast('Usuário excluído.'); await teamReload();
  }),

  'fi-tab': el => { FI.tab = el.dataset.t; $$('[data-act=fi-tab]').forEach(b => b.setAttribute('aria-selected', b === el)); $('#fi-body').innerHTML = fichaTab(); },
  'fi-rm': el => { const l = fiCollect(el.dataset.r); if (l.length <= 1) return toast('O treino precisa de pelo menos um exercício.', true); l.splice(+el.dataset.i, 1); fiRepaint(); },
  'fi-swap': guard(async el => {
    const l = fiCollect(el.dataset.r), old = l[+el.dataset.i];
    const ex = await pickExercise({ muscle: old.muscle, title: `Trocar ${old.name}`, all: true }); if (!ex) return;
    if (l.some((x, k) => k !== +el.dataset.i && x.exercise_id === ex.id)) return toast('Esse exercício já está no treino.', true);
    Object.assign(old, { exercise_id: ex.id, name: ex.name, muscle: ex.muscle, type: ex.type, media: ex.media, role: ex.role, equipment: ex.equipment }); fiRepaint();
  }),
  'fi-add': guard(async el => {
    const l = fiCollect(el.dataset.r); const ex = await pickExercise({ all: true }); if (!ex) return;
    if (l.some(x => x.exercise_id === ex.id)) return toast('Esse exercício já está no treino.', true);
    const t = ex.type === 'time';
    l.push({ exercise_id: ex.id, name: ex.name, muscle: ex.muscle, type: ex.type, media: ex.media, role: ex.role, equipment: ex.equipment, sets: 3, reps_min: t ? 30 : 8, reps_max: t ? 60 : 12, rest_sec: t ? 60 : 90 }); fiRepaint();
  }),
  'fi-save': guard(async el => {
    const rid = el.dataset.r, l = fiCollect(rid);
    const body = { exercises: l.map(x => ({ exercise_id: x.exercise_id, sets: x.sets || 3, reps_min: x.reps_min || 1, reps_max: Math.max(x.reps_max, x.reps_min) || 1, rest_sec: x.rest_sec })) };
    const r = await api('PUT', `students/${FI.id}/routines/${rid}`, body);
    const i = FI.d.routines.findIndex(x => x.id == rid); FI.d.routines[i] = r.routine; delete FI.edit[rid]; toast('Treino do aluno atualizado.'); fiRepaint();
  }),
});

Object.assign(forms, {
  'co-new': async d => {
    await api('POST', 'companies', { name: d.name, plan_id: d.plan_id ? +d.plan_id : null, referred_by: d.referred_by || undefined, ...periodBody(d), admin: { name: d.a_name, email: d.a_email, whatsapp: d.a_whatsapp, password: d.a_password } });
    closeModal(); toast('Empresa criada.'); render();
  },
  'direct-new': async d => { const r = await api('POST', 'direct/clients', { type: d.type, name: d.name, email: d.email, whatsapp: d.whatsapp, password: d.password, plan_id: d.type === 'personal' && d.plan_id ? +d.plan_id : undefined, ...periodBody(d) }); closeModal(); toast(d.type === 'personal' ? 'Personal solo criado: a empresa dele já está pronta.' : 'Cliente direto criado.'); render(); },
  'co-valid': async (d, f) => { await api('PATCH', `companies/${f.dataset.id}`, periodBody(d)); closeModal(); toast('Validade atualizada.'); render(); },
  'user-new': async d => {
    await api('POST', 'manage/users', { name: d.name, email: d.email, whatsapp: d.whatsapp, password: d.password, role: d.role, personal_id: d.personal_id || null, company_id: S.user.role === 'super' ? TEAM.cid : undefined, ...periodBody(d) });
    closeModal(); toast('Usuário criado e liberado.'); await teamReload();
  },
  'user-approve': async (d, f) => { await api('POST', `manage/users/${f.dataset.id}/approve`, { ...periodBody(d), personal_id: d.personal_id || null }); closeModal(); toast('Cadastro aprovado.'); await teamReload(); },
  'user-edit': async (d, f) => {
    const body = { name: d.name, whatsapp: d.whatsapp, ...periodBody(d) };
    if ('personal_id' in d) body.personal_id = d.personal_id || null;
    if (d.role) body.role = d.role;
    if (d.new_password) body.new_password = d.new_password;
    await api('PATCH', `manage/users/${f.dataset.id}`, body); closeModal(); toast('Alterações salvas.'); await teamReload();
  },
  cexercise: async (d, f) => {
    const id = f.dataset.id, file = d.file;
    const body = { name: d.name, muscle: d.muscle, equipment: d.equipment, environment: d.environment, role: d.role, level: +d.level, type: d.type, impact: d.impact, rep_def: d.rep_def, pace: d.pace, steps: d.steps, tips: d.tips, mistakes: d.mistakes };
    const r = await api(id ? 'PUT' : 'POST', id ? `company/exercises/${id}` : 'company/exercises', body);
    if (file?.size) await uploadMedia(r.exercise.id, file);
    delete EXD[r.exercise.id]; closeModal(); await loadExercises(true); toast('Exercício salvo.'); render();
  },
});
