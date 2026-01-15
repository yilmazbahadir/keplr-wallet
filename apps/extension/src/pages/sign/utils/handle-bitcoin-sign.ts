import {
  SignBitcoinMessageInteractionStore,
  SignBitcoinTxInteractionStore,
} from "@keplr-wallet/stores-core";
import {
  ErrFailedGetPublicKey,
  ErrFailedInit,
  ErrModuleLedgerSign,
  ErrPublicKeyUnmatched,
  LedgerOptions,
} from "./ledger-types";
import Transport from "@ledgerhq/hw-transport";
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import {
  Hash,
  PubKeyBitcoinCompatible,
  PubKeySecp256k1,
  toXOnly,
} from "@keplr-wallet/crypto";
import { KeplrError } from "@keplr-wallet/router";
import { BitcoinSignMessageType, ModularChainInfo } from "@keplr-wallet/types";
import AppClient, {
  DefaultWalletPolicy,
  WalletPolicy,
  DefaultDescriptorTemplate,
} from "ledger-bitcoin";
import { Network, Psbt, Transaction } from "bitcoinjs-lib";
import { fromOutputScript, toOutputScript } from "bitcoinjs-lib/src/address";
import { BIP322, PlainObject } from "@keplr-wallet/background";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  ErrLattice1SignerNotFound,
  ErrLattice1SignFailed,
  ErrModuleLattice1Sign,
  Lattice1Keys,
  getLattice1Credentials,
  getLattice1PathFromPubKey,
  signLattice1BitcoinMessage,
  signLattice1BitcoinTx,
} from "./lattice1";
import { bip44PathToIndices } from "../../../utils/lattice1";

// TODO: Support babylon staking with script path spending
// const BABYLON_SCRIPT_TYPES = {
//   SLASHING: "slashing",
//   UNBONDING: "unbonding",
//   TIMELOCK: "timelock",
// };

// const BABYLON_SCRIPT_TYPES_REGEX = {
//   [BABYLON_SCRIPT_TYPES.SLASHING]:
//     /^([a-f0-9]{64}) OP_CHECKSIGVERIFY ([a-f0-9]{64}) OP_CHECKSIGVERIFY ([a-f0-9]{64}) OP_CHECKSIG/,
//   [BABYLON_SCRIPT_TYPES.UNBONDING]:
//     /^([a-f0-9]{64}) OP_CHECKSIGVERIFY ([a-f0-9]{64}) OP_CHECKSIG/,
//   [BABYLON_SCRIPT_TYPES.TIMELOCK]:
//     /^([a-f0-9]{64}) OP_CHECKSIGVERIFY ([a-f0-9]{2,6}) OP_CHECKSEQUENCEVERIFY$/,
// };

/**
 * Bitcoin descriptor templates for different script types
 */
