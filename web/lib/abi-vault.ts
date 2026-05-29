export const veilLendingVaultAbi = [
  { type: "function", name: "BPS_DENOM", inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "collateralToken", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "debtToken", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "price", inputs: [], outputs: [{ type: "uint64" }], stateMutability: "view" },
  { type: "function", name: "ltvBps", inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view" },
  {
    type: "function",
    name: "liquidationBonusBps",
    inputs: [],
    outputs: [{ type: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "amountExt", type: "bytes32" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "amountExt", type: "bytes32" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "borrow",
    inputs: [
      { name: "amountExt", type: "bytes32" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "repay",
    inputs: [
      { name: "amountExt", type: "bytes32" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "liquidate",
    inputs: [{ name: "borrower", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getCollateral",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getDebt",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "positionExists",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "PositionOpened",
    inputs: [{ name: "user", type: "address", indexed: true }],
    anonymous: false,
  },
  { type: "event", name: "Deposited", inputs: [{ name: "user", type: "address", indexed: true }], anonymous: false },
  { type: "event", name: "Withdrawn", inputs: [{ name: "user", type: "address", indexed: true }], anonymous: false },
  { type: "event", name: "Borrowed", inputs: [{ name: "user", type: "address", indexed: true }], anonymous: false },
  { type: "event", name: "Repaid", inputs: [{ name: "user", type: "address", indexed: true }], anonymous: false },
  {
    type: "event",
    name: "Liquidated",
    inputs: [
      { name: "borrower", type: "address", indexed: true },
      { name: "keeper", type: "address", indexed: true },
    ],
    anonymous: false,
  },
] as const;

export const veilRegulatorRegistryAbi = [
  {
    type: "function",
    name: "setRegulator",
    inputs: [
      { name: "regulator", type: "address" },
      { name: "until", type: "uint48" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  { type: "function", name: "revokeRegulator", inputs: [], outputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    name: "regulatorOf",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "regulator", type: "address" },
      { name: "until", type: "uint48" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isAuditorOf",
    inputs: [
      { name: "user", type: "address" },
      { name: "auditor", type: "address" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "RegulatorSet",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "regulator", type: "address", indexed: true },
      { name: "until", type: "uint48", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RegulatorRevoked",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "regulator", type: "address", indexed: true },
    ],
    anonymous: false,
  },
] as const;
