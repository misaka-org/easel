import type { EaselPlugin } from '@/runtime/easel';
import { create_logger_service } from './service';
import { create_logger_window } from './ui';
import type { ContextMenuItem, ContextMenuContext } from '@/plugins/context_menu/types';

declare module '../../runtime/easel' {
  interface EaselPluginData {
    logger?: import('./types').LoggerService;
  }
}

export const logger_plugin: EaselPlugin = {
  id: '@easel/logger',
  dependencies: [{ id: '@easel/context-menu', hard: false }],
  setup(easel) {
    const service = create_logger_service();
    const window_ui = create_logger_window(easel.container, service);

    // 暴露到 plugin_data
    easel.plugin_data.logger = service;

    // 也暴露到 window 方便调试
    (window as any).__easel_logger = service;

    // 如果 context_menu 可用，注册菜单项
    const cm = easel.plugin_data.context_menu;
    if (cm) {
      cm.register({
        id: '@easel/logger',
        priority: 25,
        get_items: (_ctx: ContextMenuContext): readonly ContextMenuItem[] => [
          {
            id: 'toggle_logger',
            label: 'Toggle Logger',
            group: 'tools',
            action: () => window_ui.toggle(),
          },
        ],
      });
    }
  },
};