const DESCRIPTOR_TEMPLATES = {
  /**
   * Basic descriptor templates based on BIP purpose
   * - 86: Taproot (tr)
   * - 84: Native SegWit (wpkh)
   * - other: Legacy (pkh)
   */
  DEFAULT: (purpose: number): DefaultDescriptorTemplate => {
    switch (purpose) {
      case 86:
        return "tr(@0/**)";
      case 84:
        return "wpkh(@0/**)";
      default:
        return "pkh(@0/**)";
    }
  },

  /**
   * Babylon Slashing policy descriptor template
   * Script Format: staker_pk OP_CHECKSIGVERIFY finalityprovider_pk OP_CHECKSIGVERIFY, n of m multi-sig
   * Template Format: tr(@0/**,and_v(v:pk(staker_pk), and_v(v:pk(finalityprovider_pk),multi_a(covenant_threshold, covenant_pk1, ..., covenant_pkn))))
   * @param covenantThreshold - Number of required signatures
   * @param numKeys - Number of covenant public keys
   */
  BABYLON_SLASHING: (covenantThreshold: number, numKeys: number) =>
    `tr(@0/**,and_v(v:pk(@1/**),and_v(v:pk(@2/**),multi_a(${covenantThreshold},${Array.from(
      { length: numKeys },
      (_, index) => `@${3 + index}/**`
    ).join(",")}))))`,

  /**
   * Babylon Unbonding policy descriptor template
   * Script Format: staker_pk OP_CHECKSIGVERIFY, n of m multi-sig
   * Template Format: tr(@0/**,and_v(v:pk(staker_pk),multi_a(covenant_threshold, covenant_pk1, ..., covenant_pkn)))
   * @param covenantThreshold - Number of required signatures
   * @param numKeys - Number of covenant public keys
   */
  BABYLON_UNBONDING: (covenantThreshold: number, numKeys: number) =>
    `tr(@0/**,and_v(v:pk(@1/**),multi_a(${covenantThreshold},${Array.from(
      { length: numKeys },
      (_, index) => `@${2 + index}/**`
    ).join(",")})))`,

  /**
   * Babylon Timelock policy descriptor template
   * Script Format: staker_pk OP_CHECKSIGVERIFY, timelock_blocks OP_CHECKSEQUENCEVERIFY
   * Template Format: tr(@0/**,and_v(v:pk(staker_pk),older(timelock_blocks)))
   * @param timelockBlocks - Number of blocks to wait before spending
   */
  BABYLON_TIMELOCK: (timelockBlocks: number) =>
    `tr(@0/**,and_v(v:pk(@1/**),older(${timelockBlocks})))`,
};

const LATTICE1_SUPPORTED_BIP44_PURPOSES = new Set([44, 49, 84]);
const BTC_SIGHASH_ALL = 0x01;

const parseBip44Path = (path: string) => {
  const match = /^m\/(\d+)'\/(\d+)'\/(\d+)'\/(\d+)\/(\d+)$/i.exec(path);
  if (!match) {
    throw new Error("Invalid BIP44 path");
  }
  return {
    purpose: Number(match[1]),
    coinType: Number(match[2]),
    account: Number(match[3]),
    change: Number(match[4]),
    addressIndex: Number(match[5]),
  };
};

const normalizeScalarHex = (value: string): Buffer => {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  const raw = Buffer.from(hex, "hex");
  if (raw.length > 32) {
    throw new Error("Invalid signature length");
  }
  if (raw.length === 32) {
    return raw;
  }
  const padded = Buffer.alloc(32);
  raw.copy(padded, 32 - raw.length);
  return padded;
};

