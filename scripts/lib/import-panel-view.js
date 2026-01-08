/**
 * Import Panel View
 * 
 * Manages the drag-and-drop UI panel for the battlemap import workflow.
 * Handles panel creation, visibility, status updates, and user interactions.
 * This is a pure view component - it only manages DOM and emits events.
 * 
 * @module ImportPanelView
 */

/**
 * @typedef {Object} PanelCallbacks
 * @property {Function} onCreateSceneRequested - Called when user clicks "Create Scene"
 * @property {Function} onResetRequested - Called when user clicks "Reset"
 * @property {Function} onCloseRequested - Called when user clicks close button
 * @property {Function} onFilesDropped - Called when files are dropped on the panel
 * @property {Function} onNoGridPreferenceChanged - Called when no-grid checkbox changes
 */

/** CSS selectors for frequently accessed elements */
const PANEL_SELECTORS = {
    PANEL_ROOT: '#quick-battlemap-drop-area',
    CREATE_BUTTON: '.create-scene-button',
    RESET_BUTTON: '.reset-button',
    CLOSE_BUTTON: '.header-button.close',
    NO_GRID_CHECKBOX: 'input.ebm-no-grid',
    BACKGROUND_STATUS: '.background-status .status-value',
    WALL_DATA_STATUS: '.wall-data-status .status-value',
    PROGRESS_GROUP: '.progress-group',
    PROGRESS_TEXT: '.ebm-progress-text',
    FLOOR_LIST: '.qbi-floor-list',
    FLOOR_ITEM: '.qbi-floor-item',
    FILE_MATCH_DIALOG: '.qbi-file-match-dialog',
    UNMATCHED_FILES: '.qbi-unmatched-files'
};

/** LocalStorage key for persisting no-grid preference */
const NO_GRID_STORAGE_KEY = 'quick-battlemap:no-grid';

/**
 * View class that manages the import panel DOM and user interactions.
 * Follows a callback pattern for communicating events to the controller.
 */
export class ImportPanelView {
    constructor() {
        /** @type {boolean} Whether the panel DOM has been created */
        this.isPanelCreated = false;

        /** @type {boolean} Whether the panel is currently visible */
        this.isCurrentlyVisible = false;

        /** @type {boolean} Whether a background operation is in progress */
        this.isShowingBusyState = false;

        // Event callbacks - set by the controller
        /** @type {Function|null} */
        this.onCreateSceneRequested = null;
        /** @type {Function|null} */
        this.onResetRequested = null;
        /** @type {Function|null} */
        this.onCloseRequested = null;
        /** @type {Function|null} */
        this.onFilesDropped = null;
        /** @type {Function|null} */
        this.onNoGridPreferenceChanged = null;
        /** @type {Function|null} */
        this.onFloorOrderChanged = null;
        /** @type {Function|null} */
        this.onFloorRemoved = null;
        /** @type {Function|null} */
        this.onFileMatchConfirmed = null;
        /** @type {Function|null} */
        this.onFileMatchRequested = null;
    }

    /**
     * Ensure the panel DOM structure exists.
     * Creates the panel if it doesn't exist, removes duplicates if found.
     */
    ensureCreated() {
        if (this.isPanelCreated) {
            return;
        }

        // Remove any existing panel to prevent duplicates
        const existingPanel = document.getElementById('quick-battlemap-drop-area');
        if (existingPanel) {
            existingPanel.remove();
        }

        // Create and insert the panel HTML
        const panelHtml = this.buildPanelHtml();
        document.body.insertAdjacentHTML('beforeend', panelHtml);

        // Set up event listeners
        this.attachButtonEventListeners();
        this.attachNoGridCheckboxListener();
        this.attachDragHandlers();
        this.attachDropZoneHandlers();

        this.isPanelCreated = true;
    }

