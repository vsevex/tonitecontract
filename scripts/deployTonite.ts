import { toNano } from '@ton/core';
import { Tonite } from '../wrappers/Tonite';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const tonite = provider.open(Tonite.createFromConfig({}, await compile('Tonite')));

    await tonite.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(tonite.address);
}