export const connectAndSignMessageWithLedger = async (
  interactionData: NonNullable<
    SignBitcoinMessageInteractionStore["waitingData"]
  >,
  modularChainInfo: ModularChainInfo,
  options: LedgerOptions
): Promise<string> => {
  if (!("bitcoin" in modularChainInfo)) {
    throw new Error("Bitcoin not found");
  }

  const appData = interactionData.data.keyInsensitive;
  if (!appData) {
    throw new Error("Invalid ledger app data");
  }

  if (typeof appData !== "object") {
    throw new Error("Invalid ledger app data");
  }
  if (!appData["bip44Path"] || typeof appData["bip44Path"] !== "object") {
    throw new Error("Invalid ledger app data");
  }

  const { purpose, coinType } = modularChainInfo.bitcoin.bip44;

  if (!purpose) {
    throw new Error("BIP44 purpose is not set");
  }

  const { account, change, addressIndex } = appData["bip44Path"] as {
    account: number;
    change: number;
    addressIndex: number;
  };

  const network = interactionData.data.network;

  await checkBitcoinPubKey(
    interactionData.data.pubKey,
    {
      purpose,
      coinType,
      account,
      change,
      addressIndex,
    },
    network,
    options
  );

  let transport: Transport;
  try {
    transport = options?.useWebHID
      ? await TransportWebHID.create()
      : await TransportWebUSB.create();
  } catch (e) {
    throw new KeplrError(
      ErrModuleLedgerSign,
      ErrFailedInit,
      "Failed to init transport"
    );
  }

  const btcApp = new AppClient(transport as any);

  const derivationPath = `m/${purpose}'/${coinType}'/${account}'`;

  const fullPath = `${derivationPath}/${change}/${addressIndex}`;

  try {
    const message = interactionData.data.message;
    const signType = interactionData.data.signType;

    if (signType === "bip322-simple") {
      const address = interactionData.data.address;
      const network = interactionData.data.network;
      const masterFp = await btcApp.getMasterFingerprint();
      const scriptPubKey = toOutputScript(address, network);
      const internalPubKey =
        purpose === 86
          ? toXOnly(Buffer.from(interactionData.data.pubKey))
          : undefined;
      const txToSpend = BIP322.buildToSpendTx(message, scriptPubKey);
      const txToSign = BIP322.buildToSignTx(
        txToSpend.getId(),
        scriptPubKey,
        false,
        internalPubKey
      );

      if (purpose === 86) {
        txToSign.updateInput(0, {
          tapBip32Derivation: [
            {
              masterFingerprint: Buffer.from(masterFp, "hex"),
              pubkey: toXOnly(Buffer.from(interactionData.data.pubKey)),
              path: fullPath,
              leafHashes: [],
            },
          ],
        });
      } else {
        txToSign.updateInput(0, {
          bip32Derivation: [
            {
              masterFingerprint: Buffer.from(masterFp, "hex"),
              pubkey: Buffer.from(interactionData.data.pubKey),
              path: fullPath,
            },
          ],
        });
      }

      const xpub = await btcApp.getExtendedPubkey(derivationPath);

      const policy = getDefaultWalletPolicy(
        masterFp,
        purpose,
        derivationPath,
        xpub
      );

      const signatures = await btcApp.signPsbt(
        txToSign.toBase64(),
        policy,
        null
      );

      for (const [index, partialSignature] of signatures) {
        if (purpose === 86) {
          txToSign.updateInput(index, {
            tapKeySig: partialSignature.signature,
          });
        } else {
          txToSign.updateInput(index, {
            partialSig: [
              {
                pubkey: partialSignature.pubkey,
                signature: partialSignature.signature,
              },
            ],
          });
        }
      }

      txToSign.finalizeAllInputs();

      return BIP322.encodeWitness(txToSign);
    }

    return await btcApp.signMessage(Buffer.from(message), fullPath);
  } catch (e) {
    console.log("error", e);
    throw new KeplrError(ErrModuleLedgerSign, 9999, e.message);
  } finally {
    await transport.close();
  }
};

export const connectAndSignMessageWithLattice1 = async (
  interactionData: NonNullable<
    SignBitcoinMessageInteractionStore["waitingData"]
  >,
  modularChainInfo: ModularChainInfo
): Promise<string> => {
  if (!("bitcoin" in modularChainInfo)) {
    throw new Error("Bitcoin not found");
  }

  if (interactionData.data.signType !== BitcoinSignMessageType.ECDSA) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1SignFailed,
      "Lattice1 does not support BIP-322 message signing"
    );
  }

  const keys = interactionData.data.keyInsensitive["keys"] as Lattice1Keys;
  const path = getLattice1PathFromPubKey(
    keys,
    Buffer.from(interactionData.data.pubKey).toString("hex")
  );
  if (path === null) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1SignerNotFound,
      "Invalid signer"
    );
  }

  const creds = getLattice1Credentials(
    interactionData.data.keyInsensitive as PlainObject
  );
  const digest = Hash.hash256(encodeLegacyMessage(interactionData.data.message));
  const sig = await signLattice1BitcoinMessage(creds, path, digest);
  let r: Buffer;
  let s: Buffer;
  try {
    r = normalizeScalarHex(sig.r);
    s = normalizeScalarHex(sig.s);
  } catch (e) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1SignFailed,
      e?.message || "Invalid signature returned from Lattice1"
    );
  }
  const expectedPubKey = new PubKeySecp256k1(
    interactionData.data.pubKey
  ).toBytes(false);
  let recovery: number;
  try {
    recovery = findRecoveryId(digest, r, s, expectedPubKey);
  } catch (e) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1SignFailed,
      e?.message || "Failed to recover Bitcoin public key"
    );
  }

  return encodeLegacySignature(r, s, recovery, true);
};

