import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
// Import individual connector modules to avoid pulling in optional connectors
// (walletconnect, safe, porto, tempo) that have heavy peer dependencies.
import { injected } from "wagmi/connectors";
import { SEPOLIA_RPC } from "./config";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [sepolia.id]: http(SEPOLIA_RPC),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
