import { Address, toNano } from '@ton/core';
import { Tonite } from '../wrappers/Tonite';
import { importWallet } from './wallet';
import * as dotenv from 'dotenv';
import { runMethod } from './main';

async function main() {
    // load environment variables
    dotenv.config({ path: '.env' });

    const ownerMnemonic = process.env.OWNER_TEST_MNEMONIC!;
    const imported = await importWallet(ownerMnemonic);
    const client = imported[0];
    const ownerKeyPair = imported[1];
    const walletContract = imported[2];
    const owner = walletContract.sender(ownerKeyPair.secretKey);

    const toniteAddress = Address.parse(process.env.TONITE_TEST_ADDRESS!);
    const tonite = new Tonite(toniteAddress);
    const toniteContract = client.open(tonite);

    const depositAmount = toNano(0.1);
    await toniteContract.sendSimple(owner, { value: depositAmount });
    console.log('Deposit made to TONite:', depositAmount.toString(10));
}

runMethod(main);
