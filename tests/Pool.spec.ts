import { Cell, toNano } from '@ton/core';
import { KeyPair, keyPairFromSeed } from '@ton/crypto';
import '@ton/test-utils';
import { base64Decode } from '@ton/sandbox/dist/utils/base64';
import { compile } from '@ton/blueprint';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Pool } from '../wrappers/Pool';

describe('Pool test suite', () => {
    let code: Cell;
    let poolCell: Cell;
    let pool: SandboxContract<Pool>;
    let blockchain: Blockchain;
    let ownerKeyPair: KeyPair;
    let owner: SandboxContract<TreasuryContract>;
    let staker: SandboxContract<TreasuryContract>;
    let staker2: SandboxContract<TreasuryContract>;
    let stakerPubKey: KeyPair;
    let staker2PubKey: KeyPair;
    let deployer: SandboxContract<TreasuryContract>;

    beforeAll(async () => {
        code = await compile('Pool');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = 400;

        owner = await blockchain.treasury('owner', { workchain: 0 });
        staker = await blockchain.treasury('staker', { workchain: 0 });
        staker2 = await blockchain.treasury('staker2', { workchain: 0 });

        ownerKeyPair = keyPairFromSeed(Buffer.from(base64Decode('vt58J2v6FaBuXFGcyGtqT5elpVxcZ+I1zgu/GUfA5uY=')));
        stakerPubKey = keyPairFromSeed(Buffer.from(base64Decode('vt59J2v6FaBuXFGcyGtqT5elpVxcZ+I1zgu/GUfA5uY=')));
        staker2PubKey = keyPairFromSeed(Buffer.from(base64Decode('vt59J2v6FaBuXFGcyGtqT5elpVxcZ+I2zgu/GUfA5uY=')));
        pool = blockchain.openContract(Pool.createFromConfig({ ownerKeyPair: ownerKeyPair }, code, 0));

        deployer = await blockchain.treasury('deployer', { workchain: 0 });
        const deployResult = await pool.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: pool.address,
            deploy: true,
            success: true,
            inMessageBounced: false,
            inMessageBounceable: true,
        });

        poolCell = Pool.createPoolMessage(380, 410, 100, toNano('1'));

        const topUpBalance = await pool.sendSimple(owner.getSender(), {
            value: toNano('123450'),
        });

        expect(topUpBalance.transactions).toHaveTransaction({
            from: owner.address,
            to: pool.address,
            success: true,
        });
        expect(topUpBalance.transactions.length).toBe(2);
    });

    it("should return the owner's public key", async () => {
        const ownerPubKeyHex = await pool.getOwnerPubkey();
        expect(ownerPubKeyHex).toBe(ownerKeyPair.publicKey.toString('hex', 0, 4));
    });

    it('should return the sequence number', async () => {
        const sequenceNumber = await pool.getSeqNo();
        expect(sequenceNumber).toEqual(10);
    });

    it('should send op', async () => {
        const result = await pool.sendOp(owner.getSender(), { value: toNano('1'), op: 11 });
        expect(result.transactions).toHaveTransaction({
            from: owner.address,
            to: pool.address,
            success: true,
        });
    });

    it('should return the list of active pools', async () => {
        await pool.sendCreatePool({ seqno: 10, poolId: 121, body: poolCell });
        var activePools = await pool.getActivePools();
        expect(activePools.length).toEqual(1);

        // Create another pool
        await pool.sendCreatePool({ seqno: 11, poolId: 122, body: poolCell });

        // Check that there are two active pools
        activePools = await pool.getActivePools();
        expect(activePools.length).toEqual(2);
        const firstPool = activePools[0];
        expect(firstPool.poolId).toEqual(BigInt(121));
        expect(firstPool.startTime).toEqual(BigInt(380));
        expect(firstPool.endTime).toEqual(BigInt(410));
        expect(firstPool.maxParticipants).toEqual(BigInt(100));
    });

    it('should join a pool', async () => {
        await pool.sendCreatePool({ seqno: 10, poolId: 121, body: poolCell });
        await pool.sendJoinPool(owner.getSender(), toNano('1'), {
            poolId: 121,
            stakerPubKey: stakerPubKey,
        });
        const activePools = await pool.getActivePools();
        const firstPool = activePools[0];
        expect(firstPool.currentParticipantCount).toEqual(BigInt(1));
    });

    it('should cancel an existing pool', async () => {
        await pool.sendCreatePool({ seqno: 10, poolId: 121, body: poolCell });
        var activePools = await pool.getActivePools();
        expect(activePools.length).toEqual(1);

        await pool.sendCancelPool(121, { seqno: 11 });
        activePools = await pool.getActivePools();
        expect(activePools.length).toEqual(0);
    });

    it('should return participants of a pool', async () => {
        await pool.sendCreatePool({ seqno: 10, poolId: 121, body: poolCell });
        await pool.sendJoinPool(owner.getSender(), toNano('1'), {
            poolId: 121,
            stakerPubKey: stakerPubKey,
        });

        const participants = await pool.getPoolParticipants(121);
        expect(participants.length).toEqual(1);
        const firstPartipant = participants[0];
        expect(firstPartipant.stakeAmount).toEqual(toNano('1'));
        expect(firstPartipant.entryWc).toEqual(BigInt(0));
    });

    it('must return a messagewhen trying to join a non-existing pool', async () => {
        const queryId = Date.now();
        const result = await pool.sendJoinPool(deployer.getSender(), toNano('0.01'), {
            stakerPubKey: stakerPubKey,
            poolId: 121,
            queryId: queryId,
        });

        expect(result.transactions).toHaveTransaction({
            from: pool.address,
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
        await pool.sendCreatePool({ seqno: 10, poolId: poolId, body: poolCell });
        const result = await pool.sendCreatePool({ seqno: 11, poolId: poolId, body: poolCell });
        expect(result.transactions).toHaveTransaction({
            to: pool.address,
            exitCode: 44,
            success: true,
        });
    });

    it('should return all deposits accordingly', async () => {
        const user1PreBalance = await staker.getBalance();
        const user2PreBalance = await staker2.getBalance();
        await pool.sendCreatePool({
            seqno: 10,
            poolId: 121,
            body: Pool.createPoolMessage(380, 410, 100, toNano('0.01')),
        });
        await pool.sendJoinPool(staker.getSender(), toNano('0.01'), {
            poolId: 121,
            stakerPubKey: stakerPubKey,
        });

        await pool.sendJoinPool(staker2.getSender(), toNano('0.01'), {
            poolId: 121,
            stakerPubKey: staker2PubKey,
        });
        const participantCount = await pool.getPoolParticipants(121);
        expect(participantCount.length).toEqual(2);

        const result = await pool.sendCancelPool(121, { seqno: 11 });
        expect(result.transactions).toHaveTransaction({
            to: pool.address,
            success: true,
        });

        // verify refunds
        expect(user1PreBalance).toBeGreaterThan(await staker.getBalance());
        expect(user2PreBalance).toBeGreaterThan(await staker2.getBalance());
    });

    it('should return 47 when user attempts to join a closed pool', async () => {
        const queryId = Date.now();
        const createResult = await pool.sendCreatePool({
            seqno: 10,
            poolId: 121,
            body: Pool.createPoolMessage(380, 390, 100, toNano('1')),
        });

        expect(createResult.transactions).toHaveTransaction({
            to: pool.address,
            success: true,
        });

        const joinResult = await pool.sendJoinPool(staker.getSender(), toNano('1'), {
            poolId: 121,
            stakerPubKey: stakerPubKey,
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
        expect(outMessage?.info.src?.toString()).toEqual(pool.address.toString());

        expect(body?.loadUint(32)).toEqual(0xfffffffe);
        expect(body?.loadUint(64)).toEqual(queryId);
        expect(body?.loadUint(32)).toEqual(0xb);
        expect(body?.loadUint(32)).toEqual(47);
    });

    it('should return 50 when user attempts to join a pool which already joined', async () => {
        const createResult = await pool.sendCreatePool({
            seqno: 10,
            poolId: 121,
            body: Pool.createPoolMessage(380, 410, 100, toNano('1')),
        });

        expect(createResult.transactions).toHaveTransaction({
            to: pool.address,
            success: true,
        });

        const joinResult = await pool.sendJoinPool(staker.getSender(), toNano('0.6'), {
            poolId: 121,
            stakerPubKey: stakerPubKey,
        });

        const tx = joinResult.transactions[1];
        expect(tx.outMessagesCount).toBe(1);
        const outMessages = tx.outMessages;
        expect(outMessages).toBeDefined();
        const outMessage = outMessages.get(0);
        const body = outMessages.get(0)?.body.beginParse();
        expect(outMessage?.info.dest?.toString()).toEqual(staker.address.toString());
        expect(outMessage?.info.type).toEqual('internal');
        expect(outMessage?.info.src?.toString()).toEqual(pool.address.toString());
        expect(body?.loadUint(32)).toEqual(0xfffffffe);
        expect(body?.skip(64).loadUint(32)).toEqual(0xb);
        expect(body?.loadUint(32)).toEqual(50);
    });

    it('should return 52 when user attempts to join a pool with a different stake amount', async () => {
        const createResult = await pool.sendCreatePool({
            seqno: 10,
            poolId: 121,
            body: Pool.createPoolMessage(380, 410, 100, toNano('1')),
        });

        expect(createResult.transactions).toHaveTransaction({
            to: pool.address,
            success: true,
        });

        await pool.sendJoinPool(staker.getSender(), toNano('1'), {
            poolId: 121,
            stakerPubKey: stakerPubKey,
        });
        const joinResult = await pool.sendJoinPool(staker.getSender(), toNano('1'), {
            poolId: 121,
            stakerPubKey: stakerPubKey,
        });

        const tx = joinResult.transactions[1];
        expect(tx.outMessagesCount).toBe(1);
        const outMessages = tx.outMessages;
        expect(outMessages).toBeDefined();
        const outMessage = outMessages.get(0);
        const body = outMessages.get(0)?.body.beginParse();
        expect(outMessage?.info.dest?.toString()).toEqual(staker.address.toString());
        expect(outMessage?.info.type).toEqual('internal');
        expect(outMessage?.info.src?.toString()).toEqual(pool.address.toString());
        expect(body?.loadUint(32)).toEqual(0xfffffffe);
        expect(body?.skip(64).loadUint(32)).toEqual(0xb);
        expect(body?.loadUint(32)).toEqual(52);
    });

    it('should add reward to the cell properly', async () => {
        await pool.sendCreatePool({
            seqno: 10,
            poolId: 121,
            body: Pool.createPoolMessage(380, 410, 100, toNano('1')),
        });
    });
});
