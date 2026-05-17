import type { WidgetTypeDef } from './register';

const builtin_widgets: WidgetTypeDef[] = [
  {
    type: 'text',
    create: (w) => {
      const el = document.createElement('input');
      el.type = 'text';
      el.dataset.widgetId = w.id;
      return el;
    },
    update: (el, w, { disabled }) => {
      const input = el as HTMLInputElement;
      input.disabled = disabled;
      if (input.value !== String(w.value)) input.value = String(w.value);
    },
    parse: (el) => (el as HTMLInputElement).value,
  },
  {
    type: 'textarea',
    create: (w) => {
      const el = document.createElement('textarea');
      el.dataset.widgetId = w.id;
      el.rows = 3;
      return el;
    },
    update: (el, w, { disabled }) => {
      const ta = el as HTMLTextAreaElement;
      ta.disabled = disabled;
      if (ta.value !== String(w.value)) ta.value = String(w.value);
    },
    parse: (el) => (el as HTMLTextAreaElement).value,
  },
  {
    type: 'number',
    create: (w) => {
      const el = document.createElement('input');
      el.type = 'number';
      el.dataset.widgetId = w.id;
      if (w.min !== undefined) (el as HTMLInputElement).min = String(w.min);
      if (w.max !== undefined) (el as HTMLInputElement).max = String(w.max);
      if (w.step !== undefined) (el as HTMLInputElement).step = String(w.step);
      return el;
    },
    update: (el, w, { disabled }) => {
      const input = el as HTMLInputElement;
      input.disabled = disabled;
      if (input.value !== String(w.value)) input.value = String(w.value);
    },
    parse: (el) => parseFloat((el as HTMLInputElement).value),
  },
  {
    type: 'boolean',
    create: (w) => {
      const el = document.createElement('input');
      el.type = 'checkbox';
      el.dataset.widgetId = w.id;
      return el;
    },
    update: (el, w, { disabled }) => {
      const input = el as HTMLInputElement;
      input.disabled = disabled;
      input.checked = !!w.value;
    },
    parse: (el) => (el as HTMLInputElement).checked,
  },
  {
    type: 'color',
    create: (w) => {
      const el = document.createElement('input');
      el.type = 'color';
      el.dataset.widgetId = w.id;
      return el;
    },
    update: (el, w, { disabled }) => {
      const input = el as HTMLInputElement;
      input.disabled = disabled;
      if (input.value !== String(w.value)) input.value = String(w.value);
    },
    parse: (el) => (el as HTMLInputElement).value,
  },
  {
    type: 'select',
    create: (w) => {
      const el = document.createElement('select');
      el.dataset.widgetId = w.id;
      const opts = w.options || [];
      for (const opt of opts) {
        const optEl = document.createElement('option');
        if (typeof opt === 'string') {
          optEl.value = opt;
          optEl.textContent = opt;
        } else {
          optEl.value = opt.value;
          optEl.textContent = opt.label;
        }
        el.appendChild(optEl);
      }
      return el;
    },
    update: (el, w, { disabled }) => {
      const sel = el as HTMLSelectElement;
      sel.disabled = disabled;
      sel.value = String(w.value);
    },
    parse: (el) => (el as HTMLSelectElement).value,
  },
  {
    type: 'range',
    create: (w) => {
      const el = document.createElement('input');
      el.type = 'range';
      el.dataset.widgetId = w.id;
      if (w.min !== undefined) (el as HTMLInputElement).min = String(w.min);
      if (w.max !== undefined) (el as HTMLInputElement).max = String(w.max);
      if (w.step !== undefined) (el as HTMLInputElement).step = String(w.step);
      return el;
    },
    update: (el, w, { disabled }) => {
      const input = el as HTMLInputElement;
      input.disabled = disabled;
      if (input.value !== String(w.value)) input.value = String(w.value);
    },
    parse: (el) => parseFloat((el as HTMLInputElement).value),
  },
  {
    type: 'switch',
    create: (w) => {
      const label = document.createElement('label');
      label.className = 'easel-switch';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.widgetId = w.id;
      input.className = 'easel-switch-input';
      const slider = document.createElement('span');
      slider.className = 'easel-switch-slider';
      label.appendChild(input);
      label.appendChild(slider);
      return label;
    },
    update: (el, w, { disabled }) => {
      const input = el.querySelector('.easel-switch-input') as HTMLInputElement;
      if (input) {
        input.disabled = disabled;
        input.checked = !!w.value;
      }
    },
    parse: (el) => {
      if (el.classList.contains('easel-switch-input')) {
        return (el as HTMLInputElement).checked;
      }
      const input = el.querySelector('.easel-switch-input') as HTMLInputElement;
      return input ? input.checked : false;
    },
  },
];

export default builtin_widgets;