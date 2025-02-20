// npm run createpool 1 1 1740048279 1740081600 20 0.5
// starting balance ----> 0.0996204 TON
// ending balance   ----> 0.097029587 TON
// gap              ----> 0.002590813 TON

import { Address, toNano } from '@ton/core';
import { Tonite } from '../wrappers/Tonite';
import { importWallet } from './wallet';
import * as dotenv from 'dotenv';
import { runMethod } from './main';

async function main() {
    // load environment variables
    dotenv.config({ path: '.env' });
    const args = process.argv.slice(2);
    const seqno = args[0];
    const poolId = args[1];
    const startTime = args[2];
    const endTime = args[3];
    const maxParticipants = args[4];
    const stakeAmount = args[5];

    if (!poolId || !startTime || !endTime || !maxParticipants || !stakeAmount) {
        throw new Error('Please provide all arguments: poolId, startTime, endTime, maxParticipants, stakeAmount');
    }

    const ownerMnemonic = process.env.OWNER_TEST_MNEMONIC!;
    const imported = await importWallet(ownerMnemonic);
    const client = imported[0];
    const ownerKeyPair = imported[1];

    const toniteAddress = Address.parse(process.env.TONITE_TEST_ADDRESS!);
    const tonite = new Tonite(toniteAddress);
    const toniteContract = client.open(tonite);
    const currentSeqno = await toniteContract.getSeqno();

    if (currentSeqno !== Number.parseInt(seqno)) {
        throw new Error(`Current seqno is ${currentSeqno}, found ${seqno}`);
    }

    await toniteContract.sendCreatePool({
        seqno: Number.parseInt(seqno),
        poolId: Number.parseInt(poolId),
        body: Tonite.createPoolMessage(
            Number.parseInt(startTime),
            Number.parseInt(endTime),
            Number.parseInt(maxParticipants),
            toNano(stakeAmount),
        ),
        secretKey: ownerKeyPair.secretKey,
    });
    console.log('Pool created successfully with id:', poolId);
}

runMethod(main);
