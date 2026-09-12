import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const apiUrl = process.env.COLMAP_TRAIN_TEST_API_URL;
const token = 'test-token'; // Dedicated test-only service credential.

async function mountSession(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // Mount the actual app session/window without a renderer or GPU allocation.
  await page.route('**/training-session-harness', route => route.fulfill({ contentType: 'text/html', body: `
    <link rel="stylesheet" href="/src/index.css">
    <div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { TrainingSessionHost } = await import('/src/training/useTrainingSession.ts');
    const { TrainingWindow } = await import('/src/components/training/TrainingWindow.tsx');
    const { useTrainingStore } = await import('/src/store/stores/trainingStore.ts');
    useTrainingStore.setState({ serverUrl: ${JSON.stringify(apiUrl)}, token: ${JSON.stringify(token)}, dockOpen: true, previewEnabled: false });
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(TrainingSessionHost, {}, React.createElement(TrainingWindow)));
    </script>` }));
  await page.goto('/training-session-harness');
  const popup = page.getByRole('region', { name: 'Training', exact: true });
  await expect(popup).toBeVisible();
  await expect(popup).not.toHaveAttribute('aria-modal', 'true');
  await expect.poll(async () => ({ connected: await page.getByText('Connected', { exact: true }).count(), errors })).toEqual({ connected: 1, errors: [] });
  await expect(popup.getByRole('tab')).toHaveCount(0);
  await expect(popup.getByLabel('Session token')).toHaveAttribute('type', 'password');
  await expect(popup.getByLabel('Session token')).toHaveValue(token);
  await page.evaluate(async () => {
    const storePath = '/src/store/reconstructionStore.ts';
    const buildersPath = '/src/test/builders/colmapBuilders.ts';
    const { useReconstructionStore } = await import(storePath) as typeof import('../src/store/reconstructionStore');
    const { buildReconstruction, buildImage } = await import(buildersPath) as typeof import('../src/test/builders/colmapBuilders');
    const names = ['left/same.png', 'right/same.png'];
    const images = names.map((name, index) => buildImage({ imageId: index + 1, name }));
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 2;
    canvas.getContext('2d')!.fillRect(0, 0, 2, 2);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Could not create session fixture image.')), 'image/png',
    ));
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ images }), sourceType: 'local',
      loadedFiles: { imageFiles: new Map(names.map(name => [name, new File([png], 'same.png', { type: 'image/png' })])), hasMasks: false } });
  });
}

async function state(page: Page) {
  return page.evaluate(async () => {
    const storePath = '/src/store/stores/trainingStore.ts';
    const { useTrainingStore } = await import(storePath) as typeof import('../src/store/stores/trainingStore');
    const value = useTrainingStore.getState();
    return {
      jobId: value.currentJobId,
      phase: value.phase,
      datasetId: value.datasetId,
      error: value.operationError ?? value.connectionError,
    };
  });
}

