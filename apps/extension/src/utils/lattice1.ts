import { Buffer as BufferPolyfill } from "buffer/";
import { createHash } from "crypto";
import * as SDK from "gridplus-sdk";

const HARDENED_OFFSET = 0x80000000;
const DEFAULT_APP_NAME = "Keplr Extension";
const SDK_TIMEOUT = 120000;
const CONNECT_TIMEOUT = 20000;
const LATTICE_CONNECT_ORIGIN = "https://lattice.gridplus.io";

export interface Lattice1Credentials {
  deviceId: string;
  password: string;
  endpoint?: string;
}

export interface Lattice1WalletInfo {
  walletUid: string;
  walletName?: string;
}

const deriveSessionKey = (
  creds: Lattice1Credentials,
  appName: string
): Buffer => {
  return createHash("sha256")
    .update(
      BufferPolyfill.concat([
        BufferPolyfill.from(creds.password),
        BufferPolyfill.from(creds.deviceId),
        BufferPolyfill.from(appName),
      ])
    )
    .digest();
};

export const createLattice1Client = (
  creds: Lattice1Credentials,
  appName: string = DEFAULT_APP_NAME
) => {
  return new SDK.Client({
    name: appName,
    baseUrl: creds.endpoint || undefined,
    timeout: SDK_TIMEOUT,
    privKey: deriveSessionKey(creds, appName),
    skipRetryOnWrongWallet: true,
  });
};

export const connectLattice1Client = async (
  client: SDK.Client,
  creds: Lattice1Credentials
): Promise<Lattice1WalletInfo> => {
  const prevTimeout = client.timeout;
  client.timeout = CONNECT_TIMEOUT;
  try {
    const isPaired = await client.connect(creds.deviceId);
    if (!isPaired) {
      await client.pair(creds.password);
      await client.connect(creds.deviceId);
    }
  } finally {
    client.timeout = prevTimeout;
  }

  await client.fetchActiveWallet();
  const wallet = client.getActiveWallet();
  if (!wallet || !wallet.uid) {
    throw new Error("No active wallet found in Lattice1.");
  }

  return {
    walletUid: wallet.uid.toString("hex"),
    walletName: wallet.name?.toString() ?? undefined,
  };
};

export const bip44PathToIndices = (path: string): number[] => {
  if (!path || !path.startsWith("m/")) {
    throw new Error("Invalid BIP44 path");
  }

  const segments = path.replace(/^m\//i, "").split("/");
  if (segments.length === 0) {
    throw new Error("Invalid BIP44 path");
  }

  return segments.map((segment) => {
    const hardened = segment.endsWith("'");
    const index = parseInt(segment.replace("'", ""), 10);
    if (!Number.isFinite(index)) {
      throw new Error("Invalid BIP44 path");
    }
    return hardened ? index + HARDENED_OFFSET : index;
  });
};

export const fetchLattice1PubKeys = async (
  client: SDK.Client,
  paths: string[]
): Promise<Record<string, string>> => {
  const result: Record<string, string> = {};

  for (const path of paths) {
    const startPath = bip44PathToIndices(path);
    const pubKeys = await client.getAddresses({
      startPath,
      n: 1,
      flag: SDK.Constants.GET_ADDR_FLAGS.SECP256K1_PUB,
    });
    const pubKey = pubKeys[0];
    if (!pubKey) {
      throw new Error(`No public key returned for path: ${path}`);
    }
    const pubKeyBytes =
      typeof pubKey === "string"
        ? BufferPolyfill.from(pubKey.replace(/^0x/, ""), "hex")
        : BufferPolyfill.from(pubKey);
    result[path] = pubKeyBytes.toString("hex");
  }

  return result;
};

export const requestLattice1Credentials = async (
  appName: string = DEFAULT_APP_NAME
): Promise<Lattice1Credentials> => {
  const url = `${LATTICE_CONNECT_ORIGIN}?keyring=${encodeURIComponent(
    appName
  )}&forceLogin=true`;

  return new Promise<Lattice1Credentials>((resolve, reject) => {
    let listenInterval: ReturnType<typeof setInterval> | undefined;

    const cleanup = () => {
      if (listenInterval) {
        clearInterval(listenInterval);
      }
      window.removeEventListener("message", receiveMessage);
    };

    const normalizeCreds = (raw: any): Lattice1Credentials => {
      const deviceId = raw?.deviceID ?? raw?.deviceId;
      const password = raw?.password;
      const endpoint = raw?.endpoint ?? undefined;
      if (!deviceId || !password) {
        throw new Error("Invalid credentials returned from Lattice Connect.");
      }
      return {
        deviceId,
        password,
        endpoint,
      };
    };

    const receiveMessage = (event: MessageEvent) => {
      if (event.origin !== LATTICE_CONNECT_ORIGIN) {
        return;
      }
      try {
        cleanup();
        const creds = normalizeCreds(JSON.parse(event.data));
        resolve(creds);
      } catch (e) {
        reject(e);
      }
    };

    const openResult = window.open(url);
    if (openResult) {
      window.addEventListener("message", receiveMessage, false);
      listenInterval = setInterval(() => {
        if (openResult.closed) {
          cleanup();
          reject(new Error("Lattice Connect closed."));
        }
      }, 500);
      return;
    }

    if (browser?.tabs?.create) {
      browser.tabs
        .create({ url })
        .then((tab) => {
          const loginUrlParam = "&loginCache=";
          const tabId = tab.id;
          if (tabId == null) {
            cleanup();
            reject(new Error("Lattice Connect closed."));
            return;
          }
          listenInterval = setInterval(async () => {
            try {
              const current = await browser.tabs.get(tabId);
              if (!current || !current.url) {
                cleanup();
                reject(new Error("Lattice Connect closed."));
                return;
              }

              const paramLoc = current.url.indexOf(loginUrlParam);
              if (paramLoc < 0) {
                return;
              }

              const dataLoc = paramLoc + loginUrlParam.length;
              const decoded = BufferPolyfill.from(
                current.url.slice(dataLoc),
                "base64"
              ).toString();
              cleanup();
              await browser.tabs.remove(tabId);
              resolve(normalizeCreds(JSON.parse(decoded)));
            } catch (e) {
              cleanup();
              reject(e);
            }
          }, 500);
        })
        .catch((e) => {
          cleanup();
          reject(e);
        });
      return;
    }

    reject(new Error("Unable to open Lattice Connect."));
  });
};
