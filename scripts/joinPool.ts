import { Address, toNano } from '@ton/core';
import { Tonite } from '../wrappers/Tonite';
import { importV5Wallet, importWallet } from './wallet';
import * as dotenv from 'dotenv';
import { runMethod } from './main';

async function main() {
    // load environment variables
    dotenv.config({ path: '.env' });
    const args = process.argv.slice(2);
    const poolId = args[0];

    if (!poolId) {
        throw new Error('Please provide pool id');
    }

    const stakerMnemonic = process.env.STAKER_TEST_MNEMONIC!;
    const imported = await importV5Wallet(stakerMnemonic, { walletId: { networkGlobalId: -3 } });
    const client = imported[0];
    const stakerKey = imported[1];
    const openedWallet = imported[2];

    const toniteAddress = Address.parse(process.env.TONITE_TEST_ADDRESS!);
    const tonite = new Tonite(toniteAddress);
    const toniteContract = client.open(tonite);

    const staker = openedWallet.sender(stakerKey.secretKey);
    await toniteContract.sendJoinPool(staker, toNano(0.2), { poolId: Number.parseInt(poolId) });
}

runMethod(main);
