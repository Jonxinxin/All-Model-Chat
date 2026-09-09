import { act } from 'react';
import { setupProviderTestRenderer as setupTestRenderer } from '@/test/render/providerRenderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { setupStoreStateReset } from '@/test/stores/reset';
import { useChatStore } from '@/stores/chatStore';
import { useUIStore } from '@/stores/uiStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { dbService } from '@/services/db/dbService';
import { LibraryView } from './LibraryView';
import type { LibraryItem, SavedChatSession } from '@/types';

describe('LibraryView', () => {
  const renderer = setupTestRenderer({ providers: { language: 'en' } });
  setupStoreStateReset();

  const mockSession: SavedChatSession = {
    id: 'session-1',
    title: 'Q3 Financial Review',
    timestamp: 1700000000000,
    settings: {} as SavedChatSession['settings'],
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Analyze these files',
        timestamp: new Date(1700000000000),
        files: [
          {
            id: 'file-pdf-1',
            name: 'quarterly_report.pdf',
            type: 'application/pdf',
            size: 204800,
          },
          {
            id: 'file-img-1',
            name: 'revenue_graph.png',
            type: 'image/png',
            size: 10240,
            dataUrl: 'data:image/png;base64,mockpng',
          },
          {
            id: 'file-vid-1',
            name: 'demo_video.mp4',
            type: 'video/mp4',
            size: 512000,
            dataUrl: 'blob:http://localhost/demo.mp4',
          },
        ],
      },
    ],
  };

  const mockStandalone: LibraryItem[] = [
    {
      id: 'standalone-notes',
      name: 'meeting_notes.md',
      type: 'text/markdown',
      size: 1024,
      timestamp: 1700005000000,
      textContent: '# Meeting Notes',
      source: 'uploaded',
      isStandalone: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(dbService, 'getStandaloneLibraryFiles').mockResolvedValue([]);
    vi.spyOn(dbService, 'getAllHistoricalSessionFiles').mockResolvedValue([]);
    vi.spyOn(dbService, 'addStandaloneLibraryFiles').mockResolvedValue(undefined);
    vi.spyOn(dbService, 'deleteStandaloneLibraryFiles').mockResolvedValue(undefined);
    vi.spyOn(dbService, 'fetchLibraryFileBlob').mockResolvedValue(new Blob(['test']));
    useChatStore.setState({ savedSessions: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders empty state when there are no files', async () => {
    await act(async () => {
      renderer.root.render(<LibraryView />);
      await Promise.resolve();
    });

    expect(screen.getByText(/No files found/i)).toBeInTheDocument();
  });

  it('renders list of items from both session and standalone files', async () => {
    vi.spyOn(dbService, 'getStandaloneLibraryFiles').mockResolvedValue(mockStandalone);
    useChatStore.setState({ savedSessions: [mockSession] });

    await act(async () => {
      renderer.root.render(<LibraryView />);
      await Promise.resolve();
    });

    expect(screen.getByText('quarterly_report.pdf')).toBeInTheDocument();
    expect(screen.getByText('revenue_graph.png')).toBeInTheDocument();
    expect(screen.getByText('meeting_notes.md')).toBeInTheDocument();
    expect(screen.getAllByText(/Q3 Financial Review/).length).toBeGreaterThan(0);
  });

  it('switches between list view and grid view', async () => {
    useChatStore.setState({ savedSessions: [mockSession] });

    await act(async () => {
      renderer.root.render(<LibraryView />);
      await Promise.resolve();
    });

    expect(screen.getByRole('table')).toBeInTheDocument();

    const gridBtn = screen.getByLabelText(/Grid view/i);
    await act(async () => {
      fireEvent.click(gridBtn);
    });

    expect(useLibraryStore.getState().viewMode).toBe('grid');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('quarterly_report.pdf')).toBeInTheDocument();
  });

  it('filters items by search query', async () => {
    useChatStore.setState({ savedSessions: [mockSession] });

    await act(async () => {
      renderer.root.render(<LibraryView />);
      await Promise.resolve();
    });

    expect(screen.getByText('quarterly_report.pdf')).toBeInTheDocument();
    expect(screen.getByText('revenue_graph.png')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Search/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'revenue' } });
    });

    expect(screen.getByText('revenue_graph.png')).toBeInTheDocument();
    expect(screen.queryByText('quarterly_report.pdf')).not.toBeInTheDocument();
  });

  it('filters items by file extension search query', async () => {
    useChatStore.setState({ savedSessions: [mockSession] });

    await act(async () => {
      renderer.root.render(<LibraryView />);
      await Promise.resolve();
    });

    const searchInput = screen.getByPlaceholderText(/Search/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: '.png' } });
    });

    expect(screen.getByText('revenue_graph.png')).toBeInTheDocument();
    expect(screen.queryByText('quarterly_report.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('demo_video.mp4')).not.toBeInTheDocument();
  });

  it('selects items and starts a new chat with selected files', async () => {
    const onNewChat = vi.fn();
    useChatStore.setState({ savedSessions: [mockSession] });

    await act(async () => {
      renderer.root.render(<LibraryView onNewChat={onNewChat} />);
      await Promise.resolve();
    });

    const fileCheckbox = screen.getByLabelText('Select quarterly_report.pdf');
    await act(async () => {
      fireEvent.click(fileCheckbox);
    });

    expect(useLibraryStore.getState().selectedFileIds.size).toBe(1);
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();

    const startChatButtons = screen.getAllByRole('button', { name: /Start chat/i });
    await act(async () => {
      fireEvent.click(startChatButtons[0]);
    });

    expect(onNewChat).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'quarterly_report.pdf' })]),
    );
    expect(useChatStore.getState().selectedFiles.length).toBe(1);
    expect(useUIStore.getState().activeView).toBe('chat');
  });

  it('starts chat with an individual item directly from grid card button', async () => {
    const onNewChat = vi.fn();
    useChatStore.setState({ savedSessions: [mockSession] });
    useLibraryStore.setState({ viewMode: 'grid' });

    await act(async () => {
      renderer.root.render(<LibraryView onNewChat={onNewChat} />);
      await Promise.resolve();
    });

    const startChatButtons = screen.getAllByRole('button', { name: /Start chat/i });
    expect(startChatButtons.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(startChatButtons[0]);
    });

    expect(onNewChat).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'quarterly_report.pdf' })]),
    );
    expect(useChatStore.getState().selectedFiles.length).toBe(1);
    expect(useUIStore.getState().activeView).toBe('chat');
  });

  it('jumps to session when session title link is clicked', async () => {
    const onSelectSession = vi.fn();
    useChatStore.setState({ savedSessions: [mockSession] });

    await act(async () => {
      renderer.root.render(<LibraryView onSelectSession={onSelectSession} />);
      await Promise.resolve();
    });

    const sessionLinks = screen.getAllByText(/Q3 Financial Review/);
    await act(async () => {
      fireEvent.click(sessionLinks[0]);
    });

    expect(onSelectSession).toHaveBeenCalledWith('session-1');
    expect(useUIStore.getState().activeView).toBe('chat');
  });

  it('triggers onClose when close button is clicked', async () => {
    const onClose = vi.fn();

    await act(async () => {
      renderer.root.render(<LibraryView onClose={onClose} />);
      await Promise.resolve();
    });

    const backBtn = screen.getByLabelText('Back');
    await act(async () => {
      fireEvent.click(backBtn);
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('renders video thumbnail for video library items', async () => {
    useChatStore.setState({ savedSessions: [mockSession] });

    await act(async () => {
      renderer.root.render(<LibraryView />);
      await Promise.resolve();
    });

    expect(screen.getByText('demo_video.mp4')).toBeInTheDocument();
    const videoElement = document.querySelector('video');
    expect(videoElement).toBeInTheDocument();
    expect(videoElement).toHaveAttribute('src', 'blob:http://localhost/demo.mp4#t=0.1');
  });

  it('filters items when clicking Audio and Video tabs', async () => {
    const sessionWithAudioAndVideo: SavedChatSession = {
      ...mockSession,
      messages: [
        {
          id: 'msg-media',
          role: 'user',
          content: 'media',
          timestamp: new Date(1700000000000),
          files: [
            { id: 'f-audio', name: 'podcast.mp3', type: 'audio/mp3', size: 1000 },
            { id: 'f-video', name: 'movie.mp4', type: 'video/mp4', size: 2000 },
            { id: 'f-doc', name: 'readme.txt', type: 'text/plain', size: 500 },
          ],
        },
      ],
    };

    useChatStore.setState({ savedSessions: [sessionWithAudioAndVideo] });

    await act(async () => {
      renderer.root.render(<LibraryView />);
      await Promise.resolve();
    });

    expect(screen.getByText('podcast.mp3')).toBeInTheDocument();
    expect(screen.getByText('movie.mp4')).toBeInTheDocument();
    expect(screen.getByText('readme.txt')).toBeInTheDocument();

    // Click Audio tab
    const audioTab = screen.getByRole('button', { name: 'Audio' });
    await act(async () => {
      fireEvent.click(audioTab);
    });

    expect(screen.getByText('podcast.mp3')).toBeInTheDocument();
    expect(screen.queryByText('movie.mp4')).not.toBeInTheDocument();
    expect(screen.queryByText('readme.txt')).not.toBeInTheDocument();

    // Click Video tab
    const videoTab = screen.getByRole('button', { name: 'Video' });
    await act(async () => {
      fireEvent.click(videoTab);
    });

    expect(screen.getByText('movie.mp4')).toBeInTheDocument();
    expect(screen.queryByText('podcast.mp3')).not.toBeInTheDocument();
    expect(screen.queryByText('readme.txt')).not.toBeInTheDocument();
  });

  it('opens advanced filter popover and filters by source and sub-formats', async () => {
    useChatStore.setState({ savedSessions: [mockSession] });

    await act(async () => {
      renderer.root.render(<LibraryView />);
      await Promise.resolve();
    });

    const filterBtn = screen.getByRole('button', { name: /filter/i });
    await act(async () => {
      fireEvent.click(filterBtn);
    });

    // Check menu sections
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('All sources')).toBeInTheDocument();
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
    expect(screen.getByText('Generated')).toBeInTheDocument();
    expect(screen.getByText('Document Formats')).toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('Spreadsheet')).toBeInTheDocument();
    expect(screen.getByText('Presentation')).toBeInTheDocument();
    expect(screen.getByText('Sort by')).toBeInTheDocument();

    // Filter by PDF sub-format
    const pdfOption = screen.getByRole('button', { name: /PDF/i });
    await act(async () => {
      fireEvent.click(pdfOption);
    });

    expect(useLibraryStore.getState().fileTypeFilter).toBe('pdf');
    expect(screen.getByText('quarterly_report.pdf')).toBeInTheDocument();
    expect(screen.queryByText('revenue_graph.png')).not.toBeInTheDocument();
    expect(screen.queryByText('demo_video.mp4')).not.toBeInTheDocument();
  });
});
