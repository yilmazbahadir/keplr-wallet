import { Buffer } from "buffer/";
import { KeplrError } from "@keplr-wallet/router";
import * as SDK from "gridplus-sdk";
import { PlainObject } from "@keplr-wallet/background";
import {
  bip44PathToIndices,
  connectLattice1Client,
  createLattice1Client,
  Lattice1Credentials,
} from "../../../utils/lattice1";
import { PubKeySecp256k1 } from "@keplr-wallet/crypto";

type ClientSignParams = Parameters<SDK.Client["sign"]>[0];
type ClientSignData = ClientSignParams["data"];
type LatticeSigningPayload = Extract<ClientSignData, { payload: unknown }>;
export type LatticeEthMessagePayload = LatticeSigningPayload["payload"];
type LatticeBitcoinSignPayload = {
  prevOuts: {
    txHash: string;
    value: number;
    index: number;
    signerPath: number[];
  }[];
  recipient: string;
  value: number;
  fee: number;
  changePath: number[];
};

// TODO: Add unit tests for Lattice1 signing payloads and signature normalization using mocked SDK responses.
export interface Lattice1Keys {
  [path: string]: {
    chain: string;
    name?: string;
    pubKey: string;
  };
}

export const ErrModuleLattice1Sign = "lattice1-sign";
export const ErrLattice1MissingCredentials = 1;
export const ErrLattice1ConnectFailed = 2;
export const ErrLattice1SignFailed = 3;
export const ErrLattice1SignerNotFound = 4;

const stripHexPrefix = (value: string): string => {
  return value.startsWith("0x") ? value.slice(2) : value;
};

const normalizePubKeyHex = (
  value: string
): { compressed: string; uncompressed: string } | undefined => {
  try {
    const hex = stripHexPrefix(value);
    const bytes = Buffer.from(hex, "hex");
    const pubKey = new PubKeySecp256k1(bytes);
    return {
      compressed: Buffer.from(pubKey.toBytes(false)).toString("hex"),
      uncompressed: Buffer.from(pubKey.toBytes(true)).toString("hex"),
    };
  } catch {
    return;
  }
};

export const getLattice1PathFromPubKey = (
  keys: Lattice1Keys,
  pubKey: string
): string | null => {
  const targetRaw = stripHexPrefix(pubKey);
  const targetNormalized = normalizePubKeyHex(pubKey);
  for (const path in keys) {
    if (Object.prototype.hasOwnProperty.call(keys, path)) {
      const key = keys[path];
      const keyRaw = stripHexPrefix(key.pubKey);
      if (keyRaw === targetRaw) {
        return path;
      }
      const keyNormalized = normalizePubKeyHex(key.pubKey);
      if (
        targetNormalized &&
        keyNormalized &&
        (keyNormalized.compressed === targetNormalized.compressed ||
          keyNormalized.uncompressed === targetNormalized.uncompressed)
      ) {
        return path;
      }
    }
  }
  return null;
};

export const getLattice1Credentials = (
  keyInsensitive: PlainObject
): Lattice1Credentials => {
  const credsValue = keyInsensitive["creds"];
  if (!credsValue || typeof credsValue !== "object") {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1MissingCredentials,
      "Missing Lattice1 credentials"
    );
  }

  const creds = credsValue as PlainObject;
  const deviceId = creds["deviceId"];
  const password = creds["password"];
  const endpoint = creds["endpoint"];

  if (typeof deviceId !== "string" || typeof password !== "string") {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1MissingCredentials,
      "Invalid Lattice1 credentials"
    );
  }

  return {
    deviceId,
    password,
    endpoint: typeof endpoint === "string" ? endpoint : undefined,
  };
};

const connectClient = async (creds: Lattice1Credentials) => {
  if (!creds?.deviceId || !creds?.password) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1MissingCredentials,
      "Missing Lattice1 credentials"
    );
  }

  const client = createLattice1Client(creds);
  try {
    await connectLattice1Client(client, creds);
  } catch (e) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1ConnectFailed,
      e?.message || "Failed to connect to Lattice1"
    );
  }

  return client;
};

export const signLattice1Cosmos = async (
  creds: Lattice1Credentials,
  path: string,
  signBytes: Uint8Array
) => {
  const client = await connectClient(creds);
  const signerPath = bip44PathToIndices(path);

  const res = await client.sign({
    data: {
      payload: Buffer.from(signBytes),
      signerPath,
      curveType: SDK.Constants.SIGNING.CURVES.SECP256K1,
      hashType: SDK.Constants.SIGNING.HASHES.SHA256,
      encodingType: SDK.Constants.SIGNING.ENCODINGS.COSMOS,
    },
  });

  if (!res.sig?.r || !res.sig?.s) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1SignFailed,
      "No signature returned from Lattice1"
    );
  }

  return res.sig;
};

export const signLattice1EthMessage = async (
  creds: Lattice1Credentials,
  path: string,
  payload: LatticeEthMessagePayload,
  protocol: "signPersonal" | "eip712"
) => {
  const client = await connectClient(creds);
  const signerPath = bip44PathToIndices(path);

  const res = await client.sign({
    currency: "ETH_MSG",
    data: {
      signerPath,
      payload,
      curveType: SDK.Constants.SIGNING.CURVES.SECP256K1,
      hashType: SDK.Constants.SIGNING.HASHES.KECCAK256,
      protocol,
    },
  });

  if (!res.sig?.r || !res.sig?.s) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1SignFailed,
      "No signature returned from Lattice1"
    );
  }

  return res.sig;
};

export const signLattice1EthTx = async (
  creds: Lattice1Credentials,
  path: string,
  payload: Uint8Array
) => {
  const client = await connectClient(creds);
  const signerPath = bip44PathToIndices(path);

  const res = await client.sign({
    data: {
      payload: Buffer.from(payload),
      signerPath,
      curveType: SDK.Constants.SIGNING.CURVES.SECP256K1,
      hashType: SDK.Constants.SIGNING.HASHES.KECCAK256,
      encodingType: SDK.Constants.SIGNING.ENCODINGS.EVM,
    },
  });

  if (!res.sig?.r || !res.sig?.s) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1SignFailed,
      "No signature returned from Lattice1"
    );
  }

  return res.sig;
};

export const signLattice1BitcoinMessage = async (
  creds: Lattice1Credentials,
  path: string,
  digest: Uint8Array
) => {
  const client = await connectClient(creds);
  const signerPath = bip44PathToIndices(path);

  const res = await client.sign({
    data: {
      payload: Buffer.from(digest),
      signerPath,
      curveType: SDK.Constants.SIGNING.CURVES.SECP256K1,
      hashType: SDK.Constants.SIGNING.HASHES.NONE,
      encodingType: SDK.Constants.SIGNING.ENCODINGS.NONE,
    },
  });

  if (!res.sig?.r || !res.sig?.s) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1SignFailed,
      "No signature returned from Lattice1"
    );
  }

  return res.sig;
};

export const signLattice1BitcoinTx = async (
  creds: Lattice1Credentials,
  payload: LatticeBitcoinSignPayload
) => {
  const client = await connectClient(creds);

  const res = await client.sign({
    currency: "BTC",
    data: payload,
  });

  if (!res.sigs || res.sigs.length === 0) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1SignFailed,
      "No signature returned from Lattice1"
    );
  }

  return res.sigs;
};
