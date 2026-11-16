const path = require("node:path");

// 仅应用于本测试入口。不改原文件，保留原模块的 source map 和 debugger。
module.exports = function browserValidatorLoader(source, sourceMap) {
  const shim = path.resolve(__dirname, "browser-promise.ts").replace(/\\/g, "/");
  const adapted = source.replace(/(["'])util\/types\1/g, JSON.stringify(shim));
  this.callback(null, adapted, sourceMap);
};
