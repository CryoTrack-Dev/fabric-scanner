import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@hyperledger/fabric-gateway",
    "@grpc/grpc-js",
    "fabric-common",
    "fabric-protos",
  ],
};

export default nextConfig;
