const PREFIX = 'foco_';
const memory = new Map();
function warn() {
  const element = document.querySelector('#storageWarning');
  if (element) {
    element.textContent = 'Não consegui salvar neste navegador. Mantenha esta aba aberta e copie seus textos antes de sair.';
    element.classList.remove('hidden');
  }
}
export const storage = {
  get(key, fallback) {
    try {
      const raw = memory.has(key) ? memory.get(key) : localStorage.getItem(PREFIX + key);
      if (raw === null) return fallback;
      // The original demo stored energy as an unquoted string.
      if (key === 'energy' && ['low', 'normal', 'high'].includes(raw)) return raw;
      return JSON.parse(raw);
    } catch { warn(); return fallback; }
  },
  set(key, value) {
    const raw = JSON.stringify(value);
    memory.set(key, raw);
    try { localStorage.setItem(PREFIX + key, raw); return true; }
    catch { warn(); return false; }
  },
  remove(key) {
    memory.set(key, null);
    try { localStorage.removeItem(PREFIX + key); return true; }
    catch { warn(); return false; }
  },
  migrate(key, version, transform, fallback = {}) {
    const current = this.get(key, fallback);
    const from = Number(current?.version) || 0;
    if (from >= version) return current;
    const next = { ...transform(current, from), version };
    this.set(key, next);
    return next;
  }
};
