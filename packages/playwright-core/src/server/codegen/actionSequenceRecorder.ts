/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * ActionSequenceRecorder
 *
 * Listens to the following user actions on an already-opened browser page:
 *   - Route navigation (navigate)
 *   - click
 *   - input/fill
 *
 * Collects the actions as an ActionInContext[] sequence that can be serialized for output.
 */

import type { Page } from '../../client/page';
import type { ActionInContext, ClickAction, FillAction, NavigateAction } from '@recorder/actions';

export type ActionSequenceResult = {
  actions: ActionInContext[];
  toJSON(): string;
  toJSONL(): string;
};

export class ActionSequenceRecorder {
  private _page: Page;
  private _actions: ActionInContext[] = [];
  private _pageAlias: string;
  private _frameListeners: Array<() => void> = [];
  private _recording = false;

  constructor(page: Page, options?: { pageAlias?: string }) {
    this._page = page;
    this._pageAlias = options?.pageAlias ?? 'page';
  }

  /** Start recording. */
  start(): void {
    if (this._recording) return;
    this._recording = true;
    this._installListeners();
  }

  /** Stop recording and return the action sequence result. */
  stop(): ActionSequenceResult {
    this._recording = false;
    this._removeListeners();
    const actions = [...this._actions];
    return {
      actions,
      toJSON: () => JSON.stringify(actions, null, 2),
      toJSONL: () => actions.map(a => JSON.stringify(a)).join('\n'),
    };
  }

  /** Clear all recorded actions. */
  clear(): void {
    this._actions = [];
  }

  /** Get the current recorded actions list (read-only copy). */
  getActions(): ActionInContext[] {
    return [...this._actions];
  }

  private _frameDescription() {
    return {
      pageGuid: (this._page as any)._guid ?? 'unknown',
      pageAlias: this._pageAlias,
      framePath: [] as string[],
    };
  }

  private _installListeners(): void {
    // 1. Listen for navigation events.
    const frameNavigatedHandler = (frame: any) => {
      if (frame === (this._page as any).mainFrame()) {
        if (!this._recording) return;
        const action: NavigateAction = {
          name: 'navigate',
          url: frame.url(),
          signals: [],
        };
        this._pushAction(action);
      }
    };
    (this._page as any).on('framenavigated', frameNavigatedHandler);
    this._frameListeners.push(() =>
      (this._page as any).off('framenavigated', frameNavigatedHandler)
    );

    // 2. Inject click/input listener script.
    (this._page as any).exposeBinding(
      '__pwRecordAction__',
      (_source: any, payload: { type: string; selector: string; value?: string }) => {
        if (!this._recording) return;
        this._handleBrowserEvent(payload);
      }
    ).catch(() => {});

    const injectedScript = `
      (function() {
        if (window.__pwRecorderInjected__) return;
        window.__pwRecorderInjected__ = true;

        document.addEventListener('click', function(e) {
          var el = e.target;
          if (!el) return;
          window.__pwRecordAction__({ type: 'click', selector: window.__pwBestSelector__(el) });
        }, true);

        document.addEventListener('input', function(e) {
          var el = e.target;
          if (!el || !('value' in el)) return;
          window.__pwRecordAction__({ type: 'fill', selector: window.__pwBestSelector__(el), value: el.value });
        }, true);

        window.__pwBestSelector__ = function(el) {
          if (!el) return '';
          var testId = el.getAttribute && el.getAttribute('data-testid');
          if (testId) return '[data-testid="' + testId + '"]';
          if (el.id) return '#' + el.id;
          var ariaLabel = el.getAttribute && el.getAttribute('aria-label');
          if (ariaLabel) return '[aria-label="' + ariaLabel + '"]';
          var tag = el.tagName ? el.tagName.toLowerCase() : 'unknown';
          var parent = el.parentElement;
          if (parent) {
            var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === el.tagName; });
            var idx = siblings.indexOf(el);
            if (siblings.length > 1) return tag + ':nth-of-type(' + (idx + 1) + ')';
          }
          return tag;
        };
      })();
    `;

    (this._page as any).addInitScript({ content: injectedScript }).catch(() => {});
    (this._page as any).evaluate(injectedScript).catch(() => {});
  }

  private _removeListeners(): void {
    for (const remove of this._frameListeners) {
      try { remove(); } catch { /* ignore */ }
    }
    this._frameListeners = [];
  }

  private _handleBrowserEvent(payload: { type: string; selector: string; value?: string }): void {
    if (payload.type === 'click') {
      const action: ClickAction = {
        name: 'click',
        selector: payload.selector,
        button: 'left',
        modifiers: 0,
        clickCount: 1,
        signals: [],
      };
      this._pushAction(action);
    } else if (payload.type === 'fill') {
      const action: FillAction = {
        name: 'fill',
        selector: payload.selector,
        text: payload.value ?? '',
        signals: [],
      };
      this._pushAction(action);
    }
  }

  private _pushAction(action: ActionInContext['action']): void {
    const now = Date.now();
    const entry: ActionInContext = {
      frame: this._frameDescription(),
      action,
      startTime: now,
      endTime: now,
    };
    this._actions.push(entry);
    console.log('[ActionSequenceRecorder]', JSON.stringify({ name: action.name, ...(action as any) }));
  }
}
