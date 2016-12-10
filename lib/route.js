const pathToRegExp = require("path-to-regexp");

// Route is a simplified version of the Express Layer/Route classes
class Route {

  constructor (path, resource, options = {}) {
    this.resource = resource;
    this.path = path;
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
      if (val !== undefined || !params.hasOwnProperty(prop)) {
        params[prop] = val;
      }
      return params;
    }, {});
  }
}

function decodeParam (val) {
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

module.exports = Route;
