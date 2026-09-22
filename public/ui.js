export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => [...document.querySelectorAll(selector)];
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let toastTimer;
export function showToast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500);
}
export function motion() { return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'; }
export async function requestAI(path, payload) {
  let response;
  try {
    response = await fetch('/api/' + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal:AbortSignal.timeout(45000) });
  } catch {
    throw new Error('Não consegui falar com a IA agora. Seu texto continua aqui. Confira a conexão e tente novamente.');
  }
  let data;
  try { data = await response.json(); } catch { throw new Error('A resposta não chegou como esperado. Seu texto continua aqui. Tente novamente.'); }
  if (!response.ok) throw new Error(data.error?.message || 'A IA está indisponível agora. Tente novamente em instantes.');
  return data;
}
export async function busy(button, label, action) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  button.setAttribute('aria-busy','true');
  try { await action(); } finally { button.disabled = false; button.textContent = original; button.removeAttribute('aria-busy'); }
}
