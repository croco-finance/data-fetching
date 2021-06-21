interface DailyFees {
    // key is timestamp of the beginning of the day
    [key: number]: {
        feesToken0: number;
        feesToken1: number;
    };
}

interface Transaction {
    id: string; // tx hash
    blockNumber: number;
    timestamp: number;
    txCostETH: number;
    ethPriceUSD: number | undefined; // price of ETH at the time this transaction happened
}

interface Snapshot {
    id: string; // <NFT token id>#<block number>

    // how many fees did the user collect
    collectedFeesToken0: number;
    collectedFeesToken1: number;

    // how many tokens did the user deposit in a given position
    depositedToken0: number;
    depositedToken1: number;

    // how many tokens did the user withdraw from a given position
    withdrawnToken0: number;
    withdrawnToken1: number;

    // How many tokens did the user have after the change that invoked this snapshot happened
    amountAfterToken0: number;
    amountAfterToken1: number;

    // Transaction related to this snapshot
    transaction: Transaction;
}

interface ExpandedPositionInfo {
    // Sum of all collected fees
    collectedFeesToken0: number;
    collectedFeesToken1: number;

    snapshots: Snapshot[];
    dailyFees: DailyFees | undefined;
}
