import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import { Tonite } from '../wrappers/Tonite';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { CoordinatorUnit } from '../wrappers/Coordinator';
import { randomTestKey } from '@ton/ton/dist/utils/randomTestKey';

describe('Tonite', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Tonite');
    });

    let blockchain: Blockchain;
    let poolCell: Cell;
    let deployer: SandboxContract<TreasuryContract>;
    let tonite: SandboxContract<Tonite>;
    let owner: SandboxContract<TreasuryContract>;
    const keyReplay = randomTestKey('tonite-test');
    const ownerKeyPair = randomTestKey('tonite-owner');

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = 400;

        deployer = await blockchain.treasury('deployer');
        owner = await blockchain.treasury('owner');
        let ecvrf = blockchain.openContract(
            CoordinatorUnit.createFromOwnerAndKey(deployer.address, 0n, keyReplay.publicKey),
        );
        await ecvrf.sendDeploy(deployer.getSender());
        tonite = blockchain.openContract(
            Tonite.createFromConfig(
                {
                    ownerKeyPair: ownerKeyPair,
                    owner: beginCell().storeAddress(owner.address).asSlice(),
                    ecvrf: beginCell().storeAddress(ecvrf.address).asSlice(),
                },
                code,
                0,
            ),
        );

        poolCell = Tonite.createPoolMessage(380, 410, 100, toNano('1'));

        const topUpBalance = await tonite.sendSimple(deployer.getSender(), {
            value: toNano('101'),
        });

        expect(topUpBalance.transactions).toHaveTransaction({
            from: deployer.address,
            to: tonite.address,
            success: true,
        });
        expect(topUpBalance.transactions.length).toBe(2);

        const deployResult = await tonite.sendDeploy(deployer.getSender(), toNano('0.01'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: tonite.address,
            success: true,
            inMessageBounced: false,
            inMessageBounceable: true,
        });
    });

    it('should return the sequence number', async () => {
        const sequenceNumber = await tonite.getSeqno();
        expect(sequenceNumber).toEqual(12);
    });

    it('should return requested pool details as a tuple', async () => {
        await tonite.sendCreatePool({ seqno: 12, poolId: 121, body: poolCell });
        await tonite.sendCreatePool({ seqno: 13, poolId: 122, body: poolCell });

        // Check that there are two active pools
        const pool = await tonite.getPoolWithId(122);
        expect(pool.poolId).toEqual(BigInt(122));
        expect(pool.startTime).toEqual(BigInt(380));
        expect(pool.endTime).toEqual(BigInt(410));
        expect(pool.maxParticipants).toEqual(BigInt(100));
    });

    it('should join a pool', async () => {
        await tonite.sendCreatePool({ seqno: 12, poolId: 121, body: poolCell });
        await tonite.sendJoinPool(deployer.getSender(), toNano('1'), {
            poolId: 121,
        });
        const pool = await tonite.getPoolWithId(121);
        expect(pool.currentParticipantCount).toEqual(BigInt(1));
    });

    it('should return participant with a correct address', async () => {
        await tonite.sendCreatePool({ seqno: 12, poolId: 121, body: poolCell });
        const staker = await blockchain.treasury('staker', { workchain: 0 });
        const stakerAddress = staker.address;
        await tonite.sendJoinPool(staker.getSender(), toNano('1'), {
            poolId: 121,
        });

        const participant = await tonite.getParticipantWithAddr({ poolId: 121, stakerAddr: stakerAddress });
        expect(participant.staker.toString()).toEqual(stakerAddress.toString());
        expect(participant.stakeAmount).toEqual(toNano('1'));
        expect(participant.entryWc).toEqual(BigInt(0));
    });

    it('must return a message when trying to join a non-existing pool', async () => {
        const queryId = Date.now();
        const result = await tonite.sendJoinPool(deployer.getSender(), toNano('0.01'), {
            poolId: 121,
            queryId: queryId,
        });

        expect(result.transactions).toHaveTransaction({
            from: tonite.address,
            to: deployer.address,
            success: true,
        });

        const outMessage = result.transactions[0].outMessages.get(0);
        const body = outMessage?.body.beginParse();
        expect(outMessage).toBeDefined();
        expect(outMessage?.info.type).toEqual('internal');
        expect(body?.loadUint(32)).toEqual(0xb);
        expect(body?.loadUint(64)).toEqual(queryId);
    });

    it('should throw an exception when trying to create with an existing pool id', async () => {
        const poolId = 121;
        await tonite.sendCreatePool({ seqno: 12, poolId: poolId, body: poolCell });
        const result = await tonite.sendCreatePool({ seqno: 13, poolId: poolId, body: poolCell });
        expect(result.transactions).toHaveTransaction({
            to: tonite.address,
            exitCode: 44,
            success: true,
        });
    });

    it('should return all deposits accordingly', async () => {
        const staker = await blockchain.treasury('staker', { workchain: 0 });
        const staker2 = await blockchain.treasury('staker2', { workchain: 0 });
        const stakerPrebalance = await staker.getBalance();
        const staker2Prebalance = await staker2.getBalance();

        await tonite.sendCreatePool({
            seqno: 12,
            poolId: 121,
            body: Tonite.createPoolMessage(380, 410, 100, toNano('0.01')),
        });
        await tonite.sendJoinPool(staker.getSender(), toNano('0.01'), {
            poolId: 121,
        });

        await tonite.sendJoinPool(staker2.getSender(), toNano('0.01'), {
            poolId: 121,
        });

        const result = await tonite.sendCancelPool({ poolId: 121, seqno: 13 });
        expect(result.transactions).toHaveTransaction({
            to: tonite.address,
            success: true,
        });

        // verify refunds
        expect(stakerPrebalance).toBeGreaterThan(await staker.getBalance());
        expect(staker2Prebalance).toBeGreaterThan(await staker2.getBalance());
    });

    it('should return 47 when user attempts to join a closed pool', async () => {
        const staker = await blockchain.treasury('staker', { workchain: 0 });
        const queryId = Date.now();
        const createResult = await tonite.sendCreatePool({
            seqno: 12,
            poolId: 121,
            body: Tonite.createPoolMessage(380, 390, 100, toNano('1')),
        });

        expect(createResult.transactions).toHaveTransaction({
            to: tonite.address,
            success: true,
        });

        const joinResult = await tonite.sendJoinPool(staker.getSender(), toNano('1'), {
            poolId: 121,
            queryId: queryId,
        });

        const tx = joinResult.transactions[1];
        expect(tx.outMessagesCount).toBe(1);
        const outMessages = tx.outMessages;
        expect(outMessages).toBeDefined();
        const outMessage = outMessages.get(0);
        const body = outMessages.get(0)?.body.beginParse();
        expect(outMessage?.info.dest?.toString()).toEqual(staker.address.toString());
        expect(outMessage?.info.type).toEqual('internal');
        expect(outMessage?.info.src?.toString()).toEqual(tonite.address.toString());

        expect(body?.loadUint(32)).toEqual(0xfffffffe);
        expect(body?.loadUint(64)).toEqual(queryId);
        expect(body?.loadUint(32)).toEqual(0xb);
        expect(body?.loadUint(32)).toEqual(47);
    });

    it('should return 50 when user attempts to join a pool which already joined', async () => {
        const staker = await blockchain.treasury('staker', { workchain: 0 });
        const createResult = await tonite.sendCreatePool({
            seqno: 12,
            poolId: 121,
            body: Tonite.createPoolMessage(380, 410, 100, toNano('1')),
        });

        expect(createResult.transactions).toHaveTransaction({
            to: tonite.address,
            success: true,
        });

        const joinResult = await tonite.sendJoinPool(staker.getSender(), toNano('0.6'), {
            poolId: 121,
        });

        const tx = joinResult.transactions[1];
        expect(tx.outMessagesCount).toBe(1);
        const outMessages = tx.outMessages;
        expect(outMessages).toBeDefined();
        const outMessage = outMessages.get(0);
        const body = outMessages.get(0)?.body.beginParse();
        expect(outMessage?.info.dest?.toString()).toEqual(staker.address.toString());
        expect(outMessage?.info.type).toEqual('internal');
        expect(outMessage?.info.src?.toString()).toEqual(tonite.address.toString());
        expect(body?.loadUint(32)).toEqual(0xfffffffe);
        expect(body?.skip(64).loadUint(32)).toEqual(0xb);
        expect(body?.loadUint(32)).toEqual(50);
    });

    it('should return 52 when user attempts to join a pool with a different stake amount', async () => {
        const staker = await blockchain.treasury('staker', { workchain: 0 });
        const createResult = await tonite.sendCreatePool({
            seqno: 12,
            poolId: 121,
            body: Tonite.createPoolMessage(380, 410, 100, toNano('1')),
        });

        expect(createResult.transactions).toHaveTransaction({
            to: tonite.address,
            success: true,
        });

        await tonite.sendJoinPool(staker.getSender(), toNano('1'), {
            poolId: 121,
        });
        const joinResult = await tonite.sendJoinPool(staker.getSender(), toNano('1'), {
            poolId: 121,
        });

        const tx = joinResult.transactions[1];
        expect(tx.outMessagesCount).toBe(1);
        const outMessages = tx.outMessages;
        expect(outMessages).toBeDefined();
        const outMessage = outMessages.get(0);
        const body = outMessages.get(0)?.body.beginParse();
        expect(outMessage?.info.dest?.toString()).toEqual(staker.address.toString());
        expect(outMessage?.info.type).toEqual('internal');
        expect(outMessage?.info.src?.toString()).toEqual(tonite.address.toString());
        expect(body?.loadUint(32)).toEqual(0xfffffffe);
        expect(body?.skip(64).loadUint(32)).toEqual(0xb);
        expect(body?.loadUint(32)).toEqual(52);
    });

    it('should add reward to the cell properly', async () => {
        const poolId = 121;
        await tonite.sendCreatePool({
            seqno: 12,
            poolId: poolId,
            body: Tonite.createPoolMessage(380, 410, 100, toNano('1')),
        });

        for (let i = 10; i <= 50; i++) {
            const staker = await blockchain.treasury(`staker_${i}`, { workchain: 0 });
            await tonite.sendJoinPool(staker.getSender(), toNano('1'), { poolId: poolId });
        }
        const rewardFirst = await tonite.getRewardWithKey({ poolId: poolId, key: 1 });
        const rewardSecond = await tonite.getRewardWithKey({ poolId: poolId, key: 2 });
        const rewardForth = await tonite.getRewardWithKey({ poolId: poolId, key: 4 });

        expect(rewardFirst.loadCoins()).toEqual(BigInt(4407692307));
        expect(rewardSecond.loadCoins()).toEqual(BigInt(4165384615));
        expect(rewardForth.loadCoins()).toEqual(BigInt(3680769231));
    });

    it('should return 47 when trying to close already closed pool', async () => {
        const mockEcvrf = await blockchain.treasury('mockEcvrf', { workchain: 0 });
        const staker = await blockchain.treasury('staker', { workchain: 0 });
        tonite = blockchain.openContract(
            Tonite.createFromConfig(
                {
                    ownerKeyPair: ownerKeyPair,
                    owner: beginCell().storeAddress(deployer.address).asSlice(),
                    ecvrf: beginCell().storeAddress(mockEcvrf.address).asSlice(),
                },
                code,
                0,
            ),
        );

        tonite.sendDeploy(deployer.getSender(), 0n);
        await tonite.sendSimple(deployer.getSender(), { value: toNano('1') });
        await tonite.sendCreatePool({ seqno: 12, poolId: 121, body: poolCell });
        await tonite.sendJoinPool(staker.getSender(), toNano('1'), { poolId: 121 });
        await tonite.sendClosePool({ seqno: 13, poolId: 121 });
        let result = await tonite.sendClosePool({ seqno: 14, poolId: 121 });
        expect(result.transactions).toHaveTransaction({
            to: tonite.address,
            exitCode: 40,
            success: true,
        });
        await tonite.sendRandomNumber(mockEcvrf.getSender(), toNano('1'), { random: 100 });

        result = await tonite.sendClosePool({ poolId: 121, seqno: 14 });
        expect(result.transactions).toHaveTransaction({
            to: tonite.address,
            exitCode: 47,
            success: true,
        });
    });

    it('should return 40 when trying to close a pool without waiting for random_unlock', async () => {
        await tonite.sendCreatePool({ seqno: 12, poolId: 121, body: poolCell });
        await tonite.sendCreatePool({ seqno: 13, poolId: 122, body: poolCell });
        await tonite.sendClosePool({ poolId: 121, seqno: 14 });
        const result = await tonite.sendClosePool({ poolId: 122, seqno: 15 });

        expect(result.transactions).toHaveTransaction({
            to: tonite.address,
            exitCode: 40,
            success: true,
        });
    });

    it('should properly close the pool and send participant rewards', async () => {
        const mockEcvrf = await blockchain.treasury('mockEcvrf', { workchain: 0 });
        tonite = blockchain.openContract(
            Tonite.createFromConfig(
                {
                    ownerKeyPair: ownerKeyPair,
                    owner: beginCell().storeAddress(deployer.address).asSlice(),
                    ecvrf: beginCell().storeAddress(mockEcvrf.address).asSlice(),
                },
                code,
                0,
            ),
        );
        tonite.sendDeploy(deployer.getSender(), 0n);
        await tonite.sendSimple(deployer.getSender(), { value: toNano('1') });

        await tonite.sendCreatePool({ seqno: 12, poolId: 121, body: poolCell });

        const amounts: bigint[] = [];
        const stakers: SandboxContract<TreasuryContract>[] = [];

        for (let i = 1; i < 11; i++) {
            const staker = await blockchain.treasury(`staker_${i}`, { workchain: 0 });
            amounts.push(await staker.getBalance());
            stakers.push(staker);
            await tonite.sendJoinPool(staker.getSender(), toNano('1'), { poolId: 121 });
        }

        await tonite.sendCreatePool({ seqno: 13, poolId: 122, body: poolCell });
        await tonite.sendClosePool({ seqno: 14, poolId: 121 });
        const balance = await tonite.getBalance();
        expect(balance).toBeGreaterThanOrEqual(toNano('10'));
        await tonite.sendRandomNumber(mockEcvrf.getSender(), toNano('1'), {
            random: 382459572339,
        });
    });

    it('should withdraw contract balance to the owner address', async () => {
        const mockEcvrf = await blockchain.treasury('mockEcvrf', { workchain: 0 });
        tonite = blockchain.openContract(
            Tonite.createFromConfig(
                {
                    ownerKeyPair: ownerKeyPair,
                    owner: beginCell().storeAddress(owner.address).asSlice(),
                    ecvrf: beginCell().storeAddress(mockEcvrf.address).asSlice(),
                },
                code,
                0,
            ),
        );

        tonite.sendDeploy(deployer.getSender(), 0n);
        await tonite.sendSimple(deployer.getSender(), { value: toNano('1') });
        await tonite.sendCreatePool({ seqno: 12, poolId: 121, body: poolCell });
        for (let i = 1; i < 11; i++) {
            const staker = await blockchain.treasury(`staker_${i}`, { workchain: 0 });
            await tonite.sendJoinPool(staker.getSender(), toNano('1'), { poolId: 121 });
        }
        await tonite.sendClosePool({ seqno: 13, poolId: 121 });
        await tonite.sendRandomNumber(mockEcvrf.getSender(), toNano('1'), {
            random: 382459572339,
        });

        const preBalance = await owner.getBalance();
        await tonite.sendWithdraw({ seqno: 14 });
        const postBalance = await owner.getBalance();
        expect(postBalance).toBeGreaterThan(preBalance);
        expect(postBalance - preBalance).toBeGreaterThanOrEqual(toNano('1'));
    });

    it('should update contract code accordingly', async () => {
        const newCode = await compile('Tonite');
        await tonite.sendUpdateCode({ seqno: 12, newCode: newCode });

        const result = await tonite.sendCreatePool({ seqno: 13, poolId: 121, body: poolCell });
    });
});
