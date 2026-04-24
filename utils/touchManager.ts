import { AnyMutableFieldNode } from "./type";

class TouchManager {
  static setTouch(field: AnyMutableFieldNode, touch: boolean) {
    const dfs = (field: AnyMutableFieldNode, touch: boolean) => {
      if (field.type === "field") {
        field.cache.touch = touch;
      } else {
        field.children.forEach((f) => {
          dfs(f, touch);
        });
        field.cache.touch = touch ? field.children.length : 0;
      }
    };

    let change = touch !== field.cache.touch;
    dfs(field, touch);

    // 向上更新
    let cur = field.parent;
    while (cur && change) {
      const before = cur.cache.touch === 0 ? false : true;

      cur.cache.touch = cur.cache.touch + (touch ? 1 : -1);

      const after = cur.cache.touch === 0 ? false : true;
      change = before !== after;

      cur = cur.parent;
    }
  }

  static getTouch(field: AnyMutableFieldNode) {
    return typeof field.cache.touch === "boolean"
      ? field.cache.touch
      : field.cache.touch > 0;
  }
}