    /**
     * Build the complete HTML structure for the import panel.
     * Uses custom styling for a clean, modern look.
     * 
     * @returns {string} The complete panel HTML
     */
    buildPanelHtml() {
        const i18n = (key) => game.i18n.localize(key);
        const isLevelsActive = game.modules.get('levels')?.active ?? false;

        // Build floor section HTML only if Levels module is active
        const floorSectionHtml = isLevelsActive ? `
                    <div class="qbi-floor-section">
                        <div class="qbi-floor-header">
                            <span class="qbi-floor-title">
                                <i class="fas fa-layer-group"></i>
                                ${i18n('QUICKBATTLEMAP.FloorsTitle')}
                            </span>
                            <span class="qbi-floor-count">0 ${i18n('QUICKBATTLEMAP.FloorsCount')}</span>
                        </div>
                        <div class="qbi-floor-list" id="floorList">
                            <div class="qbi-floor-empty">
                                <i class="fas fa-info-circle"></i>
                                <span>${i18n('QUICKBATTLEMAP.FloorsEmpty')}</span>
                            </div>
                        </div>
                        <div class="qbi-unmatched-files" id="unmatchedFiles" style="display: none;">
                            <div class="qbi-unmatched-header">
                                <i class="fas fa-exclamation-triangle"></i>
                                <span>${i18n('QUICKBATTLEMAP.UnmatchedFiles')}</span>
                            </div>
                            <div class="qbi-unmatched-list"></div>
                        </div>
                    </div>
        ` : '';

        return `
        <div id="quick-battlemap-drop-area" class="qbi-panel">
            <header class="qbi-header">
                <div class="qbi-header-title">
                    <i class="fas fa-map qbi-header-icon"></i>
                    <h4>${i18n('QUICKBATTLEMAP.DropAreaTitle')}</h4>
                </div>
                <button class="qbi-close-btn header-button close" type="button" aria-label="Close">
                    <i class="fas fa-times"></i>
                </button>
            </header>
            
            <section class="qbi-content">
                <form autocomplete="off">
                    <p class="qbi-instructions">${i18n('QUICKBATTLEMAP.DropInstructions')}</p>
                    
                    <div class="qbi-dropzone" id="dropZone">
                        <div class="qbi-dropzone-inner">
                            <i class="fas fa-cloud-upload-alt qbi-dropzone-icon"></i>
                            <span class="qbi-dropzone-text">Drop files here</span>
                            <span class="qbi-dropzone-hint">Images & JSON supported</span>
                        </div>
                    </div>
                    
                    <p class="qbi-instructions qbi-instructions-secondary">${i18n('QUICKBATTLEMAP.DropInstructionsMore')}</p>
                    ${floorSectionHtml}
                    <div class="qbi-status-grid">
                        <div class="qbi-status-item">
                            <div class="qbi-status-indicator background-status">
                                <span class="status-value qbi-status-icon" data-status="pending">❌</span>
                            </div>
                            <span class="qbi-status-label">${i18n('QUICKBATTLEMAP.BackgroundStatus')}</span>
                        </div>
                        <div class="qbi-status-item">
                            <div class="qbi-status-indicator wall-data-status">
                                <span class="status-value qbi-status-icon" data-status="pending">❌</span>
                            </div>
                            <span class="qbi-status-label">${i18n('QUICKBATTLEMAP.WallDataStatus')}</span>
                        </div>
                    </div>
                    
                    <div class="qbi-options">
                        <label class="qbi-checkbox">
                            <input type="checkbox" class="ebm-no-grid qbi-checkbox-input" />
                            <span class="qbi-checkbox-mark"></span>
                            <span class="qbi-checkbox-label">${i18n('QUICKBATTLEMAP.NoGridLabel')}</span>
                        </label>
                    </div>
                    
                    <div class="qbi-progress progress-group">
                        <div class="qbi-progress-content">
                            <div class="qbi-spinner">
                                <i class="fas fa-circle-notch fa-spin"></i>
                            </div>
                            <div class="qbi-progress-info">
                                <span class="ebm-progress-text qbi-progress-text">${i18n('QUICKBATTLEMAP.ProgressIdle')}</span>
                                <span class="qbi-progress-note">${i18n('QUICKBATTLEMAP.ProgressNote')}</span>
                            </div>
                        </div>
                    </div>
                    
                    <footer class="qbi-footer">
                        <button type="button" class="qbi-btn qbi-btn-secondary reset-button">
                            <i class="fas fa-undo"></i>
                            <span>${i18n('QUICKBATTLEMAP.Reset')}</span>
                        </button>
                        <button type="button" class="qbi-btn qbi-btn-primary create-scene-button" disabled>
                            <i class="fas fa-plus-circle"></i>
                            <span>${i18n('QUICKBATTLEMAP.CreateScene')}</span>
                        </button>
                    </footer>
                </form>
            </section>
        </div>`;
    }

