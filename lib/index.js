const url = require("url");
const methods = require("methods").map(m => m.toUpperCase());

const Route = require("./route");

class Detour {

  constructor (options = {}) {
    this._middleware = [];
    this._routes = [];
    this._handlers = Object.create(defaultHandlers);
    this._routeOptions = {
      strict: options.strict,
      sensitive: options.caseSensitive,
    };
  }

  middleware () {
    return (ctx, next) => this.dispatch(ctx, next);
  }

  async dispatch (ctx, next) {
    const path = url.parse(ctx.req.url).pathname;
    const route = this._routes.find(r => r.match(path));

    if (route == null) return next();

    ctx.route = route;
    ctx.resource = route.resource;
    ctx.params = route.params(path);

    const method = ctx.req.method.toUpperCase();

    if (ctx.resource[method] == null) {
      switch (method) {
        case "HEAD": return this._handlers.HEAD(ctx, next, this);
        case "OPTIONS": return this._handlers.OPTIONS(ctx);
        default: return this._handlers.methodNotAllowed(ctx);
      }
    }

    // call each middleware in turn
    for (const fn of this._middleware) await fn(ctx);

    // then call the relevant HTTP handler on the resource
    return ctx.resource[method](ctx);
  }

  // add a general middleware
  use (fn) {
    if (typeof fn !== "function") {
      throw new TypeError("`use` requires a function");
    }
    this._middleware.push(fn);
    return this;
  }

  // tiny helper for plugins that want to call several methods on router
  apply (fn, ...args) {
    if (typeof fn !== "function") {
      throw new TypeError("`apply` requires a function");
    }
    fn(this, ...args);
    return this;
  }

  route (path, resource) {
    validatePath(path);
    validateResource(resource);
    const route = new Route(path, resource, this._routeOptions);
    this._routes.push(route);
    return this;
  }

  handle (type, handler) {

    if (!defaultHandlers.hasOwnProperty(type)) {
      throw new Error(`\`type\` argument must be one of 'OPTIONS', 'HEAD', 'methodNotAllowed', found: ${type}`);
    }

    if (typeof handler !== "function") {
      throw new Error("Handler must be a function");
    }

    this._handlers[type] = handler;
    return this;
  }

  collection (path, pairObj) {
    if (pairObj.collection == null) {
      throw new Error(`Detour.collection() requires an object with a \`collection\` property.  Path was: ${path}`);
    }

    if (pairObj.member) {
      this.route(path, pairObj.member);
    }

    this.route(parentPath(path), pairObj.collection);
    return this;
  }
}

const defaultHandlers = {
  methodNotAllowed (ctx) {
    const header = getMethods(ctx.resource).join(",");
    ctx.set("Allow", header);
    ctx.status = 405;
    ctx.body = "Method Not Allowed";
  },

  OPTIONS (ctx) {
    const header = getMethods(ctx.resource).join(",");
    ctx.set("Allow", header);
    ctx.status = 200;
    ctx.body = `Allow: ${header}`;
  },

  HEAD (ctx, next, router) {
    if (ctx.resource.GET == null) {
      return router._handlers.methodNotAllowed(ctx);
    }

    ctx.req.method = "GET";
    // Node.js strips off the body automatically. See test case.
    return router.dispatch(ctx, next);
  },
};

function parentPath (path){
  const pieces = path.split("/");
  const last = pieces.pop();
  if (!last) {
    pieces.pop();
  }
  return pieces.join("/");
}

function validateResource (resource) {
  if (!methods.some(m => resource[m])) {
    throw new Error("Resource should have at least one key with a valid HTTP verb");
  }
}

function validatePath (path) {
  if (typeof path === "string") return;
  if (Array.isArray(path)) return;
  if (Object.prototype.toString.call(path) === "[object RegExp]") return;
  throw new Error(`Invalid path: ${path}`);
}

function getMethods (resource) {
  return methods.filter(m => resource[m]);
}

module.exports = Detour;
