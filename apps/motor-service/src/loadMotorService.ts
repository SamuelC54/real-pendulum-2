/**
 * Loads **`motor.proto`** from the repo **`proto/`** tree and returns the **`MotorService`** constructor.
 */
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "node:path";

export function loadMotorServiceCtor(pkgRoot: string): grpc.ServiceClientConstructor {
  const repoProto = path.resolve(pkgRoot, "..", "..", "proto");
  const protoPath = path.join(repoProto, "motor.proto");
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [repoProto],
  });
  const loaded = grpc.loadPackageDefinition(packageDefinition) as Record<
    string,
    grpc.GrpcObject | grpc.ServiceClientConstructor
  >;
  const motorNs = loaded.motor as grpc.GrpcObject;
  const v1 = motorNs.v1 as grpc.GrpcObject;
  return v1.MotorService as grpc.ServiceClientConstructor;
}