    /**
     * Attach click event listeners to the panel's action buttons.
     */
    attachButtonEventListeners() {
        const panel = this.getPanelElement();
        if (!panel) return;

        const createButton = panel.querySelector(PANEL_SELECTORS.CREATE_BUTTON);
        const resetButton = panel.querySelector(PANEL_SELECTORS.RESET_BUTTON);
        const closeButton = panel.querySelector(PANEL_SELECTORS.CLOSE_BUTTON);
        
        createButton?.addEventListener('click', () => {
            this.onCreateSceneRequested?.();
        });

        resetButton?.addEventListener('click', () => {
            this.onResetRequested?.();
        });

        closeButton?.addEventListener('click', () => {
            this.onCloseRequested?.();
        });
    }

    /**
     * Attach change listener to the no-grid checkbox.
     * Loads and applies the persisted preference.
     */
    attachNoGridCheckboxListener() {
        const panel = this.getPanelElement();
        if (!panel) return;

        // Load persisted preference
        const persistedValue = this.loadNoGridPreference();
        const checkbox = panel.querySelector(PANEL_SELECTORS.NO_GRID_CHECKBOX);

        if (checkbox) {
            checkbox.checked = persistedValue;

            checkbox.addEventListener('change', (event) => {
                const isChecked = !!event.currentTarget.checked;
                this.saveNoGridPreference(isChecked);
                this.onNoGridPreferenceChanged?.(isChecked);
            });
        }
    }

