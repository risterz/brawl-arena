import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:8787',
    headless: true,
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    },
  },
  webServer: {
    command: 'npm run dev --workspace=@brawl-arena/worker',
    url: 'http://127.0.0.1:8787',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
