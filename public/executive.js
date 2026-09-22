import { storage } from './storage.js';
import { $, $$, escapeHtml, showToast } from './ui.js';
import { XP, award, orderedIdeas, localAction, earnedAchievements } from './focus-core.js';

const KEY = 'executive_memory';
const now = () => new Date().toISOString();
function memory() {
  const saved = storage.migrate(KEY, 4, value => ({ ...(value || {}), sessions:Array.isArray(value?.sessions) ? value.sessions : [], rewards:value?.rewards || { total:0, events:[] }, settings:value?.settings || {}, brainDump:Array.isArray(value?.brainDump) ? value.brainDump : [], activeSession:value?.activeSession || null, stats:value?.stats || {}, unlockedAchievements:Array.isArray(value?.unlockedAchievements) ? value.unlockedAchievements : [] }));
  return { version:4, sessions:Array.isArray(saved.sessions) ? saved.sessions : [], rewards:saved.rewards || { total:0, events:[] }, settings:{ gamification:saved.settings?.gamification !== false, celebrations:saved.settings?.celebrations !== false, hideConstellationDetails:!!saved.settings?.hideConstellationDetails, symbolEvolution:saved.settings?.symbolEvolution !== false }, tomorrow:saved.tomorrow || null, brainDump:Array.isArray(saved.brainDump) ? saved.brainDump : [], activeSession:saved.activeSession || null, stats:{readingSessions:Math.max(0,Number(saved.stats?.readingSessions)||0)}, unlockedAchievements:Array.isArray(saved.unlockedAchievements) ? saved.unlockedAchievements : [] };
}
function save(value) { storage.set(KEY, value); return value; }
function ideas() { return storage.get('ideas', []); }
function updateThing(id, patch) { window.dispatchEvent(new CustomEvent('foco:patch-thing',{detail:{id,patch}})); }
function reward(kind, eventId) { const data=memory(); if (!data.settings.gamification || !Number.isFinite(XP[kind])) return 0; const result=award(data.rewards,eventId,XP[kind],kind); data.rewards=result.state; save(data); if(result.awarded && data.settings.celebrations) showToast(`+${result.awarded} XP por um passo real.`); if(result.awarded) window.dispatchEvent(new Event('foco:reward-updated')); return result.awarded; }

