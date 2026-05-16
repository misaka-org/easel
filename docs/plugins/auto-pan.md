# Auto Pan 插件

拖拽/连线/框选时鼠标靠近边缘自动平移。

## 工作方式

- pointerdown 激活
- 距边缘 < 40px 时每帧向反方向平移 12px
- 作用于 dragging、wiring、resizing、box_selecting 四种模式
- 平移时同步修正交互起始偏移，保证操作连续
- requestAnimationFrame 循环检测