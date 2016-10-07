const { MARKER } = require("@nickbottomley/responses");

const DEFAULT_PROPERTY = "respond";

module.exports = function createMiddleware (options = {}) {
  const {
    property = DEFAULT_PROPERTY,
  } = options;

  return function (router) {
    return router
      .resourceOk(function (ctx, result) {
        if (result[MARKER] == null) return;
        apply(ctx, result);
      })
      .resourceErr(function (ctx, err) {
        if (err[MARKER] == null) throw err;
        apply(ctx, err);
      });
  }
}

function apply (ctx, obj) {
  ctx.body = obj.body;
  ctx.status = obj.status;
  Object.keys(obj.headers).forEach(function (h) {
    ctx.set(h, obj.headers[h]);
  });
  // should flag the context somehow so downstream middleware
  // can pick up on it?
}