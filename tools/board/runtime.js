(function(){
  var S=JSON.parse(document.getElementById('state').textContent);
  var app=document.getElementById('app'),bar=document.getElementById('savebar'),msg=document.getElementById('savemsg'),btn=document.getElementById('savebtn');
  var dirty=false,artifact=null,readOnly=false;
  function draw(){app.innerHTML=view(S);}
  app.addEventListener('change',function(e){
    var id=e.target&&e.target.getAttribute('data-id');if(!id)return;
    S.items.forEach(function(i){if(i.id===id)i.done=e.target.checked;});
    dirty=true;draw();bar.hidden=false;
    msg.textContent=readOnly?'View only: your ticks are not saved.':'Unsaved changes.';btn.hidden=readOnly;
  });
  function doc(){
    var d=new Date(),upd=d.toLocaleString('en-US',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})+' ET';
    S.updated=upd;
    var json=JSON.stringify(S).replace(/</g,'\\u003c');
    return '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>'+RESET+'</style></head><body><title>Perfect Timing Project Board</title>'+
      document.getElementById('head-bits').innerHTML.replace(/^\s+|\s+$/g,'')+
      '<main class="wrap" id="app">'+view(S)+'</main>'+
      '<div class="savebar" id="savebar" hidden><span id="savemsg"></span><button type="button" id="savebtn">Save</button></div>'+
      '<script type="application/json" id="state">'+json+'<\/script>'+
      '<script id="app-view">'+document.getElementById('app-view').textContent+'<\/script>'+
      '<script id="app-runtime">'+document.getElementById('app-runtime').textContent+'<\/script></body></html>';
  }
  btn.addEventListener('click',function(){
    if(!artifact||!dirty)return;btn.disabled=true;msg.textContent='Saving…';
    artifact.publish(doc()).then(function(){msg.textContent='Saved.';},function(err){
      var c=err&&err.code;
      if(c==='conflict'){msg.textContent='Someone saved first. Reloading their version.';}
      else if(c==='not_writer'||c==='not_granted'||c==='consent_required'||c==='capability_disabled'||c==='not_declared'){readOnly=true;btn.hidden=true;msg.textContent='View only: you can look, but not save.';}
      else{btn.disabled=false;msg.textContent='Could not save. Try again in a moment.';}
    });
  });
  try{window.claude&&window.claude.use&&window.claude.use('artifact').then(function(a){artifact=a;if(!a)readOnly=true;});}catch(e){readOnly=true;}
})();
