import {
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
    Slice,
    TupleItemSlice,
} from '@ton/core';
import { parseParticipantsList, parsePoolsList, ParticipantTuple, PoolTuple } from './helpers';
import { KeyPair, sign } from '@ton/crypto';

export type ToniteConfig = {
    seqno?: number;
    ownerKey: KeyPair;
    owner: Slice;
    ecvrf: Slice;
};

let ownerKey: KeyPair;

export function poolConfigToCell(config: ToniteConfig): Cell {
    ownerKey = config.ownerKey;

    return beginCell()
        .storeUint(config.seqno || 12, 32) // seq_no
        .storeUint(0, 1)
        .storeBuffer(config.ownerKey.publicKey, 32)
        .storeDict(Dictionary.empty())
        .storeRef(beginCell().storeSlice(config.owner).storeSlice(config.ecvrf).endCell()) // owner && ecvrf
        .endCell();
}

export class Tonite implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromConfig(config: ToniteConfig, code: Cell, workchain = 0) {
        const data = poolConfigToCell(config);
        const init = { code, data };
        return new Tonite(contractAddress(workchain, init), init);
    }

    // Send a message to create a new pool
    static createPoolMessage(startTime: number, endTime: number, maxParticipants: number, stakeAmount: bigint) {
        return beginCell()
            .storeUint(startTime, 32)
            .storeUint(endTime, 32)
            .storeUint(maxParticipants, 32)
            .storeUint(0, 32)
            .storeUint(0, 1)
            .storeCoins(stakeAmount)
            .storeDict(Dictionary.empty())
            .storeDict(Dictionary.empty())
            .storeDict(Dictionary.empty())
            .storeDict(Dictionary.empty())
            .endCell();
    }

    // Send a message to update the contract code
    static updatePoolMessage(newCode: Cell): Cell {
        return beginCell().storeUint(0x29, 32).storeRef(newCode).endCell();
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void> {
        return provider.internal(via, {
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
        return provider.external(
            beginCell()
                .storeBuffer(
                    sign(
                        beginCell().storeUint(opts.poolId, 32).storeRef(opts.body).endCell().hash(),
                        ownerKey.secretKey,
                    ),
                    64,
                )
                .storeUint(opts.seqno, 32)
                .storeUint(0x1f, 32)
                .storeUint(opts.poolId, 32)
                .storeRef(opts.body)
                .endCell(),
        );
    }

    async sendWithdraw(
        provider: ContractProvider,
        opts: {
            seqno: number;
        },
    ): Promise<void> {
        return provider.external(
            beginCell()
                .storeBuffer(sign(beginCell().endCell().hash(), ownerKey.secretKey), 64)
                .storeUint(opts.seqno, 32)
                .storeUint(0x7, 32)
                .endCell(),
        );
    }

    // Send a transaction to join a pool
    async sendJoinPool(
        provider: ContractProvider,
        via: Sender,
        value: bigint = toNano('1'),
        opts: { poolId: number; queryId?: number | undefined },
    ): Promise<void> {
        return provider.internal(via, {
            value: value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0xb, 32)
                .storeUint(opts.queryId || Date.now(), 64)
                .storeUint(opts.poolId, 32)
                .endCell(),
        });
    }

    async sendInternalMessage(provider: ContractProvider, via: Sender, value: bigint = toNano('1')): Promise<void> {
        return provider.internal(via, { value, body: beginCell().endCell() });
    }

    // Send a transaction to cancel a pool
    async sendCancelPool(provider: ContractProvider, poolId: number, opts: { seqno: number }): Promise<void> {
        return provider.external(
            beginCell()
                .storeBuffer(sign(beginCell().storeUint(poolId, 32).endCell().hash(), ownerKey.secretKey), 64)
                .storeUint(opts.seqno, 32)
                .storeUint(0x20, 32)
                .storeUint(poolId, 32)
                .endCell(),
        );
    }

    // Send a transaction to update the contract code
    async sendUpdatePool(sender: Sender, provider: ContractProvider, newCode: Cell, value: bigint = toNano('0.1')) {
        await provider.internal(sender, { value: value, body: Tonite.updatePoolMessage(newCode) });
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

    async getRewards(provider: ContractProvider, poolId: number, key: number): Promise<Slice> {
        const args = new TupleBuilder();
        args.writeNumber(poolId);
        args.writeNumber(key);
        const result = (await provider.get('get_rewards', args.build())).stack;
        return (result.peek() as TupleItemSlice).cell.asSlice();
    }

    // Gets the list of participants in a pool
    async getPoolParticipants(provider: ContractProvider, poolId: number): Promise<ParticipantTuple[]> {
        const args = new TupleBuilder();
        args.writeNumber(poolId);
        const result = await provider.get('get_participants', args.build());
        return parseParticipantsList(result.stack.readLispList());
    }

    async sendSimple(
        provider: ContractProvider,
        via: Sender,
        opts: { value: bigint; comment?: string },
    ): Promise<void> {
        return provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: opts.comment ? beginCell().storeUint(0, 32).storeStringTail(opts.comment).endCell() : undefined,
        });
    }

    async sendOp(provider: ContractProvider, via: Sender, opts: { value: bigint; op: number }) {
        return provider.internal(via, { value: opts.value, body: beginCell().storeUint(opts.op, 32).endCell() });
    }

    // Sends a random number on chain
    async sendRandomNumber(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        opts: { random: number },
    ): Promise<void> {
        return provider.internal(via, {
            value: value,
            body: beginCell().storeUint(0x069ceca8, 32).storeUint(opts.random, 256).endCell(),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }

    async sendClosePool(provider: ContractProvider, opts: { seqno: number; poolId: number }): Promise<void> {
        return provider.external(
            beginCell()
                .storeBuffer(sign(beginCell().storeUint(opts.poolId, 32).endCell().hash(), ownerKey.secretKey), 64)
                .storeUint(opts.seqno, 32)
                .storeUint(0x65, 32)
                .storeUint(opts.poolId, 32)
                .endCell(),
        );
    }

    async getBalance(provider: ContractProvider): Promise<number> {
        const result = await provider.get('balance', []);
        return result.stack.readNumber();
    }
}
