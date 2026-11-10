import { z, ZodType } from "zod";
import {
  AnyMutableFieldNode,
  FieldType,
  MutableFieldNode,
  ValidationStatus,
} from "./type";
import { FieldState, getNodesOnPath } from "./structures";
import { isPromise } from "util/types";
import { SubscribeNode } from "./subscribeType";
import { SubscribeManager } from "./subscribeManager";

class ValidatorCacheManager {
  mutableDataSource: AnyMutableFieldNode;
  subscribedManager: SubscribeManager;

  constructor(
    mutableDataSource: AnyMutableFieldNode,
    subscribedManager: SubscribeManager,
  ) {
    this.mutableDataSource = mutableDataSource;
    this.subscribedManager = subscribedManager;
  }

  validateAsync(node: MutableFieldNode<FieldType>, ruleSet: string) {
    const dfs = (
      node: MutableFieldNode<FieldType>,
      subNode: SubscribeNode | undefined,
    ):
      | {
          isAsync: true;
          promise: Promise<Omit<ValidationStatus, "unknown">>;
        }
      | {
          isAsync: false;
          result: Omit<ValidationStatus, "unknown">;
        } => {
      if (node.validationStatus[ruleSet] !== "unknown") {
        return { isAsync: false, result: node.validationStatus[ruleSet] };
      }

      if (node.type === "field") {
        const ret = node.validators[ruleSet](node.dynamicProp.value);

        if (isPromise(ret)) {
          node.validationStatus[ruleSet] = "validating";

          return {
            isAsync: true,
            promise: ret.then((result) => {
              node.validationStatus[ruleSet] = result ? "invalid" : "valid";
              node.dynamicProp.errorMessage = result?.errorMessage || {};
              return result ? "invalid" : "valid";
            }),
          };
        } else {
          let result = ret;
          return {
            isAsync: false,
            result: (node.validationStatus[ruleSet] = result
              ? "invalid"
              : "valid"),
          };
        }
      }

      const needAwait: Promise<Omit<ValidationStatus, "unknown">>[] = [];
      const count = {
        valid: 0,
        invalid: 0,
      };
      for (let i of node.children) {
        const retOfI = dfs(i, subNode?.children?.get(i.key));

        if (retOfI.isAsync) {
          needAwait.push(retOfI.promise);
        } else {
          if (retOfI.result === "valid") {
            count.valid++;
          } else {
            count.invalid++;
          }
        }
      }

      if (needAwait.length > 0) {
        return {
          isAsync: true,
          promise: Promise.all(needAwait).then((asyncResult) => {
            asyncResult.forEach((item) => {
              if (item === "valid") {
                count.valid++;
              } else {
                count.invalid++;
              }
            });
            return count.invalid > 0 ? "invalid" : "valid";
          }),
        };
      } else {
        return {
          isAsync: false,
          result: count.invalid > 0 ? "invalid" : "valid",
        };
      }
    };

    const subNode = this.subscribedManager.findNode(node.path.slice(1));
    const res = dfs(node, subNode);
    const promise = res.isAsync ? res.promise : Promise.resolve(res.result);

    const before = ValidatorCacheManager.getValidationStatus(node, ruleSet);

    // 由于有异步，展示校验中状态
    if (res.isAsync) {
      subNode &&
        this.subscribedManager.setNewValue(
          subNode,
          "validationStatus",
          "validating",
        );
    }

    return promise.then((res) => {
      this.updateValidationStatusOnChain(
        node,
        ruleSet,
        before,
        ValidatorCacheManager.getValidationStatus(node, ruleSet),
      );
      subNode &&
        this.subscribedManager.setNewValue(
          subNode,
          "validationStatus",
          res === "valid" ? "valid" : "invalid",
        );
    });
  }

  private updateValidationStatusOnChain(
    node: MutableFieldNode<FieldType>,
    ruleSet: string,
    oldStatus: ValidationStatus,
    newStatus: ValidationStatus,
  ) {
    if (oldStatus === newStatus) {
      return;
    }

    const subNodes: (SubscribeNode | undefined)[] = [
      this.subscribedManager.findNode([]),
    ];
    let curNode: AnyMutableFieldNode | undefined = this.mutableDataSource;

    {
      let subNode = subNodes[0];

      for (let i = 1; i < node.path.length; i++) {
        subNode = subNode?.children?.get(node.path[i]);
        subNodes.push(subNode);
      }
      subNodes.reverse();
    }

    for (let i = 1; i < subNodes.length; i++) {
      const subNode = subNodes[i];

      if (!curNode) {
        throw new Error("impossible");
      }

      const old = ValidatorCacheManager.getValidationStatus(curNode, ruleSet);
      curNode.validationCount[ruleSet][oldStatus]--;
      curNode.validationCount[ruleSet][newStatus]++;
      const newVal = ValidatorCacheManager.getValidationStatus(
        curNode,
        ruleSet,
      );

      if (subNode?.subscriber) {
        this.subscribedManager.setNewValue(subNode, "validationStatus", newVal);
      }

      if (old === newVal) {
        break;
      }

      if (curNode.type === "field") {
        throw new Error("shape is incompitable");
      }

      curNode = curNode.parent;
    }
  }

  private static getValidationStatus(
    node: MutableFieldNode<FieldType>,
    ruleSet: string,
  ): ValidationStatus {
    if (node.validationCount[ruleSet].invalid > 0) {
      return "invalid";
    } else if (node.validationCount[ruleSet].validating > 0) {
      return "validating";
    } else if (node.validationCount[ruleSet].unknown > 0) {
      return "unknown";
    } else {
      return "valid";
    }
  }
}

export { ValidatorCacheManager };
