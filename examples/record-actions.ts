/**
 * Usage example:
 *   npx ts-node examples/record-actions.ts
 *
 * Opens a browser, records the user's click / fill / navigate actions,
 * and outputs the action sequence as JSON when Ctrl+C is pressed.
 */

import { chromium } from '../packages/playwright-core';
import { ActionSequenceRecorder } from '../packages/playwright-core/src/server/codegen/actionSequenceRecorder';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://example.com');

  const recorder = new ActionSequenceRecorder(page, { pageAlias: 'page' });
  recorder.start();
  console.log('🎬 Recording started. Interact with the browser...');
  console.log('   Press Ctrl+C to stop recording and output the action sequence.\n');

  await new Promise<void>(resolve => {
    process.on('SIGINT', () => resolve());
  });

  const result = recorder.stop();
  console.log('\n\n✅ Recording finished. Action sequence:\n');

  console.log('=== JSON format ===');
  console.log(result.toJSON());

  console.log('\n=== JSONL format ===');
  console.log(result.toJSONL());

  await browser.close();
})();
