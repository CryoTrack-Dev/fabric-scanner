import * as fabricCommon from "fabric-common";

const TX_VALIDATION_CODES: Record<number, string> = {
  0: "VALID",
  1: "NIL_ENVELOPE",
  2: "BAD_PAYLOAD",
  3: "BAD_COMMON_HEADER",
  4: "BAD_CREATOR_SIGNATURE",
  5: "INVALID_ENDORSER_TRANSACTION",
  6: "INVALID_CONFIG_TRANSACTION",
  7: "UNSUPPORTED_TX_PAYLOAD",
  8: "BAD_PROPOSAL_TXID",
  9: "DUPLICATE_TXID",
  10: "ENDORSEMENT_POLICY_FAILURE",
  11: "MVCC_READ_CONFLICT",
  12: "PHANTOM_READ_CONFLICT",
  13: "UNKNOWN_TX_TYPE",
  14: "TARGET_CHAIN_NOT_FOUND",
  15: "MARSHAL_TX_ERROR",
  16: "NIL_TXACTION",
  17: "EXPIRED_CHAINCODE",
  18: "CHAINCODE_VERSION_CONFLICT",
  19: "BAD_HEADER_EXTENSION",
  20: "BAD_CHANNEL_HEADER",
  21: "BAD_RESPONSE_PAYLOAD",
  22: "BAD_RWSET",
  23: "ILLEGAL_WRITESET",
  24: "INVALID_WRITESET",
  25: "INVALID_CHAINCODE",
  254: "NOT_VALIDATED",
  255: "INVALID_OTHER_REASON",
};

export interface ReadSetEntry {
  namespace: string;
  key: string;
  version: { blockNum: number; txNum: number } | null;
}

export interface WriteSetEntry {
  namespace: string;
  key: string;
  isDelete: boolean;
  value: string;
}

export interface DecodedTransaction {
  txId: string;
  indexInBlock: number;
  timestamp: Date;
  creatorMspId: string;
  chaincodeName: string;
  functionName: string;
  args: string[];
  validationCode: string;
  isValid: boolean;
  endorsingMspIds: string[];
  readSet: ReadSetEntry[];
  writeSet: WriteSetEntry[];
}

export interface DecodedBlock {
  number: number;
  previousHash: string;
  dataHash: string;
  transactions: DecodedTransaction[];
}

// Minimal shape of what fabric-common's BlockDecoder.decode() returns —
// only the fields this module reads. Field names (snake_case) match
// fabric-common/lib/BlockDecoder.js exactly; verified by round-tripping a
// synthetic encoded block through the real decoder while writing this module.
interface RawVersion {
  block_num: number | { toNumber(): number };
  tx_num: number | { toNumber(): number };
}
interface RawRead {
  key: string;
  version: RawVersion | null;
}
interface RawWrite {
  key: string;
  is_delete: boolean;
  value: Buffer;
}
interface RawNsRwset {
  namespace: string;
  rwset: { reads: RawRead[]; writes: RawWrite[] };
}
interface RawAction {
  payload: {
    chaincode_proposal_payload: {
      input: { chaincode_spec: { chaincode_id: { name: string }; input: { args: Buffer[] } } };
    };
    action: {
      endorsements: { endorser: { mspid: string } }[];
      proposal_response_payload: {
        extension: { results?: { ns_rwset: RawNsRwset[] } };
      };
    };
  };
}
interface RawEnvelope {
  payload: {
    header: {
      channel_header: { type: number; tx_id: string; timestamp: Date };
      signature_header: { creator: { mspid: string } };
    };
    data: { actions?: RawAction[] };
  };
}
interface RawDecodedBlock {
  header: {
    number: number | { toNumber(): number };
    previous_hash: Buffer;
    data_hash: Buffer;
  };
  data: { data: RawEnvelope[] };
  metadata: { metadata: unknown[][] };
}

const BlockDecoder = (fabricCommon as unknown as {
  BlockDecoder: { decode(buf: Buffer): RawDecodedBlock };
}).BlockDecoder;

function toNum(value: number | { toNumber(): number }): number {
  return typeof value === "number" ? value : value.toNumber();
}

function toHex(value: Buffer): string {
  return Buffer.isBuffer(value) ? value.toString("hex") : "";
}

export function decodeBlock(blockBuf: Buffer): DecodedBlock {
  const raw = BlockDecoder.decode(blockBuf);
  const validationCodes = (raw.metadata.metadata[2] ?? []) as number[];

  const transactions: DecodedTransaction[] = raw.data.data.map((envelope, index) => {
    const channelHeader = envelope.payload.header.channel_header;
    const creatorMspId = envelope.payload.header.signature_header.creator.mspid;
    const code = validationCodes[index] ?? 254;
    const validationCode = TX_VALIDATION_CODES[code] ?? String(code);

    if (channelHeader.type !== 3) {
      return {
        txId: channelHeader.tx_id,
        indexInBlock: index,
        timestamp: channelHeader.timestamp,
        creatorMspId,
        chaincodeName: "_config",
        functionName: channelHeader.type === 1 ? "CONFIG" : "CONFIG_UPDATE",
        args: [],
        validationCode,
        isValid: code === 0,
        endorsingMspIds: [],
        readSet: [],
        writeSet: [],
      };
    }

    const action = envelope.payload.data.actions?.[0];
    if (!action) {
      return {
        txId: channelHeader.tx_id,
        indexInBlock: index,
        timestamp: channelHeader.timestamp,
        creatorMspId,
        chaincodeName: "_unknown",
        functionName: "",
        args: [],
        validationCode,
        isValid: code === 0,
        endorsingMspIds: [],
        readSet: [],
        writeSet: [],
      };
    }

    const chaincodeSpec = action.payload.chaincode_proposal_payload.input.chaincode_spec;
    const rawArgs = chaincodeSpec.input.args ?? [];
    const extension = action.payload.action.proposal_response_payload.extension;
    const endorsingMspIds = action.payload.action.endorsements.map((e) => e.endorser.mspid);

    const readSet: ReadSetEntry[] = [];
    const writeSet: WriteSetEntry[] = [];
    for (const ns of extension.results?.ns_rwset ?? []) {
      for (const read of ns.rwset.reads) {
        readSet.push({
          namespace: ns.namespace,
          key: read.key,
          version: read.version
            ? { blockNum: toNum(read.version.block_num), txNum: toNum(read.version.tx_num) }
            : null,
        });
      }
      for (const write of ns.rwset.writes) {
        writeSet.push({
          namespace: ns.namespace,
          key: write.key,
          isDelete: write.is_delete,
          value: Buffer.isBuffer(write.value) ? write.value.toString("utf8") : "",
        });
      }
    }

    return {
      txId: channelHeader.tx_id,
      indexInBlock: index,
      timestamp: channelHeader.timestamp,
      creatorMspId,
      chaincodeName: chaincodeSpec.chaincode_id.name,
      functionName: rawArgs[0] ? rawArgs[0].toString("utf8") : "",
      args: rawArgs.slice(1).map((a) => a.toString("utf8")),
      validationCode,
      isValid: code === 0,
      endorsingMspIds,
      readSet,
      writeSet,
    };
  });

  return {
    number: toNum(raw.header.number),
    previousHash: toHex(raw.header.previous_hash),
    dataHash: toHex(raw.header.data_hash),
    transactions,
  };
}
