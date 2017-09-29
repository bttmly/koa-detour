const expect = require("expect");
const verity = require("verity");

const Koa = require("koa");
const Detour = require("../lib");
const Route = require("../lib/route");

const PORT = 9999;

let app, server, v;

process.on("unhandledRejection", err => { throw err; });

function worked (ctx) {
  ctx.status = 200;
  ctx.body = "success";
}

function failed (ctx) {
  ctx.status = 200;
  ctx.body = "failed";
}

function createApp (router) {
  app = new Koa();
  app.use(router.middleware());
  server = app.listen(PORT);
  v = verity(`http://localhost:${PORT}`, "GET");
  v.expectBody("success");
  v.expectStatus(200);
}

function closeApp (done) {
  if (server == null) return done();
  server.close(done);
  server = null;
  app = null;
}

describe("koa-detour", function () {

  afterEach(closeApp);

  describe("#route", function () {

    it("accepts an array path", function () {
      new Detour().route([], { GET: worked });
    });

    it("accepts a regexp path", function () {
      new Detour().route(new RegExp(), { GET: worked });
    });

    it("throws if path argument is invalid", function () {
      expect(() => {
        new Detour().route({}, { GET: worked });
      }).toThrow(/Invalid path/);
    });

    it("throws if resource argument is invalid", function () {
      expect(() => {
        new Detour().route("/", { GIBBERISH: worked });
      }).toThrow(/valid HTTP verb/);
    });

    it("properly routes a basic GET request", function (done) {
      createApp(new Detour().route("/", { GET: worked }));
      v.test(done);
    });

    it ("can route multiple times", function (done){
      const router = new Detour()
        .route("/", { GET: failed })
        .route("/test", { GET: worked })
        .route("/test/:id", { GET: failed });

      expect(router._routes.length).toEqual(3);
      createApp(router);
      v.path("test");
      v.test(done);
    });

    it("200s for plain POST", function (done) {
      createApp(new Detour().route("/", { POST: worked }));
      v.method("POST");
      v.test(done);
    });

    it("routes are terminal -- no `next` is provided", function (done) {
      createApp(new Detour().route("/", {
        GET (ctx, next) {
          expect(next).toBe(undefined);
          worked(ctx);
        },
      }));
      v.test(done);
    });

    it("404s when no route is matched", function (done) {
      createApp(new Detour().route("/", { GET: worked }));
      v.method("GET");
      v.path("test");
      v.expectStatus(404);
      v.expectBody("Not Found");
      v.test(done);
    });

  });

  describe("context additions", function () {
    it("adds `params`", function (done) {
      createApp(new Detour()
        .route("/a/:a/b/:b", {
          GET (ctx) {
            expect(ctx.params).toEqual({ a: "x", b: "y" });
            worked(ctx);
          },
        })
      );
      v.path("/a/x/b/y");
      v.test(done);
    });

    it("adds `resource`", function (done) {
      const resource = {
        GET (ctx) {
          expect(ctx.resource).toBe(resource);
          worked(ctx);
        },
      };

      createApp(new Detour().route("/", resource));
      v.test(done);
    });

    it("adds `route`", function (done) {
      let route;
      const resource = { GET (ctx) { ({route} = ctx); worked(ctx); } };

      createApp(new Detour().route("/some-silly-path", resource));
      v.path("/some-silly-path");
      v.test(err => {
        expect(route.path).toBe("/some-silly-path");
        expect(route.resource).toBe(resource);
        done(err);
      });
    });
  });

  describe("#use and middleware behavior", function () {
    it("adds a middleware", function (done) {
      createApp(new Detour()
        .use(async function (ctx) {
          ctx.middlewareAdded = "success";
        })
        .route("/", {
          GET (ctx) {
            ctx.status = 200;
            ctx.body = ctx.middlewareAdded;
          },
        })
      );
      v.test(done);
    });

    it("middleware isn't invoked when no route is matched", function (done) {
      let called = false;
      createApp(new Detour()
        .use(() => called = true)
        .route("/test", { GET: worked }));

      // this will get back the default koa "not found" response, since nothing
      // in the router matched the request
      v.expectStatus(404);
      v.expectBody("Not Found");
      v.test(err => {
        expect(called).toBe(false);
        done(err);
      });
    });

    it("middleware isn't invoked when fallback handlers are used", function (done) {
      let called = false;
      createApp(new Detour()
        .use(() => called = true)
        .route("/", { POST: worked }));

      // the default 'methodNotAllowed' handler is responding here
      v.expectStatus(405);
      v.expectBody("Method Not Allowed");
      v.test(err => {
        expect(called).toBe(false);
        done(err);
      });
    });

    it("middleware is executed in the order added", function (done) {
      createApp(new Detour()
        .use(ctx => ctx.prop = "a")
        .use(ctx => ctx.prop += "b")
        .use(ctx => ctx.prop += "c")
        .route("/", {
          GET (ctx) {
            ctx.status = 200;
            ctx.body = ctx.prop;
          },
        })
      );
      v.expectBody("abc");
      v.test(done);
    });
  });

  describe("fallback handlers", function () {
    it("405's by default when method not supported by resource", function (done) {
      createApp(new Detour().route("/", { GET: worked }));
      v.expectStatus(405);
      v.expectBody("Method Not Allowed");
      v.method("POST");
      v.test(done);
    });

    it("provides a sane OPTIONS response by default", function (done) {
      createApp(new Detour().route("/", { GET: worked, POST: worked }));
      v.expectStatus(200);
      v.expectBody("Allow: GET,POST");
      v.method("OPTIONS");
      // TODO test Allow header
      v.test(done);
    });

    it("provides a sane HEAD response by default", function (done) {
      createApp(new Detour().route("/", { GET: worked }));
      v.expectBody("");
      v.method("HEAD");
      v.test(done);
    });

    it("405 on HEAD if no GET", function (done) {
      createApp(new Detour().route("/", { POST: worked }));
      v.method("HEAD");
      v.expectStatus(405);
      v.expectBody("");
      v.test(done);
    });
  });

  describe("#handle", function () {
    it("throws if provided an unknown type", function () {
      expect(() => {
        new Detour().handle("BAD_KEY", () => {});
      }).toThrow("`type` argument must be one of 'OPTIONS', 'HEAD', 'methodNotAllowed', found: BAD_KEY");
    });

    it("throws if handler argument isn't a function", function () {
      ["HEAD", "OPTIONS", "methodNotAllowed"].forEach(method => {
        expect(() => {
          new Detour().handle(method, {});
        }).toThrow("Handler must be a function");
      });
    });

    it("allows overriding `methodNotAllowed`", function (done) {
      createApp(new Detour()
        .route("/", { GET: worked })
        .handle("methodNotAllowed", function (ctx) {
          ctx.status = 405;
          ctx.body = "No way, pal!";
        })
      );
      v.expectStatus(405);
      v.expectBody("No way, pal!");
      v.method("POST");
      v.test(done);
    });
    // without this override, OPTIONS would 200
    it("allows overriding `OPTIONS`", function (done) {
      createApp(new Detour()
        .route("/", { GET: worked })
        .handle("OPTIONS", function (ctx) {
          ctx.status = 404;
          ctx.body = "Not found";
        })
      );
      v.expectStatus(404);
      v.expectBody("Not found");
      v.method("OPTIONS");
      v.test(done);
    });

    // NOTE: Node's HTTP layer strips the body of a HEAD response
    it("allows overriding `HEAD`", function (done) {
      createApp(new Detour()
        .route("/", { GET: worked })
        .handle("HEAD", function (ctx) {
          ctx.status = 404;
          ctx.body = "head request failed";
        })
      );
      v.expectStatus(404);
      v.expectBody(""); // body is empty string even though we set it to "head request failed"
      v.method("HEAD");
      v.test(done);
    });

  });

  describe("constructor options", function () {

    it("normally routes case-insensitive", function (done) {
      createApp(new Detour().route("/LOUD", { GET: worked }));
      v.path("loud");
      v.test(done);
    });

    it("accepts a `caseSensitive` option", function (done) {
      createApp(new Detour({caseSensitive: true}).route("/LOUD", { GET: worked }));
      v.path("loud");
      v.expectStatus(404);
      v.expectBody("Not Found");
      v.test(err => {
        if (err) return done(err);
        v = verity(`http://localhost:${PORT}`, "GET");
        v.expectStatus(200);
        v.expectBody("success");
        v.path("LOUD");
        v.test(done);
      });
    });

    it("normally is loose about trailing slashes", function (done) {
      createApp(new Detour().route("/test", { GET: worked }));
      v.path("test/");
      v.test(done);
    });

    // can't use v.uri.path because UrlGrey trims trailing slashes
    it("accepts a `strict` option", function (done) {
      createApp(new Detour({strict: true}).route("/test" /* NOTE no trailing slash */, { GET: worked }));
      v.uri = `http://localhost:${PORT}/test/`; // <-- NOTE trailing slash
      v.expectStatus(404);
      v.expectBody("Not Found");
      v.test(err => {
        if (err) return done(err);
        v = verity(`http://localhost:${PORT}`, "GET");
        v.path("test"); // <-- NOTE no trailing slash
        v.expectStatus(200);
        v.expectBody("success");
        v.test(done);
      });
    });
  });

  describe("#collection", function () {
    it("throws if `.collection` not present", function () {
      expect(() => {
        new Detour().collection("/test/:id", { member: { GET: { worked} } });
      }).toThrow(/requires an object/);
    });

    it("does just collection routing", function (done) {
      createApp(new Detour()
        .collection("/test/:id/", { collection: { GET: worked } }));
      v.path("test");
      v.test(done);
    });

    it("does member and collection routing", function (done) {
      createApp(new Detour()
        .collection("/test/:id", {
          collection: { GET: worked },
          member: {
            GET (ctx) {
              ctx.body = ctx.params.id;
              ctx.status = 200;
            },
          },
        })
      );

      v.path("test");
      v.test(err => {
        if (err) return done(err);
        v = verity(`http://localhost:${PORT}`, "GET");
        v.path("test/abcd");
        v.expectStatus(200);
        v.expectBody("abcd");
        v.test(done);
      });
    });
  });

  describe("#apply", function () {
    it("takes a function that gets called with the router, and returns the router", function () {
      let arg;
      const router = new Detour();
      const plugin = _arg => arg = _arg;
      const result = router.apply(plugin);
      expect(result).toBe(router);
      expect(arg).toBe(router);
    });
  });
});

describe("Route", function () {

  describe("#params", function () {
    it("gives an informative error if decoding fails", function () {
      expect(() => {
        new Route("/user/:id").params("/user/%E0%A4%A");
      }).toThrow(/Failed to decode param '%E0%A4%A'/);
    });

    it("returns null if no match", function () {
      expect(
        new Route("/user/:id").params("/document/123")
      ).toEqual(null);
    });
  });
});
