function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function view(S){
  const open=l=>S.items.filter(i=>i.lane===l&&!i.done), done=S.items.filter(i=>i.done&&i.lane!=='risk');
  const card=(i,box)=>`<li class="card${i.lane==='risk'?' risk':''}" data-key="${esc(i.id)}">`+
    (box?`<input type="checkbox" id="c-${esc(i.id)}" data-id="${esc(i.id)}"${i.done?' checked':''}>`:'')+
    `<label${box?` for="c-${esc(i.id)}"`:''}>${esc(i.title)}</label><p>${esc(i.detail)}</p>`+
    (i.done?`<span class="chip ${i.lane}">${i.lane==='you'?'You':'Claude'}</span>`:'')+`</li>`;
  const lane=(l,name,list,box)=>`<section class="lane" data-lane="${l}"><h2>${name} <span class="n">${list.length}</span></h2><ul class="cards">${list.map(i=>card(i,box)).join('')||'<li class="card risk"><p>Nothing here.</p></li>'}</ul></section>`;
  return `<header><p class="eyebrow">Perfect Timing Auto Repair · fixingfortmyers.com · Google profile and workshop pages</p>`+
  `<h1>Perfect Timing Project Board</h1>`+
  `<p class="sub">Updated ${esc(S.updated)}. ${esc(S.note)} Tick an item when it is done, then press Save.</p>`+
  `<ul class="tally"><li><b>${open('you').length}</b><span>Waiting on you</span></li><li><b>${open('claude').length}</b><span>Claude next</span></li><li><b>${open('risk').length}</b><span>Risks</span></li><li><b>${done.length}</b><span>Done</span></li></ul></header>`+
  `<div class="board">${lane('you','Waiting on you',open('you'),true)}${lane('claude','Claude next',open('claude'),true)}${lane('risk','Risks to watch',open('risk'),false)}</div>`+
  `<section class="done-sec"><h2>Done (${done.length})</h2><ul class="done-list">${done.map(i=>card(i,true)).join('')}</ul></section>`+
  `<footer>Source of truth for details: docs/google-business-profile-plan.md on main.</footer>`;
}
