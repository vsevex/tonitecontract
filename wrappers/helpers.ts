import { Address, Cell, Tuple, TupleItem, TupleItemCell, TupleItemInt } from '@ton/core';

// Helper function to parse the list of pools
export function parsePoolsList(tuples: TupleItem[]): PoolTuple[] {
    const pools: PoolTuple[] = [];

    if (tuples.length === 0) return [];
    for (let i = 0; i < tuples.length; i++) {
        const tuple = tuples[i] as Tuple;
        const items = tuple.items;

        const poolId = (items[0] as TupleItemInt).value;
        const startTime = (items[1] as TupleItemInt).value;
        const endTime = (items[2] as TupleItemInt).value;
        const maxParticipants = (items[3] as TupleItemInt).value;
        const currentParticipantCount = (items[4] as TupleItemInt).value;
        const poolStatus = (items[5] as TupleItemInt).value;
        const stakeAmount = (items[6] as TupleItemInt).value;
        const participants = (items[7] as TupleItemCell).cell;
        const results = (items[8] as TupleItemCell).cell;
        const rewards = (items[9] as TupleItemCell).cell;
        const state = (items[10] as TupleItemCell).cell;

        pools.push({
            poolId,
            startTime,
            endTime,
            maxParticipants,
            currentParticipantCount,
            poolStatus,
            stakeAmount,
            participants,
            results,
            rewards,
            state,
        });
    }

    return pools;
}

// Helper function to parse the list of participants
export function parseParticipantsList(tuples: TupleItem[]): ParticipantTuple[] {
    const participants: ParticipantTuple[] = [];
    if (tuples.length === 0) return [];

    for (let i = 0; i < tuples.length; i++) {
        const tuple = tuples[i] as Tuple;
        const items = tuple.items;

        const entryWc = (items[0] as TupleItemInt).value;
        const staker = (items[1] as TupleItemCell).cell.beginParse().loadAddress();
        const stakeAmount = (items[2] as TupleItemInt).value;

        participants.push({
            entryWc,
            staker,
            stakeAmount,
        });
    }

    return participants;
}

// Type definitions
export interface PoolTuple {
    poolId: bigint;
    startTime: bigint;
    endTime: bigint;
    maxParticipants: bigint;
    currentParticipantCount: bigint;
    poolStatus: bigint;
    stakeAmount: bigint;
    participants: Cell;
    results: Cell;
    rewards: Cell;
    state: Cell;
}

export interface ParticipantTuple {
    entryWc: bigint;
    staker: Address;
    stakeAmount: bigint;
}
