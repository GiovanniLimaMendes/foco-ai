import { storage } from './storage.js';
import { $, showToast, requestAI, busy, escapeHtml } from './ui.js';

export function initReading() {
  let selectedBookId = storage.get('selected_reading_book', '');
  let timer = null;
  let phase = 'focus';
  let revision = 0;
  let remainingSeconds = 0;
  let timerEndsAt = 0;
  let paused = false;

  const books = () => {
    const items = storage.get('ideas', []);
    return Array.isArray(items) ? items.filter(item => item?.category === 'reading' && typeof item.text === 'string') : [];
  };
  const book = () => books().find(item => item.id === selectedBookId);
  const excerpt = () => book()?.book?.notes?.find(note => typeof note.excerpt === 'string' && note.excerpt.trim())?.excerpt?.trim() || '';

  function stopVoice() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    $('#listenBtn').textContent = 'Ouvir trecho';
  }

  function renderResume(item) {
    if (!item) {
      $('#readingResume').innerHTML = '<p class="muted small">Escolha um livro em Minhas coisas para registrar sua leitura.</p>';
      return;
    }
    const page = Number.isInteger(item.book?.currentPage) ? item.book.currentPage : 0;
    const total = Number.isInteger(item.book?.totalPages) ? item.book.totalPages : 0;
    $('#readingResume').innerHTML = `<h3>${escapeHtml(item.text)}</h3><p class="muted small">${total ? `Página ${page} de ${total}` : page ? `Você parou na página ${page}` : 'Registre onde você parou.'}</p><div class="mini-progress"><div style="width:${total ? Math.min(100, Math.round(page / total * 100)) : 0}%"></div></div>`;
  }

  function renderPomodoro() {
    const hasText = Boolean(excerpt());
    const running = Boolean(timer);
    const sessionActive = running || paused;
    const start = $('#readingSession');
    const pause = $('#pauseReadingSession');
    const stop = $('#stopReadingSession');
    const duration = $('#readingDuration');

    start.textContent = phase === 'break' ? 'Iniciar pausa de 5 min' : paused ? 'Sessão pausada' : 'Iniciar Pomodoro';
    start.disabled = !hasText || sessionActive;
    pause.classList.toggle('hidden', !sessionActive);
    pause.disabled = !sessionActive;
    pause.textContent = paused ? 'Retomar' : 'Pausar';
    stop.classList.toggle('hidden', !sessionActive);
    stop.disabled = !sessionActive;
    duration.disabled = sessionActive || phase === 'break';
  }

  function formatTime(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function finishPhase() {
    timer = null;
    remainingSeconds = 0;
    paused = false;
    if (phase === 'focus') {
      window.dispatchEvent(new CustomEvent('foco:reading-session-complete', { detail: { id: crypto.randomUUID() } }));
      phase = 'break';
      $('#sessionStatus').textContent = 'Pomodoro concluído. Se quiser, faça uma pausa de 5 minutos.';
    } else {
      phase = 'focus';
      $('#sessionStatus').textContent = 'Pausa concluída. Você pode começar outro Pomodoro quando quiser.';
    }
    renderPomodoro();
    showToast($('#sessionStatus').textContent);
  }

  function startClock(seconds) {
    remainingSeconds = seconds;
    timerEndsAt = Date.now() + seconds * 1000;
    paused = false;
    const tick = () => {
      remainingSeconds = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
      $('#sessionStatus').textContent = `${phase === 'focus' ? 'Foco no livro' : 'Pausa curta'} · ${formatTime(remainingSeconds)}`;
      if (!remainingSeconds) {
        clearInterval(timer);
        finishPhase();
      }
    };
    tick();
    if (remainingSeconds) timer = setInterval(tick, 250);
    renderPomodoro();
  }

  function stopClock(message = 'Sessão encerrada. Tudo bem parar por aqui.') {
    if (timer) clearInterval(timer);
    timer = null;
    paused = false;
    remainingSeconds = 0;
    phase = 'focus';
    $('#sessionStatus').textContent = message;
    renderPomodoro();
  }

  function renderBook() {
    revision++;
    stopVoice();
    const item = book();
    const text = excerpt();
    $('#bookTitle').textContent = item ? item.text : 'Escolha um livro acima';
    $('#readerText').textContent = text || (item ? 'No registro de leitura, cole um trecho para ouvi-lo ou pedir uma explicação.' : 'Escolha um livro e registre uma leitura com um trecho.');
    $('#listenBtn').disabled = !text;
    $('#explainBtn').disabled = !text;
    $('#explainBox').classList.add('hidden');
    $('#readingError').textContent = '';
    renderResume(item);
    renderPomodoro();
  }

  function renderLibrary() {
    const list = books();
    if (!list.length) {
      $('#readingLibraryContent').innerHTML = '<p class="muted small">Quando um livro estiver em Minhas coisas, ele aparecerá aqui.</p>';
      selectedBookId = '';
      renderBook();
      return;
    }
    if (!list.some(item => item.id === selectedBookId)) selectedBookId = list[0].id;
    const item = book();
    const page = item.book?.currentPage || 0;
    const total = item.book?.totalPages;
    const notes = Array.isArray(item.book?.notes) ? item.book.notes.length : 0;
    $('#readingLibraryContent').innerHTML = `<div class="stack"><label for="readingLibrarySelect">Livro selecionado</label><select id="readingLibrarySelect">${list.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedBookId ? 'selected' : ''}>${escapeHtml(item.text)}</option>`).join('')}</select><p class="muted small">${total ? `Página ${page} de ${total}` : page ? `Você parou na página ${page}` : 'Página ainda não registrada'} · ${notes === 1 ? '1 anotação' : `${notes} anotações`}</p><div class="button-row"><button class="secondary-btn" id="registerSelectedReading">Registrar leitura</button><button class="text-btn" id="viewSelectedNotes">Ver anotações</button></div></div>`;
    $('#readingLibrarySelect').addEventListener('change', event => {
      if (timer || paused) stopClock('Sessão encerrada ao trocar de livro. Você pode retomá-la quando quiser.');
      selectedBookId = event.target.value;
      storage.set('selected_reading_book', selectedBookId);
      renderLibrary();
    });
    $('#registerSelectedReading').addEventListener('click', () => window.dispatchEvent(new CustomEvent('foco:open-reading-log', { detail: selectedBookId })));
    $('#viewSelectedNotes').addEventListener('click', () => window.dispatchEvent(new CustomEvent('foco:open-reading-notes', { detail: selectedBookId })));
    renderBook();
  }

  $('#listenBtn').addEventListener('click', () => {
    const text = excerpt();
    if (!text || !('speechSynthesis' in window)) return showToast('Registre um trecho primeiro.');
    if (speechSynthesis.speaking) return stopVoice();
    const voice = new SpeechSynthesisUtterance(text);
    voice.lang = 'pt-BR';
    voice.rate = .92;
    voice.onend = () => $('#listenBtn').textContent = 'Ouvir trecho';
    speechSynthesis.speak(voice);
    $('#listenBtn').textContent = 'Parar voz';
  });

  $('#explainBtn').addEventListener('click', () => busy($('#explainBtn'), 'Explicando…', async () => {
    const text = excerpt();
    const currentRevision = revision;
    try {
      const result = await requestAI('explain', { text });
      if (currentRevision !== revision) return;
      $('#explainBox p').textContent = result.explanation;
      $('#explainBox').classList.remove('hidden');
    } catch (error) {
      $('#readingError').textContent = error.message;
    }
  }));

  $('#readingSession').addEventListener('click', () => {
    if (phase === 'break') startClock(5 * 60);
    else startClock(Number($('#readingDuration').value) * 60);
  });
  $('#pauseReadingSession').addEventListener('click', () => {
    if (paused) return startClock(remainingSeconds);
    if (!timer) return;
    remainingSeconds = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
    clearInterval(timer);
    timer = null;
    paused = true;
    $('#sessionStatus').textContent = `Sessão pausada · ${formatTime(remainingSeconds)} restantes`;
    renderPomodoro();
  });
  $('#stopReadingSession').addEventListener('click', () => stopClock());
  $('#readingDuration').addEventListener('change', renderPomodoro);

  window.addEventListener('foco:ideas-changed', renderLibrary);
  window.addEventListener('pagehide', stopVoice);
  renderLibrary();
}
