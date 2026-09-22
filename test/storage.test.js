import test from 'node:test';
import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};
const { storage } = await import('../public/storage.js');

test('backup exporta os dados do Foco e restaura sem alterar seu conteúdo', () => {
  storage.set('ideas', [{id:'book',text:'O Hobbit',category:'reading'}]);
  storage.set('day_entries', [{id:'day-1',text:'Hoje li um pouco.'}]);
  storage.set('theme', 'dark');
  storage.set('reading_timer', {version:1,bookId:'book',phase:'focus',status:'paused',remainingSeconds:243});
  const backup = storage.createBackup();

  storage.set('ideas', [{id:'new',text:'Outro item'}]);
  storage.set('theme', 'light');
  const restoredCount = storage.restoreBackup(backup);

  assert.equal(backup.app, 'foco-ai');
  assert.equal(restoredCount, 4);
  assert.deepEqual(storage.get('ideas', []), [{id:'book',text:'O Hobbit',category:'reading'}]);
  assert.equal(storage.get('theme', 'light'), 'dark');
  assert.deepEqual(storage.get('day_entries', []), [{id:'day-1',text:'Hoje li um pouco.'}]);
  assert.deepEqual(storage.get('reading_timer', null), {version:1,bookId:'book',phase:'focus',status:'paused',remainingSeconds:243});
});

test('backup inválido é rejeitado antes de substituir os dados locais', () => {
  storage.set('ideas', [{id:'keep',text:'Preservar'}]);
  assert.throws(() => storage.restoreBackup({app:'outro-app',backupVersion:1,data:{ideas:[]}}), /backup válido/);
  assert.throws(() => storage.restoreBackup({app:'foco-ai',backupVersion:1,data:{unexpected:'valor'}}), /não reconhece/);
  assert.throws(() => storage.restoreBackup({app:'foco-ai',backupVersion:1,data:{day_entries:[{}]}}), /formato inválido/);
  assert.deepEqual(storage.get('ideas', []), [{id:'keep',text:'Preservar'}]);
});
