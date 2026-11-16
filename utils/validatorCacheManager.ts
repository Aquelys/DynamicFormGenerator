import {
  AnyMutableFieldNode,
  ErrorMessage,
  FieldType,
  MutableFieldNode,
  ValidationResult,
  ValidationStatus,
} from "./type";
import { isPromise } from "util/types";
import { SubscribeNode } from "./subscribeType";
import { SubscribeManager } from "./subscribeManager";
import { PlainObjectCacheManager } from "./plainObjectCacheManager";

class ValidationManager {
  mutableDataSource: AnyMutableFieldNode;
  subscribedManager: SubscribeManager;
  plainObjectManager: PlainObjectCacheManager;

  constructor(
    mutableDataSource: AnyMutableFieldNode,
    subscribedManager: SubscribeManager,
    plainObjectManager: PlainObjectCacheManager,
  ) {
    this.mutableDataSource = mutableDataSource;
    this.subscribedManager = subscribedManager;
    this.plainObjectManager = plainObjectManager;
  }

  validateAsync(node: MutableFieldNode<FieldType>, ruleSet: string) {
    const setStatusAndUpdateChain = (
      node: MutableFieldNode<FieldType>,
      subNode: SubscribeNode | undefined,
      newStatus: ValidationStatus,
    ) => {
      const before = node.validationStatus;
      node.validationStatus = {
        ...node.validationStatus,
        [ruleSet]: newStatus,
      };
      if (subNode) {
        this.subscribedManager.setNewValue(
          subNode,
          "validationStatus",
          node.validationStatus,
        );
      }
      this.updateValidationStatusOnChain(
        node,
        ruleSet,
        before[ruleSet],
        node.validationStatus[ruleSet],
      );
    };

    const dfs = (
      node: MutableFieldNode<FieldType>,
      subNode: SubscribeNode | undefined,
    ):
      | {
          isAsync: true;
          promise: Promise<"valid" | "invalid">;
        }
      | {
          isAsync: false;
          result: "valid" | "invalid";
        } => {
      if (node.cache.plainObj.type === "void") {
        return {
          isAsync: false,
          result: "valid",
        };
      }

      if (node.type === "field") {
        const ret = node.validators[ruleSet](node.dynamicProp.value);

        if (isPromise(ret)) {
          setStatusAndUpdateChain(node, subNode, "validating");

          return {
            isAsync: true,
            promise: ret.then((result) => {
              setStatusAndUpdateChain(
                node,
                subNode,
                result ? "invalid" : "valid",
              );
              node.dynamicProp.errorMessage = {
                ...node.dynamicProp.errorMessage,
                [ruleSet]: { message: result?.errorMessage || [] },
              };
              return result ? "invalid" : "valid";
            }),
          };
        } else {
          let result = ret;
          setStatusAndUpdateChain(node, subNode, result ? "invalid" : "valid");
          node.dynamicProp.errorMessage = {
            ...node.dynamicProp.errorMessage,
            [ruleSet]: { message: result?.errorMessage || [] },
          };
          return {
            isAsync: false,
            result: result ? "invalid" : "valid",
          };
        }
      }

      let parentStatus: "valid" | "invalid" | "validating" = "validating";

      const childWaitingQueue: {
        promise: Promise<void>;
      }[] = [];
      let isAsync: boolean = false;

      const childResult = node.children.map((x) =>
        dfs(x, subNode?.children?.get(x.key)),
      );
      const childCount = {
        valid: childResult.filter((n) => !n.isAsync && n.result === "valid")
          .length,
        invalid: childResult.filter((n) => !n.isAsync && n.result === "invalid")
          .length,
        validating: childResult.filter((n) => n.isAsync).length,
      };
      debugger;

      for (let result of childResult) {
        if (result.isAsync) {
          isAsync = true;
          childWaitingQueue.push({
            promise: result.promise.then((res) => {
              childCount[res]++;
              childCount.validating--;
              const status = getEffectiveStatus();
              setStatusAndUpdateChain(node, subNode, status);
            }),
          });
        } else {
          childCount[result.result]++;
        }
      }

      // 也要校验当前（称为父节点）节点
      const getEffectiveStatus = () => {
        if (parentStatus === "invalid" || childCount.invalid > 0) {
          return "invalid";
        }
        if (parentStatus === "validating" || childCount.validating > 0) {
          return "validating";
        }
        return "valid";
      };

      if (node.cache.plainObj.type === "dirty") {
        this.plainObjectManager.rebuild(node);
      }
      if (node.cache.plainObj.type === "dirty") {
        throw new Error("dirty value");
      }

      const valueObj = node.cache.plainObj.submitData;
      let parentResult = node.validators[ruleSet](valueObj);
      let parentPromise: Promise<void>;

      if (isPromise(parentResult)) {
        isAsync = true;
        parentStatus = "validating";
        setStatusAndUpdateChain(node, subNode, getEffectiveStatus());

        parentPromise = parentResult.then((result) => {
          parentStatus = result ? "invalid" : "valid";
          this.setErrorMessage(node, result, ruleSet);
          // return parentStatus;
        });
      } else {
        parentStatus = parentResult ? "invalid" : "valid";
        parentPromise = Promise.resolve();
        const status = getEffectiveStatus();
        this.setErrorMessage(node, parentResult, ruleSet);
        setStatusAndUpdateChain(node, subNode, status);
      }

      if (isAsync) {
        return {
          isAsync: true,
          promise: Promise.all([
            ...childWaitingQueue.map((item) => item.promise),
            parentPromise,
          ]).then(() => {
            const status = getEffectiveStatus() as "valid" | "invalid";
            setStatusAndUpdateChain(node, subNode, status);
            return status;
          }),
        };
      } else {
        const status = getEffectiveStatus() as "valid" | "invalid";
        setStatusAndUpdateChain(node, subNode, status);
        return {
          isAsync: false,
          result: status,
        };
      }
    };

    const subNode = this.subscribedManager.findNode(node.path.slice(1));
    const res = dfs(node, subNode);
    const promise = res.isAsync ? res.promise : Promise.resolve(res.result);

    // 由于有异步，展示校验中状态
    if (res.isAsync) {
      setStatusAndUpdateChain(node, subNode, "validating");
      this.subscribedManager.notify();
    }

    return promise.then((res) => {
      setStatusAndUpdateChain(node, subNode, res);
      this.subscribedManager.notify();
    });
  }

