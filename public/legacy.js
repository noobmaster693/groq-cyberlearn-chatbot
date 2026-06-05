const $=id=>document.getElementById(id);
  const KEYS={chats:'cy-chats-v4',active:'cy-active-v4',mode:'cy-mode-v4',theme:'cy-theme-v4',labels:'cy-labels-v4',form:'cy-python-form-v1'};
  const DEFAULTS={
    brand:'Assistant IA du cours',welcome:'Bonjour, je suis l’assistant IA de ce cours. Pose une question ou ajoute un fichier.',
    questionPlaceholder:'Écris ta question ici...',send:'Envoyer',fileTitle:'Fichiers',dropText:'Tu peux glisser des fichiers ici pour les ajouter.',
    newChat:'Nouveau chat',rename:'Renommer',deleteChat:'Supprimer',run:'Run',clear:'Clear',chatTab:'Chat',pythonTab:'Python',optionsTab:'Options ▾'
  };
  const LABEL_FIELDS=[
    ['brand','Top title'],['welcome','Welcome text'],['questionPlaceholder','Chat placeholder'],['send','Send button'],
    ['fileTitle','Files title'],['dropText','Drop-zone text'],['newChat','New chat'],['rename','Rename'],['deleteChat','Delete'],
    ['run','Run button'],['clear','Clear button'],['chatTab','Chat tab'],['pythonTab','Python tab'],['optionsTab','Options tab']
  ];
  let labels={...DEFAULTS,...JSON.parse(localStorage.getItem(KEYS.labels)||'{}')};
  let chats=[],activeId='',mode=localStorage.getItem(KEYS.mode)||'python',attachments=[],history=[];
  const MAX_FILES=5,MAX_IMAGES=3,TEXT_EXT=new Set('txt md csv json js ts py html css xml ino c cpp h java'.split(' '));

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}
  function makeId(){return crypto.randomUUID()}
  function freshChat(){return{id:makeId(),title:'Nouveau chat',messages:[],history:[],updatedAt:Date.now()}}
  function current(){return chats.find(c=>c.id===activeId)}
  function saveChats(){chats.sort((a,b)=>b.updatedAt-a.updatedAt);localStorage.setItem(KEYS.chats,JSON.stringify(chats.slice(0,25)));localStorage.setItem(KEYS.active,activeId);renderSelect()}
  function loadChats(){try{chats=JSON.parse(localStorage.getItem(KEYS.chats)||'[]')}catch{chats=[]}if(!chats.length)chats=[freshChat()];activeId=localStorage.getItem(KEYS.active)||chats[0].id;if(!current())activeId=chats[0].id;history=current().history||[]}
  function renderSelect(){const s=$('chatSelect');s.innerHTML='';for(const c of chats){const o=document.createElement('option');o.value=c.id;o.textContent=c.title;o.selected=c.id===activeId;s.appendChild(o)}}
  function setStatus(text='',type=''){ $('status').textContent=text;$('status').className='status '+type }
  function autoTitle(text){text=String(text||'').replace(/\s+/g,' ').trim();return text.length>38?text.slice(0,38)+'…':text||'Nouveau chat'}

  function inline(text){return esc(text).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>')}
  function codeBlock(lang,code){const box=document.createElement('div');box.className='codebox';box.innerHTML='<div class="codehead"><span>'+esc(lang||'code')+'</span><button class="copy" type="button">Copy</button></div><pre>'+esc(code)+'</pre>';box.querySelector('button').onclick=async()=>{await navigator.clipboard.writeText(code);box.querySelector('button').textContent='Copied';setTimeout(()=>box.querySelector('button').textContent='Copy',1200)};return box}
  function answerContent(text){const d=document.createElement('div'),rx=/```([^\n`]*)\n?([\s\S]*?)```/g;let last=0,m;while((m=rx.exec(text))){if(m.index>last){const p=document.createElement('p');p.innerHTML=inline(text.slice(last,m.index));d.appendChild(p)}d.appendChild(codeBlock(m[1],m[2].replace(/\n$/,'')));last=rx.lastIndex}if(last<text.length){const p=document.createElement('p');p.innerHTML=inline(text.slice(last));d.appendChild(p)}return d}
  function renderChat(){const log=$('chatLog');log.innerHTML='<div class="welcome">'+esc(labels.welcome)+'</div>';for(const m of current().messages){const row=document.createElement('div');row.className='message '+m.role;const b=document.createElement('div');b.className='bubble';if(m.role==='assistant')b.appendChild(answerContent(m.content));else{b.textContent=m.content;if(m.files?.length){const f=document.createElement('div');f.className='attached';f.textContent='📎 '+m.files.join(', ');b.appendChild(f)}}row.appendChild(b);log.appendChild(row)}$('chatView').scrollTop=$('chatView').scrollHeight}
  function renderPythonHistory(){const out=$('pyHistory');out.innerHTML='';for(const m of current().messages){const r=document.createElement('div');r.className='py-record';if(m.role==='user'){r.innerHTML='<div class="py-record-title">assistant_course.py</div><pre>question = "'+esc(m.content)+'"\nanswer = ask_course_assistant(question)\nprint(answer)</pre>'}else{r.innerHTML='<div class="py-record-title">output</div><pre>'+esc(m.content)+'</pre>'}out.appendChild(r)}$('pythonView').scrollTop=$('pythonView').scrollHeight}
  function render(){renderSelect();renderChat();renderPythonHistory()}

  function setMode(next){mode=next;localStorage.setItem(KEYS.mode,next);$('chatTab').classList.toggle('active',next==='chat');$('pythonTab').classList.toggle('active',next==='python');$('chatView').classList.toggle('hidden',next!=='chat');$('pythonView').classList.toggle('hidden',next!=='python');$('chatForm').classList.toggle('hidden',next!=='chat')}
  function newChat(){const c=freshChat();chats.unshift(c);activeId=c.id;history=[];saveChats();render()}
  function renameChat(){const c=current(),n=prompt('Nouveau nom :',c.title);if(n&&n.trim()){c.title=n.trim().slice(0,48);c.updatedAt=Date.now();saveChats()}}
  function deleteChat(){if(!confirm('Supprimer cette conversation ?'))return;chats=chats.filter(c=>c.id!==activeId);if(!chats.length)chats=[freshChat()];activeId=chats[0].id;history=current().history||[];saveChats();render()}

  function getPythonForm(){return{question:$('pyQuestion').value,context:$('pyContext').value,manual:[...document.querySelectorAll('[data-manual]')].map(i=>i.value)}}
  function savePythonForm(){localStorage.setItem(KEYS.form,JSON.stringify(getPythonForm()))}
  function loadPythonForm(){let d={question:'',context:'',manual:[]};try{d={...d,...JSON.parse(localStorage.getItem(KEYS.form)||'{}')}}catch{}$('pyQuestion').value=d.question||'';$('pyContext').value=d.context||'';document.querySelectorAll('[data-manual]').forEach((i,n)=>i.value=d.manual?.[n]||'');syncEditor()}
  function quote(v){return String(v||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n')}
  function syncEditor(){const q=quote($('pyQuestion').value),ctx=quote($('pyContext').value);$('pyEditor').value='question = "'+q+'"\ncontext = "'+ctx+'"\nanswer = ask_course_assistant(question, context)\nprint(answer)';savePythonForm()}
  function parseEditor(){const v=$('pyEditor').value,q=(v.match(/question\s*=\s*"([\s\S]*?)"/)||[])[1]||$('pyQuestion').value,ctx=(v.match(/context\s*=\s*"([\s\S]*?)"/)||[])[1]||$('pyContext').value;return{question:q.replace(/\\n/g,'\n').replace(/\\"/g,'"').replace(/\\\\/g,'\\'),context:ctx.replace(/\\n/g,'\n').replace(/\\"/g,'"').replace(/\\\\/g,'\\')}}
  function extraManual(){return[...document.querySelectorAll('[data-manual]')].map(i=>i.value.trim()).filter(Boolean)}
  async function ask(message,visibleMessage=message){
    if(!message.trim()&&!attachments.length)return setStatus('Ajoute une question ou un fichier.','error');
    const c=current(),files=attachments;attachments=[];renderFiles();
    if(!c.messages.some(m=>m.role==='user'))c.title=autoTitle(visibleMessage);
    c.messages.push({role:'user',content:visibleMessage,files:files.map(f=>f.name)});c.updatedAt=Date.now();saveChats();render();
    $('send').disabled=true;$('runPython').disabled=true;setStatus('Analyse en cours…');
    try{
      const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,history,attachments:files.map(({id,previewUrl,...x})=>x)})});
      const data=await res.json();if(!res.ok)throw Error(data.error||'Erreur inconnue.');
      c.messages.push({role:'assistant',content:data.reply});history.push({role:'user',content:visibleMessage},{role:'assistant',content:data.reply});history=history.slice(-16);c.history=history;c.updatedAt=Date.now();saveChats();render();setStatus('Réponse reçue.','ok')
    }catch(e){c.messages.push({role:'assistant',content:'Erreur : '+e.message});render();setStatus(e.message,'error')}
    finally{$('send').disabled=false;$('runPython').disabled=false}
  }

  function ext(name){return name.split('.').pop().toLowerCase()}
  function readURL(file){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file)})}
  function loadImage(file){return new Promise((ok,no)=>{const i=new Image(),u=URL.createObjectURL(file);i.onload=()=>{URL.revokeObjectURL(u);ok(i)};i.onerror=no;i.src=u})}
  async function prepImage(file){const i=await loadImage(file),ratio=Math.min(1,1600/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(i.width*ratio));c.height=Math.max(1,Math.round(i.height*ratio));c.getContext('2d').drawImage(i,0,0,c.width,c.height);let quality=.88,url=c.toDataURL('image/jpeg',quality);while(url.length>1e6&&quality>.45){quality-=.1;url=c.toDataURL('image/jpeg',quality)}return{id:makeId(),kind:'image',name:file.name,mimeType:'image/jpeg',dataUrl:url,previewUrl:url}}
  async function prepFile(file){const e=ext(file.name);if(file.type.startsWith('image/'))return prepImage(file);if(file.type==='application/pdf'||e==='pdf')return{id:makeId(),kind:'pdf',name:file.name,mimeType:'application/pdf',dataUrl:await readURL(file)};if(TEXT_EXT.has(e)||file.type.startsWith('text/'))return{id:makeId(),kind:'text',name:file.name,mimeType:file.type||'text/plain',text:(await file.text()).slice(0,12000)};throw Error('Format non pris en charge : '+file.name)}
  async function addFiles(list){for(const file of [...list]){if(attachments.length>=MAX_FILES)return setStatus('Maximum '+MAX_FILES+' fichiers.','error');if(file.type.startsWith('image/')&&attachments.filter(a=>a.kind==='image').length>=MAX_IMAGES)return setStatus('Maximum '+MAX_IMAGES+' images.','error');try{attachments.push(await prepFile(file));renderFiles();setStatus('Fichier ajouté.','ok')}catch(e){setStatus(e.message,'error')}}}
  function renderFiles(){const c=$('chips');c.innerHTML='';for(const a of attachments){const d=document.createElement('div');d.className='chip';if(a.previewUrl)d.innerHTML='<img src="'+a.previewUrl+'">';d.innerHTML+='<span>'+esc(a.name)+'</span><button type="button">×</button>';d.querySelector('button').onclick=()=>{attachments=attachments.filter(x=>x.id!==a.id);renderFiles()};c.appendChild(d)}}

  function applyLabels(){
    $('brand').textContent=labels.brand;$('question').placeholder=labels.questionPlaceholder;$('send').textContent=labels.send;
    $('fileTitle').textContent=labels.fileTitle;$('dropText').textContent=labels.dropText;$('newChat').textContent='＋ '+labels.newChat;
    $('renameChat').textContent='✎ '+labels.rename;$('deleteChat').textContent='× '+labels.deleteChat;$('runPython').textContent=labels.run;
    $('clearPython').textContent=labels.clear;$('chatTab').textContent=labels.chatTab;$('pythonTab').textContent=labels.pythonTab;$('optionsTab').textContent=labels.optionsTab
  }
  function openSettings(){const g=$('settingsGrid');g.innerHTML='';for(const [key,label] of LABEL_FIELDS){const d=document.createElement('div');d.className='field';d.innerHTML='<label>'+esc(label)+'</label><input data-label="'+key+'">';d.querySelector('input').value=labels[key];g.appendChild(d)}$('settingsModal').classList.add('open')}
  function saveLabels(){for(const i of document.querySelectorAll('[data-label]'))labels[i.dataset.label]=i.value.trim()||DEFAULTS[i.dataset.label];localStorage.setItem(KEYS.labels,JSON.stringify(labels));$('settingsModal').classList.remove('open');applyLabels();render()}
  function resetLabels(){labels={...DEFAULTS};localStorage.removeItem(KEYS.labels);openSettings()}

  $('chatTab').onclick=()=>setMode('chat');$('pythonTab').onclick=()=>setMode('python');$('optionsTab').onclick=()=> $('drawer').classList.toggle('hidden');$('closeDrawer').onclick=()=> $('drawer').classList.add('hidden');
  $('newChat').onclick=newChat;$('renameChat').onclick=renameChat;$('deleteChat').onclick=deleteChat;$('chatSelect').onchange=e=>{activeId=e.target.value;history=current().history||[];saveChats();render()};
  $('theme').onclick=()=>{document.body.classList.toggle('dark');localStorage.setItem(KEYS.theme,document.body.classList.contains('dark')?'dark':'light')};
  $('textSettings').onclick=openSettings;$('closeSettings').onclick=()=> $('settingsModal').classList.remove('open');$('saveLabels').onclick=saveLabels;$('resetLabels').onclick=resetLabels;
  $('chatForm').onsubmit=e=>{e.preventDefault();const q=$('question').value.trim();$('question').value='';ask(q,q)};
  $('runPython').onclick=()=>{const p=parseEditor(),extra=extraManual(),parts=[p.question,p.context&&'Context: '+p.context,extra.length&&'Additional fields: '+extra.join(' | ')].filter(Boolean);ask(parts.join('\n\n'),p.question||'Analyse les champs saisis.')};
  $('clearPython').onclick=()=>{$('pyQuestion').value='';$('pyContext').value='';document.querySelectorAll('[data-manual]').forEach(i=>i.value='');syncEditor()};
  $('pyQuestion').oninput=syncEditor;$('pyContext').oninput=syncEditor;document.querySelectorAll('[data-manual]').forEach(i=>i.oninput=savePythonForm);$('pyEditor').oninput=savePythonForm;
  $('browse').onclick=()=> $('fileInput').click();$('drop').onclick=()=> $('fileInput').click();$('fileInput').onchange=e=>addFiles(e.target.files);
  $('drop').ondragover=e=>{e.preventDefault();$('drop').classList.add('drag')};$('drop').ondragleave=()=> $('drop').classList.remove('drag');$('drop').ondrop=e=>{e.preventDefault();$('drop').classList.remove('drag');addFiles(e.dataTransfer.files)};
  window.onpaste=e=>{const f=[...(e.clipboardData?.files||[])].filter(x=>x.type.startsWith('image/'));if(f.length){e.preventDefault();addFiles(f)}};

  loadChats();if(localStorage.getItem(KEYS.theme)==='dark')document.body.classList.add('dark');loadPythonForm();applyLabels();setMode(mode);renderFiles();render();
