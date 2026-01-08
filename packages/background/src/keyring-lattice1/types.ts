export interface Lattice1Credentials {
  deviceId: string;
  password: string;
  endpoint?: string;
}

export interface Lattice1Account {
  chain: string;
  path: string;
  publicKey: string;
  name?: string;
}

export interface Lattice1Accounts {
  keys: Lattice1Account[];
  bip44Path: {
    account: number;
    change: number;
    addressIndex: number;
  };
  deviceId: string;
  walletUid?: string;
  walletName?: string;
  endpoint?: string;
  connectionType?: "WIFI";
  creds: Lattice1Credentials;
}
