import { Address } from '@ton/core';
import { Tonite } from '../wrappers/Tonite';
import { importWallet } from './wallet';
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

    const ownerMnemonic =
        'tired skin hint artefact photo orchard alarm census title you balance impulse canyon moon domain sleep toe mouse useless silk crime round wear rescue';
    const imported = await importWallet(ownerMnemonic);
    const client = imported[0];

    const toniteAddress = Address.parse(process.env.TONITE_TEST_ADDRESS!);
    const tonite = new Tonite(toniteAddress);
    const toniteContract = client.open(tonite);

    const pool = await toniteContract.getPoolWithId(Number.parseInt(poolId));
    console.log(`Pool with id ${poolId} is: `, pool);
}

runMethod(main);
