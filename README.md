# koa-detour

[![Build Status](https://travis-ci.org/nickb1080/koa-detour.svg?branch=master)](https://travis-ci.org/nickb1080/koa-detour)
[![Coverage Status](https://coveralls.io/repos/github/nickb1080/koa-detour/badge.svg?branch=master)](https://coveralls.io/github/nickb1080/koa-detour?branch=master)

### These docs are for the original [detour](https://github.com/cainus/detour)
### Proper README coming soon

Detour is a router for node.js web applications.

Detour is different from sinatra-style routers (like [express's router](http://expressjs.com/api.html#app.VERB)) because you **route urls to objects** (that have http methods) instead of to http methods.

Rationale:  If you have multiple http methods implemented for a given url (like a lot of APIs do), this style of routing will be much more natural and will vastly improve your code organization and re-use.  With object routing, it's much simpler to keep the related handlers together, but separated from unrelated handlers (often even in another file/module).

It works for node.js' standard HTTP server, as well as [express](http://expressjs.com) and [connect](http://www.senchalabs.org/connect/) applications.


## Basic Example
```js
const app = new Koa();
const router = new KoaDetour();
app.use(router.middleware());
router.route("/user", {
  GET (ctx) {
    ctx.body = "GET works!";
  },
  POST (ctx) {
    ctx.body = "POST also works";
  },
});
```

## Path parameters
```js
// path parameters (indicated by colons) are available at `ctx.params`
// this is a change from detour, which used `req.pathVars`
router.route("/user/:id", {
  GET (ctx) {
    ctx.body = `GET works: ${ctx.params.id}`
  },
});
```

## Resource-based middleware
The middleware stack for detour runs after the route has been determined, but before any other processing. The entire routed resource object will be available at `ctx.resource` if you want to do any special handling in your middleware that are related to its contents. Middleware functions can return Promises (or be `async`, which amounts to the same thing). Interestingly, middleware functions *do not* receive a `next` argument to continue processing. Rather, the pattern should be to throw an error (or reject the returned promise) when something goes awry that should cause the main HTTP verb handler to not run.

This makes Detour extremely extensible on a resource-by-resource basis. For example, if you write a resource object like this:

```js
router.route("/user/:id", {
  mustBeAuthenticated: true, // <-- note this property
  GET (ctx) {
    ctx.body = `GET works: ${ctx.params.id}`
  },
});
```

You might have a middleware like so:
```js
router.use(function (ctx) {
  if (ctx.resource.mustBeAuthenticated && !ctx.user) {
    throw new Error("Not authenticated!");
  }
});
```

In this case, Koa will send a 500 response automatically, which is not the correct status code in this situation. Read on...

## Hooks

### `handleError`
The `handleError` hook controls what is done with errors from the middleware stack or the HTTP handler. Continuing the example directly above, we want to send a 401 if the user is not authenticated.

```js
router.handleError(function (ctx, err) {
  if (err.message === Errors.Unauthenticated) {
    ctx.status = 401;
    ctx.body = err.message;
    return;
  }

  // ... perhaps more handling for other types of errors;
});
```

### `handleSuccess`
The `handleSuccess` hook determines what happens to values that come out of HTTP handlers. Usually in Koa you need to do things like `ctx.status = 200; ctx.body = "Ok!"`. This kind of imperative mutation is annoying, and lowers the abstraction level. With `koa-detour`, you can use the `handleSuccess` hook to have HTTP handlers return values.
```js
router.route("/user/:id", function (ctx) {
  // this is asynchronous and returns a promise
  return User.findById(id);
});
router.handleSuccess(function (ctx, result) {
  // in real code we'd want something a little more complicated to return other success statuses
  ctx.body = result;
  ctx.status = 200;
});
```

This is great for avoiding repetitive code in HTTP handlers, and for keeping the resources tidy.

### Add-ons
[`koa-deotour-addons`](https://github.com/nickb1080/koa-detour-addons) provides some helpers for common middleware, and support for returning or throwing [response objects](https://github.com/nickb1080/responses).
