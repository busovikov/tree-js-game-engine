/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NumberField } from './NumberField.js';

describe('NumberField', () => {
  afterEach(cleanup);

  it('does not emit an out-of-range value while the user is typing', () => {
    const values: number[] = [];
    render(
      <NumberField
        label="Opacity"
        value={1}
        min={0}
        max={1}
        onChange={(value) => values.push(value)}
      />,
    );

    const input = screen.getByLabelText('Opacity');
    fireEvent.change(input, { target: { value: '2.5' } });

    expect(values).toEqual([]);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('clamps a finite draft on blur and restores an empty draft', () => {
    const values: number[] = [];
    const { rerender } = render(
      <NumberField
        label="Opacity"
        value={0.5}
        min={0}
        max={1}
        onChange={(value) => values.push(value)}
      />,
    );

    const input = screen.getByLabelText('Opacity') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.blur(input);
    expect(values).toEqual([1]);

    rerender(
      <NumberField
        label="Opacity"
        value={1}
        min={0}
        max={1}
        onChange={(value) => values.push(value)}
      />,
    );
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(values).toEqual([1]);
    expect(input.value).toBe('1');
  });
});
