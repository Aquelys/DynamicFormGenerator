import { SubscribeManager } from "./subscribeManager";
import { SubscribeNode } from "./subscribeType";
import {
  AnyMutableFieldNode,
  MutableFieldNode,
  MutableNestedFieldNode,
} from "./type";

export type NotifyFn = (
  field: AnyMutableFieldNode,
  sub: SubscribeNode,
  touch: boolean,
) => void;

export class TouchManager {
  static setTouched(
    field: MutableFieldNode<"field">,
    subscribeManager: SubscribeManager,
    notify?: NotifyFn,
  ) {
    const before = this.getTouch(field);
    field.cache.touch.value = true;
    this.propagateTouchChanges(field, true, before, subscribeManager, notify);
  }

  static resetTouch(
    field: AnyMutableFieldNode,
    subscribeManager: SubscribeManager,
    notify: NotifyFn,
  ) {
    const dfs = (field: AnyMutableFieldNode, sub?: SubscribeNode) => {
      if (field.type === "field") {
        field.cache.touch.value = false;
        sub && notify(field, sub, false);
        return;
      }

      field.children.forEach((x) => dfs(x, sub?.children?.get(x.key)));
      this.updateTouchCount(field);
      field.cache.touch.value = false;
    };

    const sub = subscribeManager.findNode(field.path.slice(1));
    const before = this.getTouch(field);
    debugger;
    dfs(field, sub);
    this.propagateTouchChanges(field, false, before, subscribeManager, notify);
  }

  static setSelfTouch(
    field: AnyMutableFieldNode,
    touch: boolean,
    subscribeManager: SubscribeManager,
    notify: NotifyFn,
  ) {
    if (field.type === "field") {
      this.setTouched(field, subscribeManager, notify);
    } else {
      const before = this.getTouch(field);
      field.cache.touch.value = touch;
      this.propagateTouchChanges(
        field,
        touch,
        before,
        subscribeManager,
        notify,
      );
    }
  }

  static getTouch(field: AnyMutableFieldNode): boolean {
    return field.type === "field"
      ? field.cache.touch.value
      : field.cache.touch.count > 0 || field.cache.touch.value;
  }

  static updateTouchCount(field: MutableNestedFieldNode) {
    field.cache.touch.count = field.children.filter((x) =>
      this.getTouch(x),
    ).length;
  }

  /**
   * 通知当前字段以及整个祖先链上的所有节点的touch变化
   *
   * @param field 当前发生变更的字段或节点
   * @param newVal 新的touch状态
   * @param beforeVal 变更前的touch状态
   * @param subscribeManager 订阅管理器
   * @param notify 通知回调
   */
  private static propagateTouchChanges(
    field: AnyMutableFieldNode,
    newVal: boolean,
    beforeVal: boolean,
    subscribeManager: SubscribeManager,
    notify?: NotifyFn,
  ) {
    let change = newVal !== beforeVal;
    const modifiedNodes: AnyMutableFieldNode[] = [field];

    // 向上更新
    let cur = field.parent;
    while (cur && change) {
      const before = this.getTouch(cur);

      cur.cache.touch.count = cur.cache.touch.count + (newVal ? 1 : -1);

      const after = this.getTouch(cur);
      change = before !== after;
      if (change) {
        modifiedNodes.push(cur);
      }

      cur = cur.parent;
    }

    // debugger;
    let curSub = subscribeManager.findNode(modifiedNodes.at(-1)!.path.slice(1));
    // 数组的node倒着读，关系是从根部到叶子的方向
    for (let i = modifiedNodes.length - 1; i >= 0; i--) {
      if (curSub) {
        notify?.(modifiedNodes[i], curSub, this.getTouch(modifiedNodes[i]));
      } else {
        break;
      }

      if (i === 0) {
        break;
      }
      curSub = curSub.children?.get(modifiedNodes[i - 1].path.at(-1)!);
    }
  }
}
