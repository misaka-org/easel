# Guidelines 插件

拖拽节点时的吸附对齐参考线。

## 特性

- 自动对齐其他节点的边缘和中心
- 阈值 10px
- 蓝色虚线参考线
- 按住 Shift 暂停吸附

## 吸附点

x 方向 5 组：target.left/right/centerX -> dragged.left/right/centerX
y 方向 5 组：target.top/bottom/centerY -> dragged.top/bottom/centerY

## 实现

通过 `store.onAfterChange('node', handler)` 注册 store hook：

1. 节点位置变化时检测被拖拽节点与其他节点的距离
2. 找到最近的对齐点（< 10px）
3. 自动修正位置
4. SVG 叠加层绘制参考线