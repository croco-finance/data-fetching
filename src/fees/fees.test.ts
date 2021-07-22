import { getTotalOwnerPoolFees, TokenFees } from './total-owner-pool-fees';
import { BigNumber } from 'ethers';
import { getPositionFees } from './total-position-fees-reference';
import { DailyFees, getDailyPositionFees } from './daily-position-fees';
import { getLatestIndexedBlock } from './utils';
import dayjs from 'dayjs';
import { estimate24hUsdFees, FEE_ESTIMATE_QUERY, getLiquidity } from './fee-estimation';
import { formatUnits } from 'ethers/lib/utils';
import { client } from '../apollo/client';
import { getPoolTokenPrices, loadPosition, PositionInTest } from './test-utils';

jest.setTimeout(30000);

const POSITION_ID = '44459';

describe('Test fees and fee estimate', () => {
    // all the tests pass only if the user owns 1 position with ID 34054
    let latestIndexedBlock: number;
    let totalFeesFromContract: TokenFees;
    let position: PositionInTest;
    let token0Price: number;
    let token1Price: number;
    let positionLiquidityUsd: number;
    let dailyPositionFees: DailyFees;

    beforeAll(async function () {
        latestIndexedBlock = await getLatestIndexedBlock();
        position = await loadPosition(POSITION_ID);
        totalFeesFromContract = await getPositionFees(
            POSITION_ID,
            position.owner,
            latestIndexedBlock,
        );
        [token0Price, token1Price] = await getPoolTokenPrices(position.pool, latestIndexedBlock);
        positionLiquidityUsd =
            Number(position.amount0.toSignificant()) * token0Price +
            Number(position.amount1.toSignificant()) * token1Price;
        dailyPositionFees = await getDailyPositionFees(POSITION_ID, 365);
    });

    test('Total fees computed from subgraph data have less than 0.1% error compared to the ones from contract call', async () => {
        // I am not sure why the error is not always zero. However, since the error is always so small that it doesn't show up in the UI
        // I am not going to spend time on this for now.
        const totalFeesFromSubgraph = await getTotalOwnerPoolFees(position.owner, position.pool);

        const err0 = totalFeesFromSubgraph.amount0
            .sub(totalFeesFromContract.amount0)
            .mul(100)
            .div(totalFeesFromContract.amount0)
            .abs()
            .toNumber();
        const err1 = totalFeesFromSubgraph.amount1
            .sub(totalFeesFromContract.amount1)
            .mul(100)
            .div(totalFeesFromContract.amount1)
            .abs()
            .toNumber();

        expect(err0).toBeLessThan(0.1);
        expect(err1).toBeLessThan(0.1);
    });

    test('Daily fees are non-negative', async () => {
        for (let timestampKey in dailyPositionFees) {
            const dayFees = dailyPositionFees[timestampKey];
            expect(dayFees.amount0.gte('0')).toBeTruthy();
            expect(dayFees.amount1.gte('0')).toBeTruthy();
        }
    });

    test('A sum of daily fees equals total fees from contract call', async () => {
        const positionDailyFeesSum: TokenFees = {
            amount0: BigNumber.from(0),
            amount1: BigNumber.from(0),
        };

        for (let timestampKey in dailyPositionFees) {
            const dayFees = dailyPositionFees[timestampKey];
            positionDailyFeesSum.amount0 = positionDailyFeesSum.amount0.add(dayFees.amount0);
            positionDailyFeesSum.amount1 = positionDailyFeesSum.amount1.add(dayFees.amount1);
        }

        // Note: There will always be imprecision in the daily fees because the pool
        // data are saved once a day and not at the time of snapshots
        const token0err = positionDailyFeesSum.amount0
            .sub(totalFeesFromContract.amount0)
            .mul(100)
            .div(totalFeesFromContract.amount0)
            .abs()
            .toNumber();
        const token1err = positionDailyFeesSum.amount1
            .sub(totalFeesFromContract.amount1)
            .mul(100)
            .div(totalFeesFromContract.amount1)
            .abs()
            .toNumber();

        expect(token0err).toBeLessThan(3);
        expect(token1err).toBeLessThan(3);
    });

    test('The value of liquidity has less then 2% error compared to the reference after a conversion from USD to the inner contract format', async () => {
        const referenceLiquidity = BigNumber.from(position.liquidity.toString());

        // 1. Fetch all the relevant data
        let result = await client.query({
            query: FEE_ESTIMATE_QUERY,
            variables: {
                pool: position.pool,
                tickLower: position.tickLower,
                tickUpper: position.tickUpper,
                block: position.creationBlock,
            },
        });

        // 2. Parse prices
        const ethPrice = Number(result.data.bundle.ethPriceUSD);
        const token0PriceDerived = ethPrice * Number(result.data.pool.token0.derivedETH);
        const token1PriceDerived = ethPrice * Number(result.data.pool.token1.derivedETH);

        // 3. Compute liquidity
        const liquidity = getLiquidity(
            result.data.pool,
            position.tickLower,
            position.tickUpper,
            positionLiquidityUsd,
            token0PriceDerived,
            token1PriceDerived,
        );

        const err = liquidity.sub(referenceLiquidity).mul(100).div(referenceLiquidity).abs();
        expect(err.toNumber()).toBeLessThan(2);
    });

    test('24h fee estimate multiplied by the amount of days the position exists has less then a 5% error compared to the total position fees', async () => {
        const numDays = (dayjs().unix() - position.creationTimestamp) / 86400;

        const feesUsd = await estimate24hUsdFees(
            position.pool,
            positionLiquidityUsd,
            position.tickLower,
            position.tickUpper,
            numDays,
        );
        const totalFeesUsdEstimate = feesUsd * numDays;

        // Fetch current token prices
        const totalFeesToken0UsdContract =
            Number(formatUnits(totalFeesFromContract.amount0, position.token0Decimals)) *
            token0Price;
        const totalFeesToken1UsdContract =
            Number(formatUnits(totalFeesFromContract.amount1, position.token1Decimals)) *
            token1Price;
        const totalFeesUsdContract = totalFeesToken0UsdContract + totalFeesToken1UsdContract;

        const err =
            (Math.abs(totalFeesUsdEstimate - totalFeesUsdContract) / totalFeesUsdContract) * 100;
        expect(err).toBeLessThan(5);
    });
});
