# @vue/reactivity API 参考文档

`@vue/reactivity` 是 Vue 3 的核心响应式系统模块，可以脱离 Vue 框架独立使用，适用于任何需要响应式状态管理的 JavaScript 项目。

## 安装与使用

```bash
npm install @vue/reactivity
```

**独立使用注意事项**：该包的独立构建不应与用户面向渲染器（如 `@vue/runtime-dom`）的预打包构建一起使用——它们有不同的内部存储结构，一起使用会导致响应式连接状态混乱。

**基础示例**：

```javascript
import { ref, effect } from "@vue/reactivity";

const count = ref(0);

effect(() => {
  console.log(`count is: ${count.value}`);
});

count.value++; // 控制台输出: count is: 1
```

---

## 一、响应式基础 API

### 1. `ref()`

创建一个包含内部值的 ref 对象，通过 `.value` 属性访问和修改。ref 对象是可变的、响应式的，对 `.value` 的读取会被追踪，修改会触发相关副作用。

```typescript
function ref<T>(value: T): Ref<UnwrapRef<T>>;

interface Ref<T> {
  value: T;
}
```

```javascript
import { ref } from "@vue/reactivity";

const count = ref(0);
console.log(count.value); // 0

count.value++;
console.log(count.value); // 1

// 对象赋值时会自动进行深层响应式转换
const obj = ref({ nested: { a: 1 } });
obj.value.nested.a = 2; // 响应式，会触发副作用
```

---

### 2. `computed()`

接受一个 getter 函数，返回一个只读的 ref 对象。也可以接受包含 `get` 和 `set` 函数的对象来创建可写的计算属性。

```typescript
// 只读
function computed<T>(
  getter: () => T,
  debuggerOptions?: DebuggerOptions
): Readonly<Ref<Readonly<T>>>;

// 可写
function computed<T>(
  options: { get: () => T; set: (value: T) => void },
  debuggerOptions?: DebuggerOptions
): Ref<T>;
```

```javascript
import { ref, computed } from "@vue/reactivity";

const count = ref(1);

// 只读计算属性
const plusOne = computed(() => count.value + 1);
console.log(plusOne.value); // 2

// 可写计算属性
const plusOneWritable = computed({
  get: () => count.value + 1,
  set: (val) => {
    count.value = val - 1;
  },
});

plusOneWritable.value = 1;
console.log(count.value); // 0
```

---

### 3. `reactive()`

返回一个普通对象的响应式代理。响应式转换是"深层的"：影响所有嵌套属性，且会自动解包 ref 值。

```typescript
function reactive<T extends object>(target: T): UnwrapNestedRefs<T>;
```

```javascript
import { reactive, ref } from "@vue/reactivity";

const state = reactive({
  count: 0,
  nested: { a: 1, b: 2 },
});

state.count = 1; // 响应式
state.nested.a = 3; // 深层响应式

// ref 在 reactive 内部会自动解包
const msg = ref("hello");
const state2 = reactive({
  text: msg,
});
console.log(state2.text); // 'hello'，无需 .value
```

---

## 二、浅层响应式 API

### 4. `shallowRef()`

`ref()` 的浅层版本。内部值按原样存储和暴露，不会进行深层响应式转换。只有 `.value` 的访问是响应式的。

```typescript
function shallowRef<T>(value: T): ShallowRef<T>;

interface ShallowRef<T> {
  value: T;
}
```

```javascript
import { shallowRef, effect } from "@vue/reactivity";

const state = shallowRef({ count: 1 });

effect(() => {
  console.log(state.value.count);
});

// 以下操作不会触发副作用（深层修改）
state.value.count = 2;

// 以下操作会触发副作用（替换整个 .value）
state.value = { count: 2 };
```

---

### 5. `triggerRef()`

强制触发依赖浅层 ref 的副作用。通常在浅层 ref 的内部值发生深层变更后手动调用。

```typescript
function triggerRef(ref: ShallowRef): void;
```

```javascript
import { shallowRef, effect, triggerRef } from "@vue/reactivity";

const shallow = shallowRef({ greet: "Hello, world" });

effect(() => {
  console.log(shallow.value.greet);
});

// 深层修改不会自动触发
shallow.value.greet = "Hello, universe";

// 手动触发
triggerRef(shallow); // 控制台输出: Hello, universe
```

---

### 6. `shallowReactive()`

`reactive()` 的浅层版本。仅根级属性是响应式的，属性值按原样存储和暴露，ref 值不会被自动解包。

```typescript
function shallowReactive<T extends object>(target: T): T;
```

