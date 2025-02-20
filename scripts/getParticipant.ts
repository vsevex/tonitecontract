import { Address } from '@ton/core';
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

    const ownerMnemonic =
        'tired skin hint artefact photo orchard alarm census title you balance impulse canyon moon domain sleep toe mouse useless silk crime round wear rescue';
    const stakerMnemonic =
        'join crazy neutral decade genuine route install claim increase add bike onion portion century similar fade forward grant shed live myth burden orbit ski';
    const imported = await importWallet(ownerMnemonic);
    const client = imported[0];

    const importedStaker = await importV5Wallet(stakerMnemonic, { walletId: { networkGlobalId: -3 } });
    const openedWallet = importedStaker[2];

    const toniteAddress = Address.parse(process.env.TONITE_TEST_ADDRESS!);
    const tonite = new Tonite(toniteAddress);

    const toniteContract = client.open(tonite);

    const participant = await toniteContract.getParticipantWithAddr({
        poolId: Number.parseInt(poolId),
        stakerAddr: openedWallet.address,
    });
    console.log(participant);
}

runMethod(main);
