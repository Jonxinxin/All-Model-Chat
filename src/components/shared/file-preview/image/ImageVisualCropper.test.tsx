import { render, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageVisualCropper } from './ImageVisualCropper';

describe('ImageVisualCropper', () => {
  it('allows user to drag-select bounding box and triggers confirm callback', () => {
    const onConfirmSelection = vi.fn();
    const onCancel = vi.fn();

    const { container } = render(
      <div style={{ position: 'relative', width: 1000, height: 800 }}>
        <ImageVisualCropper
          fileName="screen.png"
          imageDimensions={{ width: 1000, height: 800 }}
          onConfirmSelection={onConfirmSelection}
          onCancel={onCancel}
        />
      </div>,
    );

    const surface = container.querySelector('[data-testid="visual-cropper-surface"]');
    expect(surface).not.toBeNull();

    // Mock surface getBoundingClientRect
    vi.spyOn(surface!, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 800,
      right: 1000,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Drag from (100, 80) to (500, 400) -> 10% to 50% horizontally, 10% to 50% vertically
    fireEvent.mouseDown(surface!, { clientX: 100, clientY: 80 });
    fireEvent.mouseMove(surface!, { clientX: 500, clientY: 400 });
    fireEvent.mouseUp(surface!, { clientX: 500, clientY: 400 });

    const selectionBox = container.querySelector('[data-testid="visual-crop-box"]');
    expect(selectionBox).not.toBeNull();

    const insertBtn = screen.getByTestId('visual-crop-insert-btn');
    expect(insertBtn).toBeInTheDocument();

    fireEvent.click(insertBtn);
    expect(onConfirmSelection).toHaveBeenCalledWith([100, 100, 500, 500]);
  });
});