```javascript
import { shallowReactive, isReactive } from "@vue/reactivity";

const state = shallowReactive({
  foo: 1,
  nested: { bar: 2 },
});

state.foo++; // ✅ 响应式
state.nested.bar++; // ❌ 不响应式，nested 不是响应式对象

console.log(isReactive(state)); // true
console.log(isReactive(state.nested)); // false
```

---

### 7. `shallowReadonly()`

`readonly()` 的浅层版本。仅根级属性是只读的，嵌套属性的值保持不变（但其引用不能被替换）。

```typescript
function shallowReadonly<T extends object>(target: T): Readonly<T>;
```

```javascript
import { shallowReadonly } from "@vue/reactivity";

const state = shallowReadonly({
  name: "Vue",
  nested: { version: 3 },
});

state.name = "React"; // ❌ 警告，不可修改
state.nested.version = 3.5; // ✅ 可以修改（嵌套属性不是只读的）
```

---

## 三、只读 API

### 8. `readonly()`

接受一个对象（响应式或普通对象）或 ref，返回原始对象的只读代理。只读代理是深层的：所有嵌套属性都是只读的。

```typescript
function readonly<T extends object>(
  target: T
): DeepReadonly<UnwrapNestedRefs<T>>;
```

```javascript
import { reactive, readonly } from "@vue/reactivity";

const original = reactive({ count: 0 });
const copy = readonly(original);

original.count++; // ✅ 正常工作
copy.count = 1; // ❌ 警告，不可修改
```

---

## 四、自定义 Ref API

### 9. `customRef()`

创建带有显式依赖追踪和更新触发控制的定制化 ref。适用于需要防抖、节流等场景。

```typescript
function customRef<T>(factory: CustomRefFactory<T>): Ref<T>;

type CustomRefFactory<T> = (
  track: () => void,
  trigger: () => void
) => {
  get: () => T;
  set: (value: T) => void;
};
```

```javascript
import { customRef } from "@vue/reactivity";

// 防抖 ref
function useDebouncedRef(value, delay = 200) {
  let timeout;
  return customRef((track, trigger) => ({
    get() {
      track();
      return value;
    },
    set(newValue) {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        value = newValue;
        trigger();
      }, delay);
    },
  }));
}

const text = useDebouncedRef("hello");
text.value = "world"; // 200ms 后触发更新
```

---

## 五、副作用 API

### 10. `effect()`

副作用函数，是 Vue 响应式系统的核心。它会立即执行传入的函数，并在执行过程中自动收集依赖，当依赖发生变化时重新执行。

```typescript
function effect<T = any>(
  fn: () => T,
  options?: EffectOptions
): ReactiveEffectRunner;
```

```javascript
import { ref, effect } from "@vue/reactivity";

const count = ref(0);
const double = computed(() => count.value * 2);

effect(() => {
  console.log(`count: ${count.value}, double: ${double.value}`);
});

count.value = 1; // 控制台输出: count: 1, double: 2
```

---

### 11. `stop()`

停止一个副作用实例的响应式追踪。终止后，该副作用不会再被任何后续的数据变化触发。

```typescript
function stop(runner: ReactiveEffectRunner): void;
```

```javascript
import { ref, effect, stop } from "@vue/reactivity";

const count = ref(0);
const runner = effect(() => {
  console.log(`count is: ${count.value}`);
});

count.value = 1; // 输出: count is: 1

stop(runner);
count.value = 2; // 不输出（副作用已停止）
```

---

### 12. `watchEffect()`

立即运行一个函数，响应式地追踪其依赖，并在依赖变更时重新运行。与 `effect()` 类似，但适用场景更接近 Vue 组件。

```javascript
import { ref, watchEffect } from "@vue/reactivity";

const count = ref(0);
const name = ref("Vue");

watchEffect(() => {
  console.log(`${name.value}: ${count.value}`);
});

count.value = 1; // 输出: Vue: 1
name.value = "React"; // 输出: React: 1
```

---

### 13. `watch()`

侦听一个或多个响应式数据源，只有当数据源实际发生变化时才会触发回调。

```javascript
import { ref, watch } from "@vue/reactivity";

const count = ref(0);

watch(count, (newValue, oldValue) => {
  console.log(`count changed from ${oldValue} to ${newValue}`);
});

count.value = 1; // 输出: count changed from 0 to 1
```

---

## 六、响应式工具函数

### 14. `toRaw()`

返回响应式代理指向的原始对象。这是一个"逃生舱"，用于临时读取数据或写入数据而不触发变更。不建议保留对原始对象的持久引用。

