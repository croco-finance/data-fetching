// all the amounts are converted to human readable units

interface Token {
    symbol: string;
    address: string;
    derivedETH: number; // current price denominated in ETH
}

interface Position {
    tokenId: number; // token ID (e.g. 34054)
    owner: string; // user address
    pool: string; // address of the pool this position belongs to
    feeTier: number; // fee tier of the pool this positions belongs to

    // ticks
    tickLower: number;
    tickUpper: number;
    tickCurrent: number;

    // prices
    priceLower: number; // price of: token0 / token1
    priceUpper: number; // price of:  token0 / token1
    priceCurrent: number; // price of:  token0 / token1

    // tokens
    token0: Token;
    token1: Token;

    // Current liquidity in token amounts
    liquidityToken0: number;
    liquidityToken1: number;
    liquidityUSD: number;

    // Sum of all uncollected fees
    uncollectedFeesToken0: number;
    uncollectedFeesToken1: number;
    uncollectedFeesUSD: number;
}

export interface Positions {
    // key is pool address
    [key: string]: Position[];
}
