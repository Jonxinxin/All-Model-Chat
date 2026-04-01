
import React from 'react';
import { Page } from 'react-pdf';

interface PdfSidebarProps {
    numPages: number | null;
    currentPage: number;
    showSidebar: boolean;
    onPageClick: (pageNum: number) => void;
    sidebarRef: React.RefObject<HTMLDivElement>;
}

export const PdfSidebar: React.FC<PdfSidebarProps> = ({
    numPages,
    currentPage,
    showSidebar,
    onPageClick,
    sidebarRef
}) => {
    return (
        <div className={`relative flex-shrink-0 bg-gray-950 border-r border-white/10 transition-all duration-300 ease-in-out flex flex-col ${showSidebar ? 'w-40 sm:w-52' : 'w-0 overflow-hidden'}`}>
            {showSidebar && (
                <div ref={sidebarRef} className="flex-grow overflow-y-auto custom-scrollbar p-4">
                    <div className="flex flex-col gap-5">
                        {numPages && Array.from(new Array(numPages), (_, index) => {
                            const pageNum = index + 1;
                            return (
                                <LazyThumbnail
                                    key={pageNum}
                                    pageNum={pageNum}
                                    currentPage={currentPage}
                                    onPageClick={onPageClick}
                                />
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// Lazy-loaded thumbnail that only renders when near the sidebar viewport
const LazyThumbnail = ({
    pageNum,
    currentPage,
    onPageClick,
}: {
    pageNum: number;
    currentPage: number;
    onPageClick: (pageNum: number) => void;
}) => {
    const [isVisible, setIsVisible] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;

        // Find the scrollable sidebar container
        const container = el.closest('.overflow-y-auto');
        if (!container) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    // Keep observing so we can unload if needed for very large PDFs
                }
            },
            {
                root: container,
                rootMargin: '200% 0px 200% 0px',
                threshold: 0
            }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={ref}
            data-thumbnail-page={pageNum}
            className="cursor-pointer group flex flex-col items-center"
            onClick={() => onPageClick(pageNum)}
        >
            <div className={`relative transition-all duration-200 ${currentPage === pageNum ? 'ring-2 ring-blue-500 shadow-lg scale-[1.02]' : 'hover:ring-2 hover:ring-white/30 hover:scale-[1.02]'}`}>
                {isVisible ? (
                    <Page
                        pageNumber={pageNum}
                        width={120}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        className="shadow-sm bg-white"
                        loading={<div className="w-[120px] h-[160px] bg-white/5 animate-pulse rounded-sm" />}
                    />
                ) : (
                    <div className="w-[120px] h-[160px] bg-white/5 animate-pulse rounded-sm" />
                )}
                <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded backdrop-blur-sm font-mono">
                    {pageNum}
                </div>
            </div>
        </div>
    );
};