export const connectAndSignPsbtsWithLedger = async (
  interactionData: NonNullable<SignBitcoinTxInteractionStore["waitingData"]>,
  psbtSignData: {
    psbtHex: string;
    inputsToSign: {
      index: number;
      address: string;
      hdPath?: string;
      tapLeafHashesToSign?: Buffer[];
      sighashTypes?: number[];
      disableTweakSigner?: boolean;
      useTweakedSigner?: boolean;
    }[];
  }[],
  modularChainInfo: ModularChainInfo,
  options: LedgerOptions
): Promise<string[]> => {
  if (!("bitcoin" in modularChainInfo)) {
    throw new Error("Bitcoin not found");
  }

  if (psbtSignData.length === 0) {
    throw new Error("No psbt sign data");
  }

  const appData = interactionData.data.keyInsensitive;
  if (!appData) {
    throw new Error("Invalid ledger app data");
  }

  if (typeof appData !== "object") {
    throw new Error("Invalid ledger app data");
  }
  if (!appData["bip44Path"] || typeof appData["bip44Path"] !== "object") {
    throw new Error("Invalid ledger app data");
  }

  const { purpose, coinType } = modularChainInfo.bitcoin.bip44;

  if (!purpose) {
    throw new Error("BIP44 purpose is not set");
  }

  const { account, change, addressIndex } = appData["bip44Path"] as {
    account: number;
    change: number;
    addressIndex: number;
  };

  const network = interactionData.data.network;

  await checkBitcoinPubKey(
    interactionData.data.pubKey,
    {
      purpose,
      coinType,
      account,
      change,
      addressIndex,
    },
    network,
    options
  );

  let transport: Transport;
  try {
    transport = options?.useWebHID
      ? await TransportWebHID.create()
      : await TransportWebUSB.create();
  } catch (e) {
    throw new KeplrError(
      ErrModuleLedgerSign,
      ErrFailedInit,
      "Failed to init transport"
    );
  }

  const btcApp = new AppClient(transport as any);

  const derivationPath = `m/${purpose}'/${coinType}'/${account}'`;

  try {
    const result = [];
    const { signPsbtOptions } = interactionData.data;
    const autoFinalized = signPsbtOptions?.autoFinalized ?? true;

    for (const data of psbtSignData) {
      let policy: WalletPolicy | undefined | void;
      let hmac: Buffer | undefined;

      // TODO:먼저 script path spending 여부를 확인
      try {
        // policy = await tryParsePsbt(transport, data.psbtBase64, coinType === 1);
      } catch (e) {
        console.log("error", e);
      }

      if (policy) {
        [, hmac] = await btcApp.registerWallet(policy);
      } else {
        // 현재 스크립트 경로 지출은 지원하지 않는다.
        for (const toSign of data.inputsToSign) {
          if (
            (toSign.hdPath && !toSign.hdPath.startsWith(derivationPath)) ||
            (toSign.tapLeafHashesToSign &&
              toSign.tapLeafHashesToSign.length > 0)
          ) {
            throw new KeplrError(
              ErrModuleLedgerSign,
              9999,
              "Script path spending is not supported for Ledger."
            );
          }
        }

        const masterFp = await btcApp.getMasterFingerprint();
        const xpub = await btcApp.getExtendedPubkey(derivationPath);

        policy = getDefaultWalletPolicy(
          masterFp,
          purpose,
          derivationPath,
          xpub
        );
      }

      const psbt = Psbt.fromHex(data.psbtHex);

      // 외부에서 들어온 요청의 경우 추가적으로 bip32 derivation을 처리해줘야 한다.
      if (!interactionData.isInternal) {
        const masterFp = await btcApp.getMasterFingerprint();

        for (const input of data.inputsToSign) {
          if (purpose === 86) {
            psbt.updateInput(input.index, {
              tapBip32Derivation: [
                {
                  masterFingerprint: Buffer.from(masterFp, "hex"),
                  pubkey: toXOnly(Buffer.from(interactionData.data.pubKey)),
                  path:
                    input.hdPath ??
                    `${derivationPath}/${change}/${addressIndex}`,
                  leafHashes: input.tapLeafHashesToSign ?? [],
                },
              ],
            });
          } else {
            psbt.updateInput(input.index, {
              bip32Derivation: [
                {
                  masterFingerprint: Buffer.from(masterFp, "hex"),
                  pubkey: Buffer.from(interactionData.data.pubKey),
                  path:
                    input.hdPath ??
                    `${derivationPath}/${change}/${addressIndex}`,
                },
              ],
            });
          }
        }
      }

      const signatures = await btcApp.signPsbt(
        psbt.toBase64(),
        policy,
        hmac ?? null
      );

      for (const [index, partialSignature] of signatures) {
        if (purpose === 86) {
          psbt.updateInput(index, {
            tapKeySig: partialSignature.signature,
          });
        } else {
          psbt.updateInput(index, {
            partialSig: [
              {
                pubkey: partialSignature.pubkey,
                signature: partialSignature.signature,
              },
            ],
          });
        }
      }

      if (autoFinalized) {
        psbt.finalizeAllInputs();
      }

      result.push(psbt.toHex());
    }

    return result;
  } catch (e) {
    console.log("error", e);
    throw new KeplrError(ErrModuleLedgerSign, 9999, e.message);
  } finally {
    await transport.close();
  }
};

