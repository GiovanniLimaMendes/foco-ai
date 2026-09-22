import { storage } from './storage.js';
import { $, $$, busy, escapeHtml, requestAI, showToast } from './ui.js';

function safeAnalysis(value) {
  if (!value || typeof value !== 'object') return null;
  const fields = ['summary', 'observation', 'next_step', 'note'];
  if (!fields.every(field => typeof value[field] === 'string') || !Array.isArray(value.activities)) return null;
  return { ...value, activities: value.activities.filter(item => typeof item === 'string') };
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Agora';
}

function renderAnalysis(analysis) {
  const list = analysis.activities.length ? `<ul>${analysis.activities.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p>Você não precisa provar que fez algo para poder registrar o dia.</p>';
  $('#dayAnalysis').innerHTML = `<h3>Resumo</h3><p>${escapeHtml(analysis.summary)}</p><h3>O que aconteceu</h3>${list}<h3>Algo que percebi</h3><p>${escapeHtml(analysis.observation)}</p><h3>Próximo pequeno passo</h3><p>${escapeHtml(analysis.next_step)}</p><h3>Observação</h3><p>${escapeHtml(analysis.note)}</p>`;
  $('#dayAnalysis').classList.remove('hidden');
}

function initDay() {
  let entries = storage.get('day_entries', []);
  if (!Array.isArray(entries)) entries = [];
  const draft = storage.get('day_draft', '');
  $('#dayText').value = typeof draft === 'string' ? draft : '';
  let saveTimer;
  const saveDraft = () => {
    storage.set('day_draft', $('#dayText').value);
    $('#draftStatus').textContent = 'Rascunho salvo neste navegador.';
  };
  $('#dayText').addEventListener('input', () => { clearTimeout(saveTimer); $('#draftStatus').textContent = 'Salvando rascunho…'; saveTimer = setTimeout(saveDraft, 350); });
  function persist(entry) { entries.unshift(entry); entries = entries.slice(0, 100); storage.set('day_entries', entries); storage.remove('day_draft'); renderHistory(); window.dispatchEvent(new CustomEvent('foco:reflection-saved',{detail:{id:entry.id}})); }
  function renderHistory() {
    $('#dayHistory').innerHTML = entries.map(entry => `<details><summary>${dateLabel(entry.createdAt)} — ${escapeHtml(entry.text.slice(0, 90))}${entry.text.length > 90 ? '…' : ''}</summary><p class="entry-text">${escapeHtml(entry.text)}</p>${safeAnalysis(entry.analysis) ? `<div class="analysis"><h3>Resumo da análise</h3><p>${escapeHtml(entry.analysis.summary)}</p></div>` : ''}</details>`).join('') || '<p class="muted">Quando quiser, deixe aqui uma lembrança do seu dia.</p>';
  }
  function createEntry() { const text = $('#dayText').value.trim(); if (!text) { $('#dayText').focus(); throw new Error('Escreva um pouco sobre seu dia antes de guardar.'); } return { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }; }
  $('#saveDay').addEventListener('click', () => {
    $('#dayError').textContent = '';
    try { persist(createEntry()); $('#dayText').value = ''; $('#dayAnalysis').classList.add('hidden'); showToast('Guardado neste navegador.'); }
    catch (error) { $('#dayError').textContent = error.message; }
  });
  $('#analyzeDay').addEventListener('click', () => busy($('#analyzeDay'), 'Analisando…', async () => {
    $('#dayError').textContent = '';
    let entry;
    try { entry = createEntry(); } catch (error) { $('#dayError').textContent = error.message; return; }
    persist(entry);
    try {
      const result = await requestAI('analyze-day', { entry: entry.text });
      const analysis = safeAnalysis(result.analysis);
      if (!analysis) throw new Error('A IA respondeu em um formato inesperado. Seu relato continua salvo; tente novamente.');
      entry.analysis = analysis; storage.set('day_entries', entries); renderAnalysis(analysis); renderHistory(); $('#dayText').value = ''; showToast('Seu relato foi analisado e salvo.');
    } catch (error) { $('#dayError').textContent = error.message; }
  }));
  renderHistory();
}

function initChat() {
  let messages = storage.get('chat_history', []);
  let isThinking = false;
  if (!Array.isArray(messages)) messages = [];
  messages = messages.filter(message => message && ['user','assistant'].includes(message.role) && typeof message.content === 'string').slice(-30);
  function proposal(value) {
    if (!value || typeof value !== 'object' || typeof value.name !== 'string') return null;
    const name = value.name.trim().slice(0, 160);
    return name ? { name, type: ['interest', 'project', 'obligation'].includes(value.type) ? value.type : 'interest', category: ['general', 'reading', 'game', 'series'].includes(value.category) ? value.category : 'general', state: value.state === 'in_progress' ? 'in_progress' : 'start', progress: typeof value.progress === 'string' ? value.progress.slice(0,300) : '' } : null;
  }
  function render() {
    const conversation = messages.length ? messages.map((message, index) => {
      const pending = proposal(message.proposedThing);
      const card = pending && !message.proposalDismissed && !message.proposalSaved
        ? `<div class="thing-proposal"><p>Quer guardar <strong>${escapeHtml(pending.name)}</strong> em Minhas coisas?</p><div class="button-row"><button class="primary-btn" data-save-proposal="${index}">Guardar</button><button class="text-btn" data-dismiss-proposal="${index}">Agora não</button></div></div>`
        : message.proposalSaved ? '<p class="proposal-saved">Guardado em Minhas coisas.</p>' : '';
      return `<div class="message ${message.role}"><strong>${message.role === 'user' ? 'Você' : 'Foco'}</strong>${escapeHtml(message.content)}${card}</div>`;
    }).join('') : '<div class="message"><strong>Foco</strong>O que está mais difícil de começar agora?</div>';
    const thinking = isThinking ? '<div class="message thinking" role="status" aria-label="O Foco está pensando"><strong>Foco</strong><span>Pensando</span><span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></div>' : '';
    $('#chatMessages').innerHTML = conversation + thinking;
    $$('[data-save-proposal]').forEach(button => button.addEventListener('click', () => {
      const message = messages[Number(button.dataset.saveProposal)];
      const item = proposal(message?.proposedThing);
      if (!item) return;
      window.dispatchEvent(new CustomEvent('foco:add-thing', { detail: item }));
      message.proposalSaved = true; storage.set('chat_history', messages); render();
    }));
    $$('[data-dismiss-proposal]').forEach(button => button.addEventListener('click', () => {
      const message = messages[Number(button.dataset.dismissProposal)];
      if (!message) return;
      message.proposalDismissed = true; storage.set('chat_history', messages); render();
    }));
    $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
  }
  async function send(value) {
    const message = value.trim(); if (!message) return;
    $('#chatError').textContent = '';
    const includeContext=$('#chatContextToggle').checked;
    const previous=includeContext ? messages.filter(item=>['user','assistant'].includes(item.role)).slice(-4).map(({role,content})=>({role,content})) : [];
    const personalThings=includeContext ? storage.get('ideas',[]).filter(item=>item && ['active','in_progress','start','paused'].includes(item.state)).slice(0,8).map(item=>({text:item.text,type:item.type,state:item.state,category:item.category,effort:item.effort,preferredEnergy:item.preferredEnergy,estimatedMinutes:item.estimatedMinutes,nextStep:item.nextStep,lastStop:item.lastStop,progress:item.category==='game'?item.game?.progress:item.category==='series'?item.media?.progress:item.category==='reading' && item.book?.currentPage?`Página ${item.book.currentPage}`:''})) : [];
    const executive=includeContext ? storage.get('executive_memory',{}) : {};
    const context=includeContext ? {energy:storage.get('energy','normal'),things:personalThings,sessions:(Array.isArray(executive.sessions)?executive.sessions:[]).slice(0,4).map(session=>({activity:session.title,action:session.action,status:session.status,plannedMinutes:session.plannedMinutes,feedback:session.feedback,lastStop:session.lastStop,nextStep:session.nextStep}))} : undefined;
    let diary;
    if ($('#chatDiaryToggle').checked) {
      const latest=storage.get('day_entries',[])[0];
      if (!latest || typeof latest.text!=='string' || !latest.text.trim()) { $('#chatError').textContent='Não encontrei um relato guardado em Meu Dia para incluir.'; $('#chatDiaryToggle').checked=false; $('#chatDiaryPreview').classList.add('hidden'); return; }
      diary=latest.text.trim().slice(0,2000);
      $('#chatDiaryToggle').checked=false;
      $('#chatDiaryPreview').classList.add('hidden');
    }
    messages.push({role:'user',content:message}); storage.set('chat_history',messages); isThinking = true; render(); $('#chatText').value = '';
    await busy($('#sendChat'), 'Enviando…', async () => {
      try {
        const result = await requestAI('chat', { message, history: previous, context, diary });
        if (typeof result.reply !== 'string' || !result.reply.trim()) throw new Error('Não consegui mostrar a resposta da IA. Tente de novo.');
        messages.push({role:'assistant',content:result.reply.trim(),proposedThing:proposal(result.proposedThing)}); storage.set('chat_history',messages); render();
      } catch (error) { $('#chatError').textContent = error.message; }
      finally { isThinking = false; render(); }
    });
  }
  $('#chatForm').addEventListener('submit', event => { event.preventDefault(); send($('#chatText').value); });
  $('#chatDiaryToggle').addEventListener('change',()=> {
    const preview=$('#chatDiaryPreview');
    if (!$('#chatDiaryToggle').checked) { preview.classList.add('hidden'); return; }
    const latest=storage.get('day_entries',[])[0];
    if (!latest || typeof latest.text!=='string') { $('#chatError').textContent='Não encontrei um relato guardado em Meu Dia para incluir.'; $('#chatDiaryToggle').checked=false; preview.classList.add('hidden'); return; }
    $('#chatError').textContent=''; $('#chatDiaryText').textContent=latest.text.trim().slice(0,2000); preview.classList.remove('hidden'); preview.open=true;
  });
  $$('[data-starter]').forEach(button => button.addEventListener('click', () => send(button.dataset.starter)));
  $('#clearChat').addEventListener('click', () => { if (!messages.length || confirm('Limpar esta conversa deste navegador?')) { messages = []; storage.remove('chat_history'); render(); showToast('Conversa limpa.'); } });
  render();
}

export function initAI() { initDay(); initChat(); }
