import { gql } from '@apollo/client/core';
import { client } from '../apollo/client';
import { Position } from '@uniswap/v3-sdk';
import { getPool } from '../sdk-utils';

const TOKEN_PRICES_QUERY = gql`
    query tokenPrices($pool: String, $block: Int) {
        bundle(id: "1", block: { number: $block }) {
            ethPriceUSD
        }
        pool(id: $pool, block: { number: $block }) {
            token0 {
                decimals
                derivedETH
            }
            token1 {
                decimals
                derivedETH
            }
        }
    }
`;

export async function getPoolTokenPrices(pool: string, block: number): Promise<[number, number]> {
    const result = await client.query({
        query: TOKEN_PRICES_QUERY,
        variables: {
            pool,
            block,
        },
    });
    const ethPrice = Number(result.data.bundle.ethPriceUSD);
    const token0Price = ethPrice * Number(result.data.pool.token0.derivedETH);
    const token1Price = ethPrice * Number(result.data.pool.token1.derivedETH);
    return [token0Price, token1Price];
}

const POSITION_QUERY = gql`
    query positions($id: String) {
        position(id: $id) {
            pool {
                token0 {
                    id
                    decimals
                }
                token1 {
                    id
                    decimals
                }
                feeTier
                liquidity
                sqrtPrice
                tick
            }
            tickLower {
                tickIdx
            }
            tickUpper {
                tickIdx
            }
            liquidity
            collectedFeesToken0
            collectedFeesToken1
        }
    }
`;

export async function fetchPosition(id: string): Promise<Position> {
    const result = await client.query({
        query: POSITION_QUERY,
        variables: {
            id,
        },
    });
    return new Position({
        pool: getPool(result.data.position.pool),
        tickLower: Number(result.data.position.tickLower.tickIdx),
        tickUpper: Number(result.data.position.tickUpper.tickIdx),
        liquidity: result.data.position.liquidity,
    });
}
