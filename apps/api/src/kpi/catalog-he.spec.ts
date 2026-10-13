import { KPI_TEXTS_HE } from './catalog-he';
import { KPI_CATALOG, localizedKpi } from './catalog';

const numbers = (s: string) => (s.match(/\d+(\.\d+)?/g) ?? []).sort();

describe('Hebrew KPI texts', () => {
  it('exist for every KPI, with the same list lengths and the same numbers as English', () => {
    for (const k of KPI_CATALOG) {
      const he = KPI_TEXTS_HE[k.code];
      expect(he).toBeDefined();
      for (const f of ['exclusions', 'caveats', 'possibleActions'] as const) {
        expect([k.code, f, he[f].length]).toEqual([k.code, f, k[f].length]);
        k[f].forEach((en, i) =>
          expect([k.code, f, numbers(he[f][i])]).toEqual([k.code, f, numbers(en)]),
        );
      }
      for (const f of ['formula', 'population', 'source', 'minimumSample'] as const) {
        expect([k.code, f, numbers(he[f])]).toEqual([k.code, f, numbers(k[f])]);
      }
      expect(numbers(he.exampleDescription)).toEqual(numbers(k.example().description));
      expect(he.title).not.toBe(k.title);
    }
    expect(Object.keys(KPI_TEXTS_HE).sort()).toEqual(KPI_CATALOG.map((k) => k.code).sort());
  });

  it('localizes texts only; formula version, unit, scopes and the worked example stay the same', () => {
    for (const k of KPI_CATALOG) {
      const en = localizedKpi(k, 'en');
      const he = localizedKpi(k, 'he');
      expect(en.title).toBe(k.title);
      expect(he.title).toBe(KPI_TEXTS_HE[k.code].title);
      expect([he.version, he.unit, he.direction, he.scopes, he.implementation]).toEqual([
        k.version,
        k.unit,
        k.direction,
        k.scopes,
        k.implementation,
      ]);
      const ex = he.example();
      expect(ex.result).toEqual(k.example().result);
      expect(ex.description).toBe(KPI_TEXTS_HE[k.code].exampleDescription);
      expect(he).not.toHaveProperty('exampleDescription');
    }
  });
});
