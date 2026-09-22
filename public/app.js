import { storage } from './storage.js';
import { $, $$, escapeHtml, showToast, motion } from './ui.js';
import { initReading } from './reading.js';
import { initAI } from './ai.js';
import { initExecutive } from './executive.js';
import { latestItemFeedback, deferRecentlyNotFit, localAction } from './focus-core.js';

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => {}));

const savedIdeas = storage.get('ideas', []);
let ideas = (Array.isArray(savedIdeas) ? savedIdeas : []).filter(i => i && typeof i.text === 'string').map(i => ({
  id: String(i.id || crypto.randomUUID()), text: i.text.slice(0,160),
  type: ['interest','project','obligation'].includes(i.type) ? i.type : 'interest',
  state: i.state === 'active' ? 'in_progress' : ['in_progress','paused','start','someday'].includes(i.state) ? i.state : 'start',
  effort: ['light','regular','deep'].includes(i.effort) ? i.effort : (i.nextStep ? 'light' : i.type === 'project' ? 'deep' : 'regular'),
  category: ['general','reading','game','series'].includes(i.category) ? i.category : 'general',
  book: {
    totalPages: Number.isInteger(i.book?.totalPages) && i.book.totalPages > 0 ? i.book.totalPages : null,
    currentPage: Number.isInteger(i.book?.currentPage) && i.book.currentPage >= 0 ? i.book.currentPage : 0,
    notes: Array.isArray(i.book?.notes)
      ? i.book.notes.filter(note => note && (typeof note.text === 'string' || typeof note.excerpt === 'string')).slice(0, 100).map(note => ({ id: String(note.id || crypto.randomUUID()), page: Number.isInteger(note.page) && note.page >= 0 ? note.page : 0, text: typeof note.text === 'string' ? note.text.trim().slice(0, 2000) : '', excerpt: typeof note.excerpt === 'string' ? note.excerpt.trim().slice(0, 4000) : '', createdAt: typeof note.createdAt === 'string' ? note.createdAt : new Date().toISOString() }))
      : typeof i.book?.notes === 'string' && i.book.notes.trim()
        ? [{ id: crypto.randomUUID(), page: Number.isInteger(i.book?.currentPage) ? i.book.currentPage : 0, text: i.book.notes.trim().slice(0, 2000), createdAt: new Date().toISOString() }]
        : []
  },
  game: { progress: typeof i.game?.progress === 'string' ? i.game.progress.slice(0, 300) : '' },
  media: { progress: typeof i.media?.progress === 'string' ? i.media.progress.slice(0, 300) : '' },
  nextStep: typeof i.nextStep === 'string' ? i.nextStep.slice(0,240) : '',
  lastInteraction: typeof i.lastInteraction === 'string' ? i.lastInteraction : null,
  lastStop: typeof i.lastStop === 'string' ? i.lastStop.slice(0,300) : '',
  preferredEnergy: ['low','normal','high'].includes(i.preferredEnergy) ? i.preferredEnergy : null,
  estimatedMinutes: Number.isFinite(Number(i.estimatedMinutes)) ? Math.max(1,Math.min(180,Number(i.estimatedMinutes))) : null
}));
let energy = storage.get('energy','normal');
if (!['low','normal','high'].includes(energy)) energy = 'normal';
let filter = 'all';
let suggestionIndex = 0;
let currentSuggestion;
const states = { start:'Quero começar', in_progress:'Em andamento', paused:'Pausado', someday:'Algum dia' };
const categories = { general:'Geral', reading:'Leitura', game:'Jogo', series:'Filme/série' };
const save = () => { storage.set('ideas',ideas); window.dispatchEvent(new Event('foco:ideas-changed')); };

