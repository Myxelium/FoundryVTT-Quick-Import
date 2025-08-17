export class QuickBattlemapStorageService {
    async ensureDirectoryExists(source, targetDirectoryPath) {
        try {
            await FilePicker.browse(source, targetDirectoryPath);
        } catch (_) {
            try {
                await FilePicker.createDirectory(source, targetDirectoryPath, {});
            } catch (error) {
                const message = String(error || '');
                if (!message.includes('EEXIST')) throw error;
            }
        }
    }

    async uploadBackgroundMedia(media, worldIdentifier) {
        try {
            let fileObject = media.file;

            if (!fileObject) {
                const response = await fetch(media.data);
                const blob = await response.blob();
                const type = blob.type || (media.isVideo ? 'video/webm' : 'image/png');
                fileObject = new File([blob], media.filename, {
                    type
                });
            }

            const source = 'data';
            const target = `worlds/${worldIdentifier}/quick-battlemap`;
            
            await this.ensureDirectoryExists(source, target);

            const result = await FilePicker.upload(source, target, fileObject, {
                overwrite: true
            });

            return {
                path: result?.path
            };
        } catch (error) {
            console.error('Quick Battlemap Importer | Upload failed:', error);
            ui.notifications.error(game.i18n.localize('QUICKBATTLEMAP.UploadFailed') + ': ' + (error?.message ?? error));
            return null;
        }
    }
}