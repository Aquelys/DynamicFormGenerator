// 本测试只比较基础值、数组和普通对象，不依赖 Node.js 的断言模块。
export class AssertionError extends Error {
  constructor(public actual: unknown, public expected: unknown, message = "实际结果与预期不一致，具体值见下方。") {
    super(message);
    this.name = "AssertionError";
  }
}

function sameValue(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true;
  if (typeof actual !== "object" || actual === null || typeof expected !== "object" || expected === null) return false;
  if (Object.getPrototypeOf(actual) !== Object.getPrototypeOf(expected)) return false;
  if (Array.isArray(actual) && Array.isArray(expected) && actual.length !== expected.length) return false;
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  return actualKeys.length === expectedKeys.length && expectedKeys.every(key =>
    Object.prototype.hasOwnProperty.call(actual, key) &&
    sameValue((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key]),
  );
}

export default {
  AssertionError,
  equal(actual: unknown, expected: unknown, message?: string) {
    if (!Object.is(actual, expected)) throw new AssertionError(actual, expected, message);
  },
  deepEqual(actual: unknown, expected: unknown, message?: string) {
    if (!sameValue(actual, expected)) throw new AssertionError(actual, expected, message);
  },
};