```typescript
function toRaw<T>(observed: T): T;
```

```javascript
import { reactive, toRaw } from "@vue/reactivity";

const state = reactive({ count: 0 });
const raw = toRaw(state);

console.log(raw === state); // false

// 修改原始对象不会触发响应式更新
raw.count = 1; // 不会触发任何副作用
```

---

### 15. `markRaw()`

标记一个对象，使其永远不会转换为响应式代理。即使将该对象作为属性添加到响应式对象中，它也不会被转换。

```typescript
function markRaw<T extends object>(value: T): T;
```

```javascript
import { reactive, markRaw } from "@vue/reactivity";

const nonReactive = markRaw({ count: 0 });

const state = reactive({
  data: nonReactive,
});

state.data.count = 1; // 修改了数据
state.data = { ...state.data }; // 必须替换整个属性才能触发响应式
```

适合用于不可变数据、第三方类实例等不需要响应式追踪的场景。

---

## 七、类型判断 API

### 16. `isProxy()`

检查对象是否是由 `reactive()` 或 `readonly()` 创建的代理。

```typescript
function isProxy(value: unknown): boolean;
```

```javascript
import { reactive, readonly, isProxy } from "@vue/reactivity";

const state = reactive({});
const readonlyState = readonly({});

console.log(isProxy(state)); // true
console.log(isProxy(readonlyState)); // true
console.log(isProxy({})); // false
```

---

### 17. `isReactive()`

检查对象是否是由 `reactive()` 创建的响应式代理。如果对象是由 `readonly()` 包装的、但内部包装了一个 `reactive()` 创建的代理，也返回 `true`。

```typescript
function isReactive(value: unknown): boolean;
```

```javascript
import { reactive, readonly, isReactive } from "@vue/reactivity";

const state = reactive({ count: 0 });
const readonlyState = readonly(state);

console.log(isReactive(state)); // true
console.log(isReactive(readonlyState)); // true（内部包装了 reactive）
console.log(isReactive({})); // false
```

---

### 18. `isReadonly()`

检查对象是否是由 `readonly()` 创建的只读代理。

```typescript
function isReadonly(value: unknown): boolean;
```

```javascript
import { reactive, readonly, isReadonly } from "@vue/reactivity";

const state = reactive({ count: 0 });
const readonlyState = readonly(state);

console.log(isReadonly(state)); // false
console.log(isReadonly(readonlyState)); // true
```

---

### 19. `isRef()`

检查一个值是否为 ref 对象。

```typescript
function isRef(value: unknown): boolean;
```

```javascript
import { ref, isRef, reactive } from "@vue/reactivity";

const count = ref(0);
const state = reactive({});

console.log(isRef(count)); // true
console.log(isRef(state)); // false
```

---

### 20. `isShallow()`

检查一个代理是否是浅层代理（由 `shallowReactive()` 或 `shallowReadonly()` 等创建）。

```typescript
function isShallow(value: unknown): boolean;
```

```javascript
import { reactive, shallowReactive, isShallow } from "@vue/reactivity";

const deep = reactive({});
const shallow = shallowReactive({});

console.log(isShallow(deep)); // false
console.log(isShallow(shallow)); // true
```

---

## 八、生命周期与作用域 API

### 21. `effectScope()`

创建一个 effect 作用域，可以捕获在其内部创建的响应式副作用（包括通过 `effect`、`computed` 等创建的）。该作用域可以在之后被一次性销毁。

```typescript
function effectScope(detached?: boolean): EffectScope;
```

```javascript
import { ref, effectScope, effect, computed } from "@vue/reactivity";

const count = ref(0);
const scope = effectScope();

scope.run(() => {
  effect(() => {
    console.log(`count: ${count.value}`);
  });

  const double = computed(() => count.value * 2);
  console.log(double.value);
});

count.value = 1; // 正常触发

// 一次性停止作用域内的所有副作用
scope.stop();
count.value = 2; // 不再触发任何输出
```

---

## 九、Refs 解包与转换

### 22. `toRef()`

为响应式对象的某个属性创建一个 ref。该 ref 会与源属性保持同步：修改 ref 会更新源属性，反之亦然。

```typescript
function toRef<T extends object, K extends keyof T>(
  object: T,
  key: K
): ToRef<T[K]>;
```

```javascript
import { reactive, toRef, effect } from "@vue/reactivity";

const state = reactive({ count: 0 });
const countRef = toRef(state, "count");

effect(() => {
  console.log(countRef.value);
});

state.count = 1; // 输出: 1
countRef.value = 2; // state.count 也变为 2
```

