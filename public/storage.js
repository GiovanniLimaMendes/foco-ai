const PREFIX = 'foco_';
const memory = new Map();
const BACKUP_KEYS = Object.freeze([
  'ideas', 'energy', 'theme', 'executive_memory', 'day_entries', 'day_draft',
  'chat_history', 'brain_dump_draft', 'selected_reading_book', 'reading_timer'
]);
const BACKUP_VALIDATORS = Object.freeze({
  ideas: value => Array.isArray(value),
  energy: value => ['low', 'normal', 'high'].includes(value),
  theme: value => ['light', 'dark'].includes(value),
  executive_memory: value => value !== null && typeof value === 'object' && !Array.isArray(value),
  day_entries: value => Array.isArray(value) && value.every(entry => entry && typeof entry === 'object' && typeof entry.text === 'string'),
  day_draft: value => typeof value === 'string',
  chat_history: value => Array.isArray(value),
  brain_dump_draft: value => typeof value === 'string',
  selected_reading_book: value => typeof value === 'string',
  reading_timer: value => value !== null && typeof value === 'object' && !Array.isArray(value)
});

function sanitizeBackupValue(value, depth = 0) {
  if (depth > 20) throw new Error('O backup tem uma estrutura profunda demais.');
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.length > 5000) throw new Error('O backup contém uma lista grande demais.');
    return value.map(entry => sanitizeBackupValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const clean = {};
    for (const [key, entry] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
      clean[key] = sanitizeBackupValue(entry, depth + 1);
    }
    return clean;
  }
  throw new Error('O backup contém um tipo de dado inválido.');
}

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
  },
  createBackup() {
    const data = {};
    for (const key of BACKUP_KEYS) {
      const value = this.get(key, undefined);
      if (value !== undefined) data[key] = value;
    }
    return { app: 'foco-ai', backupVersion: 1, exportedAt: new Date().toISOString(), data };
  },
  restoreBackup(backup) {
    if (!backup || typeof backup !== 'object' || Array.isArray(backup) || backup.app !== 'foco-ai' || backup.backupVersion !== 1 || !backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
      throw new Error('Esse arquivo não parece ser um backup válido do Foco.');
    }
    if (JSON.stringify(backup).length > 5_000_000) throw new Error('O arquivo é grande demais para importar.');
    const unknownKeys = Object.keys(backup.data).filter(key => !BACKUP_KEYS.includes(key));
    if (unknownKeys.length) throw new Error('O backup contém dados que esta versão do Foco não reconhece.');
    const next = {};
    for (const [key, value] of Object.entries(backup.data)) {
      const clean = sanitizeBackupValue(value);
      if (!BACKUP_VALIDATORS[key](clean)) throw new Error(`O backup tem um formato inválido em “${key}”.`);
      next[key] = clean;
    }

    const previous = this.createBackup().data;
    try {
      for (const key of BACKUP_KEYS) {
        const ok = Object.hasOwn(next, key) ? this.set(key, next[key]) : this.remove(key);
        if (!ok) throw new Error('O navegador não conseguiu gravar todos os dados. Libere espaço e tente novamente.');
      }
    } catch (error) {
      for (const key of BACKUP_KEYS) {
        if (Object.hasOwn(previous, key)) this.set(key, previous[key]);
        else this.remove(key);
      }
      throw error;
    }
    return Object.keys(next).length;
  }
};
