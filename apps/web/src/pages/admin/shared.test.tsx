import { act, renderHook } from '@testing-library/react';
import { today, useMutation } from './shared';

describe('useMutation', () => {
  it('ignores a second call while the first is in flight (no duplicate creates)', async () => {
    const setFlash = vi.fn();
    const { result } = renderHook(() => useMutation(setFlash));
    let release!: () => void;
    const action = vi.fn(() => new Promise<void>((r) => (release = r)));
    let first!: Promise<void>;
    act(() => {
      first = result.current(action, 'Saved.');
    });
    expect(result.current.pending).toBe(true);
    await act(() => result.current(action, 'Saved.'));
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await first;
    });
    expect(result.current.pending).toBe(false);
    expect(setFlash).toHaveBeenLastCalledWith({ kind: 'ok', text: 'Saved.' });
  });
});

describe('today', () => {
  it('is the local calendar date, not the UTC one', () => {
    const d = new Date();
    expect(today()).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  });
});
