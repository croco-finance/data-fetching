// all the amounts are converted to human readable units

import { Token } from '@uniswap/sdk-core';
import { Pool, Position } from '@uniswap/v3-sdk';
import {
    getFeeGrowthInside,
    getTotalPositionFees,
    parseTick,
} from '../fees/total-owner-pool-fees';
import { BigNumber } from 'ethers';
import { formatUnits } from 'ethers/lib/utils';

export class PositionInOverview extends Position {
    readonly tokenId: number; // token ID (e.g. 34054)
    readonly owner: string; // user address
    readonly poolAddress: string; // address of the pool this position belongs to

    readonly token0priceUSD: number;
    readonly token1priceUSD: number;
    readonly liquidityUSD: number;

    // Sum of all uncollected fees
    readonly uncollectedFeesToken0: number;
    readonly uncollectedFeesToken1: number;
    readonly uncollectedFeesUSD: number;

    constructor(positionData: any, ethPrice: number) {
        const poolData = positionData.pool;
        super({
            pool: new Pool(
                new Token(
                    1,
                    poolData.token0.id,
                    parseInt(poolData.token0.decimals),
                    poolData.token0.symbol,
                    poolData.token0.name,
                ),
                new Token(
                    1,
                    poolData.token1.id,
                    parseInt(poolData.token1.decimals),
                    poolData.token1.symbol,
                    poolData.token1.name,
                ),
                parseInt(poolData.feeTier),
                poolData.sqrtPrice,
                poolData.liquidity,
                parseInt(poolData.tick),
            ),
            liquidity: positionData.liquidity,
            tickLower: Number(positionData.tickLower.tickIdx),
            tickUpper: Number(positionData.tickUpper.tickIdx),
        });
        this.tokenId = Number(positionData.id);
        this.owner = positionData.owner;
        this.poolAddress = poolData.id;

        this.token0priceUSD = ethPrice * Number(poolData.token0.derivedETH);
        this.token1priceUSD = ethPrice * Number(poolData.token1.derivedETH);
        this.liquidityUSD =
            Number(this.amount0.toSignificant()) * this.token0priceUSD +
            Number(this.amount1.toSignificant()) * this.token1priceUSD;

        const tickLower = parseTick(positionData.tickLower);
        const tickUpper = parseTick(positionData.tickUpper);

        let [feeGrowthInside0X128, feeGrowthInside1X128] = getFeeGrowthInside(
            tickLower,
            tickUpper,
            this.pool.tickCurrent,
            BigNumber.from(poolData.feeGrowthGlobal0X128),
            BigNumber.from(poolData.feeGrowthGlobal1X128),
        );
        let fees = getTotalPositionFees(
            feeGrowthInside0X128,
            feeGrowthInside1X128,
            BigNumber.from(positionData.feeGrowthInside0LastX128),
            BigNumber.from(positionData.feeGrowthInside1LastX128),
            BigNumber.from(positionData.liquidity),
        );
        this.uncollectedFeesToken0 = Number(formatUnits(fees.amount0, this.pool.token0.decimals));
        this.uncollectedFeesToken1 = Number(formatUnits(fees.amount1, this.pool.token1.decimals));
        this.uncollectedFeesUSD =
            this.uncollectedFeesToken0 * this.token0priceUSD +
            this.uncollectedFeesToken1 * this.token1priceUSD;
    }
}
