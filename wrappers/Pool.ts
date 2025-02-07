import {
    Message,
    beginCell,
    Address,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    toNano,
    TupleBuilder,
    Dictionary,
} from '@ton/core';
import { KeyPair } from '@ton/crypto';
import { parseParticipantsList, parsePoolsList, ParticipantTuple, PoolTuple } from './helpers';

export type PoolConfig = {
    ownerKeyPair: KeyPair;
};

export function poolConfigToCell(config: PoolConfig): Cell {
    return beginCell()
        .storeUint(10, 32) // seq_no
        .storeBuffer(config.ownerKeyPair.publicKey, 32) // owner_pub_key
        .storeDict(Dictionary.empty())
        .endCell();
}

export class Pool implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new Pool(address);
    }

    static createFromConfig(config: PoolConfig, code: Cell, workchain = 0) {
        const data = poolConfigToCell(config);
        const init = { code, data };
        return new Pool(contractAddress(workchain, init), init);
    }

    // Send a message to create a new pool
    static createPoolMessage(startTime: number, endTime: number, maxParticipants: number, stakeAmount: bigint) {
        return beginCell()
            .storeUint(startTime, 32)
            .storeUint(endTime, 32)
            .storeUint(maxParticipants, 32)
            .storeUint(0, 32)
            .storeCoins(stakeAmount)
            .storeDict(Dictionary.empty())
            .storeDict(Dictionary.empty())
            .storeDict(Dictionary.empty())
            .storeDict(Dictionary.empty())
            .endCell();
    }

    static joinPoolMessage(poolId: number, stakerPubKey: Buffer): Cell {
        return beginCell()
            .storeUint(0xb, 32) // OP_JOIN_POOL
            .storeUint(Date.now(), 64) // query_id
            .storeUint(poolId, 32)
            .storeBuffer(stakerPubKey, 32)
            .endCell();
    }

    // Send a message to cancel a pool
    static cancelPoolMessage(poolId: number, seqno: number): Cell {
        return beginCell().storeUint(seqno, 32).storeUint(0x20, 32).storeUint(poolId, 32).endCell();
    }

    // Send a message to update the contract code
    static updatePoolMessage(newCode: Cell): Cell {
        return beginCell().storeUint(0x29, 32).storeRef(newCode).endCell();
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void> {
        return await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    // Send a transaction to create a pool
    async sendCreatePool(
        provider: ContractProvider,
        opts: {
            seqno: number;
            poolId: number;
            body: Cell;
        },
    ): Promise<void> {
        return await provider.external(
            beginCell()
                // .storeBuffer(await sha256(opts.body.hash()))
                .storeUint(opts.seqno, 32)
                .storeUint(0x1f, 32)
                .storeUint(opts.poolId, 32)
                .storeRef(opts.body)
                .endCell(),
        );
    }

    // Send a transaction to join a pool
    async sendJoinPool(
        provider: ContractProvider,
        via: Sender,
        value: bigint = toNano('1'),
        opts: { stakerPubKey: KeyPair; poolId: number; queryId?: number | undefined },
    ): Promise<void> {
        return await provider.internal(via, {
            value: value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0xb, 32)
                .storeUint(opts.queryId || Date.now(), 64)
                .storeUint(opts.poolId, 32)
                .storeBuffer(opts.stakerPubKey.publicKey, 32)
                .endCell(),
        });
    }

    async sendInternalMessage(provider: ContractProvider, via: Sender, value: bigint = toNano('1')): Promise<void> {
        return await provider.internal(via, { value, body: beginCell().endCell() });
    }

    // Send a transaction to cancel a pool
    async sendCancelPool(provider: ContractProvider, poolId: number, opts: { seqno: number }): Promise<void> {
        return await provider.external(Pool.cancelPoolMessage(poolId, opts.seqno));
    }

    // Send a transaction to update the contract code
    async sendUpdatePool(sender: Sender, provider: ContractProvider, newCode: Cell, value: bigint = toNano('0.1')) {
        await provider.internal(sender, { value: value, body: Pool.updatePoolMessage(newCode) });
    }

    // Gets the owner's public key
    async getOwnerPubkey(provider: ContractProvider): Promise<string> {
        const result = (await provider.get('get_owner_pubkey', [])).stack;
        return result.readBigNumber().toString(16);
    }

    // Gets the list of active pools
    async getActivePools(provider: ContractProvider): Promise<PoolTuple[]> {
        const result = (await provider.get('get_pools', [])).stack;
        return parsePoolsList(result.readLispList());
    }

    async getSeqNo(provider: ContractProvider): Promise<number> {
        const result = (await provider.get('get_seqno', [])).stack;
        return result.readNumber();
    }

    // Gets the list of participants in a pool
    async getPoolParticipants(provider: ContractProvider, poolId: number): Promise<ParticipantTuple[]> {
        const args = new TupleBuilder();
        args.writeNumber(poolId);
        const result = await provider.get('get_participants', args.build());
        return parseParticipantsList(result.stack.readLispList());
    }

    async sendSimple(provider: ContractProvider, via: Sender, opts: { value: bigint; comment?: string }) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: opts.comment ? beginCell().storeUint(0, 32).storeStringTail(opts.comment).endCell() : undefined,
        });
    }

    async sendOp(provider: ContractProvider, via: Sender, otps: { value: bigint; op: number }) {
        return await provider.internal(via, { value: otps.value, body: beginCell().storeUint(otps.op, 32).endCell() });
    }
}