function switchView(view, updateHash = true) {
  if (!['home','ideas','reading','day','chat'].includes(view)) view = 'home';
  $$('.view').forEach(v => v.classList.toggle('active',v.id === view+'View'));
  $$('.nav-item').forEach(n => {
    n.classList.toggle('active',n.dataset.view === view);
    if(n.dataset.view === view) n.setAttribute('aria-current','page'); else n.removeAttribute('aria-current');
  });
  if (view !== 'reading' && 'speechSynthesis' in window) speechSynthesis.cancel();
  if (updateHash) {
    history.pushState(null,'','#'+view);
    const heading = $('#'+view+'View h1');
    heading.tabIndex = -1;
    heading.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:motion()});
  }
}
$$('.nav-item').forEach(btn => btn.addEventListener('click',()=>switchView(btn.dataset.view)));
$$('[data-view-target]').forEach(btn => btn.addEventListener('click',()=>switchView(btn.dataset.viewTarget)));
window.addEventListener('hashchange',()=>switchView(location.hash.slice(1),false));

let theme = storage.get('theme',matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function applyTheme() {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark':'light';
  $$('.theme-toggle').forEach(btn=> { btn.textContent = theme === 'dark' ? 'Modo claro' : 'Modo escuro'; btn.setAttribute('aria-pressed',String(theme === 'dark')); });
}
$$('.theme-toggle').forEach(btn=>btn.addEventListener('click',()=> { theme = theme === 'dark' ? 'light':'dark'; storage.set('theme',theme); applyTheme(); }));
applyTheme();

function renderEnergy() {
  $$('.energy').forEach(btn=> { btn.classList.toggle('selected',btn.dataset.energy === energy); btn.setAttribute('aria-pressed',String(btn.dataset.energy === energy)); });
}
$$('.energy').forEach(btn=>btn.addEventListener('click',()=> {
  energy = btn.dataset.energy; storage.set('energy',energy); suggestionIndex=0; renderEnergy();
  renderSuggestion();
  $('#suggestionPanel').scrollIntoView({behavior:motion(),block:'nearest'});
}));
function typeLabel(type) { return type === 'project' ? 'PROJETO' : type === 'obligation' ? 'PRECISO FAZER':'QUERO FAZER'; }
function itemSessionHistory(item) {
  const sessions=storage.get('executive_memory',{sessions:[]})?.sessions;
  return Array.isArray(sessions) ? sessions.filter(session=>session?.itemId===item.id).slice(0,8) : [];
}
function renderSessionHistory(item) {
  const sessions=itemSessionHistory(item);
  if (!sessions.length) return '';
  return `<details class="item-history"><summary>Ver últimos começos</summary><div class="session-history">${sessions.map(session=>{
    const date=Number.isFinite(Date.parse(session.endedAt || session.startedAt)) ? new Date(session.endedAt || session.startedAt).toLocaleString('pt-BR',{dateStyle:'medium',timeStyle:'short'}) : 'Data não disponível';
    const duration=Number.isFinite(session.plannedMinutes) ? `${session.plannedMinutes} min` : 'Duração não registrada';
    const result=session.status==='completed' ? 'Bloco concluído' : session.status==='stopped' ? 'Sessão encerrada' : 'Sessão registrada';
    return `<article class="session-entry"><p class="session-meta">${escapeHtml(date)} · ${duration} · ${result}</p><p>${escapeHtml(session.action || session.title || item.text)}</p>${session.lastStop ? `<p class="muted">Parou em: ${escapeHtml(session.lastStop)}</p>`:''}${session.nextStep ? `<p class="muted">Próximo passo: ${escapeHtml(session.nextStep)}</p>`:''}</article>`;
  }).join('')}</div></details>`;
}
function categoryFields(item) {
  if (item.category === 'reading') {
    const pages = item.book.totalPages ? `Página ${item.book.currentPage} de ${item.book.totalPages}` : item.book.currentPage ? `Você parou na página ${item.book.currentPage}` : 'Você ainda não registrou uma página';
    const notes = item.book.notes.length === 1 ? '1 anotação' : `${item.book.notes.length} anotações`;
    return `<div class="item-context reading-context"><p class="card-label">LEITURA</p><p class="muted small">${pages} · ${notes}</p><div class="button-row"><button class="secondary-btn" data-log-reading="${escapeHtml(item.id)}">Registrar leitura</button><button class="text-btn" data-view-reading-notes="${escapeHtml(item.id)}">Ver anotações</button></div></div>`;
  }
  if (item.category === 'game') return `<div class="item-context"><p class="card-label">JOGO</p><label>Onde você parou? <input data-game-progress="${escapeHtml(item.id)}" maxlength="300" value="${escapeHtml(item.game.progress)}" placeholder="Ex.: capítulo 3, depois do castelo" /></label></div>`;
  if (item.category === 'series') return `<div class="item-context"><p class="card-label">FILME/SÉRIE</p><label>Onde você parou? <input data-media-progress="${escapeHtml(item.id)}" maxlength="300" value="${escapeHtml(item.media.progress)}" placeholder="Ex.: EP 101" /></label></div>`;
  return '';
}
function renderIdeas() {
  const visible = ideas.filter(i=>filter === 'all' || i.type === filter);
  $('#ideasGrid').innerHTML = visible.map(i=>`<article class="idea-card">
    <button class="delete" data-delete="${escapeHtml(i.id)}" aria-label="Remover ${escapeHtml(i.text)}">×</button>
    <div class="idea-type">${typeLabel(i.type)} · ${categories[i.category]}</div><h3>${escapeHtml(i.text)}</h3>
    <p>${i.lastStop ? `Você parou em: ${escapeHtml(i.lastStop)}` : i.lastInteraction && Number.isFinite(Date.parse(i.lastInteraction)) ? 'Último começo: '+new Date(i.lastInteraction).toLocaleDateString('pt-BR') : 'Um interesse seu. Sem pressa.'}</p>
    ${i.estimatedMinutes || i.preferredEnergy ? `<p class="memory-meta">${i.estimatedMinutes ? `Bloco habitual: ${i.estimatedMinutes} min` : ''}${i.estimatedMinutes && i.preferredEnergy ? ' · ' : ''}${i.preferredEnergy ? `Energia ${i.preferredEnergy==='low'?'baixa':i.preferredEnergy==='high'?'alta':'média'}` : ''}</p>`:''}
    <div class="idea-controls"><label>Estado<select data-state="${escapeHtml(i.id)}">${Object.entries(states).map(([v,l])=>`<option value="${v}" ${v === i.state ? 'selected':''}>${l}</option>`).join('')}</select></label>
    <label>Combina mais com<select data-effort="${escapeHtml(i.id)}"><option value="light" ${i.effort === 'light' ? 'selected':''}>Energia baixa · algo leve</option><option value="regular" ${i.effort === 'regular' ? 'selected':''}>Energia média</option><option value="deep" ${i.effort === 'deep' ? 'selected':''}>Energia alta · mais fôlego</option></select></label>
    <label>Tipo de coisa<select data-category="${escapeHtml(i.id)}">${Object.entries(categories).map(([v,l])=>`<option value="${v}" ${v === i.category ? 'selected':''}>${l}</option>`).join('')}</select></label>
    <label>Próximo pequeno passo (opcional)<input data-step="${escapeHtml(i.id)}" maxlength="240" value="${escapeHtml(i.nextStep)}" placeholder="Ex.: separar o material" /></label></div>
    ${categoryFields(i)}
    <button class="primary-btn start-idea" data-start-focus="${escapeHtml(i.id)}">Começar por um tempo</button>
    ${renderSessionHistory(i)}
    </article>`).join('') || '<p class="muted">Sua cabeça está cheia de alguma coisa? Coloca aqui. Não precisa organizar ainda.</p>';
  $$('[data-delete]').forEach(btn=>btn.addEventListener('click',()=> {
    const item=ideas.find(i=>i.id===btn.dataset.delete);
    if(!confirm(`Remover “${item.text}”?`)) return;
    ideas=ideas.filter(i=>i.id!==item.id); save(); renderIdeas(); renderPreview(); invalidateSuggestion(); showToast('Removido.');
  }));
$$('[data-state]').forEach(select=>select.addEventListener('change',()=> { ideas.find(i=>i.id===select.dataset.state).state=select.value; save(); invalidateSuggestion(); }));
  $$('[data-effort]').forEach(select=>select.addEventListener('change',()=> { ideas.find(i=>i.id===select.dataset.effort).effort=select.value; save(); invalidateSuggestion(); }));
  $$('[data-category]').forEach(select=>select.addEventListener('change',()=> { ideas.find(i=>i.id===select.dataset.category).category=select.value; save(); renderIdeas(); invalidateSuggestion(); }));
  $$('[data-step]').forEach(input=>input.addEventListener('change',()=> { ideas.find(i=>i.id===input.dataset.step).nextStep=input.value.trim(); save(); invalidateSuggestion(); }));
  $$('[data-start-focus]').forEach(button=>button.addEventListener('click',()=> window.dispatchEvent(new CustomEvent('foco:start-focus',{detail:{id:button.dataset.startFocus}}))));
  $$('[data-log-reading]').forEach(button=>button.addEventListener('click',()=> openReadingLog(button.dataset.logReading)));
  $$('[data-view-reading-notes]').forEach(button=>button.addEventListener('click',()=> openReadingNotes(button.dataset.viewReadingNotes)));
  $$('[data-game-progress]').forEach(input=>input.addEventListener('change',()=> { ideas.find(i=>i.id===input.dataset.gameProgress).game.progress=input.value.trim(); save(); }));
  $$('[data-media-progress]').forEach(input=>input.addEventListener('change',()=> { ideas.find(i=>i.id===input.dataset.mediaProgress).media.progress=input.value.trim(); save(); }));
}
function openReadingLog(id) {
  const item = ideas.find(idea => idea.id === id);
  if (!item) return;
  $('#readingLogBookId').value = item.id;
  $('#readingLogTitle').textContent = `Registrar leitura: ${item.text}`;
  $('#readingLogPage').value = item.book.currentPage || '';
  $('#readingLogTotal').value = item.book.totalPages || '';
  $('#readingLogNote').value = '';
  $('#readingLogExcerpt').value = '';
  $('#readingLogDialog').showModal();
  $('#readingLogPage').focus();
}
function openReadingNotes(id) {
  const item = ideas.find(idea => idea.id === id);
  if (!item) return;
  $('#readingNotesTitle').textContent = `Anotações: ${item.text}`;
  $('#readingNotesList').innerHTML = item.book.notes.length
    ? item.book.notes.map(note => `<article class="reading-note"><p class="note-meta">Página ${note.page || 'não informada'} · ${new Date(note.createdAt).toLocaleDateString('pt-BR')}</p>${note.text ? `<p>${escapeHtml(note.text)}</p>` : ''}${note.excerpt ? `<p class="note-excerpt">Trecho salvo: ${escapeHtml(note.excerpt)}</p>` : ''}</article>`).join('')
    : '<p class="muted">Ainda não há anotações. Quando quiser, registre uma leitura pequena.</p>';
  $('#readingNotesDialog').showModal();
}
$('#readingLogForm').addEventListener('submit', event => {
  event.preventDefault();
  const item = ideas.find(idea => idea.id === $('#readingLogBookId').value);
  if (!item) return;
  const page = Number.parseInt($('#readingLogPage').value, 10);
  const total = Number.parseInt($('#readingLogTotal').value, 10);
  item.book.totalPages = Number.isInteger(total) && total > 0 ? total : null;
  item.book.currentPage = Math.max(0, Math.min(item.book.totalPages || 99999, Number.isInteger(page) ? page : item.book.currentPage));
  const note = $('#readingLogNote').value.trim();
  const excerpt = $('#readingLogExcerpt').value.trim();
  if (note || excerpt) item.book.notes.unshift({ id: crypto.randomUUID(), page: item.book.currentPage, text: note.slice(0, 2000), excerpt: excerpt.slice(0, 4000), createdAt: new Date().toISOString() });
  item.state = 'in_progress'; item.lastInteraction = new Date().toISOString();
  save(); renderIdeas(); renderPreview(); invalidateSuggestion();
  $('#readingLogDialog').close();
  showToast(note || excerpt ? 'Leitura e anotação guardadas.' : 'Página de leitura guardada.');
});
$$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => $(button.dataset.closeDialog).close()));
window.addEventListener('foco:open-reading-log', event => openReadingLog(event.detail));
window.addEventListener('foco:open-reading-notes', event => openReadingNotes(event.detail));
function renderPreview() {
  const resumable=ideas.filter(item=>['in_progress','paused','active'].includes(item.state)).sort((a,b)=>Date.parse(b.lastInteraction || 0)-Date.parse(a.lastInteraction || 0))[0];
  const resume=resumable ? `<div class="resume-nudge"><div><p class="card-label">VOCÊ PODE RETOMAR</p><strong>${escapeHtml(resumable.text)}</strong><p class="muted small">${escapeHtml(resumable.lastStop || resumable.nextStep || 'Escolha um tempo e continue de onde fizer sentido.')}</p></div><button class="secondary-btn" data-home-resume="${escapeHtml(resumable.id)}">Escolher tempo</button></div>` : '';
  const chips=ideas.slice(0,4).map(i=>`<span class="idea-chip">${escapeHtml(i.text)}</span>`).join('');
  $('#ideaPreview').innerHTML = `${resume}${chips ? `<div class="idea-chips">${chips}</div>`:''}` || '<p class="muted small">Guarde uma ideia em “Minhas coisas”. Ela pode virar um começo pequeno.</p>';
  $$('[data-home-resume]').forEach(button=>button.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('foco:start-focus',{detail:{id:button.dataset.homeResume}}))));
}
$('#addIdea').addEventListener('click',()=> {
  const input=$('#ideaInput'); const text=input.value.trim();
  if(!text) { input.focus(); return showToast('Escreva alguma coisa primeiro.'); }
  ideas.unshift({id:crypto.randomUUID(),text:text.slice(0,160),type:$('#ideaType').value,state:'start',effort:'regular',category:'general',book:{totalPages:null,currentPage:0,notes:[]},game:{progress:''},nextStep:'',lastInteraction:null});
  input.value=''; save(); renderIdeas(); renderPreview(); invalidateSuggestion(); input.focus(); showToast('Guardado. Sem cobrança.');
});
$('#ideaInput').addEventListener('keydown',e=> {if(e.key==='Enter') $('#addIdea').click();});
$('#exportBackup').addEventListener('click', () => {
  try {
    const backup = storage.createBackup();
    const file = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `foco-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#backupStatus').textContent = 'Backup baixado para este aparelho.';
  } catch {
    $('#backupStatus').textContent = 'Não consegui criar o backup agora. Tente novamente.';
  }
});
$('#chooseBackup').addEventListener('click', () => $('#backupFile').click());
$('#backupFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error('O arquivo é grande demais para importar.');
    const backup = JSON.parse(await file.text());
    if (!confirm('Importar este backup vai substituir os dados do Foco salvos neste navegador. Se quiser guardá-los, baixe um backup antes. Continuar?')) return;
    storage.restoreBackup(backup);
    $('#backupStatus').textContent = 'Backup importado. Atualizando o Foco…';
    showToast('Seus dados foram restaurados.');
    setTimeout(() => window.location.reload(), 500);
  } catch (error) {
    $('#backupStatus').textContent = error instanceof SyntaxError
      ? 'Não consegui ler esse arquivo. Escolha um backup JSON do Foco.'
      : error.message || 'Não consegui importar o backup. Os dados atuais foram mantidos.';
  } finally {
    event.target.value = '';
  }
});
const quickCaptureDialog = $('#quickCaptureDialog');
function closeQuickCapture() {
  if (quickCaptureDialog.open) quickCaptureDialog.close();
  $('#quickCaptureButton').focus();
}
$('#quickCaptureButton').addEventListener('click', () => {
  quickCaptureDialog.showModal();
  $('#quickThingName').focus();
});
$('#closeQuickCapture').addEventListener('click', closeQuickCapture);
$('#cancelQuickCapture').addEventListener('click', closeQuickCapture);
$('#quickCaptureForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#quickThingName').value.trim();
  if (!name) return $('#quickThingName').focus();
  window.dispatchEvent(new CustomEvent('foco:add-thing', {
    detail: { name, type: $('#quickThingType').value, category: 'general', state: 'start' }
  }));
  $('#quickCaptureForm').reset();
  quickCaptureDialog.close();
  $('#quickCaptureButton').focus();
});
window.addEventListener('foco:add-thing', event => {
  const proposed = event.detail;
  const text = typeof proposed?.name === 'string' ? proposed.name.trim().slice(0, 160) : '';
  const type = ['interest', 'project', 'obligation'].includes(proposed?.type) ? proposed.type : 'interest';
  const category = ['general', 'reading', 'game', 'series'].includes(proposed?.category) ? proposed.category : 'general';
  const state = proposed?.state === 'in_progress' ? 'in_progress' : 'start';
  const progress = typeof proposed?.progress === 'string' ? proposed.progress.trim().slice(0,300) : '';
  const nextStep = typeof proposed?.nextStep === 'string' ? proposed.nextStep.trim().slice(0,240) : '';
  const currentPage = category === 'reading' ? Number(progress.match(/(?:p[aá]gina|pag\.?|p\.)\s*(\d+)/i)?.[1]) || 0 : 0;
  if (!text) return;
  if (ideas.some(item => item.text.trim().toLocaleLowerCase('pt-BR') === text.toLocaleLowerCase('pt-BR'))) {
    showToast('Isso já está em Minhas coisas.');
    return;
  }
  ideas.unshift({ id: crypto.randomUUID(), text, type, state, effort: category === 'reading' ? 'light' : 'regular', category, book:{totalPages:null,currentPage,notes:[]}, game:{progress: category === 'game' ? progress : ''}, media:{progress: category === 'series' ? progress : ''}, nextStep, lastInteraction: null });
  save(); renderIdeas(); renderPreview(); invalidateSuggestion();
  showToast('Guardado em Minhas coisas.');
});
window.addEventListener('foco:patch-thing', event => {
  const { id, patch } = event.detail || {};
  const item = ideas.find(idea => idea.id === id);
  if (!item || !patch || typeof patch !== 'object') return;
  Object.assign(item, patch); save(); renderIdeas(); renderPreview(); invalidateSuggestion();
});
$$('.filter').forEach(btn=>btn.addEventListener('click',()=> {
  filter=btn.dataset.filter;
  $$('.filter').forEach(x=> {x.classList.toggle('active',x===btn); x.setAttribute('aria-pressed',String(x===btn));}); renderIdeas();
}));
function invalidateSuggestion() { if(!$('#suggestionPanel').classList.contains('hidden')) renderSuggestion(); }
function makeSuggestion() {
  const sessionHistory = storage.get('executive_memory',{sessions:[]})?.sessions || [];
  const available = deferRecentlyNotFit(ideas.filter(i=>['in_progress','active','start'].includes(i.state)),sessionHistory);
  const minutes = {low:2,normal:5,high:10}[energy];
  const preferredEfforts = { low:['light','regular','deep'], normal:['regular','light','deep'], high:['deep','regular','light'] }[energy];
  if(available.length) {
    const ordered = preferredEfforts.flatMap(effort => available.filter(item => item.effort === effort));
    const item=ordered[suggestionIndex % ordered.length];
    const previousFeedback=latestItemFeedback(sessionHistory,item.id);
    const needsSmallerStart = energy === 'low' && item.effort !== 'light';
    const defaultTask = item.category === 'reading'
      ? `Abra ${item.text} na página ${Math.max(1, item.book.currentPage + 1)} e leia um parágrafo.`
      : item.category === 'game' && item.game.progress
        ? `Abra ${item.text} e continue de onde parou: ${item.game.progress}.`
        : energy === 'high' ? `Comece uma sessão curta de ${item.text}.` : `Separe o que você precisa para começar: ${item.text}.`;
    const task = previousFeedback?.feedbackReason === 'too_big'
      ? localAction(item,energy,minutes,previousFeedback).action
      : needsSmallerStart
      ? `Só deixe ${item.text} pronto para depois.`
      : item.nextStep || defaultTask;
    const reason = previousFeedback?.feedbackReason === 'too_big'
      ? 'Da última vez, esse começo pareceu grande. Deixei a primeira ação menor.'
      : needsSmallerStart
      ? 'Você marcou energia baixa. Não precisa fazer agora; só facilite o começo de depois.'
      : energy === 'low'
        ? 'Você marcou energia baixa. Escolhi algo que cabe num começo leve.'
        : energy === 'high'
          ? 'Você parece ter mais fôlego agora. Use só alguns minutos e pare se quiser.'
          : 'Um passo possível para o ritmo que você marcou agora.';
    return {id:item.id, task, reason, time:`~ ${minutes} min`};
  }
  const small = ['Abra um texto e leia apenas um parágrafo.','Anote uma coisa que está ocupando sua cabeça.','Separe um objeto que você quer usar em um projeto.'];
  return {task:small[suggestionIndex % small.length],reason:'Só esse começo já é suficiente por agora.',time:'~ 2 min'};
}
function renderSuggestion() {
  currentSuggestion=makeSuggestion();
  $('#suggestionTitle').textContent = { low:'Vamos manter leve.', normal:'Vamos começar pequeno.', high:'Aproveite o embalo, sem exagerar.' }[energy];
  $('#suggestionIcon').textContent='→';
  $('#suggestionTask').textContent=currentSuggestion.task;
  $('#suggestionReason').textContent=currentSuggestion.reason;
  $('#suggestionTime').textContent=currentSuggestion.time;
  $('#suggestionPanel').classList.remove('hidden');
  $('#startSuggestion').disabled=false;
  $('#startSuggestion').textContent='Começar →';
}
const legacyHelp = $('#helpMe');
if (legacyHelp) legacyHelp.addEventListener('click',()=> {renderSuggestion(); $('#suggestionPanel').scrollIntoView({behavior:motion(),block:'nearest'});});
$('#skipSuggestion').addEventListener('click',()=> { suggestionIndex++; renderSuggestion(); });
$('#closeSuggestion').addEventListener('click',()=> {$('#suggestionPanel').classList.add('hidden'); (legacyHelp || $('#stuckButton')).focus();});
$('#stuckSuggestion').addEventListener('click',()=> {
  $('#suggestionTask').textContent='Por agora, só deixe o material ao seu alcance.';
  $('#suggestionReason').textContent='Não precisa fazer a atividade ainda. Só preparar o começo.';
  $('#suggestionTime').textContent='~ 1 min';
  $('#startSuggestion').disabled=false; $('#startSuggestion').textContent='Vou tentar →';
});
$('#startSuggestion').addEventListener('click',()=> {
  const item=ideas.find(i=>i.id===currentSuggestion?.id);
  if(item) { item.lastInteraction=new Date().toISOString(); item.state='in_progress'; save(); renderIdeas(); }
  showToast('Você deu um começo. Pode seguir no seu ritmo.');
  $('#startSuggestion').textContent='Começo registrado ✓'; $('#startSuggestion').disabled=true;
});
renderIdeas(); renderPreview(); renderEnergy(); initReading(); initAI(); initExecutive(); switchView(location.hash.slice(1),false);
