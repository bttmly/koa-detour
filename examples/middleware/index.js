const auth = require("basic-auth");
const Koa = require("koa");
const Detour = require("../../");

// mock data layer
const User = require("../_shared/models/User");
const Widget = require("../_shared/models/Widget");

const app = new Koa();
app.use(loginMiddleware);

const router = new Detour();
router.use(authenticateMiddleware);
// router.use(schemaMiddleware);
router.use(fetchMiddleware);
router.use(allowMiddleware);

// router.route("/widget", {
//   authenticate: true,
//
//   schema: schema({
//     POST: {
//
//     },
//   }),
//
//   async POST ({ request, response }) {
//     const { body } = request;
//     await Widget.create(body);
//     response.status = 201;
//   },
// });

router.route("/widget/:id", {
  authenticate: true,

  fetch: ({ params }) => Widget.findById(params.id),

  allow: ({ state: { fetched, user } }) => fetched.owner === user.username,

  async GET (ctx) {
    ctx.body = ctx.state.fetched;
  },

  async DELETE (ctx) {
    const { fetched } = ctx.state;
    await Widget.deleteById(fetched.id);
    ctx.status = 204;
  },
});

async function loginMiddleware ({ state, request }, next) {
  const creds = auth(request);
  if (creds != null) {
    const { name: username, pass: password } = creds;
    state.user = await User.find({ username, password });;
  }
  return next();
}

async function fetchMiddleware (ctx) {
  if (ctx.resource.fetch == null) return;
  const fetched = await ctx.resource.fetch(ctx);
  if (fetched == null) {
    ctx.throw(404);
  }
  ctx.state.fetched = fetched;
}

async function authenticateMiddleware (ctx) {
  if (ctx.resource.authenticate && ctx.state.user == null) {
    ctx.throw(401);
  }
}

async function allowMiddleware (ctx) {
  if (ctx.resource.allow && !ctx.resource.allow(ctx)) {
    ctx.throw(403);
  }
}

app.use(router.middleware());

module.exports = app;

// function dispatchByMethod (handlers) {
//   return function (ctx) {
//     const { method } = ctx;
//     const handler = handlers[method] || handlers.default;
//     return handler(ctx);
//   };
// }
