import { test, expect } from '@playwright/test';

test.describe('E2E Smoke Test', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
  });

  test('metrics endpoint returns data', async ({ request }) => {
    const response = await request.get('/api/metrics');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(typeof body.activeRooms).toBe('number');
    expect(typeof body.connectedClients).toBe('number');
    expect(typeof body.uptime).toBe('number');
  });
});