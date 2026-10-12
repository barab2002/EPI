import type { DataSource } from 'typeorm';
import { rows } from './rows';

const fake = (result: unknown) => ({ query: async () => result }) as unknown as DataSource;

describe('rows', () => {
  it('returns SELECT/INSERT results as-is', async () => {
    expect(await rows(fake([{ id: 1 }]), 'SELECT 1')).toEqual([{ id: 1 }]);
  });
  it('unwraps UPDATE/DELETE … RETURNING [rows, count] results', async () => {
    expect(await rows(fake([[{ id: 1 }], 1]), 'UPDATE')).toEqual([{ id: 1 }]);
    expect(await rows(fake([[], 0]), 'UPDATE')).toEqual([]);
  });
  it('rejects unexpected shapes', async () => {
    await expect(rows(fake(42), 'X')).rejects.toThrow('Unexpected');
  });
});
