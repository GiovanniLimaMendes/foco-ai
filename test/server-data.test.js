import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL='1';
const { chatContext, dumpResult }=await import('../server.js');

test('contexto do chat limita e normaliza itens e sessões',()=> {
  const value=chatContext({
    energy:'high',
    things:Array.from({length:12},(_,index)=>({text:`Projeto ${index}`,state:'in_progress',category:'general',lastStop:'tela atual',preferredEnergy:'high',estimatedMinutes:15})),
    sessions:Array.from({length:7},(_,index)=>({activity:`Sessão ${index}`,status:'completed',feedback:'yes',plannedMinutes:15}))
  });
  assert.equal(value.energy,'high');
  assert.equal(value.things.length,8);
  assert.equal(value.sessions.length,4);
  assert.equal(value.things[0].lastStop,'tela atual');
  assert.equal(value.sessions[0].feedback,'yes');
});

test('contexto inválido não injeta valores fora das opções permitidas',()=> {
  const value=chatContext({energy:'furious',things:[{text:'Livro',state:'in_progress',category:'reading',effort:'unknown',estimatedMinutes:900}],sessions:[{feedback:'maybe',status:'untrusted'}]});
  assert.equal(value.energy,null);
  assert.equal(value.things[0].effort,'regular');
  assert.equal(value.things[0].estimatedMinutes,null);
  assert.equal(value.sessions[0].feedback,null);
  assert.equal(value.sessions[0].status,'');
});

test('brain dump remove duplicatas e limita sugestões seguras',()=> {
  const result=dumpResult(JSON.stringify({note:'Revise antes de guardar.',items:[
    {name:'Ler Hobbit',type:'interest',category:'reading',state:'start',progress:'',nextStep:'Abrir na página 1'},
    {name:'Ler Hobbit',type:'obligation',category:'reading',state:'start',progress:'',nextStep:''},
    {name:'One Piece',type:'interest',category:'series',state:'in_progress',progress:'EP 101',nextStep:''}
  ]}));
  assert.equal(result.items.length,2);
  assert.equal(result.items[0].category,'reading');
  assert.equal(result.items[1].state,'in_progress');
});

test('resposta inválida de organização retorna erro amigável',()=> {
  assert.throws(()=>dumpResult('not json'),error=>error.status===502 && /continua aqui/.test(error.message));
});
