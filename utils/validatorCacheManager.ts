import { z, ZodType } from "zod";
import {
  AnyMutableFieldNode,
  FieldType,
  MutableFieldNode,
  ValidationStatus,
} from "./type";
import { FieldState, getNodesOnPath } from "./structures";
import { isPromise } from "util/types";

class ValidatorCacheManager {
  mutableDataSource: AnyMutableFieldNode;

  constructor(mutableDataSource: AnyMutableFieldNode) {
    this.mutableDataSource = mutableDataSource;
  }

  validateAsync(node: MutableFieldNode<FieldType>, ruleSet: string) {
    const dfs = (
      node: MutableFieldNode<FieldType>,
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
        const retOfI = dfs(i);

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

    const res = dfs(node);
    if (res.isAsync) {
      return res.promise;
    } else {
      return Promise.resolve(res.result);
    }
  }
}

export { ValidatorCacheManager };
