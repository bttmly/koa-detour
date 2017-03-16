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
      params[keys[index].name] = decodeParam(match);
      return params;
    }, {});
  }
}

function decodeParam (val) {
  if (val == null) return val;

  try {
    return decodeURIComponent(val);
  } catch (err) {
    // is there really any other type of error that could come out here?
    if (err instanceof URIError) {
      err.message = `Failed to decode param '${val}'`;
      err.status = err.statusCode = 400;
    }
    throw err;
  }
}

module.exports = Route;
