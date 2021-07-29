import { CurrencyAmount, Token } from '@uniswap/sdk-core'

export interface Transaction {
  id: string // tx hash
  timestamp: number
  txCostETH: number
  ethPriceUSD: number // price of ETH at the time this transaction happened
}

export interface Snapshot {
  // how many tokens did the user deposit in a given position
  depositedToken0: number
  depositedToken1: number

  // how many tokens did the user withdraw from a given position
  withdrawnToken0: number
  withdrawnToken1: number

  // how many fees did the user collect
  collectedFeesToken0: number
  collectedFeesToken1: number

  // How many tokens did the user have after the change that invoked this snapshot happened
  amountToken0: CurrencyAmount<Token>
  amountToken1: CurrencyAmount<Token>

  priceToken0: number
  priceToken1: number

  // Transaction related to this snapshot
  transaction: Transaction
}

export enum InteractionType {
  DEPOSIT,
  WITHDRAW,
  COLLECT,
}

export class Interaction {
  readonly type: InteractionType
  readonly amountToken0: number
  readonly amountToken1: number
  readonly transaction: Transaction
  readonly valueUSD: number

  constructor(curSnap: Snapshot, prevSnap: Snapshot | undefined, afterWithdraw = false) {
    if (prevSnap === undefined) {
      this.type = InteractionType.DEPOSIT
      this.amountToken0 = curSnap.depositedToken0
      this.amountToken1 = curSnap.depositedToken1
    } else if (afterWithdraw) {
      this.type = InteractionType.COLLECT
      this.amountToken0 = curSnap.collectedFeesToken0 - prevSnap.collectedFeesToken0
      this.amountToken1 = curSnap.collectedFeesToken1 - prevSnap.collectedFeesToken1
    } else if (
      prevSnap.depositedToken0 !== curSnap.depositedToken0 ||
      prevSnap.depositedToken1 !== curSnap.depositedToken1
    ) {
      this.type = InteractionType.DEPOSIT
      this.amountToken0 = curSnap.depositedToken0 - prevSnap.depositedToken0
      this.amountToken1 = curSnap.depositedToken1 - prevSnap.depositedToken1
    } else if (
      prevSnap.withdrawnToken0 !== curSnap.withdrawnToken0 ||
      prevSnap.withdrawnToken1 !== curSnap.withdrawnToken1
    ) {
      this.type = InteractionType.WITHDRAW
      this.amountToken0 = curSnap.withdrawnToken0 - prevSnap.withdrawnToken0
      this.amountToken1 = curSnap.withdrawnToken1 - prevSnap.withdrawnToken1
    } else {
      this.type = InteractionType.COLLECT
      this.amountToken0 = curSnap.collectedFeesToken0 - prevSnap.collectedFeesToken0
      this.amountToken1 = curSnap.collectedFeesToken1 - prevSnap.collectedFeesToken1
    }
    this.transaction = curSnap.transaction
    this.valueUSD = this.amountToken0 * curSnap.priceToken0 + this.amountToken1 * curSnap.priceToken1
  }
}

export type FeesChartEntry = {
  date: number
  feesToken0: number
  feesToken1: number
}

export interface ExpandedPositionInfo {
  // Sum of all collected fees
  collectedFeesToken0: number
  collectedFeesToken1: number

  dailyFees: FeesChartEntry[]
  snapshots: Snapshot[]
  interactions: Interaction[]
}