export const connectAndSignPsbtsWithLattice1 = async (
  interactionData: NonNullable<SignBitcoinTxInteractionStore["waitingData"]>,
  psbtSignData: {
    psbtHex: string;
    inputsToSign: {
      index: number;
      address: string;
      hdPath?: string;
      tapLeafHashesToSign?: Buffer[];
      sighashTypes?: number[];
      disableTweakSigner?: boolean;
      useTweakedSigner?: boolean;
    }[];
  }[],
  modularChainInfo: ModularChainInfo
): Promise<string[]> => {
  if (!("bitcoin" in modularChainInfo)) {
    throw new Error("Bitcoin not found");
  }

  if (psbtSignData.length === 0) {
    throw new Error("No psbt sign data");
  }

  const keys = interactionData.data.keyInsensitive["keys"] as Lattice1Keys;
  const basePath = getLattice1PathFromPubKey(
    keys,
    Buffer.from(interactionData.data.pubKey).toString("hex")
  );
  if (basePath === null) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1SignerNotFound,
      "Invalid signer"
    );
  }

  let basePathInfo: ReturnType<typeof parseBip44Path>;
  try {
    basePathInfo = parseBip44Path(basePath);
  } catch (e) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1SignFailed,
      "Invalid Bitcoin derivation path for Lattice1"
    );
  }
  if (
    !LATTICE1_SUPPORTED_BIP44_PURPOSES.has(basePathInfo.purpose) ||
    (basePathInfo.coinType !== 0 && basePathInfo.coinType !== 1)
  ) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1SignFailed,
      "Unsupported Bitcoin derivation path for Lattice1"
    );
  }

  let changePath: number[];
  try {
    changePath = bip44PathToIndices(basePath);
  } catch (e) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1SignFailed,
      "Invalid Bitcoin change path"
    );
  }
  if (changePath.length !== 5) {
    throw new KeplrError(
      ErrModuleLattice1Sign,
      ErrLattice1SignFailed,
      "Invalid Bitcoin change path"
    );
  }

  const creds = getLattice1Credentials(
    interactionData.data.keyInsensitive as PlainObject
  );

  const result: string[] = [];
  const autoFinalized = interactionData.data.signPsbtOptions?.autoFinalized;
  const senderAddress = interactionData.data.address;
  const network = interactionData.data.network;

  for (const data of psbtSignData) {
    if (data.inputsToSign.length === 0) {
      throw new KeplrError(
        ErrModuleLattice1Sign,
        ErrLattice1SignFailed,
        "No inputs to sign for Lattice1"
      );
    }

    const psbt = Psbt.fromHex(data.psbtHex);
    if (data.inputsToSign.length !== psbt.txInputs.length) {
      throw new KeplrError(
        ErrModuleLattice1Sign,
        ErrLattice1SignFailed,
        "Lattice1 does not support partial Bitcoin signing"
      );
    }

    const inputsToSignMap = new Map(
      data.inputsToSign.map((input) => [input.index, input])
    );

    const orderedInputs = psbt.txInputs.map((txInput, index) => {
      const inputToSign = inputsToSignMap.get(index);
      if (!inputToSign) {
        throw new KeplrError(
          ErrModuleLattice1Sign,
          ErrLattice1SignFailed,
          "Missing input metadata for Lattice1 signing"
        );
      }

      if (!inputToSign.hdPath) {
        throw new KeplrError(
          ErrModuleLattice1Sign,
          ErrLattice1SignFailed,
          "Missing derivation path for Lattice1 signing"
        );
      }

      if (inputToSign.tapLeafHashesToSign?.length) {
        throw new KeplrError(
          ErrModuleLattice1Sign,
          ErrLattice1SignFailed,
          "Taproot script path signing is not supported on Lattice1"
        );
      }

      if (
        inputToSign.sighashTypes &&
        inputToSign.sighashTypes.some((type) => type !== BTC_SIGHASH_ALL)
      ) {
        throw new KeplrError(
          ErrModuleLattice1Sign,
          ErrLattice1SignFailed,
          "Lattice1 only supports SIGHASH_ALL"
        );
      }

      if (inputToSign.disableTweakSigner || inputToSign.useTweakedSigner) {
        throw new KeplrError(
          ErrModuleLattice1Sign,
          ErrLattice1SignFailed,
          "Taproot signing options are not supported on Lattice1"
        );
      }

      let pathInfo: ReturnType<typeof parseBip44Path>;
      try {
        pathInfo = parseBip44Path(inputToSign.hdPath);
      } catch (e) {
        throw new KeplrError(
          ErrModuleLattice1Sign,
          ErrLattice1SignFailed,
          "Invalid Bitcoin derivation path for Lattice1"
        );
      }
      if (
        !LATTICE1_SUPPORTED_BIP44_PURPOSES.has(pathInfo.purpose) ||
        (pathInfo.coinType !== 0 && pathInfo.coinType !== 1)
      ) {
        throw new KeplrError(
          ErrModuleLattice1Sign,
          ErrLattice1SignFailed,
          "Unsupported Bitcoin derivation path for Lattice1"
        );
      }
      if (pathInfo.coinType !== basePathInfo.coinType) {
        throw new KeplrError(
          ErrModuleLattice1Sign,
          ErrLattice1SignFailed,
          "Mismatched Bitcoin coin type for Lattice1"
        );
      }

      let signerPath: number[];
      try {
        signerPath = bip44PathToIndices(inputToSign.hdPath);
      } catch (e) {
        throw new KeplrError(
          ErrModuleLattice1Sign,
          ErrLattice1SignFailed,
          "Invalid Bitcoin signer path"
        );
      }
      if (signerPath.length !== 5) {
        throw new KeplrError(
          ErrModuleLattice1Sign,
          ErrLattice1SignFailed,
          "Invalid Bitcoin signer path"
        );
      }

      const input = psbt.data.inputs[index];
      let value: number | undefined;
      if (input.witnessUtxo) {
        value = input.witnessUtxo.value;
      } else if (input.nonWitnessUtxo) {
        const tx = Transaction.fromBuffer(input.nonWitnessUtxo);
        value = tx.outs[txInput.index]?.value;
      }

      if (value == null) {
        throw new KeplrError(
          ErrModuleLattice1Sign,
          ErrLattice1SignFailed,
          "Missing UTXO value for Lattice1 signing"
        );
      }

      const key = keys[inputToSign.hdPath];
      const pubKey = key?.pubKey
        ? Buffer.from(key.pubKey, "hex")
        : inputToSign.hdPath === basePath
        ? Buffer.from(interactionData.data.pubKey)
        : undefined;
      if (!pubKey) {
        throw new KeplrError(
          ErrModuleLattice1Sign,
          ErrLattice1SignFailed,
          "Unsupported Bitcoin address for Lattice1"
        );
      }

      const txHash = Buffer.from(txInput.hash).reverse().toString("hex");
      return {
        index,
        signerPath,
        txHash,
        value,
        pubKey,
      };
    });

    const outputs = psbt.txOutputs.map((output) => {
      let address: string;
      try {
        address =
          output.address ?? fromOutputScript(output.script, network as Network);
      } catch (e) {
        throw new KeplrError(
          ErrModuleLattice1Sign,
          ErrLattice1SignFailed,
          "Unsupported Bitcoin output for Lattice1"
        );
      }
      return {
        address,
        value: output.value,
      };
    });

    if (outputs.length === 0 || outputs.length > 2) {
      throw new KeplrError(
        ErrModuleLattice1Sign,
        ErrLattice1SignFailed,
        "Lattice1 only supports single-recipient Bitcoin transactions"
      );
    }

    const nonSenderOutputs = outputs.filter(
      (output) => output.address !== senderAddress
    );
    const recipientOutput =
      nonSenderOutputs.length === 1
        ? nonSenderOutputs[0]
        : nonSenderOutputs.length === 0 && outputs.length === 1
        ? outputs[0]
        : undefined;
    if (!recipientOutput) {
      throw new KeplrError(
        ErrModuleLattice1Sign,
        ErrLattice1SignFailed,
        "Lattice1 only supports single-recipient Bitcoin transactions"
      );
    }

    const outputSum = outputs.reduce((sum, output) => sum + output.value, 0);
    const inputSum = orderedInputs.reduce((sum, input) => sum + input.value, 0);
    const fee = inputSum - outputSum;
    if (fee < 0) {
      throw new KeplrError(
        ErrModuleLattice1Sign,
        ErrLattice1SignFailed,
        "Invalid Bitcoin fee for Lattice1 signing"
      );
    }

    const prevOuts = orderedInputs.map((input) => ({
      txHash: input.txHash,
      value: input.value,
      index: psbt.txInputs[input.index].index,
      signerPath: input.signerPath,
    }));

    const sigs = await signLattice1BitcoinTx(creds, {
      prevOuts,
      recipient: recipientOutput.address,
      value: recipientOutput.value,
      fee,
      changePath,
    });

    if (sigs.length !== orderedInputs.length) {
      throw new KeplrError(
        ErrModuleLattice1Sign,
        ErrLattice1SignFailed,
        "Unexpected signature count returned from Lattice1"
      );
    }

    sigs.forEach((sig, sigIndex) => {
      const input = orderedInputs[sigIndex];
      const signature = Buffer.concat([
        Buffer.from(sig),
        Buffer.from([BTC_SIGHASH_ALL]),
      ]);
      psbt.updateInput(input.index, {
        partialSig: [
          {
            pubkey: input.pubKey,
            signature,
          },
        ],
      });
    });

    if (autoFinalized !== false) {
      psbt.finalizeAllInputs();
    }

    result.push(psbt.toHex());
  }

  return result;
};

