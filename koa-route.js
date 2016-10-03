const pathToRegExp = require("path-to-regexp");

const hasOwnProperty = Object.prototype.hasOwnProperty;

// Route is a simplified version of the Express Layer/Route classes

module.exports = class Route {

  constructor (path, resource, options = {}) {
    this.path = path;
    this.resource = resource;
    this.keys = [];
    this._regexp = pathToRegExp(path, this.keys, options);
  }

  match (path) {
    return this._regexp.test(path);
  }

  params (path) {
    if (!this.match(path)) return null;
    const keys = this.keys;
    const matches = this._regexp.exec(path).slice(1);

    return matches.reduce((params, match, index) => {
      const key = keys[index];
      const prop = key.name;
      const val = decodeParam(match);
      if (val !== undefined || !(hasOwnProperty.call(params, prop))) {
        params[prop] = val;
      }
      return params;
    }, {});
  }
}

function decodeParam (val) {
  if (typeof val !== "string" || val.length === 0) {
    return val;
  }

  try {
    return decodeURIComponent(val);
  } catch (err) {
    if (err instanceof URIError) {
      err.message = `Failed to decode param '${val}'`;
      err.status = err.statusCode = 400;
    }

    throw err;
  }
}
