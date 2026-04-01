

import { useState } from 'react';
import { UploadedFile } from '../../types';
import { isTextFile } from '../../utils/appUtils';

interface UseChatInputLocalStateProps {
    setSelectedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
    handleConfirmCreateTextFile: (content: string | Blob, filename: string) => Promise<void>;
    setShowCreateTextFileEditor: (show: boolean) => void;
    setEditingFile: (file: UploadedFile | null) => void;
    editingFile: UploadedFile | null;
}

export const useChatInputLocalState = ({
    setSelectedFiles,
    handleConfirmCreateTextFile,
    setShowCreateTextFileEditor,
    setEditingFile,
    editingFile
}: UseChatInputLocalStateProps) => {
    const [configuringFile, setConfiguringFile] = useState<UploadedFile | null>(null);
    const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
    const [isPreviewEditable, setIsPreviewEditable] = useState(false);
    const [isConverting, setIsConverting] = useState(false);
    const [showTokenModal, setShowTokenModal] = useState(false);

    const handleSaveTextFile = async (content: string | Blob, filename: string) => {
        if (editingFile) {
            const size = content instanceof Blob ? content.size : new Blob([content]).size;
            const type = content instanceof Blob ? content.type : 'text/markdown';

            setSelectedFiles(prev => prev.map(f => {
                if (f.id !== editingFile.id) return f;

                // Revoke old blob URL to prevent memory leak
                if (f.dataUrl && f.dataUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(f.dataUrl);
                }

                return {
                    ...f,
                    name: filename.includes('.') ? filename : `${filename}.md`,
                    textContent: typeof content === 'string' ? content : undefined,
                    size: size,
                    rawFile: new File([content], filename, { type: type }),
                    dataUrl: content instanceof Blob ? URL.createObjectURL(content) : f.dataUrl,
                    // Reset upload state so the edited file gets re-uploaded with new content
                    uploadState: 'pending' as const,
                    fileUri: undefined,
                    fileApiName: undefined,
                };
            }));
            setShowCreateTextFileEditor(false);
            setEditingFile(null);
        } else {
            await handleConfirmCreateTextFile(content, filename);
        }
    };

    const handleSavePreviewTextFile = (fileId: string, content: string, newName: string) => {
        setSelectedFiles(prev => prev.map(f => {
            if (f.id !== fileId) return f;

            // Revoke old blob URL to prevent memory leak
            if (f.dataUrl && f.dataUrl.startsWith('blob:')) {
                URL.revokeObjectURL(f.dataUrl);
            }

            return {
                ...f,
                name: newName,
                textContent: content,
                size: new Blob([content]).size,
                dataUrl: URL.createObjectURL(new File([content], newName, { type: 'text/plain' })),
                rawFile: new File([content], newName, { type: 'text/plain' })
            };
        }));
    };

    const handleConfigureFile = (file: UploadedFile) => {
        if (isTextFile(file)) {
            setPreviewFile(file);
            setIsPreviewEditable(true);
        } else {
            setConfiguringFile(file);
        }
    };

    const handlePreviewFile = (file: UploadedFile) => {
        setPreviewFile(file);
        setIsPreviewEditable(false);
    };

    return {
        configuringFile, setConfiguringFile,
        previewFile, setPreviewFile,
        isPreviewEditable, setIsPreviewEditable,
        isConverting, setIsConverting,
        showTokenModal, setShowTokenModal,
        handleSaveTextFile,
        handleSavePreviewTextFile,
        handleConfigureFile,
        handlePreviewFile
    };
};