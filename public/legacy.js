const $ = (id) => document.getElementById(id);

const KEYS = {
  chats: 'cy-chats-v4',
  active: 'cy-active-v4',
  mode: 'cy-mode-v4',
  theme: 'cy-theme-v4',
  labels: 'cy-labels-v4'
};

const DEFAULT_EDITOR = '# Entrer votre question ici\nquestion = ""\nanswer = ask_course_assistant(question)\nprint(answer)';

const DEFAULTS = {
  brand: 'Assistant IA du cours',
  welcome: 'Bonjour, je suis l’assistant IA de ce cours. Pose une question ou ajoute un fichier.',
  questionPlaceholder: 'Écris ta question ici...',
  send: 'Envoyer',
  fileTitle: 'Fichiers',
  dropText: 'Vous pouvez glisser des fichiers ici pour les ajouter.',
  newChat: 'Nouveau chat',
  rename: 'Renommer',
  deleteChat: 'Supprimer',
  chatTab: 'Chat',
  pythonTab: 'Python',
  optionsTab: 'Options ▾'
};

const LABEL_FIELDS = [
  ['brand', 'Top title'],
  ['welcome', 'Welcome text'],
  ['questionPlaceholder', 'Chat placeholder'],
  ['send', 'Send button'],
  ['fileTitle', 'Files title'],
  ['dropText', 'Drop-zone text'],
  ['newChat', 'New chat'],
  ['rename', 'Rename'],
  ['deleteChat', 'Delete'],
  ['chatTab', 'Chat tab'],
  ['pythonTab', 'Python tab'],
  ['optionsTab', 'Options tab']
];

const MAX_FILES = 5;
const MAX_IMAGES = 3;
const TEXT_EXTENSIONS = new Set('txt md csv json js ts py html css xml ino c cpp h java'.split(' '));

let labels = { ...DEFAULTS, ...readJson(KEYS.labels, {}) };
let chats = [];
let activeId = '';
let mode = localStorage.getItem(KEYS.mode) || 'python';
let attachments = [];
let history = [];

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function makeId() {
  return crypto.randomUUID();
}

function freshChat() {
  return { id: makeId(), title: 'Nouveau chat', messages: [], history: [], updatedAt: Date.now() };
}

function currentChat() {
  return chats.find((chat) => chat.id === activeId);
}

function setStatus(text = '', type = '') {
  $('status').textContent = text;
  $('status').className = `status ${type}`.trim();
}

function loadChats() {
  chats = readJson(KEYS.chats, []);
  if (!Array.isArray(chats) || chats.length === 0) chats = [freshChat()];
  activeId = localStorage.getItem(KEYS.active) || chats[0].id;
  if (!currentChat()) activeId = chats[0].id;
  history = currentChat().history || [];
}

function saveChats() {
  chats.sort((a, b) => b.updatedAt - a.updatedAt);
  chats = chats.slice(0, 25);
  localStorage.setItem(KEYS.chats, JSON.stringify(chats));
  localStorage.setItem(KEYS.active, activeId);
  renderSelect();
}

function renderSelect() {
  const select = $('chatSelect');
  select.innerHTML = '';
  for (const chat of chats) {
    const option = document.createElement('option');
    option.value = chat.id;
    option.textContent = chat.title;
    option.selected = chat.id === activeId;
    select.appendChild(option);
  }
}

function autoTitle(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > 38 ? `${clean.slice(0, 38)}…` : clean || 'Nouveau chat';
}

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
}

function codeBlock(language, code) {
  const box = document.createElement('div');
  box.className = 'codebox';
  box.innerHTML = `<div class="codehead"><span>${escapeHtml(language || 'code')}</span><button class="copy" type="button">Copy</button></div><pre>${escapeHtml(code)}</pre>`;
  const button = box.querySelector('button');
  button.onclick = async () => {
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Error';
    }
    setTimeout(() => { button.textContent = 'Copy'; }, 1200);
  };
  return box;
}

function answerContent(text) {
  const container = document.createElement('div');
  const regex = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text))) {
    if (match.index > last) {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = inline(text.slice(last, match.index));
      container.appendChild(paragraph);
    }
    container.appendChild(codeBlock(match[1], match[2].replace(/\n$/, '')));
    last = regex.lastIndex;
  }
  if (last < text.length) {
    const paragraph = document.createElement('p');
    paragraph.innerHTML = inline(text.slice(last));
    container.appendChild(paragraph);
  }
  return container;
}

