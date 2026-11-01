/* Ícone de downloads na navegação do Termo, exclusivo para visitantes Windows. */
(() => {
  'use strict';
  const KNOWN_RELEASE = {installer:{url:'https://github.com/GabrielKLBr/Termo/releases/download/v1.0.0/Termo-Setup-1.0.0-x64.exe',size:121690298},portable:{url:'https://github.com/GabrielKLBr/Termo/releases/download/v1.0.0/TermoWindows.zip',size:157662885}};
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  if (!(/windows/i.test(platform) || /Win32|Win64/i.test(platform) || /Windows NT/i.test(navigator.userAgent || ''))) return;

  function init() {
    const nav = document.querySelector('wc-bar')?.shadowRoot;
    const info = nav?.getElementById('about');
    if (!info || nav.getElementById('download-windows')) return;

    const btn = document.createElement('a');
    btn.id = 'download-windows';
    btn.href = '#baixar-windows';
    btn.setAttribute('aria-label', 'Baixar Termo para Windows');
    btn.title = 'Baixar Termo para Windows';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3"/></svg>';
    const style = document.createElement('style');
    style.textContent = `#download-windows{box-sizing:border-box;min-width:4.6vh;width:4.6vh;flex:0 0 4.6vh;height:4vh;padding:0;margin:0;border-radius:8px;color:#fafaff;display:flex;align-items:center;justify-content:center;transition:background-color .2s ease,opacity .2s ease}#download-windows:hover,#download-windows:focus-visible{background:rgba(255,255,255,.15)}#download-windows:focus-visible{outline:2px solid #fafaff;outline-offset:-2px}#download-windows svg{width:2.7vh;height:2.7vh;min-width:21px;min-height:21px}`;
    nav.appendChild(style);
    info.before(btn);

    const dialog = document.createElement('dialog');
    dialog.id = 'windows-download-dialog';
    dialog.setAttribute('aria-label', 'Baixar Termo para Windows');
    dialog.innerHTML = `<div class="windows-download-heading"><h2>Baixar Termo</h2><button class="windows-download-close" type="button" aria-label="Fechar janela">×</button></div>
      <p class="windows-download-intro">Escolha uma versão para Windows 64 bits.</p>
      <div class="windows-download-options">
        <a class="windows-download-option is-disabled" id="download-installer" aria-disabled="true">
          <span class="windows-download-option-icon">↓</span><span class="windows-download-option-copy"><strong>Instalador (.exe)</strong><small>Instala o jogo no Windows · 116 MiB</small></span><span class="windows-download-option-state">Ainda não disponível</span>
        </a>
        <a class="windows-download-option is-disabled" id="download-portable" aria-disabled="true">
          <span class="windows-download-option-icon">▣</span><span class="windows-download-option-copy"><strong>Versão portátil (.zip)</strong><small>Extrair e executar, sem instalar · 150 MiB</small></span><span class="windows-download-option-state">Ainda não disponível</span>
        </a>
      </div>
      <p id="windows-download-status" role="status" aria-live="polite">Verificando arquivos...</p>
      <p class="windows-download-note">Os downloads são arquivos executáveis para Windows. Baixe apenas se você confia na origem.</p>`;
    document.body.appendChild(dialog);

    btn.addEventListener('click', e => { e.preventDefault(); if (!dialog.open) dialog.showModal(); refresh(dialog); });
    dialog.querySelector('.windows-download-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.querySelectorAll('.windows-download-option').forEach(a => {
      a.addEventListener('click', e => {
        if (!a.href || a.getAttribute('aria-disabled') === 'true') e.preventDefault();
      });
    });
  }

  function updateOption(dialog, id, file) {
    const link = dialog.querySelector('#' + id);
    const available = !!(file && typeof file.url === 'string' && /^https:\/\//.test(file.url));
    link.classList.toggle('is-disabled', !available);
    link.setAttribute('aria-disabled', String(!available));
    if (available) {
      link.href = file.url;
      link.rel = 'noopener noreferrer';
      link.querySelector('.windows-download-option-state').textContent = 'Baixar';
    } else {
      link.removeAttribute('href');
      link.querySelector('.windows-download-option-state').textContent = 'Ainda não disponível';
    }
    return available;
  }

  async function refresh(dialog) {
    const status = dialog.querySelector('#windows-download-status');
    updateOption(dialog, 'download-installer', KNOWN_RELEASE.installer);
    updateOption(dialog, 'download-portable', KNOWN_RELEASE.portable);
    status.textContent = 'Escolha a versão desejada.';
    try {
      const response = await fetch('/api/downloads?t=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!dialog.open) return;
      const installer = updateOption(dialog, 'download-installer', data.installer || KNOWN_RELEASE.installer);
      const portable = updateOption(dialog, 'download-portable', data.portable || KNOWN_RELEASE.portable);
      status.textContent = installer && portable ? 'Escolha a versão que preferir.' :
        installer || portable ? 'Uma das versões ainda está sendo disponibilizada.' :
        'Os arquivos para Windows ainda não foram enviados ao servidor.';
    } catch (err) {
      if (!dialog.open) return;
      status.textContent = 'Downloads disponíveis pela release oficial no GitHub.';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
