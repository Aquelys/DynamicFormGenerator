// 内联 loader 只替换这一次导入的 Node 专用依赖，其他路由及模块不受影响。
const { ValidatorCacheManager } = require("./browser-validator-loader.cjs!../../utils/validatorCacheManager.ts") as typeof import("../../utils/validatorCacheManager");

export { ValidatorCacheManager };
