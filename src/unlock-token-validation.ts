import { ethers } from 'ethers'
import * as dotenv from 'dotenv'

dotenv.config()

const abi = ['function getHasValidKey(address _user) view returns (bool)']

// Connect to the network
const provider = new ethers.providers.JsonRpcProvider(process.env.JSON_RPC_RINKEBY)

// Rinkeby Croco Lock
const contractAddress = '0x27143360cC640019936EFDF9d74B1dC4DeA6bfd8'

// We connect to the Contract using a Provider, so we will only
// have read-only access to the Contract
async function hasValidKey(address: string): Promise<boolean> {
  const contract = new ethers.Contract(contractAddress, abi, provider)
  return contract.getHasValidKey(address)
}

;(async function main() {
  console.log(await hasValidKey('0xaa81Ca5483020798F1A8834e1FB227e1C02c8Ede'))
})().catch((error) => console.error(error))
