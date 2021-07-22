import { gql } from '@apollo/client/core';
import { client } from '../apollo/client';
import { Position } from '@uniswap/v3-sdk';
import { getPool } from '../sdk-utils';
import { BigNumber } from 'ethers';
import { CurrencyAmount, Token } from '@uniswap/sdk-core';

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

export interface PositionInTest {
    pool: string;
    owner: string;
    liquidity: BigNumber;
    amount0: CurrencyAmount<Token>;
    amount1: CurrencyAmount<Token>;
    tickLower: number;
    tickUpper: number;
    creationTimestamp: number;
    creationBlock: number;
    token0Decimals: number;
    token1Decimals: number;
}

const POSITION_QUERY = gql`
    query positions($id: String) {
        position(id: $id) {
            pool {
                id
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
            owner
            liquidity
            collectedFeesToken0
            collectedFeesToken1
            transaction {
                timestamp
                blockNumber
            }
        }
    }
`;

export async function loadPosition(id: string): Promise<PositionInTest> {
    const result = await client.query({
        query: POSITION_QUERY,
        variables: {
            id,
        },
    });
    const rawPosition = result.data.position;
    const position = new Position({
        pool: getPool(rawPosition.pool),
        tickLower: Number(rawPosition.tickLower.tickIdx),
        tickUpper: Number(rawPosition.tickUpper.tickIdx),
        liquidity: rawPosition.liquidity,
    });

    return {
        pool: rawPosition.pool.id,
        owner: rawPosition.owner,
        liquidity: BigNumber.from(rawPosition.liquidity),
        amount0: position.amount0,
        amount1: position.amount1,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        creationTimestamp: Number(rawPosition.transaction.timestamp),
        creationBlock: Number(rawPosition.transaction.blockNumber),
        token0Decimals: position.pool.token0.decimals,
        token1Decimals: position.pool.token1.decimals,
    };
}
