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

    if (!poolId) {
        throw new Error('Please provide pool id');
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

    await toniteContract.sendClosePool({
        seqno: Number.parseInt(seqno),
        poolId: Number.parseInt(poolId),
        secretKey: ownerKeyPair.secretKey,
    });
    console.log('Pool closed successfully with id:', poolId);
}

runMethod(main);
