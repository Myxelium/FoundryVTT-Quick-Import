import {
    QuickBattlemapDropHandler
} from './lib/drop-handler.js';

let quickBattlemapDropHandlerInstance = null;

Hooks.once('init', async function () {
    console.log('Quick Battlemap | Initializing Quick Battlemap');
});

Hooks.once('ready', async function () {
    console.log('Quick Battlemap | Ready');

    quickBattlemapDropHandlerInstance = new QuickBattlemapDropHandler();
    quickBattlemapDropHandlerInstance.registerDropHandler();

    ui.notifications.info(game.i18n.localize("QUICKBATTLEMAP.Ready"));
});

Hooks.on('renderSceneDirectory', (_app, html) => {
    if (!game.user?.isGM) 
      return;

    const root = html?.[0] || html?.element || html;
    
    if (!(root instanceof HTMLElement)) 
      return;

    if (root.querySelector('button.quick-battlemap-quick-import')) 
      return;

    const container =
        root.querySelector('.header-actions') ||
        root.querySelector('.action-buttons') ||
        root.querySelector('.directory-header');

    if (!container) 
      return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quick-battlemap-quick-import';
    button.innerHTML = '<i class="fas fa-map"></i> <span>Quick import</span>';
    button.addEventListener('click', () => {
        if (!quickBattlemapDropHandlerInstance) quickBattlemapDropHandlerInstance = new QuickBattlemapDropHandler();
        quickBattlemapDropHandlerInstance.showPanel();
    });

    container.appendChild(button);
});