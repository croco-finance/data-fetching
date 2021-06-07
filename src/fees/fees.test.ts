import { getTotalUserPoolFees } from './total-user-fees';
import { BigNumber } from 'ethers';
import { getPositionFees } from './user-fees-reference';

const USER = '0x95ae3008c4ed8c2804051dd00f7a27dad5724ed1';
const POOL = '0x151ccb92bc1ed5c6d0f9adb5cec4763ceb66ac7f';

const POSITION_ID = BigNumber.from(34054);

describe('Test fees', () => {
    test('Total fees computed from subgraph data are equal to the ones from contract call', async () => {
        // this test passes only when the user has only position in a pool with ID 34054
        const totalFeesFromSubgraph = await getTotalUserPoolFees(USER, POOL);
        const totalFeesFromContract = await getPositionFees(POSITION_ID, USER);

        expect(totalFeesFromSubgraph).toEqual(totalFeesFromContract);
    });
});