  private setErrorMessage(
    node: MutableFieldNode<FieldType>,
    msg: ValidationResult,
    ruleSet: string,
  ) {
    const dfs = (
      node: MutableFieldNode<FieldType>,
      msg: ValidationResult | undefined,
    ) => {
      if (node.type === "field") {
        node.dynamicProp.errorMessage = {
          ...node.dynamicProp.errorMessage,
          [ruleSet]: { message: msg?.errorMessage || [] },
        };
        return;
      }

      // 节点树必须全量遍历
      for (let child of node.children) {
        dfs(child, msg?.children?.[child.key]);
      }
      node.dynamicProp.errorMessage = {
        ...node.dynamicProp.errorMessage,
        [ruleSet]: { message: msg?.errorMessage || [] },
      };
    };

    dfs(node, msg);
  }

  private updateValidationStatusOnChain(
    node: MutableFieldNode<FieldType>,
    ruleSet: string,
    oldStatus: ValidationStatus | undefined,
    newStatus: ValidationStatus,
  ) {
    if (oldStatus === newStatus) {
      return;
    }

    const subNodes: (SubscribeNode | undefined)[] = [
      this.subscribedManager.findNode([]),
    ];

    {
      let subNode = subNodes[0];

      for (let i = 1; i < node.path.length; i++) {
        subNode = subNode?.children?.get(node.path[i]);
        subNodes.push(subNode);
      }
      subNodes.reverse();
    }

    let curNode: AnyMutableFieldNode | undefined = node.parent;

    for (let i = 1; i < subNodes.length; i++) {
      const subNode = subNodes[i];

      if (!curNode) {
        throw new Error("impossible");
      }

      const old = ValidationManager.getValidationStatus(
        curNode.validationCount[ruleSet],
      );
      if (oldStatus) {
        curNode.validationCount[ruleSet][oldStatus]--;
      }
      curNode.validationCount[ruleSet][newStatus]++;
      const newVal = ValidationManager.getValidationStatus(
        curNode.validationCount[ruleSet],
      );

      curNode.validationStatus = {
        ...curNode.validationStatus,
        [ruleSet]: newVal,
      };

      if (old === newVal) {
        break;
      }

      if (subNode) {
        this.subscribedManager.setNewValue(
          subNode,
          "validationStatus",
          curNode.validationStatus,
        );
      }

      curNode = curNode.parent;
    }
  }

  private static getValidationStatus(count: {
    valid: number;
    invalid: number;
    validating: number;
  }): ValidationStatus {
    if (count.invalid > 0) {
      return "invalid";
    } else if (count.validating > 0) {
      return "validating";
    } else {
      return "valid";
    }
  }
}

export { ValidationManager as ValidatorCacheManager };
