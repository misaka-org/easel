# Minimap 插件

画布小地图，显示节点和视口范围，支持鼠标拖拽平移。

## 界面

右下角 150x100 canvas。

- 灰色矩形：节点
- 蓝色边框：当前视口

## 鼠标交互

小地图支持拖拽平移视口：

- `pointerdown` 开始拖拽，`setPointerCapture` 保证拖出小地图也能继续
- `pointermove` 时将小地图坐标映射到世界坐标，调用 `easel.camera.set()` 平移视口
- 滚轮事件在小地图上被阻止，避免与画布缩放冲突

## 实现

`frame_effect` 内每帧重绘：

1. 缓存 layout（nodes 不变化不重算）
2. 计算所有节点包围盒（+200px padding）
3. 缩放到 150x100
4. 绘制节点矩形
5. 绘制视口边框