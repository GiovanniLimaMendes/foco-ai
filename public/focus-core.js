export const XP = Object.freeze({ start:10, finish:15, resume:20, checkpoint:5, reading:10, reflection:10 });
export const ACHIEVEMENTS = Object.freeze([
  { id:'first-step', title:'Primeiro passo', description:'Você começou uma microação.' },
  { id:'came-back', title:'Voltei', description:'Você retomou uma atividade pausada.' },
  { id:'curious-reader', title:'Leitor curioso', description:'Você completou 10 sessões de leitura.' },
  { id:'one-step-at-a-time', title:'Um passo por vez', description:'Você iniciou 50 microações.' },
  { id:'found-my-rhythm', title:'Encontrei meu ritmo', description:'Você registrou feedback em 10 sessões.' }
]);

export function earnedAchievements(rewards, sessions, stats = {}) {
  const events=Array.isArray(rewards?.events) ? rewards.events : [];
  const starts=events.filter(event=>event.label==='start').length;
  const resumes=events.some(event=>event.label==='resume');
  const feedback=Array.isArray(sessions) ? sessions.filter(session=>session?.feedback).length : 0;
  const readers=Math.max(Number(stats.readingSessions)||0,Array.isArray(sessions) ? sessions.filter(session=>session?.category==='reading' && session.status==='completed').length : 0);
  return ACHIEVEMENTS.filter(item => item.id==='first-step' ? starts>=1
    : item.id==='came-back' ? resumes
    : item.id==='curious-reader' ? readers>=10
    : item.id==='one-step-at-a-time' ? starts>=50
    : item.id==='found-my-rhythm' ? feedback>=10 : false);
}

export function award(state, eventId, amount, label) {
  const current = state && typeof state === 'object' ? state : { total:0, events:[] };
  const events = Array.isArray(current.events) ? current.events : [];
  if (!eventId || events.some(event => event.id === eventId)) return { state:{ ...current, events }, awarded:0 };
  const event = { id:eventId, amount, label, createdAt:new Date().toISOString() };
  return { state:{ total:Math.max(0, Number(current.total) || 0) + amount, events:[event, ...events].slice(0,500) }, awarded:amount };
}

export function orderedIdeas(ideas, energy) {
  const available = (Array.isArray(ideas) ? ideas : []).filter(item => item && ['start','in_progress','active','paused'].includes(item.state));
  const order = { low:['light','regular','deep'], normal:['regular','light','deep'], high:['deep','regular','light'] }[energy] || ['regular','light','deep'];
  return order.flatMap(effort => available.filter(item => (item.effort || 'regular') === effort));
}

export function latestItemFeedback(sessions, itemId) {
  if (!itemId || !Array.isArray(sessions)) return null;
  return sessions.slice(0, 10).find(session => session?.itemId === itemId && ['yes', 'somewhat', 'no'].includes(session.feedback)) || null;
}

export function deferRecentlyNotFit(items, sessions) {
  const list = Array.isArray(items) ? items : [];
  const latest = new Map();
  if (Array.isArray(sessions)) {
    for (const session of sessions.slice(0, 10)) {
      if (session?.itemId && !latest.has(session.itemId) && ['yes', 'somewhat', 'no'].includes(session.feedback)) latest.set(session.itemId, session);
    }
  }
  const alternatives = list.filter(item => latest.get(item.id)?.feedbackReason !== 'not_fit');
  return alternatives.length ? alternatives : list;
}

export function localAction(item, energy, minutes, previousFeedback = null) {
  if (!item) return { title:'Escolha algo bem pequeno', action:'Anote uma coisa que está ocupando sua cabeça.', reason:'Não precisa decidir o resto do dia.' };
  if (previousFeedback?.feedbackReason === 'too_big') {
    const point = item.category === 'reading' && item.book?.currentPage
      ? `Abra ${item.text} na página ${item.book.currentPage + 1} e leia uma frase.`
      : item.category === 'game' && item.game?.progress
        ? `Abra ${item.text} no ponto em que parou (${item.game.progress}) e só confira onde continuar.`
        : item.category === 'series' && item.media?.progress
          ? `Abra ${item.text} onde parou (${item.media.progress}) e só encontre o episódio.`
          : `Só abra ${item.text} e deixe na tela por um instante.`;
    return { title:item.text, action:point, reason:'Da última vez, esse começo pareceu grande. Deixei o primeiro passo menor.' };
  }
  const point = item.category === 'reading' && item.book?.currentPage ? `Abra na página ${item.book.currentPage + 1} e leia um parágrafo.`
    : item.category === 'game' && item.game?.progress ? `Abra e continue de onde parou: ${item.game.progress}.`
    : item.category === 'series' && item.media?.progress ? `Abra e continue de onde parou: ${item.media.progress}.`
    : item.nextStep || item.lastStop || `Deixe o material de ${item.text} ao seu alcance.`;
  const smaller = energy === 'low' && item.effort !== 'light' ? `Só prepare ${item.text} para depois.` : point;
  return { title:item.text, action:smaller, reason:`Cabe em cerca de ${minutes} minutos. Você pode parar quando quiser.` };
}
