/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewportErrorBoundary } from './ViewportErrorBoundary.js';

function BrokenViewport({ broken }: { broken: boolean }) {
  if (broken) throw new Error('Invalid scene state');
  return <div>Viewport ready</div>;
}

describe('ViewportErrorBoundary', () => {
  afterEach(cleanup);

  it('contains a viewport render failure and resets for a new scene revision', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = render(
      <ViewportErrorBoundary resetKey="scene:1">
        <BrokenViewport broken />
      </ViewportErrorBoundary>,
    );

    expect(screen.getByRole('alert').textContent).toContain('Invalid scene state');

    rerender(
      <ViewportErrorBoundary resetKey="scene:2">
        <BrokenViewport broken={false} />
      </ViewportErrorBoundary>,
    );

    expect(screen.getByText('Viewport ready')).toBeTruthy();
    consoleError.mockRestore();
  });
});
