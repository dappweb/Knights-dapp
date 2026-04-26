import { BrowserProvider, JsonRpcSigner } from 'ethers'
import { useMemo } from 'react'
import type { Account, Chain, Client, Transport } from 'viem'
import { type Config, useClient, useConnectorClient } from 'wagmi'

export function clientToSigner(client: Client<Transport, Chain, Account>) {
  const { account, chain, transport } = client as any
  const network = {
    chainId: chain?.id,
    name: chain?.name,
    ensAddress: chain?.contracts?.ensRegistry?.address,
  }
  const provider = new BrowserProvider(transport, network)
  const signer = new JsonRpcSigner(provider, account.address)
  return signer
}

/** Hook to convert a viem Wallet Client to an ethers.js Signer. */
export function useEthersSigner({ chainId }: { chainId?: number } = {}) {
  const { data: client } = useConnectorClient<Config>({ chainId })
  return useMemo(() => (client ? clientToSigner(client) : undefined), [client])
}

export function clientToProvider(client: Client<Transport, Chain>) {
    const { chain, transport } = client as any
    const network = {
      chainId: chain?.id,
      name: chain?.name,
      ensAddress: chain?.contracts?.ensRegistry?.address,
    }
    if (transport.type === 'fallback')
      return new BrowserProvider(transport, network)
    return new BrowserProvider(transport, network)
  }
  
  /** Hook to convert a viem Public Client to an ethers.js Provider. */
  export function useEthersProvider({ chainId }: { chainId?: number } = {}) {
    const client = useClient<Config>({ chainId })
    return useMemo(() => (client ? clientToProvider(client) : undefined), [client])
  }