function renderChat() {
  const log = $('chatLog');
  log.innerHTML = `<div class="welcome">${escapeHtml(labels.welcome)}</div>`;
  for (const message of currentChat().messages) {
    const row = document.createElement('div');
    row.className = `message ${message.role}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (message.role === 'assistant') {
      bubble.appendChild(answerContent(message.content));
    } else {
      bubble.textContent = message.content;
      if (message.files?.length) {
        const files = document.createElement('div');
        files.className = 'attached';
        files.textContent = `📎 ${message.files.join(', ')}`;
        bubble.appendChild(files);
      }
    }
    row.appendChild(bubble);
    log.appendChild(row);
  }
  $('chatView').scrollTop = $('chatView').scrollHeight;
}

function renderPythonHistory() {
  const output = $('pyHistory');
  output.innerHTML = '';
  for (const message of currentChat().messages) {
    const record = document.createElement('div');
    record.className = 'py-record';
    if (message.role === 'user') {
      record.innerHTML = `<div class="py-record-title">question</div><pre>${escapeHtml(message.content)}</pre>`;
    } else {
      record.innerHTML = `<div class="py-record-title">output</div><pre>${escapeHtml(message.content)}</pre>`;
    }
    output.appendChild(record);
  }
  $('pythonView').scrollTop = $('pythonView').scrollHeight;
}

function render() {
  renderSelect();
  renderChat();
  renderPythonHistory();
}

function setMode(nextMode) {
  mode = nextMode;
  localStorage.setItem(KEYS.mode, nextMode);
  $('chatTab').classList.toggle('active', nextMode === 'chat');
  $('pythonTab').classList.toggle('active', nextMode === 'python');
  $('chatView').classList.toggle('hidden', nextMode !== 'chat');
  $('pythonView').classList.toggle('hidden', nextMode !== 'python');
  $('chatForm').classList.toggle('hidden', nextMode !== 'chat');
}

function createNewChat() {
  const chat = freshChat();
  chats.unshift(chat);
  activeId = chat.id;
  history = [];
  saveChats();
  render();
}

function renameCurrentChat() {
  const chat = currentChat();
  const newName = prompt('Nouveau nom :', chat.title);
  if (newName && newName.trim()) {
    chat.title = newName.trim().slice(0, 48);
    chat.updatedAt = Date.now();
    saveChats();
  }
}

function deleteCurrentChat() {
  if (!confirm('Supprimer cette conversation ?')) return;
  chats = chats.filter((chat) => chat.id !== activeId);
  if (!chats.length) chats = [freshChat()];
  activeId = chats[0].id;
  history = currentChat().history || [];
  saveChats();
  render();
}

function resetResponse() {
  chats = [freshChat()];
  activeId = chats[0].id;
  history = [];
  attachments = [];
  $('pyEditor').value = DEFAULT_EDITOR;
  renderFiles();
  saveChats();
  render();
  setStatus('Réponse réinitialisée.', 'ok');
}

function extractQuestionFromEditor() {
  const editorText = $('pyEditor').value;
  const match = editorText.match(/question\s*=\s*(["'])([\s\S]*?)\1/);
  return match ? match[2].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'") : '';
}

async function ask(message, visibleMessage = message) {
  if (!message.trim() && attachments.length === 0) {
    setStatus('Écris une question entre les guillemets ou ajoute un fichier.', 'error');
    return;
  }

  const chat = currentChat();
  const files = attachments;
  attachments = [];
  renderFiles();

  if (!chat.messages.some((item) => item.role === 'user')) chat.title = autoTitle(visibleMessage);
  chat.messages.push({ role: 'user', content: visibleMessage, files: files.map((file) => file.name) });
  chat.updatedAt = Date.now();
  saveChats();
  render();

  $('send').disabled = true;
  $('runPython').disabled = true;
  setStatus('Analyse en cours…');

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history,
        attachments: files.map(({ id, previewUrl, ...file }) => file)
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erreur inconnue.');

    chat.messages.push({ role: 'assistant', content: data.reply });
    history.push({ role: 'user', content: visibleMessage }, { role: 'assistant', content: data.reply });
    history = history.slice(-16);
    chat.history = history;
    chat.updatedAt = Date.now();
    saveChats();
    render();
    setStatus('Réponse reçue.', 'ok');
  } catch (error) {
    chat.messages.push({ role: 'assistant', content: `Erreur : ${error.message}` });
    render();
    setStatus(error.message, 'error');
  } finally {
    $('send').disabled = false;
    $('runPython').disabled = false;
  }
}

function extension(filename) {
  return filename.split('.').pop().toLowerCase();
}

function readUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = reject;
    image.src = url;
  });
}

async function prepareImage(file) {
  const image = await loadImage(file);
  const ratio = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * ratio));
  canvas.height = Math.max(1, Math.round(image.height * ratio));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = 0.88;
  let url = canvas.toDataURL('image/jpeg', quality);
  while (url.length > 1000000 && quality > 0.45) {
    quality -= 0.1;
    url = canvas.toDataURL('image/jpeg', quality);
  }
  return { id: makeId(), kind: 'image', name: file.name, mimeType: 'image/jpeg', dataUrl: url, previewUrl: url };
}

async function prepareFile(file) {
  const ext = extension(file.name);
  if (file.type.startsWith('image/')) return prepareImage(file);
  if (file.type === 'application/pdf' || ext === 'pdf') {
    return { id: makeId(), kind: 'pdf', name: file.name, mimeType: 'application/pdf', dataUrl: await readUrl(file) };
  }
  if (TEXT_EXTENSIONS.has(ext) || file.type.startsWith('text/')) {
    return { id: makeId(), kind: 'text', name: file.name, mimeType: file.type || 'text/plain', text: (await file.text()).slice(0, 12000) };
  }
  throw new Error(`Format non pris en charge : ${file.name}`);
}

async function addFiles(fileList) {
  for (const file of [...fileList]) {
    if (attachments.length >= MAX_FILES) return setStatus(`Maximum ${MAX_FILES} fichiers.`, 'error');
    if (file.type.startsWith('image/') && attachments.filter((item) => item.kind === 'image').length >= MAX_IMAGES) {
      return setStatus(`Maximum ${MAX_IMAGES} images.`, 'error');
    }
    try {
      attachments.push(await prepareFile(file));
      renderFiles();
      setStatus('Fichier ajouté.', 'ok');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }
}

function renderFiles() {
  const container = $('chips');
  container.innerHTML = '';
  for (const attachment of attachments) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    if (attachment.previewUrl) chip.innerHTML = `<img src="${attachment.previewUrl}" alt="">`;
    chip.innerHTML += `<span>${escapeHtml(attachment.name)}</span><button type="button">×</button>`;
    chip.querySelector('button').onclick = () => {
      attachments = attachments.filter((item) => item.id !== attachment.id);
      renderFiles();
    };
    container.appendChild(chip);
  }
}

function applyLabels() {
  $('brand').textContent = labels.brand;
  $('question').placeholder = labels.questionPlaceholder;
  $('send').textContent = labels.send;
  $('fileTitle').textContent = labels.fileTitle;
  $('dropText').textContent = labels.dropText;
  $('newChat').textContent = `＋ ${labels.newChat}`;
  $('renameChat').textContent = `✎ ${labels.rename}`;
  $('deleteChat').textContent = `× ${labels.deleteChat}`;
  $('chatTab').textContent = labels.chatTab;
  $('pythonTab').textContent = labels.pythonTab;
  $('optionsTab').textContent = labels.optionsTab;
}

function openSettings() {
  const grid = $('settingsGrid');
  grid.innerHTML = '';
  for (const [key, title] of LABEL_FIELDS) {
    const field = document.createElement('div');
    field.className = 'field';
    field.innerHTML = `<label>${escapeHtml(title)}</label><input data-label="${key}">`;
    field.querySelector('input').value = labels[key];
    grid.appendChild(field);
  }
  $('settingsModal').classList.add('open');
}

function saveLabels() {
  for (const input of document.querySelectorAll('[data-label]')) {
    labels[input.dataset.label] = input.value.trim() || DEFAULTS[input.dataset.label];
  }
  localStorage.setItem(KEYS.labels, JSON.stringify(labels));
  $('settingsModal').classList.remove('open');
  applyLabels();
  render();
}

$('chatTab').onclick = () => setMode('chat');
$('pythonTab').onclick = () => setMode('python');
$('optionsTab').onclick = () => $('drawer').classList.toggle('hidden');
$('closeDrawer').onclick = () => $('drawer').classList.add('hidden');
$('newChat').onclick = createNewChat;
$('renameChat').onclick = renameCurrentChat;
$('deleteChat').onclick = deleteCurrentChat;
$('theme').onclick = () => {
  document.body.classList.toggle('dark');
  localStorage.setItem(KEYS.theme, document.body.classList.contains('dark') ? 'dark' : 'light');
};
$('textSettings').onclick = openSettings;
$('closeSettings').onclick = () => $('settingsModal').classList.remove('open');
$('saveLabels').onclick = saveLabels;
$('resetLabels').onclick = () => {
  labels = { ...DEFAULTS };
  localStorage.removeItem(KEYS.labels);
  openSettings();
};
$('chatSelect').onchange = (event) => {
  activeId = event.target.value;
  history = currentChat().history || [];
  saveChats();
  render();
};
$('chatForm').onsubmit = (event) => {
  event.preventDefault();
  const question = $('question').value.trim();
  $('question').value = '';
  ask(question, question);
};
$('runPython').onclick = () => {
  const question = extractQuestionFromEditor();
  ask(question, question || 'Analyse la question saisie.');
};
$('resetResponse').onclick = resetResponse;
$('browse').onclick = () => $('fileInput').click();
$('drop').onclick = () => $('fileInput').click();
$('fileInput').onchange = (event) => addFiles(event.target.files);
$('drop').ondragover = (event) => { event.preventDefault(); $('drop').classList.add('drag'); };
$('drop').ondragleave = () => $('drop').classList.remove('drag');
$('drop').ondrop = (event) => { event.preventDefault(); $('drop').classList.remove('drag'); addFiles(event.dataTransfer.files); };
window.onpaste = (event) => {
  const images = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith('image/'));
  if (images.length) {
    event.preventDefault();
    addFiles(images);
  }
};

loadChats();
if (localStorage.getItem(KEYS.theme) === 'dark') document.body.classList.add('dark');
applyLabels();
setMode(mode);
renderFiles();
render();
