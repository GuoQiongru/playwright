/**
 * Advanced example: Convert recorded action sequences to executable Playwright test code.
 *   npx ts-node examples/record-actions-with-codegen.ts
 */

import { chromium } from '../packages/playwright-core';
import { ActionSequenceRecorder } from '../packages/playwright-core/src/server/codegen/actionSequenceRecorder';
import { JavaScriptLanguageGenerator } from '../packages/playwright-core/src/server/codegen/javascript';
import { generateCode } from '../packages/playwright-core/src/server/codegen/language';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://example.com');

  const recorder = new ActionSequenceRecorder(page, { pageAlias: 'page' });
  recorder.start();
  console.log('🎬 Recording... Press Ctrl+C to stop.');

  await new Promise<void>(resolve => process.on('SIGINT', () => resolve()));

  const result = recorder.stop();

  const generator = new JavaScriptLanguageGenerator();
  const { text } = generateCode(result.actions, generator, {
    browserName: 'chromium',
    launchOptions: {},
    contextOptions: {},
    deviceName: undefined,
    saveStorage: undefined,
  });

  console.log('\n✅ Generated Playwright test code:\n');
  console.log(text);

  await browser.close();
})();
