import { en_messages, type PlaygroundMessages } from './i18n/en';
import { zh_messages } from './i18n/zh';

export type Locale = 'en' | 'zh';
export type LocalePreference = 'auto' | Locale;
export type MessageKey = keyof PlaygroundMessages;

const locale_preference_key = 'easel_playground_locale';
const message_dictionaries: Record<Locale, PlaygroundMessages> = {
  en: en_messages,
  zh: zh_messages,
};

let active_locale: Locale = 'en';
const locale_listeners = new Set<() => void>();

const get_local_storage = (): Storage | undefined => {
  try {
    if (typeof window === 'undefined' || window.localStorage == null) {
      return undefined;
    }
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export const get_current_locale = (): Locale => {
  return active_locale;
};

export const get_current_messages = (): PlaygroundMessages => {
  return message_dictionaries[active_locale];
};

export const translate = (
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
): string => {
  const template = message_dictionaries[active_locale][key];
  if (params == null) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value == null ? match : String(value);
  });
};

export const resolve_locale = (
  preference: LocalePreference,
  browser_language: string | undefined,
): Locale => {
  if (preference === 'en' || preference === 'zh') {
    return preference;
  }
  if (browser_language != null && browser_language.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  return 'en';
};

export const detect_browser_locale = (): Locale => {
  const browser_language = typeof navigator === 'undefined' ? undefined : navigator.language;
  return resolve_locale(read_locale_preference(), browser_language);
};

export const read_locale_preference = (): LocalePreference => {
  const value = get_local_storage()?.getItem(locale_preference_key);
  if (value === 'en' || value === 'zh' || value === 'auto') {
    return value;
  }
  return 'auto';
};

export const write_locale_preference = (preference: LocalePreference): void => {
  get_local_storage()?.setItem(locale_preference_key, preference);
};

export const set_locale = (locale: Locale): void => {
  if (active_locale === locale) {
    return;
  }
  active_locale = locale;
  if (typeof document !== 'undefined' && document.documentElement != null) {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }
  for (const listener of locale_listeners) {
    listener();
  }
};

export const on_locale_change = (listener: () => void): (() => void) => {
  locale_listeners.add(listener);
  return () => {
    locale_listeners.delete(listener);
  };
};

const translate_element_text = (element: Element): void => {
  const key = element.getAttribute('data-i18n');
  if (key == null) {
    return;
  }
  element.textContent = translate(key as MessageKey);
};

const translate_element_value = (element: Element): void => {
  const key = element.getAttribute('data-i18n-value');
  if (key == null) {
    return;
  }
  const value = translate(key as MessageKey);
  if (element instanceof HTMLOptionElement) {
    element.textContent = value;
  } else if (element instanceof HTMLInputElement) {
    element.value = value;
  }
};

export const apply_dom_translations = (root: ParentNode = document): void => {
  root.querySelectorAll('[data-i18n]').forEach(translate_element_text);
  root.querySelectorAll('[data-i18n-title]').forEach(element => {
    const key = element.getAttribute('data-i18n-title');
    if (key != null) {
      element.setAttribute('title', translate(key as MessageKey));
    }
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    if (key != null) {
      element.setAttribute('placeholder', translate(key as MessageKey));
    }
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
    const key = element.getAttribute('data-i18n-aria-label');
    if (key != null) {
      element.setAttribute('aria-label', translate(key as MessageKey));
    }
  });
  root.querySelectorAll('[data-i18n-value]').forEach(translate_element_value);
};
