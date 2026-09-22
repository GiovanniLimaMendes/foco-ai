import { storage } from './storage.js';
import { $, $$, escapeHtml, showToast } from './ui.js';
import { XP, award, orderedIdeas, localAction } from './focus-core.js';

const KEY = 'executive_memory';
const now = () => new Date().toISOString();
function memory() {
  const saved = storage.migrate(KEY, 2, value => ({ ...(value || {}), sessions:Array.isArray(value?.sessions) ? value.sessions : [], rewards:value?.rewards || { total:0, events:[] }, settings:value?.settings || {}, brainDump:Array.isArray(value?.brainDump) ? value.brainDump : [] }));
  return { version:2, sessions:Array.isArray(saved.sessions) ? saved.sessions : [], rewards:saved.rewards || { total:0, events:[] }, settings:{ gamification:saved.settings?.gamification !== false, celebrations:saved.settings?.celebrations !== false, hideConstellationDetails:!!saved.settings?.hideConstellationDetails }, tomorrow:saved.tomorrow || null, brainDump:Array.isArray(saved.brainDump) ? saved.brainDump : [] };
}
function save(value) { storage.set(KEY, value); return value; }
function ideas() { return storage.get('ideas', []); }
function updateThing(id, patch) { window.dispatchEvent(new CustomEvent('foco:patch-thing',{detail:{id,patch}})); }
function reward(kind, eventId) { const data=memory(); if (!data.settings.gamification) return 0; const result=award(data.rewards,eventId,XP[kind],kind); data.rewards=result.state; save(data); if(result.awarded && data.settings.celebrations) showToast(`+${result.awarded} XP por um passo real.`); return result.awarded; }

