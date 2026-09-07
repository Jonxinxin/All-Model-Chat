import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { useChatStore } from '@/stores/chatStore';
import { useUIStore } from '@/stores/uiStore';
import { useLibraryStore } from '@/stores/libraryStore';
import type { LibraryItem, UploadedFile } from '@/types';
import { dbService } from '@/services/db/dbService';
import {
  extractLibraryItemsFromSessions,
  filterAndSortLibraryItems,
  resolveLibraryItemToUploadedFile,
} from '@/utils/library/libraryFiles';
import { triggerDownload } from '@/utils/export/core';
import { fileToBlobUrl, cleanupFilePreviewUrl } from '@/utils/file/filePreviewUrls';
import { LibraryHeader } from './LibraryHeader';
import { LibraryToolbar } from './LibraryToolbar';
import { LibraryListView } from './LibraryListView';
import { LibraryGridView } from './LibraryGridView';
import { LibraryEmptyState } from './LibraryEmptyState';
import { FilePreviewModal } from '@/components/modals/FilePreviewModal';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';
import { Upload } from 'lucide-react';

interface LibraryViewProps {
  onNewChat?: (initialFiles?: UploadedFile[]) => void;
  onSelectSession?: (sessionId: string) => void;
  onClose?: () => void;
  themeId?: string;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onNewChat, onSelectSession, onClose }) => {
  const { t } = useI18n();
  const savedSessions = useChatStore((state) => state.savedSessions);
  const setSelectedFiles = useChatStore((state) => state.setSelectedFiles);
  const setActiveView = useUIStore((state) => state.setActiveView);

  const viewMode = useLibraryStore((state) => state.viewMode);
  const categoryFilter = useLibraryStore((state) => state.categoryFilter);
  const sourceFilter = useLibraryStore((state) => state.sourceFilter);
  const fileTypeFilter = useLibraryStore((state) => state.fileTypeFilter);
  const sortOption = useLibraryStore((state) => state.sortOption);
  const searchQuery = useLibraryStore((state) => state.searchQuery);
  const selectedFileIds = useLibraryStore((state) => state.selectedFileIds);
  const clearSelection = useLibraryStore((state) => state.clearSelection);
  const setCategoryFilter = useLibraryStore((state) => state.setCategoryFilter);
  const setSourceFilter = useLibraryStore((state) => state.setSourceFilter);
  const setFileTypeFilter = useLibraryStore((state) => state.setFileTypeFilter);
  const setSearchQuery = useLibraryStore((state) => state.setSearchQuery);

  const [standaloneFiles, setStandaloneFiles] = useState<LibraryItem[]>([]);
  const [historicalFiles, setHistoricalFiles] = useState<LibraryItem[]>([]);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<LibraryItem | 'selected' | null>(null);

  // Load standalone files and historical session files from IndexedDB
  const refreshLibraryFiles = useCallback(async () => {
    const [standalone, historical] = await Promise.all([
      dbService.getStandaloneLibraryFiles(),
      dbService.getAllHistoricalSessionFiles(),
    ]);
    setStandaloneFiles(standalone);
    setHistoricalFiles(historical);
  }, []);

  useEffect(() => {
    void refreshLibraryFiles();
  }, [refreshLibraryFiles]);

  // Merge session files and standalone files
  const allItems = useMemo(() => {
    const map = new Map<string, LibraryItem>();

    // 1. Add standalone files first
    standaloneFiles.forEach((file) => {
      map.set(file.id, file);
    });

    // 2. Add historical session files from IndexedDB
    historicalFiles.forEach((file) => {
      if (!map.has(file.id)) {
        map.set(file.id, file);
      }
    });

    // 3. Add or update with current in-memory sessions (covers active / freshly modified session)
    const inMemorySessionFiles = extractLibraryItemsFromSessions(savedSessions);
    inMemorySessionFiles.forEach((file) => {
      map.set(file.id, file);
    });

    return Array.from(map.values());
  }, [savedSessions, standaloneFiles, historicalFiles]);

  // Filtered & sorted items
  const filteredItems = useMemo(() => {
    return filterAndSortLibraryItems(allItems, {
      category: categoryFilter,
      source: sourceFilter,
      fileType: fileTypeFilter,
      sort: sortOption,
      searchQuery,
      viewMode,
    });
  }, [allItems, categoryFilter, sourceFilter, fileTypeFilter, sortOption, searchQuery, viewMode]);

  // Upload handler
  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;

      const newItems: LibraryItem[] = await Promise.all(
        files.map(async (file) => {
          const id = `lib-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          let textContent: string | undefined;

          if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
            try {
              textContent = await file.text();
            } catch {
              // ignore
            }
          }

          return {
            id,
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            timestamp: Date.now(),
            rawFile: file,
            textContent,
            source: 'uploaded' as const,
            isStandalone: true,
          };
        }),
      );

      await dbService.addStandaloneLibraryFiles(newItems);
      await refreshLibraryFiles();
    },
    [refreshLibraryFiles],
  );

  // Drag & Drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setIsDraggingOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setIsDraggingOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      await handleUploadFiles(droppedFiles);
    }
  };

  // Start chat with file(s)
  const handleStartChatWithItems = useCallback(
    async (items: LibraryItem[]) => {
      if (!items.length) return;

      const uploadedFiles: UploadedFile[] = await Promise.all(
        items.map((item) => resolveLibraryItemToUploadedFile(item, (i) => dbService.fetchLibraryFileBlob(i))),
      );

      if (onNewChat) {
        onNewChat(uploadedFiles);
      }
      setSelectedFiles(uploadedFiles);
      setActiveView('chat');
    },
    [onNewChat, setSelectedFiles, setActiveView],
  );

  const handleStartChatWithSelected = useCallback(async () => {
    const selectedItems = allItems.filter((i) => selectedFileIds.has(i.id));
    clearSelection();
    await handleStartChatWithItems(selectedItems);
  }, [allItems, selectedFileIds, clearSelection, handleStartChatWithItems]);

  // Download item
  const handleDownloadItem = useCallback(async (item: LibraryItem) => {
    let blob = item.rawFile;
    if (!blob) {
      blob = await dbService.fetchLibraryFileBlob(item);
    }

    if (blob) {
      const url = fileToBlobUrl(blob);
      triggerDownload(url, item.name);
    } else if (item.dataUrl) {
      triggerDownload(item.dataUrl, item.name);
    }
  }, []);

  const handleDownloadSelected = useCallback(async () => {
    const selectedItems = allItems.filter((i) => selectedFileIds.has(i.id));
    for (const item of selectedItems) {
      await handleDownloadItem(item);
    }
  }, [allItems, selectedFileIds, handleDownloadItem]);

  // Delete item
  const handleDeleteItem = useCallback((item: LibraryItem) => {
    setDeleteConfirmTarget(item);
  }, []);

  const handleDeleteSelected = useCallback(() => {
    setDeleteConfirmTarget('selected');
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmTarget) return;

    if (deleteConfirmTarget === 'selected') {
      const ids = Array.from(selectedFileIds);
      await dbService.deleteStandaloneLibraryFiles(ids);
      setHistoricalFiles((prev) => prev.filter((i) => !selectedFileIds.has(i.id)));
      clearSelection();
      await refreshLibraryFiles();
    } else {
      const item = deleteConfirmTarget;
      if (item.isStandalone) {
        await dbService.deleteStandaloneLibraryFiles([item.id]);
        await refreshLibraryFiles();
      } else {
        // Session file: remove from view state
        setHistoricalFiles((prev) => prev.filter((i) => i.id !== item.id));
      }
    }
  }, [deleteConfirmTarget, selectedFileIds, clearSelection, refreshLibraryFiles]);

  // Preview item
  const handlePreviewItem = useCallback(async (item: LibraryItem) => {
    const file = await resolveLibraryItemToUploadedFile(item, (i) => dbService.fetchLibraryFileBlob(i));
    setPreviewFile(file);
  }, []);

  const handleClosePreview = () => {
    if (previewFile?.dataUrl) {
      cleanupFilePreviewUrl(previewFile);
    }
    setPreviewFile(null);
  };

  const handleClearFilters = () => {
    setCategoryFilter('all');
    setSourceFilter('all');
    setFileTypeFilter('all');
    setSearchQuery('');
  };

  const isFiltered =
    categoryFilter !== 'all' || sourceFilter !== 'all' || fileTypeFilter !== 'all' || searchQuery.trim().length > 0;

  return (
    <div
      className="flex flex-col flex-1 h-full w-full overflow-hidden bg-[var(--theme-bg-primary)] relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-[var(--theme-bg-accent)]/10 backdrop-blur-xs border-2 border-dashed border-[var(--theme-accent)] flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-100">
          <div className="p-4 rounded-full bg-[var(--theme-bg-primary)] text-[var(--theme-accent)] shadow-xl mb-3">
            <Upload size={32} strokeWidth={2} />
          </div>
          <span className="text-base font-semibold text-[var(--theme-text-primary)]">{t('libraryDropOverlay')}</span>
        </div>
      )}

      <LibraryHeader onUploadFiles={handleUploadFiles} onClose={onClose} />

      <LibraryToolbar
        selectedCount={selectedFileIds.size}
        onStartChat={handleStartChatWithSelected}
        onDownloadSelected={handleDownloadSelected}
        onDeleteSelected={handleDeleteSelected}
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredItems.length === 0 ? (
          <LibraryEmptyState
            isFiltered={isFiltered}
            onClearFilters={handleClearFilters}
            onUploadClick={() => {
              const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
              fileInput?.click();
            }}
          />
        ) : viewMode === 'list' ? (
          <LibraryListView
            items={filteredItems}
            onPreviewItem={handlePreviewItem}
            onStartChatWithItem={(item) => handleStartChatWithItems([item])}
            onDownloadItem={handleDownloadItem}
            onDeleteItem={handleDeleteItem}
            onJumpToSession={(sessionId) => {
              onSelectSession?.(sessionId);
              setActiveView('chat');
            }}
          />
        ) : (
          <LibraryGridView
            items={filteredItems}
            onPreviewItem={handlePreviewItem}
            onStartChatWithItem={(item) => handleStartChatWithItems([item])}
            onDownloadItem={handleDownloadItem}
            onDeleteItem={handleDeleteItem}
          />
        )}
      </div>

      {previewFile && <FilePreviewModal file={previewFile} onClose={handleClosePreview} />}

      {deleteConfirmTarget && (
        <ConfirmationModal
          isOpen={Boolean(deleteConfirmTarget)}
          onClose={() => setDeleteConfirmTarget(null)}
          onConfirm={handleConfirmDelete}
          title={t('confirm')}
          message={t('libraryDeleteConfirm')}
          isDanger
          confirmLabel={t('delete')}
          cancelLabel={t('cancel')}
        />
      )}
    </div>
  );
};
