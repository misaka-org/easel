# React Integration

Easel 不内建框架绑定。React 节点通过 `EaselNode` 标准的 `mount`/`unmount` 生命周期 + `node_events` 粒度订阅实现对接。

## 原理

1. 继承 `EaselNode`，在 `mount` 时 `createRoot(container).render(<MyComponent />)`
2. 通过 `node_events` 订阅 `data` 事件，收到新数据时 re-render
3. `dispatch` 直接传入组件，或通过 `useEasel` hook 封装
4. `unmount` 时清理事件监听 + `root.unmount()`

核心通信接口只有三个：

| 接口 | 用途 |
|---|---|
| `easel.getState()` | 同步读取当前 State |
| `easel.dispatch(updater)` | 发起状态变更 |
| `easel.node_events.get(id)?.on('data', fn)` | 订阅单个节点的数据变化 |

不需要额外的 Provider 或 Context。

## 完整示例

```tsx
import { createRoot, type Root } from 'react-dom/client';
import { useState, useEffect } from 'react';
import { EaselNode, type GraphNode, type State } from 'easel';

type Props = {
  data: GraphNode;
  dispatch: (updater: (s: State) => State) => void;
};

function MyWidget({ data, dispatch }: Props) {
  return (
    <div style={{ padding: '12px' }}>
      <h4>{data.title}</h4>
      {data.widgets?.map((w) => (
        <input
          key={w.id}
          defaultValue={String(w.value)}
          onChange={(e) =>
            dispatch((s) => {
              const node = s.nodes[data.id];
              if (!node) return s;
              const widgets = node.widgets?.map((x) =>
                x.id === w.id ? { ...x, value: e.target.value } : x
              );
              return { ...s, nodes: { ...s.nodes, [data.id]: { ...node, widgets } } };
            })
          }
        />
      ))}
    </div>
  );
}

// --- Easel 节点包装 ---
export class ReactNode extends EaselNode {
  private root: Root | null = null;
  private currentData: GraphNode | null = null;

  mount(node_data: GraphNode) {
    this.currentData = node_data;
    this.root = createRoot(this.container);
    this.renderComponent(node_data);

    // 订阅自己的变化，增量更新
    this.context.node_events?.get(this.node_id)?.on('data', ({ next }) => {
      this.currentData = next;
      this.renderComponent(next);
    });
  }

  // easel 每帧会调用 update，但 React 由事件驱动，这里不需要额外操作
  update(node_data: GraphNode, _state: State) {
    // noop — React 组件通过 node_events 收到更新后自行 re-render
  }

  unmount() {
    this.context.node_events?.get(this.node_id)?.off('data');
    this.root?.unmount();
  }

  private renderComponent(data: GraphNode) {
    this.root?.render(<MyWidget data={data} dispatch={this.dispatch} />);
  }
}
```

## Hook 封装（可选）

如果要跨组件共享 `easel` 实例，可以创建一个轻量 React Context：

```tsx
import { createContext, useContext, type ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { Easel, type GraphNode } from 'easel';

const EaselCtx = createContext<Easel | null>(null);

export function EaselProvider({ easel, children }: { easel: Easel; children: ReactNode }) {
  return <EaselCtx.Provider value={easel}>{children}</EaselCtx.Provider>;
}

export function useNodeState(nodeId: string): GraphNode | null {
  const easel = useContext(EaselCtx);
  if (!easel) throw new Error('missing EaselProvider');

  return useSyncExternalStore(
    (cb) => {
      const ev = easel.node_events.get(nodeId);
      if (!ev) return () => {};
      ev.on('data', cb);
      return () => ev.off('data', cb);
    },
    () => easel.getState().nodes[nodeId] ?? null,
  );
}
```

## 注意事项

- `update()` 可以留空 — React 自己管 re-render，不要在里面操作 DOM
- `node_events` 的 `data` 事件在节点数据真正变化时才触发（引用比较），不会因 camera 移动等无关操作 re-render
- 不要在 React 组件里直接订阅 `easel.app_events` 的全局事件，粒度太粗
- `dispatch` 是不变的引用，可以直接传给组件或用 context 共享