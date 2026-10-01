import fs from 'node:fs';
const RESET=':root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}';
const S=JSON.parse(fs.readFileSync('state.json','utf8'));
const viewSrc=fs.readFileSync('app.js','utf8')+'\nvar RESET='+JSON.stringify(RESET)+';';
const view=new Function(viewSrc+'\nreturn view;')();
const head=`<title>Perfect Timing Project Board</title>
<div id="head-bits" hidden><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600&amp;family=Barlow+Condensed:wght@600&amp;family=JetBrains+Mono:wght@500&amp;display=swap"><style>${fs.readFileSync('style.css','utf8')}</style></div>`;
// head-bits holds the links+style so the runtime can re-emit them; move them out of the hidden div at parse time is unnecessary: <link>/<style> in body work anywhere
const body=`${head}
<main class="wrap" id="app">${view(S)}</main>
<div class="savebar" id="savebar" hidden><span id="savemsg"></span><button type="button" id="savebtn">Save</button></div>
<script type="application/json" id="state">${JSON.stringify(S).replace(/</g,'\\u003c')}</script>
<script id="app-view">${viewSrc}</script>
<script id="app-runtime">${fs.readFileSync('runtime.js','utf8')}</script>`;
fs.writeFileSync('project-board.html',body);
console.log('bytes',body.length);
