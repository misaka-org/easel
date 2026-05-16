# Node Picker 插件

通过搜索快速添加节点。

## 使用

- 双击画布空白处打开
- 输入搜索关键词
- 方向键上下选择，Enter 确认，Escape 关闭
- 鼠标悬停选择，点击添加

## 搜索范围

匹配以下字段（大小写不敏感）：

- 节点名称（label）
- 命名空间（ns 路径）
- 类型名（type）

## 界面

居中浮层：搜索框 + 可滚动列表。

- 每项：圆点指示器 + 名称 + 命名空间
- 无匹配显示 "No matching nodes found"
- 自动过滤 subgraph_input/subgraph_output