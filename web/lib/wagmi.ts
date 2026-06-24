import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
// Import individual connector modules to avoid pulling in optional connectors
// (safe, porto, tempo) that have heavy peer dependencies.
import { injected, walletConnect } from "wagmi/connectors";
import { SEPOLIA_RPC } from "./config";

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

const connectors = [
  injected({ shimDisconnect: true }),
  ...(WC_PROJECT_ID
    ? [
        walletConnect({
          projectId: WC_PROJECT_ID,
          metadata: {
            name: "Veil",
            description: "Confidential MEV-resistant CLOB DEX on Zama FHEVM",
            url: "https://veil-zama.vercel.app",
            icons: ["https://veil-zama.vercel.app/icon.png"],
          },
          showQrModal: true,
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors,
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
