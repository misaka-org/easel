# History 插件

撤销/重做功能，带历史列表面板。

## 快捷键

- Ctrl+Z：撤销
- Ctrl+Shift+Z / Ctrl+Y：重做
- 点击面板记录项跳转到对应状态

## 实现

- 包装 `easel.dispatch`，在 `interaction === "idle"` 时记录快照
- 上限 50 条，超出丢弃最早记录
- 跳转时只恢复 nodes/wires，保留 camera 位置
- 面板可折叠（点击标题栏）

## 右键菜单

注册 "History" 子菜单（Undo / Redo）。