export function initExecutive() {
  let flow = { energy:'normal', minutes:10, preference:'any', index:0, action:null };
  let activeSession = null; let selectedItem = null; let timer;
  const dialog = $('#stuckDialog'); const focusDialog = $('#focusDialog');
  function renderSettings() { const data=memory(); $('#xpTotal').textContent=`${data.rewards.total || 0} XP`; $('#gamificationToggle').checked=data.settings.gamification; $('#celebrationToggle').checked=data.settings.celebrations; $('#hideStarsToggle').checked=data.settings.hideConstellationDetails; $('#symbolEvolutionToggle').checked=data.settings.symbolEvolution; const level=!data.settings.symbolEvolution || !data.settings.gamification ? 0 : data.rewards.total>=500 ? 2 : data.rewards.total>=100 ? 1 : 0; document.querySelectorAll('.brand-logo').forEach(logo=>logo.dataset.focusLevel=String(level)); }
  function chooseAction() { const list=orderedIdeas(ideas(),flow.energy); let candidates=list; if(flow.preference==='fun') candidates=list.filter(item=>item.type==='interest' || ['game','series'].includes(item.category)); if(flow.preference==='important') candidates=list.filter(item=>item.type==='obligation' || item.state==='in_progress'); if(!candidates.length) candidates=list; flow.action=localAction(candidates[flow.index % Math.max(1,candidates.length)],flow.energy,flow.minutes); flow.action.item=candidates[flow.index % Math.max(1,candidates.length)] || null; }
  function renderFlow(step='energy') { dialog.dataset.step=step; $$('.flow-step').forEach(node=>node.classList.toggle('hidden',node.dataset.step!==step)); if(step==='suggestion') { chooseAction(); $('#flowActionTitle').textContent=flow.action.title; $('#flowAction').textContent=flow.action.action; $('#flowReason').textContent=flow.action.reason; } }
  $('#stuckButton').addEventListener('click',()=> { flow={energy:'normal',minutes:10,preference:'any',index:0,action:null}; renderFlow('energy'); dialog.showModal(); });
  window.addEventListener('foco:start-focus', event => {
    const item=ideas().find(candidate=>candidate.id===event.detail?.id);
    if (!item) return;
    selectedItem=item;
    $('#itemFocusTitle').textContent=item.text;
    $('#itemCustomTime').value='';
    $('#itemFocusDialog').showModal();
  });
  function startSelectedItem(minutes) {
    if (!selectedItem) return;
    const item=selectedItem;
    selectedItem=null;
    $('#itemFocusDialog').close();
    flow.energy=item.preferredEnergy || (item.effort === 'light' ? 'low' : item.effort === 'deep' ? 'high' : 'normal');
    const action=localAction(item,flow.energy,minutes);
    action.item=item;
    startSession(action,minutes);
  }
  $$('[data-item-focus-time]').forEach(button=>button.addEventListener('click',()=>startSelectedItem(Number(button.dataset.itemFocusTime))));
  $('#itemCustomTime').addEventListener('change',()=>startSelectedItem(Math.max(1,Math.min(180,Number($('#itemCustomTime').value)||10))));
  $$('[data-flow-energy]').forEach(button=>button.addEventListener('click',()=> { flow.energy=button.dataset.flowEnergy; renderFlow('time'); }));
  $$('[data-flow-time]').forEach(button=>button.addEventListener('click',()=> { flow.minutes=Number(button.dataset.flowTime); renderFlow('preference'); }));
  $('#customTime').addEventListener('change',()=> { const value=Math.max(1,Math.min(180,Number($('#customTime').value)||10)); flow.minutes=value; renderFlow('preference'); });
  $$('[data-flow-preference]').forEach(button=>button.addEventListener('click',()=> { flow.preference=button.dataset.flowPreference; renderFlow('suggestion'); }));
  $('#anotherAction').addEventListener('click',()=> { flow.index++; renderFlow('suggestion'); });
  $('#harderAction').addEventListener('click',()=> { $('#flowAction').textContent=flow.action.item ? `Só abra ou deixe perto: ${flow.action.item.text}.` : 'Só respire e escolha um objeto perto de você.'; $('#flowReason').textContent='Não precisa fazer a atividade agora.'; });
  $('#dismissFlow').addEventListener('click',()=>dialog.close());
  $('#startFlow').addEventListener('click',()=> { dialog.close(); startSession(flow.action, flow.minutes); });
  $$('[data-close-exec]').forEach(button=>button.addEventListener('click',()=> $(button.dataset.closeExec).close()));
  function persistActiveSession() { const data=memory(); data.activeSession=activeSession; save(data); }
  function startSession(action, minutes) { const item=action.item; activeSession={ id:crypto.randomUUID(), itemId:item?.id || null, category:item?.category || null, title:action.title, action:action.action, startedAt:now(), plannedMinutes:minutes, status:'active', lastStop:item?.lastStop || '', nextStep:item?.nextStep || '', timerEndsAt:Date.now()+minutes*60000 }; $('#whereStopped').value=activeSession.lastStop; $('#nextAfterFocus').value=activeSession.nextStep; $('#focusTitle').textContent=action.action; $('#focusTimer').textContent=`${String(minutes).padStart(2,'0')}:00`; $('#focusDialog').showModal(); persistActiveSession(); reward(item?.state==='paused' ? 'resume':'start',`${item?.state==='paused' ? 'resume':'start'}:${activeSession.id}`); if(item) updateThing(item.id,{state:'in_progress',lastInteraction:now(),preferredEnergy:flow.energy,estimatedMinutes:minutes}); startTimer(minutes*60); }
  function startTimer(seconds) { clearInterval(timer); $('#extendFocus').classList.add('hidden'); $('#resumeFocus').classList.add('hidden'); $('#focusStatus').textContent='Você pode pausar ou parar quando quiser.'; let remaining=Math.max(0,Math.ceil(seconds)); if(activeSession) { activeSession.status='active'; activeSession.remainingSeconds=null; activeSession.timerEndsAt=Date.now()+remaining*1000; persistActiveSession(); } const draw=()=>$('#focusTimer').textContent=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`; draw(); timer=setInterval(()=> { remaining=Math.max(0,Math.ceil((activeSession.timerEndsAt-Date.now())/1000)); draw(); if(remaining<=0) { clearInterval(timer); activeSession.status='waiting'; activeSession.timerEndsAt=null; activeSession.remainingSeconds=0; persistActiveSession(); $('#focusStatus').textContent='Esse bloco terminou. Você decide o que fazer agora.'; $('#extendFocus').classList.remove('hidden'); } },1000); }
  $$('[data-extend-focus]').forEach(button=>button.addEventListener('click',()=> { const minutes=Number(button.dataset.extendFocus); if(activeSession) activeSession.plannedMinutes+=minutes; startTimer(minutes*60); }));
  $('#whereStopped').addEventListener('input',()=> { if(activeSession) { activeSession.lastStop=$('#whereStopped').value.slice(0,300); persistActiveSession(); } });
  $('#nextAfterFocus').addEventListener('input',()=> { if(activeSession) { activeSession.nextStep=$('#nextAfterFocus').value.slice(0,240); persistActiveSession(); } });
  $('#pauseFocus').addEventListener('click',()=> { if(!activeSession) return; const remaining=Math.max(0,Math.ceil((Number(activeSession.timerEndsAt)-Date.now())/1000)); clearInterval(timer); activeSession.status=remaining ? 'paused':'waiting'; activeSession.remainingSeconds=remaining; activeSession.timerEndsAt=null; persistActiveSession(); $('#focusTimer').textContent=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`; $('#focusStatus').textContent=remaining ? 'Pausado. Você pode retomar esse mesmo bloco quando fizer sentido.' : 'Esse bloco terminou. Você decide o que fazer agora.'; if(remaining) $('#resumeFocus').classList.remove('hidden'); else $('#extendFocus').classList.remove('hidden'); });
  $('#resumeFocus').addEventListener('click',()=> { if(activeSession?.remainingSeconds) startTimer(activeSession.remainingSeconds); });
  function finish(status) { if(!activeSession) return; clearInterval(timer); $('#extendFocus').classList.add('hidden'); activeSession.lastStop=$('#whereStopped').value.trim().slice(0,300); activeSession.nextStep=$('#nextAfterFocus').value.trim().slice(0,240); activeSession.status=status; activeSession.endedAt=now(); const finished=activeSession; const data=memory(); data.sessions.unshift(finished); data.sessions=data.sessions.slice(0,250); data.activeSession=null; if(status==='completed' && finished.category==='reading' && data.settings.gamification) data.stats.readingSessions=(data.stats.readingSessions||0)+1; save(data); reward('finish',`finish:${finished.id}`); if(status==='completed' && finished.category==='reading') reward('reading',`reading:${finished.id}`); if(finished.lastStop) reward('checkpoint',`checkpoint:${finished.id}`); if(finished.itemId) { const item=ideas().find(candidate=>candidate.id===finished.itemId); updateThing(finished.itemId,{lastInteraction:now(),lastStop:finished.lastStop || item?.lastStop || '',nextStep:finished.nextStep || item?.nextStep || ''}); } $('#focusDialog').close(); $('#feedbackDialog').showModal(); renderConstellation(); activeSession=null; }
  $('#completeFocus').addEventListener('click',()=>finish('completed')); $('#stopFocus').addEventListener('click',()=>finish('stopped'));
  $$('[data-feedback]').forEach(button=>button.addEventListener('click',()=> { const data=memory(); const session=data.sessions[0]; if(session && !session.feedback) { session.feedback=button.dataset.feedback; save(data); } $('#feedbackDialog').close(); renderAchievements(true); }));
  $('#saveTomorrow').addEventListener('click',()=> { const intention=$('#tomorrowIntention').value.trim(); if(!intention) return showToast('Escreva uma intenção pequena primeiro.'); const data=memory(); data.tomorrow={intention,when:$('#tomorrowWhen').value.trim(),where:$('#tomorrowWhere').value.trim(),createdAt:now()}; save(data); renderTomorrow(); showToast('Amanhã tem uma única intenção guardada.'); });
  function renderTomorrow() { const value=memory().tomorrow; $('#tomorrowSaved').textContent=value ? `${value.intention}${value.when ? ` · ${value.when}`:''}${value.where ? ` · ${value.where}`:''}` : 'Nada definido. Tudo bem.'; }
  $('#organizeDump').addEventListener('click',()=> { const text=$('#brainDumpText').value.trim(); if(!text) return; const parts=text.split(/[\n.;]+/).map(part=>part.trim()).filter(part=>part.length>2).slice(0,6); $('#dumpReview').innerHTML=parts.length ? parts.map((part,index)=>`<label class="dump-item"><input type="checkbox" checked data-dump="${index}" /> ${escapeHtml(part)}</label>`).join('') : '<p class="muted">Não encontrei uma ideia separada ainda.</p>'; $('#dumpReview').dataset.items=JSON.stringify(parts); });
  $('#saveDumpChoices').addEventListener('click',()=> { const parts=JSON.parse($('#dumpReview').dataset.items || '[]'); $$('[data-dump]:checked').forEach(input=>window.dispatchEvent(new CustomEvent('foco:add-thing',{detail:{name:parts[Number(input.dataset.dump)],type:'interest',category:'general'}}))); const data=memory(); data.brainDump.unshift({text:$('#brainDumpText').value.trim(),createdAt:now()}); save(data); $('#brainDumpText').value=''; $('#dumpReview').innerHTML=''; showToast('Você escolheu o que queria guardar.'); });
  function renderConstellation() {
    const data=memory();
    const nowDate=new Date();
    const from=$('#constellationPeriod').value==='week' ? new Date(nowDate.getFullYear(),nowDate.getMonth(),nowDate.getDate()-6) : new Date(nowDate.getFullYear(),nowDate.getMonth(),1);
    const events=(data.rewards?.events || []).filter(event=>Number.isFinite(Date.parse(event.createdAt)) && new Date(event.createdAt)>=from).slice(0,42);
    $('#starDetails').textContent='Escolha uma estrela para ver esse momento.';
    $('#constellation').innerHTML=events.length
      ? events.map((event,index)=> {
          const names={start:'Começou uma microação',finish:'Encerrou uma sessão',resume:'Retomou uma atividade',checkpoint:'Registrou onde parou',reading:'Sessão de leitura',reflection:'Reflexão no diário'};
          const detail=data.settings.hideConstellationDetails ? 'Progresso registrado' : `${names[event.label] || 'Progresso registrado'} · ${event.amount} XP · ${new Date(event.createdAt).toLocaleString('pt-BR',{dateStyle:'medium',timeStyle:'short'})}`;
          return `<button class="star" data-star-id="${escapeHtml(event.id)}" style="--x:${(index*37)%92+4}%;--y:${(index*61)%80+10}%" title="${escapeHtml(detail)}" aria-label="Estrela: ${escapeHtml(detail)}">✦</button>`;
        }).join('')
      : '<p class="muted">Seus próximos passos vão aparecer aqui. Dias vazios não apagam estrelas.</p>';
    $$('[data-star-id]').forEach(button=>button.addEventListener('click',()=> {
      const event=events.find(candidate=>candidate.id===button.dataset.starId);
      if (!event) return;
      const names={start:'Começou uma microação',finish:'Encerrou uma sessão',resume:'Retomou uma atividade',checkpoint:'Registrou onde parou',reading:'Sessão de leitura',reflection:'Reflexão no diário'};
      $('#starDetails').textContent=data.settings.hideConstellationDetails ? 'Um progresso seu foi registrado.' : `${names[event.label] || 'Progresso registrado'}: +${event.amount} XP · ${new Date(event.createdAt).toLocaleString('pt-BR',{dateStyle:'medium',timeStyle:'short'})}`;
    }));
  }
  function renderAchievements(announce=false) {
    const data=memory();
    if (!data.settings.gamification) { $('#achievements').innerHTML='<p class="muted small">Gamificação desativada.</p>'; return; }
    const earned=earnedAchievements(data.rewards,data.sessions,data.stats);
    const previous=new Set(data.unlockedAchievements);
    const newly=earned.filter(item=>!previous.has(item.id));
    if (newly.length) { data.unlockedAchievements=[...new Set([...data.unlockedAchievements,...newly.map(item=>item.id)])]; save(data); if(announce && data.settings.celebrations) showToast(`Conquista: ${newly[0].title}.`); }
    $('#achievements').innerHTML=earned.length ? earned.map(item=>`<article class="achievement${announce && data.settings.celebrations && newly.some(entry=>entry.id===item.id) ? ' just-earned':''}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description)}</p></article>`).join('') : '<p class="muted small">As conquistas aparecem aqui quando chegarem, sem metas ou cobranças.</p>';
  }
  window.addEventListener('foco:reward-updated',()=> { renderSettings(); renderConstellation(); renderAchievements(true); });
  window.addEventListener('foco:reflection-saved',event=> { if(event.detail?.id) reward('reflection',`reflection:${event.detail.id}`); });
  window.addEventListener('foco:reading-session-complete',event=> {
    const id=event.detail?.id;
    if (!id) return;
    const data=memory();
    if (!data.settings.gamification || data.rewards.events.some(rewardEvent=>rewardEvent.id===`reading:${id}`)) return;
    data.stats.readingSessions++;
    save(data);
    reward('reading',`reading:${id}`);
  });
  $('#constellationPeriod').addEventListener('change',renderConstellation);
  $('#gamificationToggle').addEventListener('change',()=> { const data=memory(); data.settings.gamification=$('#gamificationToggle').checked; save(data); renderSettings(); renderConstellation(); renderAchievements(); });
  $('#celebrationToggle').addEventListener('change',()=> { const data=memory(); data.settings.celebrations=$('#celebrationToggle').checked; save(data); });
  $('#hideStarsToggle').addEventListener('change',()=> { const data=memory(); data.settings.hideConstellationDetails=$('#hideStarsToggle').checked; save(data); renderConstellation(); });
  $('#symbolEvolutionToggle').addEventListener('change',()=> { const data=memory(); data.settings.symbolEvolution=$('#symbolEvolutionToggle').checked; save(data); renderSettings(); });
  function restoreSession() {
    const saved=memory().activeSession;
    if (!saved || !saved.id || !['active','paused','waiting'].includes(saved.status)) return;
    activeSession=saved;
    $('#focusTitle').textContent=saved.action || saved.title || 'Sua atividade';
    $('#whereStopped').value=saved.lastStop || '';
    $('#nextAfterFocus').value=saved.nextStep || '';
    $('#focusDialog').showModal();
    if(saved.status==='active') {
      const remaining=Math.ceil((Number(saved.timerEndsAt)-Date.now())/1000);
      if(remaining>0) startTimer(remaining);
      else { activeSession.status='waiting'; activeSession.timerEndsAt=null; persistActiveSession(); $('#focusStatus').textContent='Esse bloco terminou enquanto o app estava fechado.'; $('#extendFocus').classList.remove('hidden'); $('#focusTimer').textContent='00:00'; }
    } else if(saved.status==='waiting') {
      $('#focusStatus').textContent='Esse bloco terminou. Você decide o que fazer agora.';
      $('#extendFocus').classList.remove('hidden');
      $('#focusTimer').textContent='00:00';
    } else {
      const remaining=Math.max(0,Number(saved.remainingSeconds)||0);
      $('#focusTimer').textContent=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
      if(remaining) { $('#focusStatus').textContent='Sessão pausada. Você pode retomar esse mesmo bloco ou encerrar.'; $('#resumeFocus').classList.remove('hidden'); }
      else { $('#focusStatus').textContent='Sessão pausada. Você pode continuar por mais um bloco ou encerrar.'; $('#extendFocus').classList.remove('hidden'); }
    }
  }
  renderSettings(); renderTomorrow(); renderConstellation(); renderAchievements();
  restoreSession();
}
