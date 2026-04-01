
import React from 'react';
import { Document } from 'react-pdf';
import { UploadedFile } from '../../../types';
import { usePdfViewer } from '../../../hooks/ui/usePdfViewer';
import { PdfSidebar } from './pdf-viewer/PdfSidebar';
import { PdfMainContent } from './pdf-viewer/PdfMainContent';
import { PdfToolbar } from './pdf-viewer/PdfToolbar';

interface PdfViewerProps {
    file: UploadedFile;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ file }) => {
    const {
        numPages,
        currentPage,
        pageInput,
        setPageInput,
        scale,
        rotation,
        isLoading,
        error,
        showSidebar,
        containerRef,
        sidebarRef,
        isInputFocusedRef,
        setPageRef,
        onDocumentLoadSuccess,
        onDocumentLoadError,
        scrollToPage,
        previousPage,
        nextPage,
        handlePageInputCommit,
        handleZoomIn,
        handleZoomOut,
        handleRotate,
        toggleSidebar
    } = usePdfViewer(file);

    return (
        <Document
            file={file.dataUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={null}
            error={null}
            className="w-full h-full relative flex flex-row bg-gray-900 overflow-hidden select-none"
        >
            <PdfSidebar
                numPages={numPages}
                currentPage={currentPage}
                showSidebar={showSidebar}
                onPageClick={scrollToPage}
                sidebarRef={sidebarRef}
            />

            <div className="flex-grow h-full relative flex flex-col min-w-0">
                <PdfMainContent
                    numPages={numPages}
                    scale={scale}
                    rotation={rotation}
                    isLoading={isLoading}
                    error={error}
                    setPageRef={setPageRef}
                    containerRef={containerRef}
                />

                <PdfToolbar
                    currentPage={currentPage}
                    numPages={numPages}
                    scale={scale}
                    showSidebar={showSidebar}
                    pageInput={pageInput}
                    onPageInputChange={setPageInput}
                    onPageInputCommit={handlePageInputCommit}
                    onPrevPage={previousPage}
                    onNextPage={nextPage}
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    onRotate={handleRotate}
                    onToggleSidebar={toggleSidebar}
                    isInputFocusedRef={isInputFocusedRef}
                />
            </div>
        </Document>
    );
};
