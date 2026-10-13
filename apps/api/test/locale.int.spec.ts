import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { freshDatabase, login, startApp } from './helpers';

/** Per-user interface language (Hebrew UI). */
jest.setTimeout(60_000);

describe('Interface language (integration)', () => {
  let ds: DataSource;
  let app: INestApplication;

  beforeAll(async () => {
    ds = await freshDatabase();
    app = await startApp(ds);
  });
  afterAll(async () => {
    await app?.close();
    await ds?.destroy();
  });

  const put = (cookie: string, csrf: string | null, body: object) => {
    const r = request(app.getHttpServer()).put('/api/v1/me/locale').set('Cookie', cookie);
    if (csrf) r.set('x-csrf-token', csrf);
    return r.send(body);
  };

  it('is unset by default, is saved per user and survives a new session', async () => {
    const eli = await login(app, ds, 'Eli Engineer');
    expect((await eli.get('/api/v1/me').expect(200)).body.locale).toBeNull();
    await put(eli.cookie, eli.csrf, { locale: 'he' }).expect(204);
    const again = await login(app, ds, 'Eli Engineer');
    expect((await again.get('/api/v1/me').expect(200)).body.locale).toBe('he');
    // Another person is unaffected.
    const dana = await login(app, ds, 'Dana Dev');
    expect((await dana.get('/api/v1/me').expect(200)).body.locale).toBeNull();
  });

  it('accepts only en/he, needs CSRF and a session', async () => {
    const eli = await login(app, ds, 'Eli Engineer');
    await put(eli.cookie, eli.csrf, { locale: 'fr' }).expect(400);
    await put(eli.cookie, null, { locale: 'en' }).expect(403);
    await request(app.getHttpServer()).put('/api/v1/me/locale').send({ locale: 'en' }).expect(401);
  });

  it('serves KPI definitions and explanations in the requested language', async () => {
    const lead = await login(app, ds, 'Taylor Lead');
    const en = (await lead.get('/api/v1/kpis/CYCLE_TIME/explanation').expect(200)).body;
    expect(en.title).toBe('Cycle Time');
    const he = (await lead.get('/api/v1/kpis/CYCLE_TIME/explanation?lang=he').expect(200)).body;
    expect(he.title).toBe('זמן מחזור');
    expect(he.example.description).toMatch(/חציון 4 ימים/);
    // Numbers come from the same engine run; only the words change.
    expect(he.example.result).toEqual(en.example.result);
    expect([he.version, he.unit]).toEqual([en.version, en.unit]);
    const viaHeader = (
      await lead.get('/api/v1/kpis/catalog').set('Accept-Language', 'he-IL,he;q=0.9').expect(200)
    ).body;
    expect(viaHeader.find((k: { code: string }) => k.code === 'WORK_ITEM_AGING').title).toBe(
      'גיל פריטים פתוחים',
    );
    // An explicit ?lang wins over the browser header.
    const forced = (
      await lead.get('/api/v1/kpis/catalog?lang=en').set('Accept-Language', 'he').expect(200)
    ).body;
    expect(forced[0].title).toBe('Cycle Time');
  });
});
