import { gql } from '@apollo/client/core';
import { client } from '../apollo/client';

const BLOCK_QUERY = gql`
    query block {
        _meta {
            block {
                number
            }
        }
    }
`;

export async function getLatestBlock(): Promise<number> {
    const result = await client.query({
        query: BLOCK_QUERY,
    });

    return Number(result.data._meta.block.number);
}
