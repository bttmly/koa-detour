const request = require("supertest");

const app = require("./");

describe("middleware example", () => {

  describe("GET /widget/:id", () => {
    it("401s if not authenticated", async () => {
      return request(app.callback())
      .get("/widget/1")
      .expect(401);
    });

    it("403s if user is not owner of widget", async () => {
      return request(app.callback())
      .get("/widget/3")
      .auth("steph", "chefcurry")
      .expect(403);
    });

    it("200 if user is owner of widget", async () => {
      return request(app.callback())
      .get("/widget/1")
      .auth("steph", "chefcurry")
      .expect(200);
    });
  });


});
