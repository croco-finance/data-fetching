import { DailyFees } from '../fees/daily-position-fees';
import { CurrencyAmount, Token } from '@uniswap/sdk-core';

export interface Transaction {
    id: string; // tx hash
    timestamp: number;
    txCostETH: number;
    ethPriceUSD: number; // price of ETH at the time this transaction happened
}

export interface Snapshot {
    // how many tokens did the user deposit in a given position
    depositedToken0: number;
    depositedToken1: number;

    // how many tokens did the user withdraw from a given position
    withdrawnToken0: number;
    withdrawnToken1: number;

    // how many fees did the user collect
    collectedFeesToken0: number;
    collectedFeesToken1: number;

    // How many tokens did the user have after the change that invoked this snapshot happened
    amountToken0: CurrencyAmount<Token>;
    amountToken1: CurrencyAmount<Token>;

    // Transaction related to this snapshot
    transaction: Transaction;
}

export interface ExpandedPositionInfo {
    // Sum of all collected fees
    collectedFeesToken0: number;
    collectedFeesToken1: number;

    dailyFees: DailyFees;
    snapshots: Snapshot[];
}