test.describe('Two independent training sessions over real HTTP', () => {
  test.skip(!apiUrl, 'Start tests/serve_fake_api.py and set COLMAP_TRAIN_TEST_API_URL.');
  test('recovers committed response loss, agrees on FIFO, and disconnects/cancels explicit jobs', async ({ browser, browserName, request }) => {
    const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
    if (browserName === 'chromium') await Promise.all(contexts.map(context => context.grantPermissions(['local-network-access'], { origin: 'http://localhost:5173' })));
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    const owned = new Set<string>();
    const transferRequests: Array<Record<string, unknown>> = [];
    const faultPrefix = randomUUID();
    try {
      const lost = new Set<string>();
      await pages[0].route(`${apiUrl}/api/v1/**`, async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.method() === 'PUT') transferRequests.push({ path, contentLength: request.headers()['content-length'], bodyBytes: request.postDataBuffer()?.byteLength ?? null });
        const boundary = request.method() === 'POST' && path.endsWith('/datasets') ? 'dataset'
          : request.method() === 'PUT' ? 'file'
          : request.method() === 'POST' && path.endsWith('/finalize') ? 'finalize'
          : request.method() === 'POST' && path.endsWith('/jobs') ? 'job' : null;
        if (boundary && !lost.has(boundary)) {
          lost.add(boundary);
          const url = new URL(request.url());
          url.searchParams.set('__test_drop_committed_response', `${faultPrefix}-${boundary}`);
          // Continue the one original request. The dedicated test server commits
          // it, then discards the JSON response body so the client must replay.
          await route.continue({ url: url.toString() });
        } else await route.continue();
      });
      await Promise.all(pages.map(mountSession));
      await pages[0].getByRole('button', { name: 'Train', exact: true }).click();
      await expect(pages[0].getByRole('tab')).toHaveCount(0);
      await expect.poll(async () => (await state(pages[0])).jobId).not.toBeNull();
      const first = (await state(pages[0])).jobId!; owned.add(first);
      await expect.poll(async () => {
        const response = await request.get(`${apiUrl}/api/v1/queue`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return (await response.json()).active_job?.job_id ?? null;
      }).toBe(first);
      await pages[1].getByRole('button', { name: 'Train', exact: true }).click();
      await expect.poll(async () => (await state(pages[1])).jobId).not.toBeNull();
      const second = (await state(pages[1])).jobId!; owned.add(second);
      await expect.poll(async () => {
        const response = await request.get(`${apiUrl}/api/v1/queue`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return (await response.json()).waiting.map((job: { job_id: string }) => job.job_id);
      }).toEqual([second]);
      expect([...lost].sort()).toEqual(['dataset', 'file', 'finalize', 'job']);
      const drops = await request.get(`${apiUrl}/__test/dropped-responses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect((await drops.json()).markers).toEqual(expect.arrayContaining(
        ['dataset', 'file', 'finalize', 'job'].map(boundary => `${faultPrefix}-${boundary}`),
      ));
      const history = await request.get(`${apiUrl}/api/v1/jobs`, { headers: { Authorization: `Bearer ${token}` } });
      const jobs = (await history.json()).items as Array<{ job_id: string; client_snapshot_id: string }>;
      expect(jobs.filter(job => owned.has(job.job_id))).toHaveLength(2);
      await pages[0].locator('.training-window-connection > summary').click();
      await pages[0].getByRole('button', { name: 'Disconnect', exact: true }).click();
      expect((await state(pages[0])).phase).toBe('disconnected');
      const stillRunning = await request.get(`${apiUrl}/api/v1/jobs/${first}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(['starting', 'running']).toContain((await stillRunning.json()).state);
      await pages[0].getByRole('button', { name: 'Connect / Retry', exact: true }).click();
      await expect(pages[0].getByText('Connected', { exact: true })).toBeVisible();
      await pages[1].getByRole('button', { name: 'Remove from queue', exact: true }).first().click();
      await expect.poll(async () => {
        const response = await request.get(`${apiUrl}/api/v1/queue`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return (await response.json()).waiting.length;
      }).toBe(0);
      const cancelled = await request.get(`${apiUrl}/api/v1/jobs/${second}`, { headers: { Authorization: `Bearer ${token}` } });
      expect((await cancelled.json()).state).toBe('cancelled');
      const active = await request.get(`${apiUrl}/api/v1/jobs/${first}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(['starting', 'running']).toContain((await active.json()).state);
    } finally {
      await test.info().attach('transfer-requests', { body: JSON.stringify(transferRequests), contentType: 'application/json' });
      for (const id of owned) await request.post(`${apiUrl}/api/v1/jobs/${id}/cancel`, { headers: { Authorization: `Bearer ${token}` } });
      await Promise.all(contexts.map(context => context.close()));
    }
  });

  test('reconciles receipts after repeated PUT response loss without duplicating the dataset', async ({ browser, browserName, request }) => {
    const context = await browser.newContext();
    if (browserName === 'chromium') await context.grantPermissions(['local-network-access'], { origin: 'http://localhost:5173' });
    const page = await context.newPage();
    let jobId: string | null = null;
    const faultPrefix = randomUUID();
    try {
      let droppedPath: string | null = null;
      let drops = 0;
      let recovering = false;
      const retriedPaths: string[] = [];
      let createCount = 0;
      await page.route(`${apiUrl}/api/v1/**`, async route => {
        const method = route.request().method();
        const path = new URL(route.request().url()).pathname;
        if (method === 'POST' && path.endsWith('/datasets')) createCount += 1;
        if (method === 'PUT') {
          if (recovering) retriedPaths.push(path);
          droppedPath ??= path;
          if (path === droppedPath && drops < 3) {
            const url = new URL(route.request().url());
            url.searchParams.set('__test_drop_committed_response', `${faultPrefix}-file-exhaust-${drops}`);
            drops += 1;
            await route.continue({ url: url.toString() });
            return;
          }
        }
        await route.continue();
      });
      await mountSession(page);
      await page.getByRole('button', { name: 'Train', exact: true }).click();
      await expect.poll(async () => {
        const current = await state(page);
        return current.error ? 'manual-recovery' : current.jobId ? 'browser-recovered' : 'pending';
      }, { timeout: 15000 }).not.toBe('pending');
      const outcome = await state(page);
      const datasetId = outcome.datasetId!;
      const response = await request.get(`${apiUrl}/api/v1/datasets/${datasetId}`, { headers: { Authorization: `Bearer ${token}` } });
      const dataset = await response.json() as { files: Array<{ file_id: string; receipt: unknown }> };
      const committed = dataset.files.filter(file => file.receipt).map(file => `/api/v1/datasets/${datasetId}/files/${file.file_id}`);
      expect(committed.length).toBeGreaterThan(0);
      if (outcome.error) {
        recovering = true;
        await page.getByRole('button', { name: 'Resume preparation', exact: true }).click();
        await expect.poll(async () => (await state(page)).jobId).not.toBeNull();
        jobId = (await state(page)).jobId;
        expect(retriedPaths.some(path => committed.includes(path))).toBe(false);
      } else {
        // Some browser/network stacks may replay a lost response before fetch
        // reports it. The receipt contract still prevents a second dataset or
        // a conflicting publication.
        jobId = outcome.jobId;
        expect(dataset.files.every(file => file.receipt)).toBe(true);
      }
      expect(createCount).toBe(1);
      expect((await state(page)).datasetId).toBe(datasetId);
      const dropResponse = await request.get(`${apiUrl}/__test/dropped-responses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const markers = (await dropResponse.json()).markers as string[];
      const expectedDropCount = outcome.error ? 3 : 1;
      expect(markers).toEqual(expect.arrayContaining(
        Array.from({ length: expectedDropCount }, (_, index) => `${faultPrefix}-file-exhaust-${index}`),
      ));
      await test.info().attach('response-loss-recovery-mode', {
        body: JSON.stringify({ browserName, mode: outcome.error ? 'explicit' : 'browser-transparent' }),
        contentType: 'application/json',
      });
    } finally {
      if (jobId) await request.post(`${apiUrl}/api/v1/jobs/${jobId}/cancel`, { headers: { Authorization: `Bearer ${token}` } });
      await context.close();
    }
  });
});
