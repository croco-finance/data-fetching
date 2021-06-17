import { getTotalUserPoolFees } from './total-user-fees';
import { BigNumber } from 'ethers';
import { getPositionFees } from './total-user-fees-reference';
import { getDailyUserPoolFees, TokenFees } from './daily-user-fees';
import { getLatestIndexedBlock, getPoolTokenPrices } from './utils';
import dayjs from 'dayjs';
import { estimate24hUsdFees, FEE_ESTIMATE_QUERY, getPosition } from './fee-estimation';
import { formatUnits } from 'ethers/lib/utils';
import { client } from '../apollo/client';

jest.setTimeout(30000);

const USER = '0x95ae3008c4ed8c2804051dd00f7a27dad5724ed1';
const POOL = '0x151ccb92bc1ed5c6d0f9adb5cec4763ceb66ac7f';

const POSITION_ID = BigNumber.from(34054);
const POSITION_CREATION_TIMESTAMP = 1622711721;
const POSITION_LIQUIDITY = BigNumber.from('180196358198030075483');
const POSITION_LIQUIDITY_USD = 19874.83769869;
const POSITION_TICK_LOWER = -31980;
const POSITION_TICK_UPPER = -28320;

// acceptable difference between sum of daily fees and reference
// Note: the returned values are in the smallest units (e.g. multiplied
// by 10^18 for WETH) so 1000 is a really small diff
const ACCEPTABLE_DIFF = BigNumber.from('1000');

describe('Test fees and fee estimate', () => {
    // all the tests pass only if the user owns 1 position with ID 34054
    let totalFeesFromContract: TokenFees;
    let latestIndexedBlock: number;

    beforeAll(async function () {
        latestIndexedBlock = await getLatestIndexedBlock();
        totalFeesFromContract = await getPositionFees(POSITION_ID, USER, latestIndexedBlock);
    });

    test('Total fees computed from subgraph data are equal to the ones from contract call', async () => {
        const totalFeesFromSubgraph = await getTotalUserPoolFees(USER, POOL);

        expect(totalFeesFromSubgraph).toEqual(totalFeesFromContract);
    });

    test('Sum of daily fees equals total fees from contract call', async () => {
        const poolUserDailyFees = await getDailyUserPoolFees(USER, POOL, 365);

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
            .abs();
        const token1Diff = positionDailyFeesSum.feesToken1
            .sub(totalFeesFromContract.feesToken1)
            .abs();

        expect(token0Diff.lte(ACCEPTABLE_DIFF)).toBeTruthy();
        expect(token1Diff.lte(ACCEPTABLE_DIFF)).toBeTruthy();
    });

    test('The value of liquidity is equal to reference after conversion from USD to inner contract format', async () => {
        // 1. Fetch all the relevant data
        let result = await client.query({
            query: FEE_ESTIMATE_QUERY,
            variables: {
                pool: POOL,
                tickLower: POSITION_TICK_LOWER,
                tickUpper: POSITION_TICK_UPPER,
                block: 12560689,
            },
        });

        // 2. Parse prices
        const ethPrice = Number(result.data.bundle.ethPriceUSD);
        const token0Price = ethPrice * Number(result.data.pool.token0.derivedETH);
        const token1Price = ethPrice * Number(result.data.pool.token1.derivedETH);

        // 3. Instantiate position
        const position = getPosition(
            result,
            POSITION_TICK_LOWER,
            POSITION_TICK_UPPER,
            POSITION_LIQUIDITY_USD,
            token0Price,
            token1Price,
        );

        // 4. convert liquidity from JSBI format to BigNumber
        const liquidity = BigNumber.from(position.liquidity.toString());

        expect(liquidity).toEqual(POSITION_LIQUIDITY);
    });

    test('24h fee estimate multiplied by the amount of days the position exists is close to the total position fees', async () => {
        const numDays = (dayjs().unix() - POSITION_CREATION_TIMESTAMP) / 86400;

        const feesUsd = await estimate24hUsdFees(
            POOL,
            POSITION_LIQUIDITY_USD,
            POSITION_TICK_LOWER,
            POSITION_TICK_UPPER,
            numDays,
        );
        const totalFeesUsdEstimate = feesUsd * numDays;

        // Fetch current token prices
        let [token0Price, token1Price] = await getPoolTokenPrices(POOL, latestIndexedBlock);
        const totalFeesToken0UsdContract =
            Number(formatUnits(totalFeesFromContract.feesToken0, 18)) * token0Price;
        const totalFeesToken1UsdContract =
            Number(formatUnits(totalFeesFromContract.feesToken1, 18)) * token1Price;
        const totalFeesUsdContract = totalFeesToken0UsdContract + totalFeesToken1UsdContract;

        expect(totalFeesUsdEstimate).toEqual(totalFeesUsdContract);
    });
});
