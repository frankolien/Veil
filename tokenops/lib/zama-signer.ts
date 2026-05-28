import {
  getAccount,
  getBlock,
  getChainId,
  readContract,
  signTypedData,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import type { Config } from "wagmi";

/**
 * Minimal Zama GenericSigner over wagmi/core.
 *
 * The official `WagmiSigner` from `@zama-fhe/react-sdk/wagmi` imports
 * `watchConnection` from `wagmi/actions`, which no longer exists in current
 * wagmi (the export is `watchConnections`, plural). The Zama SDK only uses
 * it to power the optional `subscribe` lifecycle hook, so we omit `subscribe`
 * entirely and the rest of the surface keeps working as-is.
 */
export class WagmiSigner {
  readonly config: Config;

  constructor(opts: { config: Config }) {
    this.config = opts.config;
  }

  async getChainId() {
    return getChainId(this.config);
  }

  async getAddress() {
    const acc = getAccount(this.config);
    if (!acc?.address) throw new TypeError("Invalid address");
    return acc.address;
  }

  // Zama SDK passes EIP-712 typed data with `EIP712Domain` in `types`; wagmi expects
  // it stripped out and a `primaryType` chosen from the remaining type keys.
  async signTypedData(typedData: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    message: Record<string, unknown>;
  }) {
    const { EIP712Domain: _ignored, ...rest } = typedData.types as Record<string, unknown>;
    const primaryType = Object.keys(rest)[0]!;
    return signTypedData(this.config, {
      // wagmi's signTypedData type is parameterised over the user's typed-data
      // schema; the Zama SDK passes through arbitrary input here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      types: rest as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      domain: typedData.domain as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      message: typedData.message as any,
      primaryType,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async writeContract(args: any): Promise<`0x${string}`> {
    return writeContract(this.config, args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async readContract(args: any): Promise<any> {
    return readContract(this.config, args);
  }

  async waitForTransactionReceipt(hash: `0x${string}`) {
    return waitForTransactionReceipt(this.config, { hash });
  }

  async getBlockTimestamp() {
    return (await getBlock(this.config)).timestamp;
  }
}
