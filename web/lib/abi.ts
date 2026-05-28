export const veilAbi = [
  {
    type: "constructor",
    inputs: [{ name: "batchBlocks_", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "NUM_TICKS",
    inputs: [],
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "batchBlocks",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "currentBatchId",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "placeOrder",
    inputs: [
      { name: "sideExt", type: "bytes32" },
      { name: "tickExt", type: "bytes32" },
      { name: "sizeExt", type: "bytes32" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "closeBatch",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitClearing",
    inputs: [
      { name: "batchId", type: "uint256" },
      { name: "clearingTick", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getBatchState",
    inputs: [{ name: "batchId", type: "uint256" }],
    outputs: [
      { name: "openBlock", type: "uint256" },
      { name: "closeBlock", type: "uint256" },
      { name: "state", type: "uint8" },
      { name: "clearingTick", type: "uint8" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOrderCount",
    inputs: [{ name: "batchId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOrderTrader",
    inputs: [
      { name: "batchId", type: "uint256" },
      { name: "idx", type: "uint256" },
    ],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOrderFill",
    inputs: [
      { name: "batchId", type: "uint256" },
      { name: "idx", type: "uint256" },
    ],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBuyVolume",
    inputs: [
      { name: "batchId", type: "uint256" },
      { name: "tick", type: "uint8" },
    ],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSellVolume",
    inputs: [
      { name: "batchId", type: "uint256" },
      { name: "tick", type: "uint8" },
    ],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "BatchOpened",
    inputs: [
      { name: "batchId", type: "uint256", indexed: true },
      { name: "openBlock", type: "uint256", indexed: false },
      { name: "closeBlock", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OrderPlaced",
    inputs: [
      { name: "batchId", type: "uint256", indexed: true },
      { name: "trader", type: "address", indexed: true },
      { name: "orderIndex", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BatchClosed",
    inputs: [{ name: "batchId", type: "uint256", indexed: true }],
    anonymous: false,
  },
  {
    type: "event",
    name: "BatchCleared",
    inputs: [
      { name: "batchId", type: "uint256", indexed: true },
      { name: "clearingTick", type: "uint8", indexed: false },
    ],
    anonymous: false,
  },
] as const;

export enum BatchState {
  Open = 0,
  Closed = 1,
  Cleared = 2,
}

export const TICK_LABELS = ["T0 (cheapest)", "T1", "T2", "T3 (richest)"] as const;
