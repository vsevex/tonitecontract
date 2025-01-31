import { Address, Cell, toNano } from '@ton/core';
import { KeyPair, keyPairFromSeed } from '@ton/crypto';
import '@ton/test-utils';
import { randomAddress } from '@ton/test-utils';
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
    let ownerAddress: Address;
    let deployer: SandboxContract<TreasuryContract>;

    beforeAll(async () => {
        code = await compile('Pool');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = 400;

        owner = await blockchain.treasury('owner');
        ownerAddress = randomAddress();

        ownerKeyPair = keyPairFromSeed(Buffer.from(base64Decode('vt58J2v6FaBuXFGcyGtqT5elpVxcZ+I1zgu/GUfA5uY=')));
        pool = blockchain.openContract(Pool.createFromConfig({ ownerKeyPair: ownerKeyPair }, code, -1));

        deployer = await blockchain.treasury('deployer', { workchain: -1 });
        const deployResult = await pool.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: pool.address,
            deploy: true,
            success: true,
            inMessageBounced: false,
            inMessageBounceable: true,
        });

        poolCell = Pool.createPoolMessage(380, 410, 0, 100, BigInt('50'));

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
        expect(firstPool.poolFlags).toEqual(BigInt(0));
        expect(firstPool.maxParticipants).toEqual(BigInt(100));
    });

    it('should join a pool', async () => {
        const stakerPubKey = keyPairFromSeed(Buffer.from(base64Decode('vt59J2v6FaBuXFGcyGtqT5elpVxcZ+I1zgu/GUfA5uY=')));
        await pool.sendCreatePool({ seqno: 10, poolId: 121, body: poolCell });
        await pool.sendJoinPool(owner.getSender(), toNano('0.1'), {
            poolId: 121,
            stakerPubKey: stakerPubKey,
        });
        // const activePools = await pool.getActivePools();
        // const firstPool = activePools[0];
        // console.log(firstPool);
        // expect(firstPool.currentParticipantCount).toEqual(BigInt(0));
    });

    // let code: Cell;
    // beforeAll(async () => {
    //     code = await compile('Pool');
    // });
    // let poolCell: Cell;
    // let blockchain: Blockchain;
    // let deployer: SandboxContract<TreasuryContract>;
    // let pool: SandboxContract<Pool>;
    // beforeEach(async () => {
    //     blockchain = await Blockchain.create();
    //     blockchain.now = 300;
    //     pool = blockchain.openContract(Pool.createFromConfig({ ownerPubkey: BigInt('0x1') }, code));
    //     poolCell = Pool.createPoolMessage(
    //         1672531200,
    //         1672617600,
    //         0,
    //         100,
    //         BigInt('50'),
    //         new Cell(),
    //         new Cell(),
    //         new Cell(),
    //         new Cell(),
    //     );
    //     deployer = await blockchain.treasury('deployer', { resetBalanceIfZero: true });
    //     await pool.sendInternalMessage(deployer.getSender(), toNano(1.234));
    //     const deployResult = await pool.sendDeploy(deployer.getSender(), toNano('1'));
    //     await deployer.send({ to: pool.address, value: toNano('10') });
    //     // expect(deployResult.transactions).not.toHaveTransaction({
    //     //     from: deployer.address,
    //     //     to: pool.address,
    //     //     deploy: true,
    //     //     success: true,
    //     // });
    // });
    // it("should return the owner's public key", async () => {
    //     const ownerPubKey = await pool.getOwnerPubkey();
    //     expect(ownerPubKey).toEqual(BigInt('0x1'));
    // });
    // it('should return the sequence number', async () => {
    //     const sequenceNumber = await pool.getSeqNo();
    //     expect(sequenceNumber).toEqual(10);
    // });
    // it('should return the list of active pools', async () => {
    //     await pool.sendCreatePool({ seqno: 10, poolId: 121, body: poolCell });
    //     var activePools = await pool.getActivePools();
    //     expect(activePools.length).toEqual(1);
    //     // Create another pool
    //     await pool.sendCreatePool({ seqno: 11, poolId: 123, body: poolCell });
    //     // Check that there are two active pools
    //     activePools = await pool.getActivePools();
    //     expect(activePools.length).toEqual(2);
    //     const firstPool = activePools[0];
    //     expect(firstPool.poolId).toEqual(BigInt(121));
    //     expect(firstPool.startTime).toEqual(BigInt(1672531200));
    //     expect(firstPool.endTime).toEqual(BigInt(1672617600));
    //     expect(firstPool.poolFlags).toEqual(BigInt(0));
    //     expect(firstPool.maxParticipants).toEqual(BigInt(100));
    // });
    //
});