---

### 23. `toRefs()`

将响应式对象转换为一个普通对象，其中每个属性都是指向源对象对应属性的 ref。

```typescript
function toRefs<T extends object>(object: T): ToRefs<T>;
```

```javascript
import { reactive, toRefs, effect } from "@vue/reactivity";

const state = reactive({ count: 0, name: "Vue" });
const refs = toRefs(state);

effect(() => {
  console.log(`count: ${refs.count.value}, name: ${refs.name.value}`);
});

state.count++; // 输出: count: 1, name: Vue
refs.name.value = "React"; // state.name 也变为 'React'
```

---

### 24. `toValue()`

规范化一个值、ref 或 getter 函数，返回其实际值。常用于在非响应式上下文中安全地获取 ref 的值。

```typescript
function toValue<T>(source: T | Ref<T> | (() => T)): T;
```

```javascript
import { ref, toValue, computed } from "@vue/reactivity";

const count = ref(10);
const double = computed(() => count.value * 2);

console.log(toValue(count)); // 10
console.log(toValue(100)); // 100
console.log(toValue(double)); // 20
```

---

### 25. `unref()`

如果参数是 ref，则返回其 `.value`；否则直接返回该参数本身。是 `val = isRef(val) ? val.value : val` 的语法糖。

```typescript
function unref<T>(ref: T | Ref<T>): T;
```

```javascript
import { ref, unref } from "@vue/reactivity";

const count = ref(10);
const plain = 20;

console.log(unref(count)); // 10
console.log(unref(plain)); // 20
```

---

## 十、集合类型支持

`@vue/reactivity` 响应式系统基于 Proxy，**原生支持** `Map`、`Set`、`WeakMap`、`WeakSet` 等集合类型。直接将集合类型传给 `reactive()` 或作为 ref 的值即可获得响应式代理，集合的 `set`、`delete`、`clear` 等操作都会自动触发响应式更新。

```javascript
import { reactive, effect } from "@vue/reactivity";

const map = reactive(new Map());
const set = reactive(new Set());

effect(() => {
  console.log(`map size: ${map.size}, set size: ${set.size}`);
});

map.set("key", "value"); // 触发副作用
set.add("item"); // 触发副作用
```

> **注意**：普通数组支持完整，但 ref 在作为响应式数组或集合的元素时不会自动解包，这一点与 `reactive` 对象的属性不同。

---

## 补充说明与注意事项

### 1. 内置对象特殊处理

未观察的内置对象无法进行响应式代理，但 `Array`、`Map`、`WeakMap`、`Set` 和 `WeakSet` 例外，它们都得到了充分支持。

### 2. ref 在 reactive 中的自动解包

当 ref 作为 `reactive` 对象的属性时，会自动解包，无需通过 `.value` 访问。但在响应式数组或集合类型中，ref **不会**被自动解包。

### 3. 性能优化建议

- 对于大型数据结构，优先使用 `shallowRef` 或 `shallowReactive` 来减少深层代理开销
- 使用 `markRaw` 标记不需要响应式的大型静态数据源
- 使用 `effectScope` 统一管理组件的副作用生命周期

### 4. TypeScript 支持

所有 API 都提供了完整的 TypeScript 类型声明，可在使用时获得良好的类型提示和检查。

### 5. API 完整列表获取方式

如需查看最新导出的完整 API 列表，可以从源码 `src/index.ts` 入口文件获取，或运行以下命令生成 API 报告：

```bash
pnpm build reactivity --types
# API 报告生成在 temp/reactivity.api.md
```

---

## 独立项目完整示例

```javascript
// counter.js — 一个使用 @vue/reactivity 的独立状态管理示例
import { ref, computed, effect, toRefs } from "@vue/reactivity";

// 创建状态
const state = ref({ count: 0, step: 1 });

// 派生状态
const doubled = computed(() => state.value.count * 2);

// 副作用 — 自动追踪依赖
effect(() => {
  console.log(`Count: ${state.value.count}, Doubled: ${doubled.value}`);
});

// 修改状态，自动触发副作用
setInterval(() => {
  state.value.count += state.value.step;
}, 1000);

// 导出状态供其他模块使用
export function useCounter() {
  return toRefs(state.value);
}

// 5秒后停止所有副作用
setTimeout(() => {
  console.log("Stopping all effects...");
  // 在实际项目中可结合 effectScope 来统一管理
}, 5000);
```
