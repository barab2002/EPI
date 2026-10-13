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

  it('sends error and validation messages in the language of the request', async () => {
    const eli = await login(app, ds, 'Eli Engineer');
    const forbidden = await eli
      .get('/api/v1/admin/settings')
      .set('Accept-Language', 'he')
      .expect(403);
    expect(forbidden.body.message).toBe('נדרשת הרשאת מנהל מערכת');
    expect(forbidden.body.correlationId).toBeDefined();
    const english = await eli.get('/api/v1/admin/settings').expect(403);
    expect(english.body.message).toBe('Administrator role required');
    const invalid = await request(app.getHttpServer())
      .put('/api/v1/me/locale')
      .set('Cookie', eli.cookie)
      .set('x-csrf-token', eli.csrf)
      .set('Accept-Language', 'he-IL')
      .send({ locale: 'fr' })
      .expect(400);
    expect(invalid.body.message).toEqual(['השדה locale חייב להיות אחד מהערכים: en, he']);
    const anon = await request(app.getHttpServer()).get('/api/v1/me?lang=he').expect(401);
    expect(anon.body.message).toBe('לא מחוברים, או שתוקף ההתחברות פג');
  });

  it('sends the connection test result in Hebrew', async () => {
    const admin = await login(app, ds, 'Avery Admin');
    const created = await admin
      .post('/api/v1/admin/settings/connections', {
        kind: 'jira',
        name: 'jira-he',
        url: 'https://jira.corp.example',
        projects: ['ENG'],
        secretRef: 'EPI_HE_TEST_TOKEN',
      })
      .expect(201);
    const r = await admin
      .post(`/api/v1/admin/settings/connections/${created.body.id}/test`)
      .set('Accept-Language', 'he')
      .expect(200);
    expect(r.body.ok).toBe(false); // the token does not exist in the test environment
    expect(r.body.summary).toMatch(/^הטוקן EPI_HE_TEST_TOKEN לא סופק/);
  });
});
