// 本套测试仅使用当前浏览器窗口创建的原生 Promise；与 Node isPromise 一样不接受普通 thenable。
export function isPromise(value: unknown): value is Promise<unknown> {
  return value instanceof Promise;
}
