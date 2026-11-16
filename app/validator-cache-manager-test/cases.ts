import assert from "./browser-assert";
import { ValidatorCacheManager } from "./browser-validator";
import { SubscribeManager } from "../../utils/subscribeManager";
import { PlainObjectCacheManager } from "../../utils/plainObjectCacheManager";
import type {
  AnyMutableFieldNode,
  MutableFieldNode,
  Validator,
  ValidationResult,
} from "../../utils/type";

// 独立构造节点，避免 FormModel 的初始化逻辑掩盖被测模块的问题。
function field(validator: Validator = () => null): MutableFieldNode<"field"> {
  return {
    type: "field",
    key: "name",
    path: ["dummy"],
    parent: undefined,
    validators: { onSubmit: validator, onBlur: () => null },
    validationStatus: {},
    validationCount: { onSubmit: { valid: 0, invalid: 0, validating: 0 } },
    snapshot: { dirty: "uninitialized" },
    cache: {
      plainObj: { type: "dirty" },
      selfDirty: false,
      touch: { value: false },
    },
    dynamicProp: {
      value: "Alice",
      visible: true,
      include: true,
      errorMessage: null,
      controlProp: undefined,
      required: false,
    },
    staticProp: { label: "姓名", toolTip: undefined },
    source: "initial",
    effect: new Set(),
  };
}

function group(
  child: AnyMutableFieldNode,
  validator: Validator = () => null,
): MutableFieldNode<"object"> {
  const root: MutableFieldNode<"object"> = {
    type: "object",
    key: "dummy",
    path: ["dummy"],
    parent: undefined,
    children: [child],
    validators: { onSubmit: validator },
    validationStatus: {},
    validationCount: { onSubmit: { valid: 0, invalid: 0, validating: 0 } },
    snapshot: { dirty: "uninitialized" },
    staticProp: {},
    cache: {
      plainObj: { type: "dirty" },
      selfDirty: false,
      touch: { value: false, count: 0 },
    },
    dynamicProp: {
      visible: true,
      include: true,
      removeWhenNoChildren: false,
      errorMessage: null,
    },
  };
  const attach = (
    node: AnyMutableFieldNode,
    parent: MutableFieldNode<"object" | "array">,
  ) => {
    node.parent = parent;
    node.path = [...parent.path, node.key];
    if (node.type !== "field")
      node.children.forEach((item) => attach(item, node));
  };
  attach(child, root);
  return root;
}

function setup(node: AnyMutableFieldNode) {
  const subscriptions = new SubscribeManager();
  const cache = new PlainObjectCacheManager(node);
  return {
    manager: new ValidatorCacheManager(node, subscriptions, cache),
    subscriptions,
    cache,
  };
}

