export class QuickBattlemapPanelView {
    constructor() {
        this.isInitialized = false;
        this.isVisible = false;
        this.onCreateScene = null;
        this.onReset = null;
        this.onClose = null;
        this.onDrop = null;
        this.onNoGridChange = null;
        this.isBusy = false;
    }

    ensure() {
        if (this.isInitialized)
            return;

        const existing = document.getElementById('quick-battlemap-drop-area');

        if (existing)
            existing.remove();

        const containerHtml = `
        <div id="quick-battlemap-drop-area" class="app window-app quick-battlemap" style="left:72px; top:80px; z-index:100; display:none; width: 520px; position: absolute;">
            <header class="window-header flexrow draggable">
            <h4 class="window-title">${game.i18n.localize('QUICKBATTLEMAP.DropAreaTitle')}</h4>
            <a class="header-button control close"><i class="fas fa-times"></i>${game.i18n.localize('Close') ?? 'Close'}</a>
            </header>
            <section class="window-content">
            <form class="flexcol" autocomplete="off">
                <p class="notes quick-battlemap-instructions">${game.i18n.localize('QUICKBATTLEMAP.DropInstructions')}</p>
                <div class="area">
                <div id="dropZone">Drop files here</div>
                </div>
                <p class="notes quick-battlemap-instructions">${game.i18n.localize('QUICKBATTLEMAP.DropInstructionsMore')}</p>
                <div class="form-group">
                <label>${game.i18n.localize('QUICKBATTLEMAP.BackgroundStatus')}</label>
                <div class="form-fields">
                    <span class="background-status"><span class="status-value">❌</span></span>
                </div>
                </div>
                <div class="form-group">
                <label>${game.i18n.localize('QUICKBATTLEMAP.WallDataStatus')}</label>
                <div class="form-fields">
                    <span class="wall-data-status"><span class="status-value">❌</span></span>
                </div>
                </div>
                <div class="form-group">
                <label>${game.i18n.localize('QUICKBATTLEMAP.Options')}</label>
                <div class="form-fields ebm-no-grid">
                    <label class="checkbox">
                    <input type="checkbox" class="ebm-no-grid" />
                    <span>${game.i18n.localize('QUICKBATTLEMAP.NoGridLabel')}</span>
                    </label>
                </div>
                </div>
                <div class="form-group progress-group" style="display:none">
                <label>${game.i18n.localize('QUICKBATTLEMAP.ProgressLabel')}</label>
                <div class="form-fields ebm-progress-row">
                    <div class="ebm-spinner" aria-hidden="true"><i class="fas fa-spinner fa-spin"></i></div>
                    <span class="ebm-progress-text">${game.i18n.localize('QUICKBATTLEMAP.ProgressIdle')}</span>
                </div>
                <p class="notes ebm-progress-note">${game.i18n.localize('QUICKBATTLEMAP.ProgressNote')}</p>
                </div>
                <footer class="sheet-footer flexrow">
                <button type="button" class="reset-button"><i class="fas fa-undo"></i> ${game.i18n.localize('QUICKBATTLEMAP.Reset')}</button>
                <button type="button" class="create-scene-button" disabled><i class="fas fa-save"></i> ${game.i18n.localize('QUICKBATTLEMAP.CreateScene')}</button>
                </footer>
            </form>
            </section>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', containerHtml);

        const panel = document.getElementById('quick-battlemap-drop-area');
        const createSceneButton = panel.querySelector('.create-scene-button');
        const resetButton = panel.querySelector('.reset-button');
        const closeButton = panel.querySelector('.header-button.close');
        
        createSceneButton?.addEventListener('click', () => this.onCreateScene && this.onCreateScene());
        resetButton?.addEventListener('click', () => this.onReset && this.onReset());
        closeButton?.addEventListener('click', () => this.onClose && this.onClose());

        const saved = (() => {
            try {
                return localStorage.getItem('quick-battlemap:no-grid');
            } catch (_) {
                return null;
            }
        })();

        const persistedNoGrid = saved === 'true';
        const noGridCheckbox = panel.querySelector('input.ebm-no-grid');

        if (noGridCheckbox) {
            noGridCheckbox.checked = !!persistedNoGrid;
            noGridCheckbox.addEventListener('change', event => {
                const chosen = !!event.currentTarget.checked;

                localStorage.setItem('quick-battlemap:no-grid', String(chosen));

                if (this.onNoGridChange) this.onNoGridChange(chosen);
            });
        }

        const header = panel.querySelector('header');
        if (panel && header) {
            let isDragging = false;
            let startClientX = 0;
            let startClientY = 0;
            let originalLeft = 0;
            let originalTop = 0;
            const onMouseMove = event => {
                if (!isDragging)
                    return;

                const deltaX = event.clientX - startClientX;
                const deltaY = event.clientY - startClientY;
                panel.style.left = `${Math.max(0, originalLeft + deltaX)}px`;
                panel.style.top = `${Math.max(0, originalTop + deltaY)}px`;
            };
            const onMouseUp = () => {
                isDragging = false;

                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };
            header.addEventListener('mousedown', event => {
                if (event.button !== 0)
                    return;

                isDragging = true;

                const rect = panel.getBoundingClientRect();

                startClientX = event.clientX;
                startClientY = event.clientY;
                originalLeft = rect.left + window.scrollX;
                originalTop = rect.top + window.scrollY;

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            });
        }

        const dropArea = document.getElementById('quick-battlemap-drop-area');

        if (dropArea) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropArea.addEventListener(eventName, event => {
                    event.preventDefault();
                    event.stopPropagation();
                }, false);
            });
            ['dragenter', 'dragover'].forEach(eventName => {
                dropArea.addEventListener(eventName, () => dropArea.classList.add('highlight'), false);
            });
            ['dragleave', 'drop'].forEach(eventName => {
                dropArea.addEventListener(eventName, () => dropArea.classList.remove('highlight'), false);
            });
            dropArea.addEventListener('drop', event => this.onDrop && this.onDrop(event), false);
        }

        this.isInitialized = true;
    }

    show() {
        this.ensure();
        const element = document.getElementById('quick-battlemap-drop-area');

        if (!element)
            return;

        element.style.display = '';
        this.isVisible = true;
    }

    hide() {
        const element = document.getElementById('quick-battlemap-drop-area');

        if (!element)
            return;

        element.style.display = 'none';
        this.isVisible = false;
    }

    setCreateButtonEnabled(isEnabled) {
        const element = document.querySelector('.create-scene-button');
        if (element) element.disabled = !isEnabled;
    }

    updateBackgroundStatus(isOk, title) {
        const element = document.querySelector('.background-status .status-value');

        if (!element)
            return;

        element.textContent = isOk ? '✅' : '❌';
        element.title = title || '';
    }

    updateWallDataStatus(isOk, title) {
        const element = document.querySelector('.wall-data-status .status-value');

        if (!element)
            return;

        element.textContent = isOk ? '✅' : '❌';
        element.title = title || '';
    }

    setBusy(message) {
        const group = document.querySelector('#quick-battlemap-drop-area .progress-group');
        const text = document.querySelector('#quick-battlemap-drop-area .ebm-progress-text');

        if (group)
            group.style.display = '';

        if (text && message)
            text.textContent = message;

        this.isBusy = true;
    }

    clearBusy() {
        const group = document.querySelector('#quick-battlemap-drop-area .progress-group');
        const text = document.querySelector('#quick-battlemap-drop-area .ebm-progress-text');
        
        if (group)
            group.style.display = 'none';
        
        if (text) 
            text.textContent = game.i18n.localize('QUICKBATTLEMAP.ProgressIdle');

        this.isBusy = false;
    }

    resetStatuses(persistedNoGrid) {
        this.updateBackgroundStatus(false, '');
        this.updateWallDataStatus(false, '');
        this.setCreateButtonEnabled(false);

        const group = document.querySelector('#quick-battlemap-drop-area .progress-group');
        const text = document.querySelector('#quick-battlemap-drop-area .ebm-progress-text');

        if (group) 
            group.style.display = 'none';

        if (text) 
            text.textContent = game.i18n.localize('QUICKBATTLEMAP.ProgressIdle');

        const noGridCheckbox = document.querySelector('#quick-battlemap-drop-area input.ebm-no-grid');

        if (noGridCheckbox) 
            noGridCheckbox.checked = !!persistedNoGrid;
    }

    getNoGridChosen() {
        const noGridCheckbox = document.querySelector('#quick-battlemap-drop-area input.ebm-no-grid');

        return !!noGridCheckbox?.checked;
    }

    setNoGridChosen(value) {
        const noGridCheckbox = document.querySelector('#quick-battlemap-drop-area input.ebm-no-grid');

        if (noGridCheckbox) 
            noGridCheckbox.checked = !!value;
    }
}