    /**
     * Attach drag event handlers to make the panel header draggable.
     */
    attachDragHandlers() {
        const panel = this.getPanelElement();
        const header = panel?.querySelector('header');
        
        if (!panel || !header) return;

        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let panelStartLeft = 0;
        let panelStartTop = 0;

        const handleMouseMove = (event) => {
            if (!isDragging) return;

            const deltaX = event.clientX - dragStartX;
            const deltaY = event.clientY - dragStartY;

            // Keep panel within viewport bounds
            const newLeft = Math.max(0, panelStartLeft + deltaX);
            const newTop = Math.max(0, panelStartTop + deltaY);

            panel.style.left = `${newLeft}px`;
            panel.style.top = `${newTop}px`;
        };

        const handleMouseUp = () => {
            isDragging = false;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        header.addEventListener('mousedown', (event) => {
            // Only respond to left mouse button
            if (event.button !== 0) return;

            isDragging = true;

            const panelRect = panel.getBoundingClientRect();
            dragStartX = event.clientX;
            dragStartY = event.clientY;
            panelStartLeft = panelRect.left + window.scrollX;
            panelStartTop = panelRect.top + window.scrollY;

            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        });
    }

    /**
     * Attach drag-and-drop event handlers to the drop zone.
     */
    attachDropZoneHandlers() {
        const dropArea = this.getPanelElement();
        if (!dropArea) return;

        // Prevent default browser behavior for all drag events
        const preventDefaults = (event) => {
            event.preventDefault();
            event.stopPropagation();
        };

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, preventDefaults, false);
        });

        // Add visual highlight during drag
        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => {
                dropArea.classList.add('highlight');
            }, false);
        });

        // Remove highlight when drag ends
        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => {
                dropArea.classList.remove('highlight');
            }, false);
        });

        // Forward drop events to callback
        dropArea.addEventListener('drop', (event) => {
            this.onFilesDropped?.(event);
        }, false);
    }

    /**
     * Load the no-grid preference from localStorage.
     * @returns {boolean} Whether no-grid mode is enabled
     */
    loadNoGridPreference() {
        try {
            return localStorage.getItem(NO_GRID_STORAGE_KEY) === 'true';
        } catch (_error) {
            return false;
        }
    }

    /**
     * Save the no-grid preference to localStorage.
     * @param {boolean} isEnabled - Whether no-grid mode is enabled
     */
    saveNoGridPreference(isEnabled) {
        try {
            localStorage.setItem(NO_GRID_STORAGE_KEY, String(isEnabled));
        } catch (_error) {
            // localStorage may not be available
        }
    }

    /**
     * Get the panel's root DOM element.
     * @returns {HTMLElement|null} The panel element
     */
    getPanelElement() {
        return document.getElementById('quick-battlemap-drop-area');
    }

    /**
     * Show the import panel.
     */
    show() {
        this.ensureCreated();
        const panel = this.getPanelElement();
        
        if (panel) {
            panel.style.display = 'block';
            this.isCurrentlyVisible = true;
        }
    }

    /**
     * Hide the import panel.
     */
    hide() {
        const panel = this.getPanelElement();
        
        if (panel) {
            panel.style.display = 'none';
            this.isCurrentlyVisible = false;
        }
    }

    /**
     * Enable or disable the Create Scene button.
     * @param {boolean} isEnabled - Whether the button should be enabled
     */
    setCreateButtonEnabled(isEnabled) {
        const button = document.querySelector(PANEL_SELECTORS.CREATE_BUTTON);
        if (button) {
            button.disabled = !isEnabled;
        }
    }

    /**
     * Update the background media status indicator.
     * @param {boolean} isLoaded - Whether background media is loaded
     * @param {string} tooltipText - Tooltip text (usually the filename)
     */
    updateBackgroundMediaStatus(isLoaded, tooltipText) {
        const statusElement = document.querySelector(PANEL_SELECTORS.BACKGROUND_STATUS);
        
        if (statusElement) {
            statusElement.textContent = isLoaded ? '✅' : '❌';
            statusElement.title = tooltipText || '';
            statusElement.dataset.status = isLoaded ? 'complete' : 'pending';
        }
    }

    /**
     * Update the wall/grid data status indicator.
     * @param {boolean} isLoaded - Whether wall data is loaded
     * @param {string} tooltipText - Tooltip text (usually the filename or "Auto-detected")
     */
    updateWallDataStatus(isLoaded, tooltipText) {
        const statusElement = document.querySelector(PANEL_SELECTORS.WALL_DATA_STATUS);
        
        if (statusElement) {
            statusElement.textContent = isLoaded ? '✅' : '❌';
            statusElement.title = tooltipText || '';
            statusElement.dataset.status = isLoaded ? 'complete' : 'pending';
        }
    }

    /**
     * Show the progress/busy indicator with a message.
     * @param {string} statusMessage - Message to display
     */
    showBusyState(statusMessage) {
        const progressGroup = document.querySelector(`${PANEL_SELECTORS.PANEL_ROOT} ${PANEL_SELECTORS.PROGRESS_GROUP}`);
        const progressText = document.querySelector(`${PANEL_SELECTORS.PANEL_ROOT} ${PANEL_SELECTORS.PROGRESS_TEXT}`);

        if (progressGroup) {
            progressGroup.style.display = '';
        }

        if (progressText && statusMessage) {
            progressText.textContent = statusMessage;
        }

        this.isShowingBusyState = true;
    }

    /**
     * Hide the progress/busy indicator.
     */
    clearBusyState() {
        const progressGroup = document.querySelector(`${PANEL_SELECTORS.PANEL_ROOT} ${PANEL_SELECTORS.PROGRESS_GROUP}`);
        const progressText = document.querySelector(`${PANEL_SELECTORS.PANEL_ROOT} ${PANEL_SELECTORS.PROGRESS_TEXT}`);
        
        if (progressGroup) {
            progressGroup.style.display = 'none';
        }

        if (progressText) {
            progressText.textContent = game.i18n.localize('QUICKBATTLEMAP.ProgressIdle');
        }

        this.isShowingBusyState = false;
    }

    /**
     * Reset all status indicators to their default (empty) state.
     * @param {boolean} persistedNoGridValue - Whether to check the no-grid checkbox
     */
    resetAllStatuses(persistedNoGridValue) {
        this.updateBackgroundMediaStatus(false, '');
        this.updateWallDataStatus(false, '');
        this.setCreateButtonEnabled(false);

        // Hide and reset progress indicator
        const progressGroup = document.querySelector(`${PANEL_SELECTORS.PANEL_ROOT} ${PANEL_SELECTORS.PROGRESS_GROUP}`);
        const progressText = document.querySelector(`${PANEL_SELECTORS.PANEL_ROOT} ${PANEL_SELECTORS.PROGRESS_TEXT}`);

        if (progressGroup) {
            progressGroup.style.display = 'none';
        }

        if (progressText) {
            progressText.textContent = game.i18n.localize('QUICKBATTLEMAP.ProgressIdle');
        }

        // Restore no-grid checkbox to persisted value
        const noGridCheckbox = document.querySelector(`${PANEL_SELECTORS.PANEL_ROOT} ${PANEL_SELECTORS.NO_GRID_CHECKBOX}`);
        if (noGridCheckbox) {
            noGridCheckbox.checked = !!persistedNoGridValue;
        }
    }

    /**
     * Get the current state of the no-grid checkbox.
     * @returns {boolean} Whether no-grid mode is selected
     */
    getNoGridCheckboxState() {
        const checkbox = document.querySelector(`${PANEL_SELECTORS.PANEL_ROOT} ${PANEL_SELECTORS.NO_GRID_CHECKBOX}`);
        return !!checkbox?.checked;
    }

    /**
     * Set the state of the no-grid checkbox.
     * @param {boolean} isChecked - Whether the checkbox should be checked
     */
    setNoGridCheckboxState(isChecked) {
        const checkbox = document.querySelector(`${PANEL_SELECTORS.PANEL_ROOT} ${PANEL_SELECTORS.NO_GRID_CHECKBOX}`);
        if (checkbox) {
            checkbox.checked = !!isChecked;
        }
    }

    /**
     * Render the floor list from the provided floors data.
     * @param {Array} floors - Array of floor objects with id, name, mediaFile, jsonFile
     */
    renderFloorList(floors) {
        const floorList = document.querySelector(PANEL_SELECTORS.FLOOR_LIST);
        const floorCount = document.querySelector('.qbi-floor-count');
        const i18n = (key) => game.i18n.localize(key);
        
        if (!floorList) return;

        // Update floor count
        if (floorCount) {
            floorCount.textContent = `${floors.length} ${i18n('QUICKBATTLEMAP.FloorsCount')}`;
        }

        // Show empty state if no floors
        if (floors.length === 0) {
            floorList.innerHTML = `
                <div class="qbi-floor-empty">
                    <i class="fas fa-info-circle"></i>
                    <span>${i18n('QUICKBATTLEMAP.FloorsEmpty')}</span>
                </div>`;
            return;
        }

        // Render floor items
        floorList.innerHTML = floors.map((floor, index) => `
            <div class="qbi-floor-item" data-floor-id="${floor.id}" draggable="true">
                <div class="qbi-floor-drag-handle">
                    <i class="fas fa-grip-vertical"></i>
                </div>
                <div class="qbi-floor-info">
                    <div class="qbi-floor-name">
                        <span class="qbi-floor-level">${i18n('QUICKBATTLEMAP.FloorLevel')} ${index + 1}</span>
                        <span class="qbi-floor-filename" title="${floor.mediaFile?.name || ''}">${this.truncateFilename(floor.mediaFile?.name || i18n('QUICKBATTLEMAP.NoMedia'))}</span>
                    </div>
                    <div class="qbi-floor-json ${floor.jsonFile ? 'has-json' : 'no-json'}">
                        <i class="fas ${floor.jsonFile ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                        <span>${floor.jsonFile ? this.truncateFilename(floor.jsonFile.name) : i18n('QUICKBATTLEMAP.NoJson')}</span>
                    </div>
                </div>
                <div class="qbi-floor-actions">
                    <button type="button" class="qbi-floor-btn qbi-floor-move-up" title="${i18n('QUICKBATTLEMAP.MoveUp')}" ${index === 0 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-up"></i>
                    </button>
                    <button type="button" class="qbi-floor-btn qbi-floor-move-down" title="${i18n('QUICKBATTLEMAP.MoveDown')}" ${index === floors.length - 1 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-down"></i>
                    </button>
                    <button type="button" class="qbi-floor-btn qbi-floor-remove" title="${i18n('QUICKBATTLEMAP.RemoveFloor')}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `).join('');

        // Attach event listeners to floor items
        this.attachFloorItemEventListeners();
    }

    /**
     * Truncate a filename for display.
     * @param {string} filename - The filename to truncate
     * @param {number} maxLength - Maximum length before truncation
     * @returns {string} Truncated filename
     */
    truncateFilename(filename, maxLength = 25) {
        if (!filename || filename.length <= maxLength) return filename;
        const extension = filename.split('.').pop();
        const nameWithoutExt = filename.slice(0, filename.lastIndexOf('.'));
        const truncatedName = nameWithoutExt.slice(0, maxLength - extension.length - 4) + '...';
        return `${truncatedName}.${extension}`;
    }

    /**
     * Attach event listeners to floor item buttons.
     */
    attachFloorItemEventListeners() {
        const floorList = document.querySelector(PANEL_SELECTORS.FLOOR_LIST);
        if (!floorList) return;

        // Move up buttons
        floorList.querySelectorAll('.qbi-floor-move-up').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const floorItem = e.currentTarget.closest(PANEL_SELECTORS.FLOOR_ITEM);
                const floorId = floorItem?.dataset.floorId;
                if (floorId) this.onFloorOrderChanged?.('up', floorId);
            });
        });

        // Move down buttons
        floorList.querySelectorAll('.qbi-floor-move-down').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const floorItem = e.currentTarget.closest(PANEL_SELECTORS.FLOOR_ITEM);
                const floorId = floorItem?.dataset.floorId;
                if (floorId) this.onFloorOrderChanged?.('down', floorId);
            });
        });

        // Remove buttons
        floorList.querySelectorAll('.qbi-floor-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const floorItem = e.currentTarget.closest(PANEL_SELECTORS.FLOOR_ITEM);
                const floorId = floorItem?.dataset.floorId;
                if (floorId) this.onFloorRemoved?.(floorId);
            });
        });

        // Setup drag and drop for reordering
        this.setupFloorDragAndDrop();
    }

    /**
     * Setup drag and drop functionality for floor reordering.
     */
    setupFloorDragAndDrop() {
        const floorList = document.querySelector(PANEL_SELECTORS.FLOOR_LIST);
        if (!floorList) return;

        let draggedItem = null;

        floorList.querySelectorAll(PANEL_SELECTORS.FLOOR_ITEM).forEach(item => {
            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                item.classList.add('qbi-floor-dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            item.addEventListener('dragend', () => {
                if (draggedItem) {
                    draggedItem.classList.remove('qbi-floor-dragging');
                    draggedItem = null;
                }
                floorList.querySelectorAll(PANEL_SELECTORS.FLOOR_ITEM).forEach(i => {
                    i.classList.remove('qbi-floor-drag-over');
                });
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (item !== draggedItem) {
                    item.classList.add('qbi-floor-drag-over');
                }
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('qbi-floor-drag-over');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('qbi-floor-drag-over');
                
                if (draggedItem && item !== draggedItem) {
                    const fromId = draggedItem.dataset.floorId;
                    const toId = item.dataset.floorId;
                    this.onFloorOrderChanged?.('reorder', fromId, toId);
                }
            });
        });
    }

    /**
     * Show unmatched files that need user attention.
     * @param {Array} unmatchedMedia - Array of unmatched media files
     * @param {Array} unmatchedJson - Array of unmatched JSON files
     */
    showUnmatchedFiles(unmatchedMedia, unmatchedJson) {
        const container = document.querySelector(PANEL_SELECTORS.UNMATCHED_FILES);
        const listElement = container?.querySelector('.qbi-unmatched-list');
        const i18n = (key) => game.i18n.localize(key);
        
        if (!container || !listElement) return;

        const hasUnmatched = unmatchedMedia.length > 0 || unmatchedJson.length > 0;
        container.style.display = hasUnmatched ? '' : 'none';

        if (!hasUnmatched) return;

        let html = '';

        if (unmatchedMedia.length > 0) {
            html += `
                <div class="qbi-unmatched-group">
                    <span class="qbi-unmatched-label"><i class="fas fa-image"></i> ${i18n('QUICKBATTLEMAP.UnmatchedMedia')}</span>
                    ${unmatchedMedia.map(file => `
                        <div class="qbi-unmatched-item" data-file-name="${file.name}" data-file-type="media">
                            <span class="qbi-unmatched-name" title="${file.name}">${this.truncateFilename(file.name)}</span>
                            <button type="button" class="qbi-unmatched-assign" title="${i18n('QUICKBATTLEMAP.AssignToFloor')}">
                                <i class="fas fa-link"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>`;
        }

        if (unmatchedJson.length > 0) {
            html += `
                <div class="qbi-unmatched-group">
                    <span class="qbi-unmatched-label"><i class="fas fa-file-code"></i> ${i18n('QUICKBATTLEMAP.UnmatchedJson')}</span>
                    ${unmatchedJson.map(file => `
                        <div class="qbi-unmatched-item" data-file-name="${file.name}" data-file-type="json">
                            <span class="qbi-unmatched-name" title="${file.name}">${this.truncateFilename(file.name)}</span>
                            <button type="button" class="qbi-unmatched-assign" title="${i18n('QUICKBATTLEMAP.AssignToFloor')}">
                                <i class="fas fa-link"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>`;
        }

        listElement.innerHTML = html;

        // Attach click handlers for assign buttons
        listElement.querySelectorAll('.qbi-unmatched-assign').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const item = e.currentTarget.closest('.qbi-unmatched-item');
                const fileName = item?.dataset.fileName;
                const fileType = item?.dataset.fileType;
                if (fileName && fileType) {
                    this.showFileMatchDialog(fileName, fileType);
                }
            });
        });
    }

    /**
     * Hide unmatched files section.
     */
    hideUnmatchedFiles() {
        const container = document.querySelector(PANEL_SELECTORS.UNMATCHED_FILES);
        if (container) {
            container.style.display = 'none';
        }
    }

    /**
     * Show a dialog to match a file to a floor.
     * @param {string} fileName - The file to match
     * @param {string} fileType - 'media' or 'json'
     */
    showFileMatchDialog(fileName, fileType) {
        // This will be handled by the controller opening a proper dialog
        this.onFileMatchRequested?.(fileName, fileType);
    }

    /**
     * Show a dialog for the user to match files to floors.
     * @param {Array} floors - Current floors list
     * @param {string} fileName - File to match
     * @param {string} fileType - 'media' or 'json'
     * @returns {Promise<string|null>} Selected floor ID or null if cancelled
     */
    async promptFloorSelection(floors, fileName, fileType) {
        const i18n = (key) => game.i18n.localize(key);
        
        return new Promise((resolve) => {
            const dialogContent = `
                <div class="qbi-match-dialog-content">
                    <p>${i18n('QUICKBATTLEMAP.SelectFloorFor')} <strong>${fileName}</strong></p>
                    <select class="qbi-floor-select">
                        <option value="">${i18n('QUICKBATTLEMAP.SelectFloor')}</option>
                        ${floors.map((floor, index) => `
                            <option value="${floor.id}">${i18n('QUICKBATTLEMAP.FloorLevel')} ${index + 1} - ${floor.mediaFile?.name || i18n('QUICKBATTLEMAP.NoMedia')}</option>
                        `).join('')}
                        ${fileType === 'media' ? `<option value="__new__">${i18n('QUICKBATTLEMAP.CreateNewFloor')}</option>` : ''}
                    </select>
                </div>
            `;

            new Dialog({
                title: i18n('QUICKBATTLEMAP.MatchFileTitle'),
                content: dialogContent,
                buttons: {
                    confirm: {
                        icon: '<i class="fas fa-check"></i>',
                        label: i18n('QUICKBATTLEMAP.Confirm'),
                        callback: (html) => {
                            const select = html.find('.qbi-floor-select')[0];
                            resolve(select?.value || null);
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: i18n('QUICKBATTLEMAP.Cancel'),
                        callback: () => resolve(null)
                    }
                },
                default: 'confirm'
            }).render(true);
        });
    }

    /**
     * Clear the floor list display.
     */
    clearFloorList() {
        const i18n = (key) => game.i18n.localize(key);
        const floorList = document.querySelector(PANEL_SELECTORS.FLOOR_LIST);
        const floorCount = document.querySelector('.qbi-floor-count');
        
        if (floorList) {
            floorList.innerHTML = `
                <div class="qbi-floor-empty">
                    <i class="fas fa-info-circle"></i>
                    <span>${i18n('QUICKBATTLEMAP.FloorsEmpty')}</span>
                </div>`;
        }
        
        if (floorCount) {
            floorCount.textContent = `0 ${i18n('QUICKBATTLEMAP.FloorsCount')}`;
        }

        this.hideUnmatchedFiles();
    }
}
