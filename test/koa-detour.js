require("babel-register")({
  presets: ["stage-0"]
})

const expect = require("expect");
const verity = require("verity");
const Bluebird = require("bluebird");
const sinon = require("sinon");

const Koa = require("koa");
const Detour = require("../koa-detour");

const PORT = 9999;

let app, server, v;

process.on("unhandledRejection", err => { throw err; });

function worked (ctx, fn) {
  if (fn) fn(ctx);
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
  server = app.listen(9999)

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
  // beforeEach(createApp);
  afterEach(closeApp);

  describe("#route", function () {

    it("properly routes a basic GET request", function (done) {
      createApp(new Detour()
        .route("/", { GET: worked })
      );
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
      createApp(new Detour()
        .route("/", { POST: worked })
      );
      v.method("POST");
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

  describe("#use", function () {
    it("adds a middleware", function (done) {
      createApp(new Detour()
        .use(function (ctx) {
          return Bluebird.delay(200).then(function () {
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
  });

  describe("override hooks", function () {
    it("resourceOk receives the resolution value of the resource", function (done) {
      createApp(new Detour().route("/", {
          GET (ctx) { return Promise.resolve("success") }
        })
        .resourceOk(function (ctx, value) {
          ctx.status = 200;
          ctx.body = value;
        })
      );
      v.test(done);
    });

    it("resourceErr receives the rejection value of the resource", function (done) {
      createApp(new Detour()
        .route("/", {
          GET (ctx) { throw new Error("not found") }
        })
        .resourceErr(function (ctx, err) {
          ctx.status = 404;
          ctx.body = err.message;
        })
      );

      v.expectStatus(404);
      v.expectBody("not found");
      v.test(done);
    });

    it("middlewareErr receives the rejection value of the middleware stack", function (done) {
      createApp(new Detour()
        .use(function (ctx) { throw new Error("not found"); })
        .route("/", { GET: worked })
        .middlewareErr(function (ctx, err) {
          ctx.status = 404;
          ctx.body = err.message;
          ctx.continue = false;
        })
      );

      v.expectStatus(404);
      v.expectBody("not found");
      v.test(done);
    });
  });

  describe("fallback handlers", function () {
    it("405's by default when method not supported by resource", function (done) {
      createApp(new Detour().route("/", { GET: worked }));
      v.expectStatus(405);
      v.expectBody("Not allowed");
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
  });

  describe("#handle", function () {
    it("throws if provided an unknown type", function () {
      expect(() => {
        new Detour().handle("BAD_KEY", () => {})
      }).toThrow("Invalid `type` argument to `handle()`: BAD_KEY")
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

    // not quite sure what HEAD is supposed to do
  });

});