import { useState, useCallback } from 'react'
import { usePublicClient } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { isAddress, type Address, erc20Abi, getAddress, formatUnits } from 'viem'
import { arcTestnet } from 'viem/chains'
import {
  Search, CheckCircle, XCircle, Loader2, ExternalLink, Copy, Check,
  Code2, Coins, Hash, Shield, AlertTriangle, ChevronDown, ChevronUp,
  Wallet
} from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { requireChain, getUsdc } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { toast } from 'sonner'

// ── helpers ──────────────────────────────────────────────────────────────────
const CHAIN_ID = arcTestnet.id
const chain = requireChain(CHAIN_ID)
const usdcFact = getUsdc(CHAIN_ID)

const shortAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

function buildExplorerUrl(address: string) {
  return `${chain.explorerBase}/address/${address}`
}

// glass surface styles
const glass = {
  card: {
    background: 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.68)',
    boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
  } as React.CSSProperties,
  inner: {
    background: 'rgba(255,255,255,0.46)',
    border: '1px solid rgba(255,255,255,0.56)',
  } as React.CSSProperties,
}

// minimal ERC-20 name/symbol/decimals ABI
const erc20MetaAbi = [
  { name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const

// ── types ─────────────────────────────────────────────────────────────────────
interface ContractInfo {
  address: Address
  bytecodeSize: number
  isERC20: boolean
  tokenName?: string
  tokenSymbol?: string
  tokenDecimals?: number
  tokenSupply?: bigint
  usdcBalance?: bigint
  nativeBalance?: bigint
  codeHash: string
}

// ── CopyButton ────────────────────────────────────────────────────────────────
function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      toast.success('Copied to clipboard')
    })
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors"
      style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : label}
    </button>
  )
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
      style={{
        background: ok ? 'rgba(26,128,71,0.1)' : 'rgba(186,43,76,0.1)',
        color: ok ? 'var(--success)' : 'var(--danger)',
      }}
    >
      {ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
      {label}
    </span>
  )
}

// ── InfoRow ───────────────────────────────────────────────────────────────────
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-sm shrink-0" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="text-sm font-medium text-right" style={{ color: 'var(--ink)' }}>{children}</span>
    </div>
  )
}

// ── SectionCard ───────────────────────────────────────────────────────────────
function SectionCard({
  icon, title, children, defaultOpen = true
}: { icon: React.ReactNode; title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl overflow-hidden" style={glass.card}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4"
        style={{ color: 'var(--ink)' }}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </span>
        {open ? <ChevronUp size={16} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--muted)' }} />}
      </button>
      {open && (
        <div className="px-5 pb-5">
          {children}
        </div>
      )}
    </div>
  )
}

