const _ = require("lodash");

const Widget = {
  async findById (id) {
    return _.find(db, { id });
  },
  async removeById (id) {
    _.remove(db, { id });
  },
};

module.exports = Widget;

const db = [
  { id: "1", owner: "steph" },
  { id: "2", owner: "steph" },
  { id: "3", owner: "dray" },
  { id: "4", owner: "klay" },
];
