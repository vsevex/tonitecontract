import { Address, beginCell, Cell, toNano } from '@ton/core';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Tonite } from '../wrappers/Tonite';
import { importWallet } from './wallet';
import * as dotenv from 'dotenv';
import { runMethod } from './main';

async function main() {
    // load environment variables
    dotenv.config({ path: '.env' });

    const ownerAddress = Address.parse(process.env.OWNER_TEST_ADDRESS!);
    const ecvrfTestnet = Address.parse(process.env.ECVRF_TEST_ADDRESS!);

    const ownerMnemonic = process.env.OWNER_MAIN_MNEMONIC!;
    const imported = await importWallet(ownerMnemonic, { mainnet: true });
    const code = Cell.fromBoc(readFileSync(resolve(__dirname, '../build/tonite.boc')))[0];
    const client = imported[0];
    const ownerKeyPair = imported[1];
    const walletContract = imported[2];

    const tonite = Tonite.createFromConfig(
        {
            seqno: 1,
            ownerKeyPair: ownerKeyPair,
            owner: beginCell().storeAddress(ownerAddress).asSlice(),
            ecvrf: beginCell().storeAddress(ecvrfTestnet).asSlice(),
        },
        code,
        0,
    );

    if (!(await client.isContractDeployed(walletContract.address))) {
        return console.log('Wallet is not deployed');
    }

    console.log('TONite address:', tonite.address.toString());
    if (await client.isContractDeployed(tonite.address)) {
        return console.log('TONite already deployed');
    }

    // open wallet and read the current seqno of the wallet
    const walletSender = walletContract.sender(ownerKeyPair.secretKey);
    const seqno = await walletContract.getSeqno();

    // send the deploy transaction
    const toniteContract = client.open(tonite);
    await toniteContract.sendDeploy(walletSender, toNano(0.1));

    // wait until confirmed
    let currentSeqno = seqno;
    while (currentSeqno == seqno) {
        console.log('Waiting for deploy transaction to confirm...');
        await sleep(1500);
        currentSeqno = await walletContract.getSeqno();
    }
    console.log('Deploy transaction confirmed!');
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

runMethod(main);
