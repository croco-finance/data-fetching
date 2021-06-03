import { Pool } from '@uniswap/v3-sdk';
import { Token } from '@uniswap/sdk-core';

export function getPool(rawPool: any): Pool {
    const token0 = new Token(1, rawPool.token0.id, parseInt(rawPool.token0.decimals));
    const token1 = new Token(1, rawPool.token1.id, parseInt(rawPool.token1.decimals));

    // ???
    const sqrtRatioX96 = parseInt(rawPool.sqrtPrice);

    return new Pool(
        token0,
        token1,
        parseInt(rawPool.feeTier),
        sqrtRatioX96,
        parseInt(rawPool.liquidity),
        parseInt(rawPool.tick),
    );
}
