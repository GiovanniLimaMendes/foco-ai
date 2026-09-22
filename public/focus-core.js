export const XP = Object.freeze({ start:10, finish:15, resume:20, checkpoint:5, reading:10, reflection:10 });

export function award(state, eventId, amount, label) {
  const current = state && typeof state === 'object' ? state : { total:0, events:[] };
  const events = Array.isArray(current.events) ? current.events : [];
  if (!eventId || events.some(event => event.id === eventId)) return { state:{ ...current, events }, awarded:0 };
  const event = { id:eventId, amount, label, createdAt:new Date().toISOString() };
  return { state:{ total:Math.max(0, Number(current.total) || 0) + amount, events:[event, ...events].slice(0,500) }, awarded:amount };
}

export function orderedIdeas(ideas, energy) {
  const available = (Array.isArray(ideas) ? ideas : []).filter(item => item && ['start','in_progress','active'].includes(item.state));
  const order = { low:['light','regular','deep'], normal:['regular','light','deep'], high:['deep','regular','light'] }[energy] || ['regular','light','deep'];
  return order.flatMap(effort => available.filter(item => (item.effort || 'regular') === effort));
}

export function localAction(item, energy, minutes) {
  if (!item) return { title:'Escolha algo bem pequeno', action:'Anote uma coisa que está ocupando sua cabeça.', reason:'Não precisa decidir o resto do dia.' };
  const point = item.category === 'reading' && item.book?.currentPage ? `Abra na página ${item.book.currentPage + 1} e leia um parágrafo.`
    : item.category === 'game' && item.game?.progress ? `Abra e continue de onde parou: ${item.game.progress}.`
    : item.category === 'series' && item.media?.progress ? `Abra e continue de onde parou: ${item.media.progress}.`
    : item.nextStep || item.lastStop || `Deixe o material de ${item.text} ao seu alcance.`;
  const smaller = energy === 'low' && item.effort !== 'light' ? `Só prepare ${item.text} para depois.` : point;
  return { title:item.text, action:smaller, reason:`Cabe em cerca de ${minutes} minutos. Você pode parar quando quiser.` };
}