async function checkBitcoinPubKey(
  expectedPubKey: Uint8Array,
  bip44Path: {
    purpose: number;
    coinType: number;
    account: number;
    change: number;
    addressIndex: number;
  },
  network: Network,
  options: LedgerOptions
): Promise<void> {
  let transport: Transport;

  const { purpose, coinType, account, change, addressIndex } = bip44Path;

  const hdPath = `${purpose}'/${coinType}'/${account}'/${change}/${addressIndex}`;

  try {
    transport = options?.useWebHID
      ? await TransportWebHID.create()
      : await TransportWebUSB.create();
  } catch (e) {
    throw new KeplrError(
      ErrModuleLedgerSign,
      ErrFailedInit,
      "Failed to init transport"
    );
  }

  try {
    const btcApp = new AppClient(transport as any);

    const xpub = await btcApp.getExtendedPubkey(hdPath);

    if (
      Buffer.from(
        new PubKeyBitcoinCompatible(Buffer.from(expectedPubKey)).toBytes()
      ).toString("hex") !==
      Buffer.from(
        PubKeyBitcoinCompatible.fromExtendedKey(
          xpub,
          hdPath,
          undefined,
          undefined,
          network
        ).toBytes()
      ).toString("hex")
    ) {
      throw new KeplrError(
        ErrModuleLedgerSign,
        ErrPublicKeyUnmatched,
        "Public key unmatched"
      );
    }
  } catch (e) {
    throw new KeplrError(ErrModuleLedgerSign, ErrFailedGetPublicKey, e.message);
  } finally {
    await transport.close();
  }
}

