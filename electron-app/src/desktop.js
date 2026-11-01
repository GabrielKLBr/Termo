/* UI nativa opcional: quando aberto no navegador, nada é modificado. */
(() => {
  const bridge = window.termoDesktop;
  if (!bridge) return;
  const bar = document.querySelector('wc-bar');
  const header = document.querySelector('wc-header');
  if (!bar || !header) return;

  document.documentElement.classList.add('electron');
  const shell = document.createElement('div');
  shell.className = 'desktop-heading';
  shell.innerHTML = `
    <div class="desktop-drag-area" title="Arraste para mover a janela"></div>
    <div class="desktop-window-controls" role="group" aria-label="Controles da janela">
      <button class="desktop-window-control" data-action="minimize" title="Minimizar" aria-label="Minimizar janela" type="button">
        <img src="./assets/minimzar.svg" alt="" draggable="false">
      </button>
      <button class="desktop-window-control" data-action="maximize" title="Maximizar" aria-label="Maximizar janela" type="button">
        <img src="./assets/maximizar.svg" alt="" draggable="false">
      </button>
      <button class="desktop-window-control" data-action="close" title="Fechar" aria-label="Fechar janela" type="button">
        <img src="./assets/fechar.svg" alt="" draggable="false">
      </button>
    </div>`;
  header.before(shell);
  shell.insertBefore(header, shell.querySelector('.desktop-window-controls'));

  const maximize = shell.querySelector('[data-action="maximize"]');
  function setWindowState(state) {
    const maximized = !!state?.maximized || !!state?.fullScreen;
    maximize.querySelector('img').src = maximized ? './assets/restaurar.svg' : './assets/maximizar.svg';
    maximize.setAttribute('aria-label', maximized ? 'Restaurar janela' : 'Maximizar janela');
    maximize.title = maximized ? 'Restaurar' : 'Maximizar';
    document.documentElement.classList.toggle('window-maximized', maximized);
  }
  shell.querySelectorAll('button[data-action]').forEach(button => {
    button.addEventListener('click', () => bridge.windowAction(button.dataset.action)
      .catch(error => console.error('Não foi possível controlar a janela:', error)));
  });
  bridge.onWindowState(setWindowState);
  bridge.windowState().then(setWindowState).catch(console.error);

  // Os Web Components originais continuam intactos; somente o visual desktop é ajustado.
  function addShadowRules(tag, css) {
    const root = document.querySelector(tag)?.shadowRoot;
    if (!root) return;
    const style = document.createElement('style');
    style.textContent = css;
    root.appendChild(style);
  }
  addShadowRules('wc-bar', `
    :host { width: 100%; max-width: none; min-width: 0; grid-template-columns: minmax(0,1fr) auto; grid-template-rows: 3em; -webkit-app-region: drag; }
    a { -webkit-app-region: no-drag; }
    #left { min-width: 0; width: 100%; overflow-x: auto; scrollbar-width: none; }
    #left::-webkit-scrollbar { display: none; }
    #right { width: auto; flex-shrink: 0; }
    a { box-sizing: border-box; white-space: nowrap; height: 100%; padding: 0 clamp(10px, 1.7vw, 24px); }
  `);
  addShadowRules('wc-header', `
    :host { max-width: 720px; width: 100%; height: 100%; grid-template-columns: 48px 48px minmax(0,1fr) 48px 48px; -webkit-app-region: drag; }
    h1 { height: 100%; line-height: 1; font-size: clamp(25px, 3.8vh, 34px); -webkit-app-region: drag; app-region: drag; }
    button { width: 48px; height: 100%; -webkit-app-region: no-drag; app-region: no-drag; }
    button img, button div { width: 32px; height: 32px; box-sizing: border-box; }
    button:focus-visible { outline: 2px solid #fafaff; outline-offset: -3px; }
  `);

  // O teclado e os botões de jogo mantêm suas próprias regiões clicáveis.
  // Quando o menu abre, o cabeçalho é deslocado naturalmente pelo fluxo flex do body.
})();
