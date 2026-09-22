import { storage } from './storage.js';
import { $, showToast, requestAI, busy, escapeHtml } from './ui.js';

export function initReading() {
  const savedTimer = storage.get('reading_timer', null);
  let selectedBookId = typeof savedTimer?.bookId === 'string' ? savedTimer.bookId : storage.get('selected_reading_book', '');
  let timer = null;
  let phase = savedTimer?.phase === 'break' ? 'break' : 'focus';
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

  function announce(message) {
    $('#readingStatusAnnounce').textContent = message;
  }

  function persistTimer(status) {
    if (!selectedBookId) return storage.remove('reading_timer');
    const data = {
      version: 1,
      bookId: selectedBookId,
      phase,
      status,
      durationMinutes: Number($('#readingDuration').value),
      updatedAt: new Date().toISOString()
    };
    if (status === 'running') data.timerEndsAt = timerEndsAt;
    if (status === 'paused') data.remainingSeconds = remainingSeconds;
    storage.set('reading_timer', data);
  }

  function finishPhase() {
    timer = null;
    remainingSeconds = 0;
    paused = false;
    if (phase === 'focus') {
      window.dispatchEvent(new CustomEvent('foco:reading-session-complete', { detail: { id: crypto.randomUUID() } }));
      phase = 'break';
      $('#sessionStatus').textContent = 'Pomodoro concluído. Se quiser, faça uma pausa de 5 minutos.';
      announce('Pomodoro concluído. Se quiser, faça uma pausa de 5 minutos.');
      persistTimer('ready');
    } else {
      phase = 'focus';
      $('#sessionStatus').textContent = 'Pausa concluída. Você pode começar outro Pomodoro quando quiser.';
      announce('Pausa concluída. Você pode começar outro Pomodoro quando quiser.');
      storage.remove('reading_timer');
    }
    renderPomodoro();
    showToast($('#sessionStatus').textContent);
  }

  function startClock(seconds) {
    const wasPaused = paused;
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
    if (remainingSeconds) {
      timer = setInterval(tick, 1000);
      persistTimer('running');
      announce(wasPaused ? 'Sessão retomada.' : phase === 'focus' ? `Pomodoro de ${$('#readingDuration').value} minutos iniciado.` : 'Pausa de 5 minutos iniciada.');
    }
    renderPomodoro();
  }

  function pauseClock(message = '') {
    if (!timer) return;
    remainingSeconds = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
    clearInterval(timer);
    timer = null;
    if (!remainingSeconds) return finishPhase();
    paused = true;
    $('#sessionStatus').textContent = message || `Sessão pausada · ${formatTime(remainingSeconds)} restantes`;
    announce(message || 'Sessão pausada. Você pode retomar quando quiser.');
    persistTimer('paused');
    renderPomodoro();
  }

  function stopClock(message = 'Sessão encerrada. Tudo bem parar por aqui.') {
    if (timer) clearInterval(timer);
    timer = null;
    paused = false;
    remainingSeconds = 0;
    phase = 'focus';
    storage.remove('reading_timer');
    $('#sessionStatus').textContent = message;
    announce(message);
    renderPomodoro();
  }

  function restoreTimer() {
    const saved = storage.get('reading_timer', null);
    if (!saved || saved.version !== 1 || saved.bookId !== selectedBookId || !books().some(item => item.id === saved.bookId)) {
      if (saved) storage.remove('reading_timer');
      return;
    }
    phase = saved.phase === 'break' ? 'break' : 'focus';
    if (saved.status === 'ready' && phase === 'break') {
      if ([5, 10, 15, 25].includes(Number(saved.durationMinutes))) $('#readingDuration').value = String(saved.durationMinutes);
      $('#sessionStatus').textContent = 'Pomodoro concluído. Se quiser, faça uma pausa de 5 minutos.';
      announce('Pomodoro concluído. Se quiser, faça uma pausa de 5 minutos.');
      renderPomodoro();
      return;
    }
    if (saved.status === 'paused') {
      if ([5, 10, 15, 25].includes(Number(saved.durationMinutes))) $('#readingDuration').value = String(saved.durationMinutes);
      remainingSeconds = Math.max(0, Math.ceil(Number(saved.remainingSeconds) || 0));
      if (remainingSeconds) {
        paused = true;
        $('#sessionStatus').textContent = `Leitura pausada · ${formatTime(remainingSeconds)} restantes. Toque em Retomar quando quiser.`;
        announce('Sua leitura está pausada. Você pode retomar quando quiser.');
        renderPomodoro();
      } else {
        finishPhase();
      }
      return;
    }
    if (saved.status === 'running' && Number.isFinite(Number(saved.timerEndsAt))) {
      if ([5, 10, 15, 25].includes(Number(saved.durationMinutes))) $('#readingDuration').value = String(saved.durationMinutes);
      const remaining = Math.ceil((Number(saved.timerEndsAt) - Date.now()) / 1000);
      if (remaining > 0) {
        startClock(remaining);
      } else {
        finishPhase();
      }
      return;
    }
    storage.remove('reading_timer');
    phase = 'focus';
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
      if (timer || paused) stopClock('O livro não está mais na lista. A sessão foi encerrada.');
      else storage.remove('reading_timer');
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
      if (timer || paused || phase === 'break') stopClock('Sessão encerrada ao trocar de livro. Você pode retomá-la quando quiser.');
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
    pauseClock();
  });
  $('#stopReadingSession').addEventListener('click', () => stopClock());
  $('#readingDuration').addEventListener('change', renderPomodoro);

  window.addEventListener('foco:ideas-changed', renderLibrary);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pauseClock('Leitura pausada ao sair do app. Toque em Retomar quando voltar.');
  });
  window.addEventListener('pagehide', () => { pauseClock('Leitura pausada. Toque em Retomar quando voltar.'); stopVoice(); });
  renderLibrary();
  restoreTimer();
}
