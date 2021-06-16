import { getTotalUserPoolFees } from './total-user-fees';
import { BigNumber } from 'ethers';
import { getPositionFees } from './total-user-fees-reference';
import { getDailyUserPoolFees, TokenFees } from './daily-user-fees';
import { getLatestIndexedBlock } from './utils';

const USER = '0x95ae3008c4ed8c2804051dd00f7a27dad5724ed1';
const POOL = '0x151ccb92bc1ed5c6d0f9adb5cec4763ceb66ac7f';

const POSITION_ID = BigNumber.from(34054);

// acceptable difference between sum of daily fees and reference
// Note: the returned values are in the smallest units (e.g. multiplied
// by 10^18 for WETH) so 1000 is a really small diff
const ACCEPTABLE_DIFF = BigNumber.from('1000');

describe('Test fees', () => {
    test('Total fees computed from subgraph data are equal to the ones from contract call', async () => {
        // this test passes only when the user has only position in a pool with ID 34054
        const totalFeesFromSubgraph = await getTotalUserPoolFees(USER, POOL);
        const totalFeesFromContract = await getPositionFees(
            POSITION_ID,
            USER,
            await getLatestIndexedBlock(),
        );

        expect(totalFeesFromSubgraph).toEqual(totalFeesFromContract);
    });
    test('Sum of daily fees equals total fees from contract call', async () => {
        // this test passes only when the user has only position in a pool with ID 34054
        const totalFeesFromContract = await getPositionFees(
            POSITION_ID,
            USER,
            await getLatestIndexedBlock(),
        );
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
});
