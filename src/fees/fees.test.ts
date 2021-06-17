import { getTotalOwnerPoolFees } from './total-owner-pool-fees';
import { BigNumber } from 'ethers';
import { getPositionFees } from './total-position-fees-reference';
import { getDailyOwnerPoolFees, TokenFees } from './daily-owner-pool-fees';
import { getLatestIndexedBlock } from './utils';
import dayjs from 'dayjs';
import { estimate24hUsdFees, FEE_ESTIMATE_QUERY, getPosition } from './fee-estimation';
import { formatUnits } from 'ethers/lib/utils';
import { client } from '../apollo/client';
import { fetchPosition, getPoolTokenPrices } from './test-utils';
import { Position } from '@uniswap/v3-sdk';

jest.setTimeout(30000);

const POSITION_OWNER = '0x95ae3008c4ed8c2804051dd00f7a27dad5724ed1';
const POSITION_ID = '34054';
const POSITION_POOL = '0x151ccb92bc1ed5c6d0f9adb5cec4763ceb66ac7f';
const POSITION_CREATION_TIMESTAMP = 1622711721;
const POSITION_CREATION_BLOCK = 12560689;

// acceptable difference between sum of daily fees and reference
// Note: the returned values are in the smallest units (e.g. multiplied
// by 10^18 for WETH) so 1000 is a really small diff
const ACCEPTABLE_DIFF = BigInt('1000');

describe('Test fees and fee estimate', () => {
    // all the tests pass only if the user owns 1 position with ID 34054
    let latestIndexedBlock: number;
    let totalFeesFromContract: TokenFees;
    let position: Position;
    let token0Price: number;
    let token1Price: number;
    let positionLiquidityUsd: number;

    beforeAll(async function () {
        latestIndexedBlock = await getLatestIndexedBlock();
        totalFeesFromContract = await getPositionFees(
            POSITION_ID,
            POSITION_OWNER,
            latestIndexedBlock,
        );
        position = await fetchPosition(POSITION_ID);
        [token0Price, token1Price] = await getPoolTokenPrices(POSITION_POOL, latestIndexedBlock);
        positionLiquidityUsd =
            Number(position.amount0.toSignificant()) * token0Price +
            Number(position.amount1.toSignificant()) * token1Price;
    });

    test('Total fees computed from subgraph data are equal to the ones from contract call', async () => {
        const totalFeesFromSubgraph = await getTotalOwnerPoolFees(POSITION_OWNER, POSITION_POOL);

        expect(totalFeesFromSubgraph).toEqual(totalFeesFromContract);
    });

    test('Sum of daily fees equals total fees from contract call', async () => {
        const poolUserDailyFees = await getDailyOwnerPoolFees(POSITION_OWNER, POSITION_POOL, 365);

        const positionDailyFees = poolUserDailyFees[POSITION_ID.toString()];

        const positionDailyFeesSum: TokenFees = {
            feesToken0: BigNumber.from(0),
            feesToken1: BigNumber.from(0),
        };

        for (let timestampKey in positionDailyFees) {
            const dayFees = positionDailyFees[timestampKey];
            positionDailyFeesSum.feesToken0 = positionDailyFeesSum.feesToken0.add(
                dayFees.feesToken0,
            );
            positionDailyFeesSum.feesToken1 = positionDailyFeesSum.feesToken1.add(
                dayFees.feesToken1,
            );
        }

        // Note: There will always be imprecision in the daily fees because the pool
        // data are saved once a day and not at the time of snapshots
        const token0Diff = positionDailyFeesSum.feesToken0
            .sub(totalFeesFromContract.feesToken0)
            .abs()
            .toBigInt();
        const token1Diff = positionDailyFeesSum.feesToken1
            .sub(totalFeesFromContract.feesToken1)
            .abs()
            .toBigInt();

        expect(token0Diff).toBeLessThan(ACCEPTABLE_DIFF);
        expect(token1Diff).toBeLessThan(ACCEPTABLE_DIFF);
    });

    test('The value of liquidity is equal to reference after conversion from USD to inner contract format', async () => {
        // 1. Fetch all the relevant data
        let result = await client.query({
            query: FEE_ESTIMATE_QUERY,
            variables: {
                pool: POSITION_POOL,
                tickLower: position.tickLower,
                tickUpper: position.tickUpper,
                block: POSITION_CREATION_BLOCK,
            },
        });

        // 2. Parse prices
        const ethPrice = Number(result.data.bundle.ethPriceUSD);
        const token0PriceDerived = ethPrice * Number(result.data.pool.token0.derivedETH);
        const token1PriceDerived = ethPrice * Number(result.data.pool.token1.derivedETH);

        // 3. Instantiate position
        const positionFromUsd = getPosition(
            result,
            position.tickLower,
            position.tickUpper,
            positionLiquidityUsd,
            token0PriceDerived,
            token1PriceDerived,
        );

        // 4. convert liquidity from JSBI format to BigNumber
        // const liquidity = BigNumber.from(positionFromUsd.liquidity.toString());

        expect(positionFromUsd.liquidity.toString()).toEqual(position.liquidity.toString());
    });

    test('24h fee estimate multiplied by the amount of days the position exists is close to the total position fees', async () => {
        const numDays = (dayjs().unix() - POSITION_CREATION_TIMESTAMP) / 86400;

        const feesUsd = await estimate24hUsdFees(
            POSITION_POOL,
            positionLiquidityUsd,
            position.tickLower,
            position.tickUpper,
            numDays,
        );
        const totalFeesUsdEstimate = feesUsd * numDays;

        // Fetch current token prices
        const totalFeesToken0UsdContract =
            Number(formatUnits(totalFeesFromContract.feesToken0, 18)) * token0Price;
        const totalFeesToken1UsdContract =
            Number(formatUnits(totalFeesFromContract.feesToken1, 18)) * token1Price;
        const totalFeesUsdContract = totalFeesToken0UsdContract + totalFeesToken1UsdContract;

        expect(totalFeesUsdEstimate).toEqual(totalFeesUsdContract);
    });
});
