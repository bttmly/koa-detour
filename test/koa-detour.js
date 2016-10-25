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
  server = app.listen(PORT)
  v = verity(`http://localhost:${PORT}`, `GET`);
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
      v.uri = v.uri.path("test");
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
        }
      }));
      v.test(done);
    });

    it("404s when no route is matched", function (done) {
      createApp(new Detour().route("/", { GET: worked }));
      v.method("GET");
      v.uri = v.uri.path("test");
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
            expect(ctx.params).toEqual({ a: "x", b: "y" })
            worked(ctx);
          }
        })
      )
      v.uri = v.uri.path("/a/x/b/y");
      v.test(done);
    });

    it("adds `resource`", function (done) {
      const resource = {
        GET (ctx) {
          expect(ctx.resource).toBe(resource);
          worked(ctx);
        }
      };

      createApp(new Detour().route("/", resource));
      v.test(done);
    });
  });

  describe("#use and middleware behavior", function () {
    it("adds a middleware", function (done) {
      createApp(new Detour()
        .use(function (ctx) {
          return Promise.resolve().then(function () {
            ctx.middlewareAdded = "success";
          });
        })
        .route("/", {
          GET (ctx) {
            ctx.status = 200;
            ctx.body = ctx.middlewareAdded;
          }
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
          }
        })
      );
      v.expectBody("abc");
      v.test(done);
    });
  });

  describe("override hooks", function () {
    it("handleSuccess receives the resolution value of the resource", function (done) {
      createApp(new Detour().route("/", {
          GET (ctx) { return Promise.resolve("success") }
        })
        .handleSuccess(function (ctx, value) {
          ctx.status = 200;
          ctx.body = value;
        })
      );
      v.test(done);
    });

    it("500s if the resource stack rejects without a handleError override", function (done) {
      createApp(new Detour()
        .route("/", {
          GET (ctx) { throw new Error("Bad Request") }
        })
      );
      v.expectBody("Internal Server Error");
      v.expectStatus(500);
      v.test(done);
    });

    it("handleError receives a rejection value from the resource", function (done) {
      createApp(new Detour()
        .route("/", {
          GET (ctx) { throw new Error("Bad Request") }
        })
        .handleError(function (ctx, err) {
          ctx.status = 400;
          ctx.body = err.message;
        })
      );

      v.expectStatus(400);
      v.expectBody("Bad Request");
      v.test(done);
    });

    it("handleError receives a rejection value from the middleware stack", function (done) {
      createApp(new Detour()
        .use(function (ctx) { throw new Error("Bad Request"); })
        .route("/", { GET: worked })
        .handleError(function (ctx, err) {
          ctx.status = 400;
          ctx.body = err.message;
        })
      );

      v.expectStatus(400);
      v.expectBody("Bad Request");
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
        new Detour().handle("BAD_KEY", () => {})
      }).toThrow("Invalid `type` argument to `handle()`: BAD_KEY")
    });

    it("throws if handler argument isn't a function", function () {
      expect(() => {
        new Detour().handle("methodNotAllowed", {})
      }).toThrow("Handler must be a function")
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

    it("allows overriding `HEAD`", function (done) {
      createApp(new Detour()
        .route("/", { GET: worked })
        .handle("HEAD", function (ctx) {
          ctx.status = 404;
        })
      );
      v.expectStatus(404);
      v.expectBody("");
      v.method("HEAD");
      v.test(done);
    });
  });

  describe("constructor options", function () {

    it("normally routes case-insensitive", function (done) {
      createApp(new Detour().route("/LOUD", { GET: worked }))
      v.uri = v.uri.path("loud");
      v.test(done);
    });

    it("accepts a `caseSensitive` option", function (done) {
      createApp(new Detour({caseSensitive: true}).route("/LOUD", { GET: worked }))
      v.uri = v.uri.path("loud");
      v.expectStatus(404);
      v.expectBody("Not Found")
      v.test(err => {
        if (err) return done(err);
        v = verity(`http://localhost:${PORT}`, `GET`);
        v.expectStatus(200);
        v.expectBody("success");
        v.uri = v.uri.path("LOUD");
        v.test(done);
      });
    });

    it("normally is loose about trailing slashes", function (done) {
      createApp(new Detour().route("/test", { GET: worked }))
      v.uri = v.uri.path("test/");
      v.test(done);
    });

    // not sure what's going on here -- verity/urlgrey maybe trimming the slash?
    xit("accepts a `strict` option", function (done) {
      createApp(new Detour({strict: true}).route("/test", { GET: worked }))
      v.uri = v.uri.path("test/");
      v.expectStatus(404);
      v.expectBody("Not Found");
      v.test(err => {
        if (err) return done(err);
        v = verity(`http://localhost:${PORT}`, `GET`);
        v.expectStatus(200);
        v.expectBody("success");
        v.uri = v.uri.path("test");
        v.test(done);
      });
    });
  });

  describe("#collection", function () {
    it("throws if `.collection` not present", function () {
      expect(() => {
        new Detour().collection("/test/:id", { member: { GET: { worked} } })
      }).toThrow(/requires an object/)
    });

    it("does just collection routing", function (done) {
      createApp(new Detour()
        .collection("/test/:id/", { collection: { GET: worked } }));
      v.uri = v.uri.path("test");
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
            }
          },
        })
      );

      v.uri = v.uri.path("test");
      v.test(err => {
        if (err) return done(err);
        v = verity(`http://localhost:${PORT}`, `GET`);
        v.uri = v.uri.path("test/abcd");
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
  it("gives an informative error if decoding fails", function () {
    const route = new Route("/user/:id");
    try {
      route.params("/user/%E0%A4%A");
    } catch (err) {
      expect(err.message).toEqual("Failed to decode param '%E0%A4%A'")
      return;
    }
    throw new Error("shouldn't get here");
  });
});
