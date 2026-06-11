(() => {
  function latestAssistantMessage() {
    return [...(currentChat()?.messages || [])]
      .reverse()
      .find((message) => message.role === 'assistant');
  }

  function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const temporary = document.createElement('textarea');
    temporary.value = text;
    temporary.style.position = 'fixed';
    temporary.style.opacity = '0';
    document.body.appendChild(temporary);
    temporary.select();
    document.execCommand('copy');
    temporary.remove();
    return Promise.resolve();
  }

  // Replace the obsolete question/output history renderer with one output panel.
  renderPythonHistory = function renderPythonOutputPanel() {
    const panel = $('programOutput');
    const text = $('programOutputText');
    const latest = latestAssistantMessage();

    if (!panel || !text) return;
    if (!latest) {
      panel.classList.add('hidden');
      text.textContent = '';
      return;
    }

    text.textContent = latest.content;
    panel.classList.remove('hidden');
  };

  $('runPython').onclick = () => {
    const question = extractQuestionFromEditor();
    ask(question, question || 'Analyse les fichiers joints.');
  };

  $('copyProgramOutput').onclick = async () => {
    const button = $('copyProgramOutput');
    const text = $('programOutputText').textContent;
    if (!text) return;

    try {
      await copyText(text);
      button.textContent = 'COPIÉ';
    } catch {
      button.textContent = 'ERREUR';
    }

    setTimeout(() => { button.textContent = 'COPIER'; }, 1200);
  };

  // Rebind uploads after the Python-panel markup change.
  $('browse').onclick = () => $('fileInput').click();
  $('drop').onclick = () => $('fileInput').click();
  $('fileInput').onchange = (event) => {
    addFiles(event.target.files);
    event.target.value = '';
  };
  $('drop').ondragover = (event) => {
    event.preventDefault();
    $('drop').classList.add('drag');
  };
  $('drop').ondragleave = () => $('drop').classList.remove('drag');
  $('drop').ondrop = (event) => {
    event.preventDefault();
    $('drop').classList.remove('drag');
    addFiles(event.dataTransfer.files);
  };

  // Python remains the default view while Chat stays available inside Options.
  setMode('python');
  renderFiles();
  render();
})();