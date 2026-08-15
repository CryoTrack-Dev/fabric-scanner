import * as grpc from "@grpc/grpc-js";
import { connect, Contract, Gateway, Identity, Signer, signers } from "@hyperledger/fabric-gateway";
import * as crypto from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { ScannerEnv } from "../env";

export interface IdentityPaths {
  tlsCertPath: string;
  certDir: string;
  keyDir: string;
}

export function resolveIdentityPaths(env: ScannerEnv): IdentityPaths {
  const orgDir = path.join(env.fabricCryptoBase, "peerOrganizations", env.orgDomain);
  const userMspDir = path.join(orgDir, "users", `${env.userName}@${env.orgDomain}`, "msp");

  return {
    tlsCertPath: path.join(orgDir, "peers", env.peerName, "tls", "ca.crt"),
    certDir: path.join(userMspDir, "signcerts"),
    keyDir: path.join(userMspDir, "keystore"),
  };
}

export interface FabricConnection {
  gateway: Gateway;
  grpcClient: grpc.Client;
  qscc: Contract;
}

export async function connectToFabric(env: ScannerEnv): Promise<FabricConnection> {
  const paths = resolveIdentityPaths(env);

  const tlsRootCert = await fs.readFile(paths.tlsCertPath);
  const grpcClient = new grpc.Client(env.peerAddress, grpc.credentials.createSsl(tlsRootCert), {
    "grpc.ssl_target_name_override": env.peerName,
  });

  const certFile = (await fs.readdir(paths.certDir)).find((f) => f.endsWith(".pem"));
  if (!certFile) throw new Error(`No signing cert found under ${paths.certDir}`);
  const certPem = await fs.readFile(path.join(paths.certDir, certFile));
  const identity: Identity = { mspId: env.mspId, credentials: certPem };

  const keyFile = (await fs.readdir(paths.keyDir))[0];
  if (!keyFile) throw new Error(`No private key found under ${paths.keyDir}`);
  const keyPem = await fs.readFile(path.join(paths.keyDir, keyFile));
  const signer: Signer = signers.newPrivateKeySigner(crypto.createPrivateKey(keyPem));

  const gateway = connect({
    client: grpcClient,
    identity,
    signer,
    evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
  });

  const qscc = gateway.getNetwork(env.channelName).getContract("qscc");

  return { gateway, grpcClient, qscc };
}

export function closeFabricConnection(connection: FabricConnection): void {
  connection.gateway.close();
  connection.grpcClient.close();
}