function deferred() {
  let resolve!: (value: ValidationResult) => void;
  const promise = new Promise<ValidationResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const cases: { name: string; run: () => Promise<void> }[] = [
  {
    name: "同步通过：收到字段值并设为 valid",
    async run() {
      const node = field((value) => {
        assert.equal(value, "Alice");
        return null;
      });
      await setup(node).manager.validateAsync(node, "onSubmit");
      assert.equal(node.validationStatus.onSubmit, "valid");
    },
  },
  {
    name: "同步失败：设为 invalid",
    async run() {
      const node = field(() => ({ errorMessage: ["必填"] }));
      await setup(node).manager.validateAsync(node, "onSubmit");
      assert.equal(node.validationStatus.onSubmit, "invalid");
    },
  },
  {
    name: "同步失败：保存字段错误信息",
    async run() {
      const node = field(() => ({ errorMessage: ["必填"] }));
      await setup(node).manager.validateAsync(node, "onSubmit");
      assert.deepEqual(
        node.dynamicProp.errorMessage?.onSubmit.message,
        ["必填"],
        "同步校验失败后，应保存字段的错误提示。",
      );
    },
  },
  {
    name: "同步重新通过：清除旧错误",
    async run() {
      const node = field();
      node.dynamicProp.errorMessage = { onSubmit: { message: ["旧错误"] } };
      await setup(node).manager.validateAsync(node, "onSubmit");
      assert.deepEqual(
        node.dynamicProp.errorMessage?.onSubmit.message,
        [],
        "字段重新校验通过后，应清除上一次的错误提示。",
      );
    },
  },
  ...([null, { errorMessage: ["异步错误"] }] as ValidationResult[]).map(
    (result) => ({
      name: `异步${result ? "失败" : "通过"}：等待期间 validating，完成后更新状态和错误`,
      async run() {
        const task = deferred();
        const node = field(() => task.promise);
        const pending = setup(node).manager.validateAsync(node, "onSubmit");
        assert.equal(node.validationStatus.onSubmit, "validating");
        task.resolve(result);
        await pending;
        assert.equal(
          node.validationStatus.onSubmit,
          result ? "invalid" : "valid",
        );
        assert.deepEqual(
          node.dynamicProp.errorMessage?.onSubmit.message,
          result?.errorMessage ?? [],
        );
      },
    }),
  ),
  {
    name: "规则集隔离：onSubmit 不覆盖 onBlur",
    async run() {
      const node = field();
      node.validationStatus.onBlur = "invalid";
      node.dynamicProp.errorMessage = { onBlur: { message: ["保留"] } };
      await setup(node).manager.validateAsync(node, "onSubmit");
      assert.equal(node.validationStatus.onBlur, "invalid");
      assert.deepEqual(node.dynamicProp.errorMessage.onBlur.message, ["保留"]);
    },
  },
  {
    name: "void 节点：跳过校验器",
    async run() {
      const node = field(() => {
        throw new Error("排除的字段不应被校验");
      });
      node.dynamicProp.include = false;
      await setup(node).manager.validateAsync(node, "onSubmit");
      assert.equal(node.validationStatus.onSubmit, "valid");
    },
  },
  {
    name: "对象节点：校验器收到提交对象",
    async run() {
      const root = group(field(), (value) => {
        assert.deepEqual(value, { name: "Alice" });
        return null;
      });
      await setup(root).manager.validateAsync(root, "onSubmit");
      assert.equal(root.validationStatus.onSubmit, "valid");
    },
  },
  {
    name: "子节点失败：父节点汇总为 invalid",
    async run() {
      const root = group(field(() => ({ errorMessage: ["错误"] })));
      await setup(root).manager.validateAsync(root, "onSubmit");
      assert.equal(root.validationStatus.onSubmit, "invalid");
    },
  },
  {
    name: "父校验器错误：分发到子字段",
    async run() {
      const child = field();
      const root = group(child, () => ({
        errorMessage: ["对象错误"],
        children: { name: { errorMessage: ["字段错误"] } },
      }));
      await setup(root).manager.validateAsync(root, "onSubmit");
      assert.deepEqual(root.dynamicProp.errorMessage?.onSubmit.message, [
        "对象错误",
      ]);
      assert.deepEqual(child.dynamicProp.errorMessage?.onSubmit.message, [
        "字段错误",
      ]);
    },
  },
  {
    name: "脏缓存：验证前重建提交数据",
    async run() {
      const child = field();
      const root = group(child, (value) => {
        assert.deepEqual(value, { name: "Bob" });
        return null;
      });
      const { manager, cache } = setup(root);
      child.dynamicProp.value = "Bob";
      cache.updateNode(child);
      await manager.validateAsync(root, "onSubmit");
      assert.equal(root.cache.plainObj.type, "ready");
    },
  },
  {
    name: "订阅通知：异步开始和结束均通知状态",
    async run() {
      const task = deferred();
      const node = field(() => task.promise);
      const { manager, subscriptions } = setup(node);
      const observed: string[] = [];
      subscriptions.subscribe([], "validationStatus", () =>
        observed.push(node.validationStatus.onSubmit),
      );
      const pending = manager.validateAsync(node, "onSubmit");
      assert.deepEqual(observed, ["validating"]);
      task.resolve(null);
      await pending;
      assert.deepEqual(observed, ["validating", "valid"]);
    },
  },
  {
    name: "异步子字段：父校验完成前必须等待子字段",
    async run() {
      const task = deferred();
      const root = group(field(() => task.promise));
      let completed = false;
      const pending = setup(root)
        .manager.validateAsync(root, "onSubmit")
        .then(() => {
          root;
          debugger;
          completed = true;
        });
      // 排在验证完成的微任务之后检查，避免使用不稳定的计时断言。
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const completedEarly = completed;
      task.resolve({ errorMessage: ["子字段错误"] });
      await pending;
      assert.equal(
        completedEarly,
        false,
        "子字段尚未完成，校验方法却已经提前结束。",
      );
      assert.equal(root.validationStatus.onSubmit, "invalid");
    },
  },
  {
    name: "异步父校验器：返回的 Promise 等待父校验完成",
    async run() {
      const task = deferred();
      const root = group(field(), () => task.promise);
      let completed = false;
      const pending = setup(root)
        .manager.validateAsync(root, "onSubmit")
        .then(() => {
          completed = true;
        });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const completedEarly = completed;
      task.resolve({ errorMessage: ["对象错误"] });
      await pending;
      assert.equal(
        completedEarly,
        false,
        "父节点的校验器尚未完成，校验方法却已经提前结束。",
      );
      assert.equal(root.validationStatus.onSubmit, "invalid");
    },
  },
];

export type TestResult = {
  name: string;
  passed: boolean;
  error?: string;
  comparison?: { expected: string; actual: string };
};

function describeValue(value: unknown): string {
  if (value === undefined) return "未设置（undefined）";
  if (value === null) return "空值（null）";
  if (typeof value === "boolean") return value ? "是（true）" : "否（false）";
  if (Array.isArray(value) && value.length === 0)
    return "空列表（没有错误或记录）";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export const testCount = cases.length;
export const caseNames = cases.map((test) => test.name);

export async function runValidatorTests(
  onProgress?: (name: string) => void,
  selectedName?: string,
) {
  const selectedCases =
    selectedName === undefined
      ? cases
      : cases.filter((test) => test.name === selectedName);
  if (selectedCases.length === 0)
    throw new Error("找不到指定的测试用例，请重新选择。");
  const results: TestResult[] = [];
  for (const test of selectedCases) {
    onProgress?.(test.name);
    try {
      // 不设置超时，避免在 DevTools 中暂停调试后被误判为测试超时。
      await test.run();
      results.push({ name: test.name, passed: true });
    } catch (error) {
      if (error instanceof assert.AssertionError) {
        results.push({
          name: test.name,
          passed: false,
          error: error.message,
          comparison: {
            expected: describeValue(error.expected),
            actual: describeValue(error.actual),
          },
        });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ name: test.name, passed: false, error: message });
      }
    }
  }
  return results;
}