// ── main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const publicClient = usePublicClient({ chainId: CHAIN_ID })

  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [info, setInfo] = useState<ContractInfo | null>(null)

  const verify = useCallback(async () => {
    const addr = input.trim()
    if (!isAddress(addr)) {
      setErrorMsg('Enter a valid 0x address.')
      setStatus('error')
      return
    }
    if (!publicClient) {
      setErrorMsg('Wallet not connected to Arc Testnet.')
      setStatus('error')
      return
    }

    setStatus('loading')
    setInfo(null)
    setErrorMsg('')

    try {
      const checksumAddr = getAddress(addr)

      // parallel: bytecode + native balance + USDC balance
      const [bytecode, nativeBal, usdcBal] = await Promise.all([
        publicClient.getCode({ address: checksumAddr }),
        publicClient.getBalance({ address: checksumAddr }),
        usdcFact
          ? publicClient.readContract({
              address: usdcFact.address as Address,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [checksumAddr],
            }).catch(() => undefined)
          : Promise.resolve(undefined),
      ])

      const code = bytecode ?? '0x'
      const bytecodeSize = code === '0x' ? 0 : (code.length - 2) / 2

      if (bytecodeSize === 0) {
        setErrorMsg('No contract found at this address on Arc Testnet. It may be an EOA or undeployed.')
        setStatus('error')
        return
      }

      // try ERC-20 probe
      let isERC20 = false
      let tokenName: string | undefined
      let tokenSymbol: string | undefined
      let tokenDecimals: number | undefined
      let tokenSupply: bigint | undefined

      try {
        const [name, symbol, decimals, supply] = await Promise.all([
          publicClient.readContract({ address: checksumAddr, abi: erc20MetaAbi, functionName: 'name' }),
          publicClient.readContract({ address: checksumAddr, abi: erc20MetaAbi, functionName: 'symbol' }),
          publicClient.readContract({ address: checksumAddr, abi: erc20MetaAbi, functionName: 'decimals' }),
          publicClient.readContract({ address: checksumAddr, abi: erc20MetaAbi, functionName: 'totalSupply' }),
        ])
        isERC20 = true
        tokenName = name
        tokenSymbol = symbol
        tokenDecimals = decimals
        tokenSupply = supply
      } catch {
        // not an ERC-20, that's fine
      }

      setInfo({
        address: checksumAddr,
        bytecodeSize,
        isERC20,
        tokenName,
        tokenSymbol,
        tokenDecimals,
        tokenSupply,
        usdcBalance: usdcBal,
        nativeBalance: nativeBal,
        codeHash: code.length > 10
          ? `${code.slice(0, 18)}…${code.slice(-8)}`
          : code,
      })
      setStatus('done')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(`Verification failed: ${msg}`)
      setStatus('error')
    }
  }, [input, publicClient])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void verify()
  }

  return (
    <div
      className="relative min-h-dvh overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #f9f9fc 0%, #fffcf7 52%, #fbf7f2 100%)' }}
    >
      {/* ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: 'absolute', top: '6%', left: '4%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(133,177,237,0.20) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '6%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,205,131,0.18) 0%, transparent 70%)', filter: 'blur(58px)' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-lg px-4 pb-16 pt-8">

        {/* header */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>Contract Verifier</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Inspect any contract on <span className="font-semibold">Arc Testnet</span>
            </p>
          </div>
          <ConnectKitButton />
        </header>

        {/* search card */}
        <div className="rounded-2xl p-5 mb-5" style={glass.card}>
          <label className="block text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
            Contract Address
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="0x…"
              spellCheck={false}
              className="mono flex-1 rounded-xl px-4 py-3 text-sm outline-none transition-all"
              style={{
                ...glass.inner,
                color: 'var(--ink)',
                fontSize: '13px',
              }}
            />
            <button
              onClick={() => void verify()}
              disabled={status === 'loading' || !input.trim()}
              className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              {status === 'loading'
                ? <Loader2 size={16} className="animate-spin" />
                : <Search size={16} />}
              {status === 'loading' ? 'Checking…' : 'Verify'}
            </button>
          </div>

          {/* quick examples */}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>Try:</span>
            {usdcFact && (
              <button
                onClick={() => { setInput(usdcFact.address); setStatus('idle') }}
                className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
                style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
              >
                USDC token
              </button>
            )}
          </div>
        </div>

        {/* error state */}
        {status === 'error' && (
          <div
            className="flex items-start gap-3 rounded-2xl p-4 mb-5"
            style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.15)' }}
          >
            <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
            <p className="text-sm" style={{ color: 'var(--danger)' }}>{errorMsg}</p>
          </div>
        )}

        {/* results */}
        {status === 'done' && info && (
          <div className="space-y-4">

            {/* summary hero */}
            <div className="rounded-2xl p-5" style={glass.card}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Shield size={16} style={{ color: 'var(--success)' }} />
                    <span className="display text-base font-bold" style={{ color: 'var(--ink)' }}>
                      Contract Confirmed
                    </span>
                  </div>
                  <p className="mono text-xs" style={{ color: 'var(--muted)' }}>{shortAddr(info.address)}</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <StatusBadge ok={true} label="Is Contract" />
                  {info.isERC20 && <StatusBadge ok={true} label="ERC-20" />}
                </div>
              </div>

              <div className="flex gap-2">
                <a
                  href={buildExplorerUrl(info.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition-colors"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  <ExternalLink size={13} /> View on Explorer
                </a>
                <CopyButton value={info.address} label="Copy Address" />
              </div>
            </div>

            {/* contract info */}
            <SectionCard icon={<Code2 size={15} />} title="Contract Details">
              <div className="divide-y-0">
                <InfoRow label="Address">
                  <span className="mono text-xs">{info.address}</span>
                </InfoRow>
                <InfoRow label="Bytecode Size">
                  {info.bytecodeSize.toLocaleString()} bytes
                </InfoRow>
                <InfoRow label="Bytecode Preview">
                  <span className="mono text-xs break-all" style={{ color: 'var(--muted)' }}>
                    {info.codeHash}
                  </span>
                </InfoRow>
                <InfoRow label="Network">Arc Testnet (chain {CHAIN_ID})</InfoRow>
                <InfoRow label="Type">
                  {info.isERC20 ? 'ERC-20 Token' : 'Smart Contract'}
                </InfoRow>
              </div>
            </SectionCard>

            {/* ERC-20 section (only when applicable) */}
            {info.isERC20 && (
              <SectionCard icon={<Coins size={15} />} title="Token Information">
                {info.tokenName && <InfoRow label="Name">{info.tokenName}</InfoRow>}
                {info.tokenSymbol && <InfoRow label="Symbol">{info.tokenSymbol}</InfoRow>}
                {info.tokenDecimals !== undefined && (
                  <InfoRow label="Decimals">{info.tokenDecimals}</InfoRow>
                )}
                {info.tokenSupply !== undefined && info.tokenDecimals !== undefined && (
                  <InfoRow label="Total Supply">
                    {parseFloat(formatUnits(info.tokenSupply, info.tokenDecimals)).toLocaleString('en-US', { maximumFractionDigits: 2 })}{' '}
                    {info.tokenSymbol}
                  </InfoRow>
                )}
              </SectionCard>
            )}

            {/* balances */}
            <SectionCard icon={<Wallet size={15} />} title="Balances Held">
              <InfoRow label="Native USDC (gas)">
                <span className="flex items-center gap-1.5">
                  <TokenUSDC size={14} variant="branded" />
                  {formatUnits(info.nativeBalance ?? 0n, 18)} USDC
                </span>
              </InfoRow>
              {usdcFact && (
                <InfoRow label="ERC-20 USDC">
                  <span className="flex items-center gap-1.5">
                    <TokenUSDC size={14} variant="branded" />
                    {info.usdcBalance !== undefined
                      ? `${Amount.fromRaw(info.usdcBalance, usdcDecimalsFor(CHAIN_ID)).toFixed(2)} USDC`
                      : '—'
                    }
                  </span>
                </InfoRow>
              )}
            </SectionCard>

            {/* bytecode hash */}
            <SectionCard icon={<Hash size={15} />} title="Bytecode" defaultOpen={false}>
              <div className="rounded-xl p-3 overflow-x-auto" style={glass.inner}>
                <pre className="mono text-xs whitespace-pre-wrap break-all" style={{ color: 'var(--muted)', margin: 0 }}>
                  {info.codeHash}
                </pre>
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>
                This is a truncated preview. View the full bytecode on the explorer.
              </p>
            </SectionCard>

          </div>
        )}

        {/* idle empty state */}
        {status === 'idle' && (
          <div className="flex flex-col items-center py-12 text-center" style={{ color: 'var(--muted)' }}>
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(18,45,69,0.06)' }}
            >
              <Shield size={28} style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>Ready to verify</p>
            <p className="text-xs max-w-xs" style={{ color: 'var(--subtle)' }}>
              Paste any contract address above to inspect its bytecode, token metadata, and USDC holdings on Arc Testnet.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
