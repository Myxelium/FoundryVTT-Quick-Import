/**
 * Myxeliums Battlemap Importer - Main Entry Point
 * 
 * This module provides a streamlined way to import battlemaps into Foundry VTT.
 * It adds a "Quick import" button to the Scenes sidebar that opens a drag-and-drop
 * panel for creating scenes from images/videos and optional JSON configuration files.
 * 
 * @module MyxeliumsBattlemap
 * @author Myxelium
 * @license MIT
 */

import { SceneImportController } from './lib/scene-import-controller.js';

/** @type {SceneImportController|null} Singleton instance of the import controller */
let sceneImportController = null;

/**
 * Module identifier used for logging and namespacing
 * @constant {string}
 */
const MODULE_ID = 'Myxeliums Battlemap Importer';

/**
 * CSS class name for the quick import button to prevent duplicate insertion
 * @constant {string}
 */
const QUICK_IMPORT_BUTTON_CLASS = 'myxeliums-battlemap-quick-import';

/**
 * Initialize the module when Foundry is ready.
 * Sets up the import controller and registers necessary handlers.
 */
Hooks.once('init', async function () {
    console.log(`${MODULE_ID} | Initializing module`);
});

/**
 * Complete module setup after Foundry is fully loaded.
 * Creates the controller instance and displays a ready notification.
 */
Hooks.once('ready', async function () {
    console.log(`${MODULE_ID} | Module ready`);

    sceneImportController = new SceneImportController();
    sceneImportController.initialize();

    ui.notifications.info(game.i18n.localize("QUICKBATTLEMAP.Ready"));
});

/**
 * Add the "Quick import" button to the Scenes directory header.
 * This hook fires whenever the SceneDirectory is rendered.
 * 
 * @param {Application} _app - The SceneDirectory application instance (unused)
 * @param {jQuery|HTMLElement} html - The rendered HTML element
 */
Hooks.on('renderSceneDirectory', (_app, html) => {
    // Only GMs can use the quick import feature
    if (!game.user?.isGM) {
        return;
    }

    // Handle different HTML element formats across Foundry versions
    const rootElement = html?.[0] || html?.element || html;
    
    if (!(rootElement instanceof HTMLElement)) {
        return;
    }

    // Prevent adding duplicate buttons
    const existingButton = rootElement.querySelector(`button.${QUICK_IMPORT_BUTTON_CLASS}`);
    if (existingButton) {
        return;
    }

    // Find a suitable container for the button
    const buttonContainer = findButtonContainer(rootElement);
    if (!buttonContainer) {
        return;
    }

    // Create and append the quick import button
    const quickImportButton = createQuickImportButton();
    buttonContainer.appendChild(quickImportButton);
});

/**
 * Find a suitable container element for the quick import button.
 * Tries multiple selectors for compatibility across Foundry versions.
 * 
 * @param {HTMLElement} rootElement - The root element to search within
 * @returns {HTMLElement|null} The container element or null if not found
 */
function findButtonContainer(rootElement) {
    const containerSelectors = [
        '.header-actions',
        '.action-buttons',
        '.directory-header'
    ];

    for (const selector of containerSelectors) {
        const container = rootElement.querySelector(selector);
        if (container) {
            return container;
        }
    }

    return null;
}

/**
 * Create the quick import button element with icon and click handler.
 * 
 * @returns {HTMLButtonElement} The configured button element
 */
function createQuickImportButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = QUICK_IMPORT_BUTTON_CLASS;
    button.innerHTML = '<i class="fas fa-map"></i> <span>Quick import</span>';
    
    button.addEventListener('click', handleQuickImportClick);

    return button;
}

/**
 * Handle click events on the quick import button.
 * Creates the controller if needed and shows the import panel.
 */
function handleQuickImportClick() {
    if (!sceneImportController) {
        sceneImportController = new SceneImportController();
        sceneImportController.initialize();
    }
    
    sceneImportController.showImportPanel();
}