export function initExecutive() {
  let flow = { energy:'normal', minutes:10, preference:'any', index:0, action:null };
  let activeSession = null; let timer;
  const dialog = $('#stuckDialog'); const focusDialog = $('#focusDialog');
  function renderSettings() { const data=memory(); $('#xpTotal').textContent=`${data.rewards.total || 0} XP`; $('#gamificationToggle').checked=data.settings.gamification; $('#celebrationToggle').checked=data.settings.celebrations; $('#hideStarsToggle').checked=data.settings.hideConstellationDetails; }
  function chooseAction() { const list=orderedIdeas(ideas(),flow.energy); let candidates=list; if(flow.preference==='fun') candidates=list.filter(item=>item.type==='interest' || ['game','series'].includes(item.category)); if(flow.preference==='important') candidates=list.filter(item=>item.type==='obligation' || item.state==='in_progress'); if(!candidates.length) candidates=list; flow.action=localAction(candidates[flow.index % Math.max(1,candidates.length)],flow.energy,flow.minutes); flow.action.item=candidates[flow.index % Math.max(1,candidates.length)] || null; }
  function renderFlow(step='energy') { $('#stuckStep').dataset.step=step; $$('.flow-step').forEach(node=>node.classList.toggle('hidden',node.dataset.step!==step)); if(step==='suggestion') { chooseAction(); $('#flowActionTitle').textContent=flow.action.title; $('#flowAction').textContent=flow.action.action; $('#flowReason').textContent=flow.action.reason; } }
  $('#stuckButton').addEventListener('click',()=> { flow={energy:'normal',minutes:10,preference:'any',index:0,action:null}; renderFlow('energy'); dialog.showModal(); });
  $$('[data-flow-energy]').forEach(button=>button.addEventListener('click',()=> { flow.energy=button.dataset.flowEnergy; renderFlow('time'); }));
  $$('[data-flow-time]').forEach(button=>button.addEventListener('click',()=> { flow.minutes=Number(button.dataset.flowTime); renderFlow('preference'); }));
  $('#customTime').addEventListener('change',()=> { const value=Math.max(1,Math.min(180,Number($('#customTime').value)||10)); flow.minutes=value; renderFlow('preference'); });
  $$('[data-flow-preference]').forEach(button=>button.addEventListener('click',()=> { flow.preference=button.dataset.flowPreference; renderFlow('suggestion'); }));
  $('#anotherAction').addEventListener('click',()=> { flow.index++; renderFlow('suggestion'); });
  $('#harderAction').addEventListener('click',()=> { $('#flowAction').textContent=flow.action.item ? `Só abra ou deixe perto: ${flow.action.item.text}.` : 'Só respire e escolha um objeto perto de você.'; $('#flowReason').textContent='Não precisa fazer a atividade agora.'; });
  $('#dismissFlow').addEventListener('click',()=>dialog.close());
  $('#startFlow').addEventListener('click',()=> { dialog.close(); startSession(flow.action, flow.minutes); });
  $$('[data-close-exec]').forEach(button=>button.addEventListener('click',()=> $(button.dataset.closeExec).close()));
  function startSession(action, minutes) { activeSession={ id:crypto.randomUUID(), itemId:action.item?.id || null, title:action.title, action:action.action, startedAt:now(), plannedMinutes:minutes, status:'active' }; $('#focusTitle').textContent=action.action; $('#focusTimer').textContent=`${String(minutes).padStart(2,'0')}:00`; $('#focusDialog').showModal(); if(action.item) { updateThing(action.item.id,{state:'in_progress',lastInteraction:now(),preferredEnergy:flow.energy,estimatedMinutes:minutes}); reward('start',`start:${activeSession.id}`); if(action.item.state==='paused') reward('resume',`resume:${activeSession.id}`); } startTimer(minutes*60); }
  function startTimer(seconds) { clearInterval(timer); let remaining=seconds; timer=setInterval(()=> { remaining--; $('#focusTimer').textContent=`${String(Math.floor(Math.max(0,remaining)/60)).padStart(2,'0')}:${String(Math.max(0,remaining)%60).padStart(2,'0')}`; if(remaining<=0) { clearInterval(timer); $('#focusStatus').textContent='O tempo passou. Você pode concluir, pausar ou parar.'; } },1000); }
  $('#pauseFocus').addEventListener('click',()=> { clearInterval(timer); $('#focusStatus').textContent='Pausado. Você pode voltar quando fizer sentido.'; });
  function finish(status) { if(!activeSession) return; clearInterval(timer); activeSession.status=status; activeSession.endedAt=now(); const data=memory(); data.sessions.unshift(activeSession); data.sessions=data.sessions.slice(0,250); save(data); if(status==='completed') reward('finish',`finish:${activeSession.id}`); if(activeSession.itemId) updateThing(activeSession.itemId,{lastInteraction:now(),lastStop:$('#whereStopped').value.trim().slice(0,300),nextStep:$('#nextAfterFocus').value.trim().slice(0,240)}); $('#focusDialog').close(); $('#feedbackDialog').showModal(); renderConstellation(); activeSession=null; }
  $('#completeFocus').addEventListener('click',()=>finish('completed')); $('#stopFocus').addEventListener('click',()=>finish('stopped'));
  $$('[data-feedback]').forEach(button=>button.addEventListener('click',()=> { const data=memory(); const session=data.sessions[0]; if(session && !session.feedback) { session.feedback=button.dataset.feedback; save(data); reward('checkpoint',`feedback:${session.id}`); } $('#feedbackDialog').close(); renderConstellation(); }));
  $('#saveTomorrow').addEventListener('click',()=> { const intention=$('#tomorrowIntention').value.trim(); if(!intention) return showToast('Escreva uma intenção pequena primeiro.'); const data=memory(); data.tomorrow={intention,when:$('#tomorrowWhen').value.trim(),where:$('#tomorrowWhere').value.trim(),createdAt:now()}; save(data); renderTomorrow(); showToast('Amanhã tem uma única intenção guardada.'); });
  function renderTomorrow() { const value=memory().tomorrow; $('#tomorrowSaved').textContent=value ? `${value.intention}${value.when ? ` · ${value.when}`:''}${value.where ? ` · ${value.where}`:''}` : 'Nada definido. Tudo bem.'; }
  $('#organizeDump').addEventListener('click',()=> { const text=$('#brainDumpText').value.trim(); if(!text) return; const parts=text.split(/[\n.;]+/).map(part=>part.trim()).filter(part=>part.length>2).slice(0,6); $('#dumpReview').innerHTML=parts.length ? parts.map((part,index)=>`<label class="dump-item"><input type="checkbox" checked data-dump="${index}" /> ${escapeHtml(part)}</label>`).join('') : '<p class="muted">Não encontrei uma ideia separada ainda.</p>'; $('#dumpReview').dataset.items=JSON.stringify(parts); });
  $('#saveDumpChoices').addEventListener('click',()=> { const parts=JSON.parse($('#dumpReview').dataset.items || '[]'); $$('[data-dump]:checked').forEach(input=>window.dispatchEvent(new CustomEvent('foco:add-thing',{detail:{name:parts[Number(input.dataset.dump)],type:'interest',category:'general'}}))); const data=memory(); data.brainDump.unshift({text:$('#brainDumpText').value.trim(),createdAt:now()}); save(data); $('#brainDumpText').value=''; $('#dumpReview').innerHTML=''; showToast('Você escolheu o que queria guardar.'); });
  function renderConstellation() { const data=memory(); const sessions=data.sessions.slice(0,42); $('#constellation').innerHTML=sessions.length ? sessions.map((session,index)=>`<button class="star" style="--x:${(index*37)%92+4}%;--y:${(index*61)%80+10}%" title="${escapeHtml(session.title)}" aria-label="Sessão: ${escapeHtml(session.title)}">✦</button>`).join('') : '<p class="muted">Cada sessão registrada acende uma estrela. Não há dias perdidos aqui.</p>'; }
  $('#gamificationToggle').addEventListener('change',()=> { const data=memory(); data.settings.gamification=$('#gamificationToggle').checked; save(data); renderSettings(); });
  $('#celebrationToggle').addEventListener('change',()=> { const data=memory(); data.settings.celebrations=$('#celebrationToggle').checked; save(data); });
  $('#hideStarsToggle').addEventListener('change',()=> { const data=memory(); data.settings.hideConstellationDetails=$('#hideStarsToggle').checked; save(data); });
  renderSettings(); renderTomorrow(); renderConstellation();
}
