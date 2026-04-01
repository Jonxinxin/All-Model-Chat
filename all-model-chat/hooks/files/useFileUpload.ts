
import { useCallback, Dispatch, SetStateAction } from 'react';
import { AppSettings, ChatSettings as IndividualChatSettings, UploadedFile } from '../../types';
import { logService } from '../../services/logService';
import { useFilePreProcessing } from '../file-upload/useFilePreProcessing';
import { useFileUploader } from '../file-upload/useFileUploader';
import { useFileIdAdder } from '../file-upload/useFileIdAdder';
import { dbService } from '../../utils/db';

const MAX_SINGLE_FILE_SIZE = 100 * 1024 * 1024; // 100MB per file

interface UseFileUploadProps {
    appSettings: AppSettings;
    selectedFiles: UploadedFile[];
    setSelectedFiles: Dispatch<SetStateAction<UploadedFile[]>>;
    setAppFileError: Dispatch<SetStateAction<string | null>>;
    currentChatSettings: IndividualChatSettings;
    setCurrentChatSettings: (updater: (prevSettings: IndividualChatSettings) => IndividualChatSettings) => void;
}

export const useFileUpload = ({
    appSettings,
    selectedFiles,
    setSelectedFiles,
    setAppFileError,
    currentChatSettings,
    setCurrentChatSettings,
}: UseFileUploadProps) => {

    const { processFiles } = useFilePreProcessing({ appSettings, setSelectedFiles });

    const { uploadFiles, cancelUpload } = useFileUploader({
        appSettings,
        setSelectedFiles,
        setAppFileError,
        currentChatSettings,
        setCurrentChatSettings
    });

    const { addFileById } = useFileIdAdder({
        appSettings,
        setSelectedFiles,
        setAppFileError,
        currentChatSettings,
        setCurrentChatSettings,
        selectedFiles
    });

    const handleProcessAndAddFiles = useCallback(async (files: FileList | File[]) => {
        if (!files || files.length === 0) return;
        setAppFileError(null);

        const rawFilesArray = Array.isArray(files) ? files : Array.from(files);

        // Check individual file sizes
        const oversized = rawFilesArray.find(f => f.size > MAX_SINGLE_FILE_SIZE);
        if (oversized) {
            setAppFileError(`File "${oversized.name}" exceeds the 100MB size limit.`);
            return;
        }

        // Check storage quota before processing
        const totalBytes = rawFilesArray.reduce((sum, f) => sum + f.size, 0);
        const hasQuota = await dbService.checkStorageAvailable(totalBytes);
        if (!hasQuota) {
            setAppFileError('Not enough storage space. Please delete some chat history to free up space.');
            return;
        }

        logService.info(`Processing ${rawFilesArray.length} files.`);

        // 1. Pre-process files (ZIP extraction, Audio compression, etc.)
        const processedFiles = await processFiles(files);

        // 2. Hand off to uploader (Inline vs API strategy)
        await uploadFiles(processedFiles);
    }, [processFiles, uploadFiles, setAppFileError]);

    return {
        handleProcessAndAddFiles,
        handleCancelFileUpload: cancelUpload,
        handleAddFileById: addFileById,
    };
};
