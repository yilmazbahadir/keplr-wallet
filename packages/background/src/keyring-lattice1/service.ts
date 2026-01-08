import { PlainObject, Vault } from "../vault";
import { Buffer } from "buffer/";
import { PubKeySecp256k1 } from "@keplr-wallet/crypto";
import { KeyRingService } from "../keyring";
import { Lattice1Accounts } from "./types";

export class KeyRingLattice1Service {
  async init(): Promise<void> {
    // No-op. Lattice1 uses frontend signing with stored credentials.
  }

  supportedKeyRingType(): string {
    return "lattice1";
  }

  createKeyRingVault(
    lattice1Accounts: Lattice1Accounts
  ): Promise<{
    insensitive: PlainObject;
    sensitive: PlainObject;
  }> {
    const keys: PlainObject = {};
    lattice1Accounts.keys.forEach((k) => {
      keys[k.path] = {
        pubKey: k.publicKey,
        chain: k.chain,
        name: k.name,
      };
    });
    const creds: PlainObject = {
      deviceId: lattice1Accounts.creds.deviceId,
      password: lattice1Accounts.creds.password,
      endpoint: lattice1Accounts.creds.endpoint,
    };

    return Promise.resolve({
      insensitive: {
        deviceId: lattice1Accounts.deviceId,
        walletUid: lattice1Accounts.walletUid,
        walletName: lattice1Accounts.walletName,
        endpoint: lattice1Accounts.endpoint,
        connectionType: lattice1Accounts.connectionType ?? "WIFI",
        keys,
        bip44Path: lattice1Accounts.bip44Path,
        creds,
      },
      sensitive: {},
    });
  }

  getPubKey(vault: Vault, purpose: number, coinType: number): PubKeySecp256k1 {
    let bytes: Buffer;
    if (vault.insensitive["keys"]) {
      const path = Object.keys(vault.insensitive["keys"]).find((path) => {
        const result = KeyRingService.parseBIP44Path(path);
        return result.purpose === purpose && result.coinType === coinType;
      });
      if (!path) {
        throw new Error(
          `Purpose ${purpose} and CoinType ${coinType} is not supported.`
        );
      }
      bytes = Buffer.from(
        ((vault.insensitive["keys"] as PlainObject)[path] as PlainObject)[
          "pubKey"
        ] as string,
        "hex"
      );
    } else {
      throw new Error(`Lattice1 is not initialized.`);
    }
    return new PubKeySecp256k1(bytes);
  }

  sign(): {
    readonly r: Uint8Array;
    readonly s: Uint8Array;
    readonly v: number | null;
  } {
    throw new Error(
      "Lattice1 can't sign message in background. You should provide the signature from frontend."
    );
  }
}
