import { render, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { InlineTimestampSeekButton } from './InlineTimestampSeekButton';
import * as seekVideoModule from '@/utils/media-nav/seekVideo';
import { useMediaNavStore } from '@/stores/mediaNavStore';

vi.mock('@/utils/media-nav/seekVideo', () => ({
  seekSessionVideo: vi.fn(),
}));

describe('InlineTimestampSeekButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('triggers seekSessionVideo when clicked without text selection', () => {
    const { container } = render(
      <InlineTimestampSeekButton startSeconds={15} endSeconds={30} videoName="test.mp4">
        00:15 - 00:30
      </InlineTimestampSeekButton>,
    );

    const btn = container.querySelector('[data-testid="inline-timestamp-seek-btn"]')!;
    expect(btn).not.toBeNull();

    fireEvent.click(btn);
    expect(seekVideoModule.seekSessionVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        startSeconds: 15,
        endSeconds: 30,
        videoName: 'test.mp4',
      }),
    );
  });

  it('does NOT trigger seekSessionVideo when user has an active text selection (e.g. dragging to copy)', () => {
    // Mock active window text selection
    const mockSelection = {
      isCollapsed: false,
      toString: () => '00:15 - 00:30',
    };
    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

    const { container } = render(
      <InlineTimestampSeekButton startSeconds={15} endSeconds={30} videoName="test.mp4">
        00:15 - 00:30
      </InlineTimestampSeekButton>,
    );

    const btn = container.querySelector('[data-testid="inline-timestamp-seek-btn"]')!;
    fireEvent.click(btn);

    // Seeking should be prevented to avoid conflicting with copy
    expect(seekVideoModule.seekSessionVideo).not.toHaveBeenCalled();

    getSelectionSpy.mockRestore();
  });

  it('marks play icon with data-selection-copy="exclude" and keeps text selectable', () => {
    const { container } = render(<InlineTimestampSeekButton startSeconds={15}>00:15</InlineTimestampSeekButton>);

    const icon = container.querySelector('[data-selection-copy="exclude"]');
    expect(icon).not.toBeNull();

    const textSpan = container.querySelector('.select-text');
    expect(textSpan).not.toBeNull();
    expect(textSpan?.textContent).toBe('00:15');

    // Outer button must NOT have .select-none to avoid being stripped by copy utilities
    const btn = container.querySelector('[data-testid="inline-timestamp-seek-btn"]')!;
    expect(btn.classList.contains('select-none')).toBe(false);
  });

  it('highlights with data-active="true" during reverse grounding sync', () => {
    act(() => {
      useMediaNavStore.setState({
        isOpen: true,
        openKind: 'video',
        currentPlayTime: 20,
      });
    });

    const { container } = render(
      <InlineTimestampSeekButton startSeconds={15} endSeconds={30} videoName="test.mp4">
        00:15 - 00:30
      </InlineTimestampSeekButton>,
    );

    const btn = container.querySelector('[data-testid="inline-timestamp-seek-btn"]')!;
    expect(btn.getAttribute('data-active')).toBe('true');

    // Scrub outside range
    act(() => {
      useMediaNavStore.setState({
        currentPlayTime: 50,
      });
    });

    expect(btn.getAttribute('data-active')).toBeNull();
  });
});
