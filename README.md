# koa-detour

[![Build Status](https://travis-ci.org/bttmly/koa-detour.svg?branch=master)](https://travis-ci.org/bttmly/koa-detour)
[![Coverage Status](https://coveralls.io/repos/github/bttmly/koa-detour/badge.svg?branch=master)](https://coveralls.io/github/bttmly/koa-detour?branch=master)

KoaDetour is an expressive router for [Koa v2](https://github.com/koajs/koa/issues/533) applications. **NOTE**: this project is NOT versioned according to Koa's versioning scheme. Specifically, all versions are intended only to work with Koa 2.0.0+.

Detour is different from sinatra-style routers (like [express's router](http://expressjs.com/api.html#app.VERB)) because you **route urls to objects** (that have HTTP methods and resource-level middleware) instead of to HTTP methods directly.

Rationale:  If you have multiple http methods implemented for a given url (like a lot of APIs do), this style of routing will be much more natural and will vastly improve your code organization and re-use, and better composition and factoring of middleware.  With object routing, it's much simpler to keep the related handlers together, but separated from unrelated handlers (often even in another file/module).

## Basic Example
```js
const app = new Koa();
const router = new KoaDetour();
app.use(router.middleware());
router.route("/user", {
  GET (ctx) {
    ctx.body = "GET works!";
  },
  // obviously you'll almost always do something asynchronous in a handler.
  // so, just return a promise here and the router will wait on it
  POST (ctx) {
    return createUser(ctx.req.body)
      .then(user => ctx.body = user);
  },
  // or just use `async` functions!
  async PUT (ctx) {
    const user = await updateUser(ctx.req.body);
    ctx.body = user;
  },
});
```
Note here that the HTTP handlers (`GET` and `POST`) in this example do *not* receive a `next` function like normal Koa middleware. This is because there is a distinction between routes and middleware -- routes should be terminal. They handle the request and send a response, or they error, which will be picked up by a downstream error handler. Either way, no other HTTP handler is going to run.


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

The declarative style of `{ [middlewareName]: value }` has many advantages. However, for more complex cases, you may want to compose functions. Here's one way that might work

```js
// helper calls each fn with ctx, checks at least 1 resolved to a truthy value
const someOk = fns => async ctx => {
  const results = await Bluebird.map(fns, f => f(ctx));
  return results.some(Boolean);
}

// message route can be accessed by admins, sender, or recipient
// we implement these elsewhere and share the logic, in various compositions
// across many endpoints. There are many ways to factor this logic, on a spectrum
// from more logic in the middleware function passed to `use` to more logic in the
// resource object
router.route("/message/:id", {
  hasAccess: someOk([
    userIsAdmin,
    userIsSender,
    userIsRecipient,
  ]),
  GET () { /* implementation */ },
})

router.use(async function (ctx) {
  if (ctx.resource.hasAccess) {
    const ok = await ctx.resource.hasAccess(ctx);
    if (!ok) throw new Error("Access not allowed!");
  }
});
```

All middleware and HTTP handlers are executed in promise chains, so it's safe to throw an error like the one above -- it won't crash the process! However, in this case, Koa will send a 500 response automatically, which is not the correct status code in this situation. Read on...

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

  // ... perhaps more handling for other types of errors ...
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
[`koa-deotour-addons`](https://github.com/bttmly/koa-detour-addons) provides some helpers for common middleware, and support for returning or throwing [response objects](https://github.com/bttmly/responses).

These addons are designed to make it easier to factor and implement a production API that needs to return correct responses and status codes in a variety of cases. Briefly:

- `schema` checks that the request contents are valid, so it 400s if it fails
- `authenticate` checks that the user is logged in, so it 401s if it fails
- `forbid` checks that the user has access to the resource, so it 403s if it fails
- `fetch` is intended to get the resource from the data store, so it 404s if it fails.
- `respond` is responsible for turning response objects into calls to the Koa context, completing the response. Still trying to stabilize an API for this however.
