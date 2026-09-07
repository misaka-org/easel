// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { en_messages } from './i18n/en';
import { zh_messages } from './i18n/zh';
import { apply_dom_translations, resolve_locale, set_locale, translate } from './i18n';

describe('playground i18n', () => {
  it('detects zh from common browser language values and falls back to en', () => {
    expect(resolve_locale('auto', 'zh')).toBe('zh');
    expect(resolve_locale('auto', 'zh-CN')).toBe('zh');
    expect(resolve_locale('auto', 'zh-TW')).toBe('zh');
    expect(resolve_locale('auto', 'en-US')).toBe('en');
    expect(resolve_locale('auto', undefined)).toBe('en');
    expect(resolve_locale('en', 'zh-CN')).toBe('en');
    expect(resolve_locale('zh', 'en-US')).toBe('zh');
  });

  it('keeps English and Chinese dictionaries aligned', () => {
    expect(Object.keys(zh_messages).sort()).toEqual(Object.keys(en_messages).sort());
  });

  it('replaces translate parameters in the active locale', () => {
    set_locale('en');
    expect(
      translate('scope_path_project_file', { file_name: 'demo.easel.json', path: 'root' }),
    ).toBe('demo.easel.json / root');

    set_locale('zh');
    expect(
      translate('scope_path_project_file', { file_name: 'demo.easel.json', path: 'root' }),
    ).toBe('demo.easel.json / root');

    expect(translate('overlay_scope_root_selected_hint', { host_id: 'host_a' })).toContain(
      'host_a',
    );
    expect(translate('file_error_unsupported_version', { version: 3 })).toContain('3');
    set_locale('en');
  });

  it('applies static DOM translations and option labels', () => {
    set_locale('en');
    document.body.innerHTML = [
      '<span id="static-label" data-i18n="app_project_label">Project</span>',
      '<span id="static-title" data-i18n-title="app_import_title" title="Open .easel.json"></span>',
      '<input id="static-search" data-i18n-placeholder="library_search_placeholder" placeholder="Filter nodes" />',
      '<select id="static-locale" data-i18n-aria-label="locale_selector_aria" aria-label="Playground language">',
      '<option value="auto" data-i18n-value="locale_auto">Auto</option>',
      '<option value="zh" data-i18n-value="locale_zh">Chinese</option>',
      '</select>',
    ].join('');

    set_locale('zh');
    apply_dom_translations(document.body);
    expect(document.getElementById('static-label')?.textContent).toBe(
      zh_messages.app_project_label,
    );
    expect(document.getElementById('static-title')?.getAttribute('title')).toBe(
      zh_messages.app_import_title,
    );
    expect(document.getElementById('static-search')?.getAttribute('placeholder')).toBe(
      zh_messages.library_search_placeholder,
    );
    expect(document.getElementById('static-locale')?.getAttribute('aria-label')).toBe(
      zh_messages.locale_selector_aria,
    );
    expect(document.querySelectorAll('#static-locale option')[0]?.textContent).toBe(
      zh_messages.locale_auto,
    );
    expect(document.querySelectorAll('#static-locale option')[1]?.textContent).toBe(
      zh_messages.locale_zh,
    );

    set_locale('en');
    apply_dom_translations(document.body);
    expect(document.getElementById('static-label')?.textContent).toBe('Project');
    expect(document.getElementById('static-title')?.getAttribute('title')).toBe(
      'Open .easel.json (Ctrl/Cmd+O)',
    );
    expect(document.getElementById('static-locale')?.getAttribute('aria-label')).toBe(
      'Playground language',
    );
    expect(document.querySelectorAll('#static-locale option')[1]?.textContent).toBe('Chinese');
  });
});
