# zama_grant

Two submissions to the Zama Developer Program Mainnet Season 3.
Deadline: **2026-07-07**. Theme: *Composable Privacy Is the Key.*

| Workspace | Submission | Track | Reward pool |
| --------- | ---------- | ----- | ----------- |
| [`contracts/`](contracts/) + [`web/`](web/) | **Veil** — confidential MEV-resistant CLOB DEX with cross-margined lending | Builder Track | up to 7,000 cUSDT |
| [`tokenops/`](tokenops/) | **Mist** — confidential disperse on the TokenOps SDK | Special Bounty × TokenOps | 2,500 cUSDT |

## Veil

Every "private DEX" shipped to date reveals order state at match time. Veil keeps
orders, depth, and lending health factors **encrypted end-to-end** under FHE — by
construction, not by latency tricks.

Four primitives, one product:

1. **Sealed-bid uniform-price batch-auction CLOB.** Encrypted side, encrypted price tick,
   encrypted size. Per-tick aggregate volumes accumulated as ciphertexts. After batch close,
   aggregates are made publicly decryptable; any solver computes the clearing tick;
   per-user fills are computed under FHE and stay user-decryptable only.
2. **Cross-margined lending vault.** `euint64` health factor never revealed. Liquidation
   eligibility computed under FHE, decrypted only by permissionless keepers via delegated
   decryption when the liquidation flag flips.
3. **ERC-7984 + Confidential Wrappers Registry** as the settlement layer (cUSDC / cUSDT /
   cWETH live on Sepolia and Ethereum mainnet).
4. **Regulator-key compliance hatch** via delegated decryption — turns Veil into something
   institutions can actually use.

Layout:

- [`contracts/`](contracts/) — Hardhat + `@fhevm/solidity`. v0 contract:
  [`VeilBatchAuction.sol`](contracts/contracts/VeilBatchAuction.sol). Tests in
  [`contracts/test/VeilBatchAuction.ts`](contracts/test/VeilBatchAuction.ts).
- [`web/`](web/) — Next.js 16 App Router + Wagmi + `@zama-fhe/react-sdk`. Place-order page
  at [`web/app/page.tsx`](web/app/page.tsx).

## Mist (TokenOps Special Bounty)

Mist turns a confidential disperse into a paste-and-go flow. Recipients are listed in
plaintext; per-recipient amounts are encrypted client-side and bundled into a single
ERC-7984 transfer via the TokenOps confidential disperse singleton.

- [`tokenops/`](tokenops/) — Next.js 16 + `@tokenops/sdk/fhe-disperse/react` + `@zama-fhe/react-sdk`.

## Quick start

```bash
# 1. Contracts — Hardhat workspace
cd contracts
npm install
npx hardhat compile
npx hardhat test test/VeilBatchAuction.ts          # 4 tests pass on the FHEVM mock

# 2. Veil frontend — http://localhost:3030
cd ../web
npm install
cp .env.local.example .env.local                   # add NEXT_PUBLIC_VEIL_ADDRESS once deployed
npm run dev                                        # webpack-mode dev (Turbopack rejects @zama-fhe/sdk)

# 3. Mist (TokenOps disperse) — http://localhost:3031
cd ../tokenops
npm install
cp .env.local.example .env.local                   # add NEXT_PUBLIC_DISPERSE_TOKEN (any ERC-7984)
npm run dev
```

## Status

| Week | Milestone | Status |
| ---- | --------- | ------ |
| 1 | Monorepo + encrypted CLOB primitive + tests passing on FHEVM mock | ✅ |
| 1 | Veil frontend MVP (wallet connect, encrypted place-order form) | ✅ |
| 1 | Mist (TokenOps disperse) scaffold — register + preflight + encrypt-and-disperse UI | ✅ |
| 2 | Sealed-bid uniform-price clearing — pro-rata at marginal tick | ⬜ |
| 3 | ERC-7984 settlement + frontend user-decryption fills + clearing solver bot | ⬜ |
| 4 | Cross-margin lending vault with encrypted health factor | ⬜ |
| 5 | Composition + keeper bot + regulator-key compliance ACL | ⬜ |
| 6 | Polish + gas benchmarks + 3-min video pitch + Sepolia deploy | ⬜ |

## Known infra notes

- **`next dev`/`next build` must run with `--webpack`** in `web/` and `tokenops/` — Turbopack's
  parser currently chokes on `@zama-fhe/sdk`'s use of the right-associative `**` operator.
  Scripts already use the flag.
- **`watchConnection` shim.** Both apps swap `@zama-fhe/react-sdk/wagmi`'s `WagmiSigner` for a
  local copy at `lib/zama-signer.ts` that omits the optional `subscribe` method — the upstream
  signer imports a `watchConnection` export that current wagmi versions don't ship.
