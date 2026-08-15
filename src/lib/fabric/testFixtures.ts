import { common, protos, msp, rwset, kvrwset } from "fabric-protos";

function identityBytes(mspid: string, cert: string): Uint8Array {
  return msp.SerializedIdentity.encode({ mspid, id_bytes: Buffer.from(cert) }).finish();
}

export interface FixtureOptions {
  blockNumber?: number;
  txId?: string;
  chaincodeName?: string;
  functionName?: string;
  args?: string[];
  creatorMspId?: string;
  validationCode?: number;
}

/**
 * Builds a real encoded common.Block with a single ENDORSER_TRANSACTION
 * envelope, for exercising decodeBlock() without a live Fabric network.
 */
export function buildFixtureBlock(options: FixtureOptions = {}): Buffer {
  const {
    blockNumber = 42,
    txId = "tx1",
    chaincodeName = "cryotrack",
    functionName = "CommissionShipment",
    args = ["urn:epc:id:sscc:123"],
    creatorMspId = "ExporterMSP",
    validationCode = 0,
  } = options;

  const creator = identityBytes(creatorMspId, "creator-cert");
  const endorser = identityBytes(creatorMspId, "endorser-cert");

  const channelHeaderBytes = common.ChannelHeader.encode({
    type: 3, // ENDORSER_TRANSACTION
    version: 0,
    timestamp: { seconds: 1765000000, nanos: 0 },
    channel_id: "supplychain",
    tx_id: txId,
    epoch: 0,
  }).finish();

  const signatureHeaderBytes = common.SignatureHeader.encode({
    creator,
    nonce: Buffer.from("nonce"),
  }).finish();

  // Payload.header is a NESTED MESSAGE (common.Header), not bytes — pass
  // channel_header/signature_header as already-encoded bytes fields on it.
  const chaincodeSpecBytes = protos.ChaincodeSpec.encode({
    type: 2, // NODE
    chaincode_id: { name: chaincodeName, version: "1.0" },
    input: { args: [Buffer.from(functionName), ...args.map((a) => Buffer.from(a))] },
  }).finish();

  const chaincodeInvocationSpecBytes = protos.ChaincodeInvocationSpec.encode({
    chaincode_spec: protos.ChaincodeSpec.decode(chaincodeSpecBytes),
  }).finish();

  const chaincodeProposalPayloadBytes = protos.ChaincodeProposalPayload.encode({
    input: chaincodeInvocationSpecBytes,
  }).finish();

  const kvrwsetBytes = kvrwset.KVRWSet.encode({
    reads: [{ key: "facility:F1", version: { block_num: 1, tx_num: 0 } }],
    writes: [{ key: `shipment:${args[0]}`, is_delete: false, value: Buffer.from('{"status":"active"}') }],
  }).finish();

  const rwsetBytes = rwset.TxReadWriteSet.encode({
    data_model: 0,
    ns_rwset: [{ namespace: chaincodeName, rwset: kvrwsetBytes }],
  }).finish();

  const chaincodeActionBytes = protos.ChaincodeAction.encode({
    results: rwsetBytes,
    chaincode_id: { name: chaincodeName, version: "1.0" },
    response: { status: 200, message: "", payload: Buffer.alloc(0) },
  }).finish();

  const proposalResponsePayloadBytes = protos.ProposalResponsePayload.encode({
    proposal_hash: Buffer.alloc(32),
    extension: chaincodeActionBytes,
  }).finish();

  // ChaincodeActionPayload.action is a NESTED MESSAGE (ChaincodeEndorsedAction),
  // not bytes — pass it as a plain object, not pre-encoded bytes.
  const chaincodeActionPayloadBytes = protos.ChaincodeActionPayload.encode({
    chaincode_proposal_payload: chaincodeProposalPayloadBytes,
    action: {
      proposal_response_payload: proposalResponsePayloadBytes,
      endorsements: [{ endorser, signature: Buffer.alloc(64) }],
    },
  }).finish();

  const transactionBytes = protos.Transaction.encode({
    actions: [{ header: signatureHeaderBytes, payload: chaincodeActionPayloadBytes }],
  }).finish();

  const payloadBytes = common.Payload.encode({
    header: { channel_header: channelHeaderBytes, signature_header: signatureHeaderBytes },
    data: transactionBytes,
  }).finish();

  const envelopeBytes = common.Envelope.encode({
    signature: Buffer.from("sig"),
    payload: payloadBytes,
  }).finish();

  const blockBytes = common.Block.encode({
    header: {
      number: blockNumber,
      previous_hash: Buffer.from("prevhash"),
      data_hash: Buffer.from("datahash"),
    },
    data: { data: [envelopeBytes] },
    metadata: {
      metadata: [
        Buffer.alloc(0),
        Buffer.alloc(0),
        Buffer.from([validationCode]), // TRANSACTIONS_FILTER — one byte per tx
        Buffer.alloc(0),
        Buffer.alloc(0),
      ],
    },
  }).finish();

  return Buffer.from(blockBytes);
}
