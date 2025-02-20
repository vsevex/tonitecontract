import { Address, Cell } from '@ton/core';

/**
 * Represents a tuple containing information about a pool.
 *
 * @interface PoolTuple
 *
 * @property {bigint} poolId - The unique identifier for the pool.
 * @property {bigint} startTime - The start time of the pool.
 * @property {bigint} endTime - The end time of the pool.
 * @property {bigint} maxParticipants - The maximum number of participants allowed in the pool.
 * @property {bigint} currentParticipantCount - The current number of participants in the pool.
 * @property {bigint} stakeAmount - The amount of stake required to participate in the pool.
 * @property {Cell | null} [participants] - Optional. The participants in the pool, represented as a Cell or null.
 * @property {Cell | null} [rewards] - Optional. The rewards for the pool, represented as a Cell or null.
 */
export class PoolTuple {
    constructor(
        public poolId: bigint,
        public startTime: bigint,
        public endTime: bigint,
        public maxParticipants: bigint,
        public currentParticipantCount: bigint,
        public poolStatus: bigint,
        public stakeAmount: bigint,
        public participants?: Cell | null,
        public results?: Cell | null,
        public rewards?: Cell | null,
    ) {}
}

export class ParticipantTuple {
    constructor(
        public entryWc: bigint,
        public staker: Address,
        public stakeAmount: bigint,
    ) {}
}
export interface PoolTuple {
    poolId: bigint;
    startTime: bigint;
    endTime: bigint;
    maxParticipants: bigint;
    currentParticipantCount: bigint;
    stakeAmount: bigint;
    participants?: Cell | null;
    rewards?: Cell | null;
}

export interface ParticipantTuple {
    entryWc: bigint;
    staker: Address;
    stakeAmount: bigint;
}
