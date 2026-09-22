import test from 'node:test';
import assert from 'node:assert/strict';
import { award, orderedIdeas, localAction } from '../public/focus-core.js';

test('XP só recompensa o mesmo evento uma vez', () => {
  const first = award({ total:0, events:[] }, 'session-1', 10, 'start');
  const second = award(first.state, 'session-1', 10, 'start');
  assert.equal(first.state.total, 10);
  assert.equal(second.state.total, 10);
  assert.equal(second.awarded, 0);
});

test('energia média prioriza itens médios e depois leves', () => {
  const items = [{ id:'a', state:'start', effort:'light' }, { id:'b', state:'start', effort:'regular' }, { id:'c', state:'start', effort:'deep' }];
  assert.deepEqual(orderedIdeas(items, 'normal').map(item => item.id), ['b','a','c']);
});

test('sugestão local retoma o ponto de um jogo', () => {
  const action = localAction({ text:'Jogo', category:'game', game:{progress:'capítulo 3'}, state:'start' }, 'normal', 10);
  assert.match(action.action, /capítulo 3/);
});

test('sugestão local reutiliza o último ponto registrado', () => {
  const action = localAction({ text:'Projeto pessoal', state:'in_progress', effort:'regular', category:'general', lastStop:'parei na tela de login' }, 'normal', 10);
  assert.match(action.action, /parei na tela de login/);
});
