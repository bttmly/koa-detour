declare module "koa-detour" {
  import Koa = require("koa");
  import * as compose from "koa-compose";

  namespace Detour {
    interface Options {
      strict?: boolean;
      caseSensitive?: boolean;
    }

    export type RoutePath = string | any[] | RegExp;
    type HandlerType = "HEAD" | "OPTIONS" | "methodNotAllowed";
    type Handler = (ctx: Context) => void;

    export interface Resource {
      GET?: (ctx: Context) => any;
      PUT?: (ctx: Context) => any;
      POST?: (ctx: Context) => any;
      DELETE?: (ctx: Context) => any;
      name?: string;
    }

    export interface CollectionResource {
      member: Resource;
      collection: Resource;
    }

    type Middleware = compose.Middleware<Context>;

    export class Route {
      constructor(path: RoutePath, resource: Resource, options: any);
      match(r: string): boolean;
      path?: string;
    }

    export interface Context extends Koa.Context {
      resource: Resource;
      route: Route;
      params: any;
    }
  }

  interface IDetour {
    constructor(options?: Detour.Options);

    middleware(): (ctx: Detour.Context, next: () => void) => void;

    use(fn: Detour.Middleware): this;

    apply(fn: Function, ...args: any[]): this;

    route(path: Detour.RoutePath, resource: Detour.Resource): this;

    collection(path: Detour.RoutePath, resource: Detour.CollectionResource): this;

    handle(type: Detour.HandlerType, handler: Detour.Handler): this;

    _routes: Detour.Route[];
  }

  export = Detour;
}
