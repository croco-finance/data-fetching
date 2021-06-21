// all the amounts are converted to human readable units

import { Token } from '@uniswap/sdk-core';
import { Pool, Position } from '@uniswap/v3-sdk';
import { getFeeGrowthInside, getTotalPositionFees, parseTick } from '../fees/total-owner-pool-fees';
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
    readonly unclaimedFeesToken0: number;
    readonly unclaimedFeesToken1: number;
    readonly unclaimedFeesUSD: number;

    constructor(positionData: any, ethPrice: number) {
        const poolData = positionData.pool;
        super({
            pool: new Pool(
                new Token(1, poolData.token0.id, parseInt(poolData.token0.decimals)),
                new Token(1, poolData.token1.id, parseInt(poolData.token1.decimals)),
                parseInt(poolData.feeTier),
                parseInt(poolData.sqrtPrice),
                parseInt(poolData.liquidity),
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
        this.unclaimedFeesToken0 = Number(formatUnits(fees.amount0, this.pool.token0.decimals));
        this.unclaimedFeesToken1 = Number(formatUnits(fees.amount1, this.pool.token1.decimals));
        this.unclaimedFeesUSD =
            this.unclaimedFeesToken0 * this.token0priceUSD +
            this.unclaimedFeesToken1 * this.token1priceUSD;
    }
}
