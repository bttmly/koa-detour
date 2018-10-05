const _ = require("lodash");

const User = {
  async find (properties) {
    const user = _.find(db, properties);
    if (user == null) return null;
    return _.omit(user, [ "password" ]);
  },
};

module.exports = User;

const db = [
  { username: "steph", password: "chefcurry", age: 29 },
  { username: "dray", password: "teedup", age: 26 },
  { username: "kev", password: "theservant", age: 29 },
  { username: "klay", password: "rocco", age: 27 },
  { username: "jbell", password: "2", age: 21 },
];
