import React, { useRef } from 'react';
import { Search, X, ChevronDown, ChevronLeft, Upload, Image as ImageIcon, FileText } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { useLibraryStore } from '@/stores/libraryStore';
import { useClickOutside } from '@/hooks/useClickOutside';

interface LibraryHeaderProps {
  onUploadFiles: (files: File[]) => void;
  onCreateNote?: () => void;
  onClose?: () => void;
}

export const LibraryHeader: React.FC<LibraryHeaderProps> = ({ onUploadFiles, onCreateNote, onClose }) => {
  const { t } = useI18n();
  const searchQuery = useLibraryStore((state) => state.searchQuery);
  const setSearchQuery = useLibraryStore((state) => state.setSearchQuery);
  const isNewDropdownOpen = useLibraryStore((state) => state.isNewDropdownOpen);
  const setIsNewDropdownOpen = useLibraryStore((state) => state.setIsNewDropdownOpen);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, () => setIsNewDropdownOpen(false), isNewDropdownOpen);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadFiles(Array.from(e.target.files));
      e.target.value = '';
      setIsNewDropdownOpen(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-8 pt-6 pb-4 flex-shrink-0">
      <div className="flex items-center gap-2 sm:gap-3">
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 -ml-1 rounded-full text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
            title="Back"
            aria-label="Back"
          >
            <ChevronLeft size={22} strokeWidth={2.2} />
          </button>
        )}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--theme-text-primary)]">
          {t('libraryTitle')}
        </h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex-1 sm:w-64 sm:flex-initial">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--theme-text-tertiary)]">
            <Search size={16} strokeWidth={2} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('librarySearchPlaceholder')}
            className="w-full pl-9 pr-8 py-1.5 text-sm bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-tertiary)] rounded-full border border-transparent focus:border-[var(--theme-border-focus)] focus:bg-[var(--theme-bg-primary)] outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)]"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsNewDropdownOpen((prev) => !prev)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-full bg-[var(--theme-text-primary)] text-[var(--theme-bg-primary)] hover:opacity-90 active:scale-95 transition-all shadow-sm"
          >
            <span>{t('libraryNew')}</span>
            <ChevronDown
              size={14}
              strokeWidth={2.5}
              className={isNewDropdownOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
            />
          </button>

          {isNewDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-44 rounded-2xl bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] shadow-xl py-1.5 z-50 text-sm animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  imageInputRef.current?.click();
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
              >
                <ImageIcon size={16} className="text-[var(--theme-text-secondary)]" />
                <span>{t('libraryUploadImage')}</span>
              </button>

              {onCreateNote && (
                <button
                  onClick={() => {
                    setIsNewDropdownOpen(false);
                    onCreateNote();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors"
                >
                  <FileText size={16} className="text-[var(--theme-text-secondary)]" />
                  <span>{t('libraryNote')}</span>
                </button>
              )}

              <button
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors border-t border-[var(--theme-border-secondary)] mt-1 pt-2"
              >
                <Upload size={16} className="text-[var(--theme-text-secondary)]" />
                <span>{t('libraryUpload')}</span>
              </button>
            </div>
          )}

          <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};
