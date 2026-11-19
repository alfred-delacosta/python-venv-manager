/* Copyright Advanced Software and AI Solutions LLC */
import { loadConfig } from '../core/config.js';
import { assertBindHost } from '../core/lan.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const config = loadConfig();
  assertBindHost(config.host, config.allowAllInterfaces);
  const app = await buildApp(config);
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Python Venv Manager listening on http://${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
