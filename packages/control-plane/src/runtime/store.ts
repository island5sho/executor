import { type SqlControlPlaneRows, SqlControlPlaneRowsService } from "#persistence";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export type ControlPlaneStoreShape = SqlControlPlaneRows;

export class ControlPlaneStore extends Context.Tag(
  "#runtime/ControlPlaneStore",
)<ControlPlaneStore, ControlPlaneStoreShape>() {}

export const ControlPlaneStoreLive = Layer.effect(
  ControlPlaneStore,
  Effect.map(SqlControlPlaneRowsService, (rows) => rows),
);
