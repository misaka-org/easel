# Executor 插件

图执行引擎的 UI 插件，提供控制栏和节点状态覆盖层。

## 控制栏

顶部居中：

| 按钮 | 功能 |
|---|---|
| Compile | 编译图，检查依赖 |
| Step | 单步执行 |
| Run | 完整执行 |
| Stop | 停止 |
| Realtime | 切换实时模式 |
| Reset | 停止并重新编译 |

## 节点覆盖层

每个节点执行时的状态指示：

- running：蓝色边框 + 发光 + 进度条
- completed：绿色闪烁 600ms
- error：红色边框 + 发光 + 错误文本

## 右键菜单

注册 "Executor" 子菜单，含 "Reset Cache"。

## 内部

- 创建 `GraphExecutor` 实例
- `effect` 监听执行状态变化更新 UI
- `frame_effect` 每帧同步覆盖层位置
- 实时模式下监听 `state_changed` 检测 widget 变化