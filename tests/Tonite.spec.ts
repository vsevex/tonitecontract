import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { Tonite } from '../wrappers/Tonite';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Tonite', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Tonite');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let tonite: SandboxContract<Tonite>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        tonite = blockchain.openContract(Tonite.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await tonite.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: tonite.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and tonite are ready to use
    });
});