function getDefaultWalletPolicy(
  masterFingerprint: string,
  purpose: number,
  derivationPath: string,
  xpub: string
): DefaultWalletPolicy {
  return new DefaultWalletPolicy(
    DESCRIPTOR_TEMPLATES.DEFAULT(purpose),
    `[${derivationPath.replace("m", masterFingerprint)}]${xpub}`
  );
}

const MAGIC_BYTES = new TextEncoder().encode("Bitcoin Signed Message:\n");

function encodeLegacyMessage(message: string, prefix?: string): Uint8Array {
  const magicBytes = prefix ? new TextEncoder().encode(prefix) : MAGIC_BYTES;
  const magicLength = encodeVarInt(magicBytes.length);
  const messageBytes = new TextEncoder().encode(message);
  const messageLength = encodeVarInt(messageBytes.length);

  const totalLength =
    magicLength.length +
    magicBytes.length +
    messageLength.length +
    messageBytes.length;

  const buffer = Buffer.alloc(totalLength);

  let offset = 0;
  buffer.set(magicLength, offset);
  offset += magicLength.length;
  buffer.set(magicBytes, offset);
  offset += magicBytes.length;
  buffer.set(messageLength, offset);
  offset += messageLength.length;
  buffer.set(messageBytes, offset);

  return buffer;
}

