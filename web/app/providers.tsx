"use client";

import { ReactNode, useMemo } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ZamaProvider,
  RelayerWeb,
  SepoliaConfig,
  indexedDBStorage,
} from "@zama-fhe/react-sdk";
import { WagmiSigner } from "@/lib/zama-signer";
import { sepolia } from "wagmi/chains";
import { wagmiConfig } from "@/lib/wagmi";
import { SEPOLIA_RPC_OVERRIDE, ZAMA_RELAYER_URL_OVERRIDE } from "@/lib/config";

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), []);
  const signer = useMemo(() => new WagmiSigner({ config: wagmiConfig }), []);
  const relayer = useMemo(
    () =>
      new RelayerWeb({
        getChainId: () => signer.getChainId(),
        transports: {
          // SepoliaConfig carries the FHE protocol addresses (ACL, KMS, gateway,
          // executor) the worker needs to bootstrap, plus Zama's canonical
          // relayer URL + a default RPC. We override RPC / relayerUrl only when
          // the env var is non-empty — defaulting to clobber with placeholders
          // is exactly what broke before.
          [sepolia.id]: {
            ...SepoliaConfig,
            ...(SEPOLIA_RPC_OVERRIDE ? { network: SEPOLIA_RPC_OVERRIDE } : {}),
            ...(ZAMA_RELAYER_URL_OVERRIDE ? { relayerUrl: ZAMA_RELAYER_URL_OVERRIDE } : {}),
          },
        },
      }),
    [signer],
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider relayer={relayer} signer={signer} storage={indexedDBStorage}>
          {children}
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
