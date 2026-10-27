# Contract Verifier

A live contract inspection tool built on Arc Testnet. Paste any contract address to instantly verify its existence, inspect its bytecode, detect ERC-20 token metadata, and view USDC balances held by the contract.

Built with [Arc Studio](https://studio.arc.io)

## Tech Stack

- React 18 + TypeScript + Vite
- wagmi v2 + viem for onchain reads
- ConnectKit for wallet connection
- Arc Testnet (USDC as native gas)
- Tailwind CSS + Arc Light design tokens

## Features

- Verify any address is a deployed contract (vs EOA)
- Bytecode size and preview
- ERC-20 detection: name, symbol, decimals, total supply
- Native USDC (gas token) and ERC-20 USDC balance held by the contract
- One-click explorer link and copy address

## Development

### Prerequisites

- [Bun](https://bun.sh) runtime

### Install

```bash
bun install
```

### Environment Variables

None required for basic use. The app reads from the Arc Testnet public RPC.

| Variable | Purpose |
|---|---|
| `VITE_WALLETCONNECT_PROJECT_ID` | Optional — WalletConnect Project ID for WalletConnect modal support |

### Run

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Type Check

```bash
bun run check
```