function encodeLegacySignature(
  r: Uint8Array,
  s: Uint8Array,
  recovery: number,
  compressed?: boolean
): string {
  if (!(recovery === 0 || recovery === 1 || recovery === 2 || recovery === 3)) {
    throw new Error("recovery must be 0, 1, 2, or 3");
  }

  const headerByte = recovery + 27 + (compressed ? 4 : 0);
  return Buffer.concat([
    Uint8Array.of(headerByte),
    Uint8Array.from(r),
    Uint8Array.from(s),
  ]).toString("base64");
}

function encodeVarInt(value: number): Uint8Array {
  let buffer: Uint8Array;
  let dataView: DataView;

  if (value < 253) {
    buffer = new Uint8Array(1);
    buffer[0] = value;
  } else if (value < 0x10000) {
    buffer = new Uint8Array(3);
    buffer[0] = 253;
    dataView = new DataView(buffer.buffer);
    dataView.setUint16(1, value, true);
  } else if (value < 0x100000000) {
    buffer = new Uint8Array(5);
    buffer[0] = 254;
    dataView = new DataView(buffer.buffer);
    dataView.setUint32(1, value, true);
  } else {
    buffer = new Uint8Array(9);
    buffer[0] = 255;
    dataView = new DataView(buffer.buffer);
    dataView.setInt32(1, value & -1, true);
    dataView.setUint32(5, Math.floor(value / 0x100000000), true);
  }
  return buffer;
}

function findRecoveryId(
  digest: Uint8Array,
  r: Uint8Array,
  s: Uint8Array,
  expectedPubKey: Uint8Array
): number {
  const compact = Buffer.concat([Buffer.from(r), Buffer.from(s)]);
  const signature = secp256k1.Signature.fromCompact(compact);
  const expected = Buffer.from(expectedPubKey);

  for (let recovery = 0; recovery < 4; recovery += 1) {
    const recovered = signature
      .addRecoveryBit(recovery)
      .recoverPublicKey(digest)
      .toRawBytes(true);
    if (Buffer.from(recovered).equals(expected)) {
      return recovery;
    }
  }

  throw new Error("Failed to recover Bitcoin public key");
}
