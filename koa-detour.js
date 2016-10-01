const urlgrey = require("urlgrey");

const methods = new Set(require("methods")
    .map(m => m.toUpperCase()));

const Route = require("./route");

function validateResource (resource) {
  if (!Object.keys(resource).some(k => methods.has(k))) {
    throw new Error("Resource should have at least one key with a valid HTTP verb");
  }
}

function validatePath (path) {
  if (typeof path === "string") return;
  if (Array.isArray(path)) return;
  if (({}).toString.call(path) == "[object RegExp]") return;
  throw new Error(`Invalid path: ${path}`);
}

function getMethods (resource) {
  return Object.keys(resource)
    .filter(key => methods.has(key));
}

const defaultHandlers = {
  methodNotAllowed (ctx) {
    const header = getMethods(ctx.resource).join(",");
    ctx.set("Allow", header)
    ctx.status = 405;
    ctx.body = "Method Not Allowed";
  },
  OPTIONS (ctx) {
    const header = getMethods(ctx.resource).join(",");
    ctx.set("Allow", header);
    ctx.status = 200;
    ctx.body = `Allow: ${header}`;
  },
  HEAD (ctx, next) {
    const router = this._self();
    const {resource} = ctx;

    if (resource.GET == null){
      return router._handlers.methodNotAllowed(ctx);
    }

    ctx.req.method = "GET";
    return router._dispatch(ctx, next);
  },
}

function rethrow (ctx, err) { throw err; }
function rereturn (ctx, value) { return value; }

class Detour {

  constructor (options = {}) {
    this._middleware = [];
    this._routes = [];
    this._handlers = Object.create(defaultHandlers);
    this._handlers._self = () => this;
    this._resourceOk = rereturn;
    this._resourceErr = rethrow;
    this._middlewareErr = rethrow;

    this.strict = options.strict;
    this.caseSensitive = options.caseSensitive;
  }

  middleware () {
    return (ctx, next) => this._dispatch(ctx, next);
  }

  _dispatch (ctx, next) {
    const path = urlgrey(ctx.req.url).path();
    const route = this._routes.find(r => r.match(path));

    if (route == null) {
      return next();
    }

    const resource = ctx.resource = route.resource;
    const params = ctx.params = {};
    Object.keys(route.params).forEach(k => ctx.params[k] = route.params[k]);

    const method = ctx.req.method.toUpperCase();

    if (resource[method] == null) {
      if (method === "HEAD" && this._handlers.HEAD) {
        return this._handlers.HEAD(ctx);
      }

      if (method === "OPTIONS" && this._handlers.OPTIONS) {
        return this._handlers.OPTIONS(ctx);
      }

      return this._handlers.methodNotAllowed(ctx);
    }

    return pipeCtx(ctx, this._middleware)
      .catch(err => this._middlewareErr(ctx, err))
      .then(() => {
        // TODO -- this is wonky, figure out a better way
        if (ctx.continue === false) return;

        return Promise.resolve()
          .then(() => resource[method](ctx))
          .then(result => this._resourceOk(ctx, result))
          .catch(err => this._resourceErr(ctx, err))
      });
  }

  // to special-handle rejections from the middleware stack
  middlewareErr (fn) { this._middlewareErr = fn; return this; }

  // to special-handle rejections from the resource
  resourceErr (fn) { this._resourceErr = fn; return this; }

  // to special-handle resolutions from the resource
  resourceOk (fn) { this._resourceOk = fn; return this; }

  // add a general middleware
  use (fn) { this._middleware.push(fn); return this; }

  route (path, resource) {
    validatePath(path);
    validateResource(resource);

    const route = new Route(path, resource, {
      sensitive: this.caseSensitive,
      strict: this.strict
    });

    this._routes.push(route);
    return this;
  }

  handle (type, handler) {
    if (!defaultHandlers.hasOwnProperty(type)) {
      throw new Error(`Invalid \`type\` argument to \`handle()\`: ${type}`)
    }
    this._handlers[type] = handler;
    return this;
  }
}

function pipeCtx (ctx, fns) {
  if (fns.length === 0) return Promise.resolve();

  return fns.reduce(function (prms, fn) {
    return prms.then(() => fn(ctx));
  }, Promise.resolve());
}

module.exports = Detour;
