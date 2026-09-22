import { storage } from './storage.js';
import { $, showToast, requestAI, busy, escapeHtml } from './ui.js';

export function initReading() {
  let selectedBookId = storage.get('selected_reading_book', '');
  let timer; let phase = 'focus'; let revision = 0;
  const books = () => { const items = storage.get('ideas', []); return Array.isArray(items) ? items.filter(item => item?.category === 'reading' && typeof item.text === 'string') : []; };
  const book = () => books().find(item => item.id === selectedBookId);
  const excerpt = () => book()?.book?.notes?.find(note => typeof note.excerpt === 'string' && note.excerpt.trim())?.excerpt?.trim() || '';
  function stopVoice() { if ('speechSynthesis' in window) speechSynthesis.cancel(); $('#listenBtn').textContent = 'Ouvir trecho'; }
  function renderResume(item) {
    if (!item) { $('#readingResume').innerHTML = '<p class="muted small">Escolha um livro em Minhas coisas para registrar sua leitura.</p>'; return; }
    const page = Number.isInteger(item.book?.currentPage) ? item.book.currentPage : 0; const total = Number.isInteger(item.book?.totalPages) ? item.book.totalPages : 0;
    $('#readingResume').innerHTML = `<h3>${escapeHtml(item.text)}</h3><p class="muted small">${total ? `Página ${page} de ${total}` : page ? `Você parou na página ${page}` : 'Registre onde você parou.'}</p><div class="mini-progress"><div style="width:${total ? Math.min(100, Math.round(page / total * 100)) : 0}%"></div></div>`;
  }
  function renderBook() {
    revision++; stopVoice(); const item = book(); const text = excerpt();
    $('#bookTitle').textContent = item ? item.text : 'Escolha um livro acima';
    $('#readerText').textContent = text || (item ? 'No registro de leitura, cole um trecho para ouvi-lo ou pedir uma explicação.' : 'Escolha um livro e registre uma leitura com um trecho.');
    for (const id of ['#readingSession','#listenBtn','#explainBtn']) $(id).disabled = !text;
    $('#explainBox').classList.add('hidden'); $('#readingError').textContent = ''; renderResume(item);
  }
  function renderLibrary() {
    const list = books();
    if (!list.length) { $('#readingLibraryContent').innerHTML = '<p class="muted small">Quando um livro estiver em Minhas coisas, ele aparecerá aqui.</p>'; selectedBookId = ''; renderBook(); return; }
    if (!list.some(item => item.id === selectedBookId)) selectedBookId = list[0].id;
    const item = book(); const page = item.book?.currentPage || 0; const total = item.book?.totalPages; const notes = Array.isArray(item.book?.notes) ? item.book.notes.length : 0;
    $('#readingLibraryContent').innerHTML = `<div class="stack"><label for="readingLibrarySelect">Livro selecionado</label><select id="readingLibrarySelect">${list.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedBookId ? 'selected' : ''}>${escapeHtml(item.text)}</option>`).join('')}</select><p class="muted small">${total ? `Página ${page} de ${total}` : page ? `Você parou na página ${page}` : 'Página ainda não registrada'} · ${notes === 1 ? '1 anotação' : `${notes} anotações`}</p><div class="button-row"><button class="secondary-btn" id="registerSelectedReading">Registrar leitura</button><button class="text-btn" id="viewSelectedNotes">Ver anotações</button></div></div>`;
    $('#readingLibrarySelect').addEventListener('change', event => { selectedBookId = event.target.value; storage.set('selected_reading_book', selectedBookId); renderLibrary(); });
    $('#registerSelectedReading').addEventListener('click', () => window.dispatchEvent(new CustomEvent('foco:open-reading-log', { detail:selectedBookId })));
    $('#viewSelectedNotes').addEventListener('click', () => window.dispatchEvent(new CustomEvent('foco:open-reading-notes', { detail:selectedBookId })));
    renderBook();
  }
  $('#listenBtn').addEventListener('click', () => { const text = excerpt(); if (!text || !('speechSynthesis' in window)) return showToast('Registre um trecho primeiro.'); if (speechSynthesis.speaking) return stopVoice(); const voice = new SpeechSynthesisUtterance(text); voice.lang = 'pt-BR'; voice.rate = .92; voice.onend = () => $('#listenBtn').textContent = 'Ouvir trecho'; speechSynthesis.speak(voice); $('#listenBtn').textContent = 'Parar voz'; });
  $('#explainBtn').addEventListener('click', () => busy($('#explainBtn'), 'Explicando…', async () => { const text = excerpt(); const currentRevision = revision; try { const result = await requestAI('explain', { text }); if (currentRevision !== revision) return; $('#explainBox p').textContent = result.explanation; $('#explainBox').classList.remove('hidden'); } catch (error) { $('#readingError').textContent = error.message; } }));
  $('#readingSession').addEventListener('click', () => {
    if (timer) { clearInterval(timer); timer = null; $('#readingSession').textContent = 'Iniciar Pomodoro'; $('#sessionStatus').textContent = 'Pomodoro interrompido. Tudo bem parar aqui.'; return; }
    const duration = phase === 'focus' ? 25 * 60 : 5 * 60; const end = Date.now() + duration * 1000;
    $('#readingSession').textContent = 'Encerrar Pomodoro';
    timer = setInterval(() => { const seconds = Math.max(0, Math.ceil((end - Date.now()) / 1000)); const label = `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`; $('#sessionStatus').textContent = phase === 'focus' ? `Foco no livro · ${label}` : `Pausa curta · ${label}`; if (!seconds) { clearInterval(timer); timer = null; phase = phase === 'focus' ? 'break' : 'focus'; $('#readingSession').textContent = phase === 'break' ? 'Iniciar pausa de 5 min' : 'Iniciar Pomodoro'; $('#sessionStatus').textContent = phase === 'break' ? 'Pomodoro concluído. Hora de uma pausa de 5 minutos.' : 'Pausa concluída. Você pode começar outro Pomodoro se quiser.'; showToast($('#sessionStatus').textContent); } }, 250);
  });
  window.addEventListener('foco:ideas-changed', renderLibrary); window.addEventListener('pagehide', stopVoice); renderLibrary();
}
