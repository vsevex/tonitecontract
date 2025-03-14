import { Blockchain, BlockchainTransaction, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, Message, toNano } from '@ton/core';
import { Tonite } from '../wrappers/Tonite';
import { compile } from '@ton/blueprint';
import { CoordinatorUnit } from '../wrappers/Coordinator';
import { randomTestKey } from '@ton/ton/dist/utils/randomTestKey';
import '@ton/test-utils';
import { Maybe } from '@ton/core/dist/utils/maybe';

describe('Tonite', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Tonite');
    });

    let blockchain: Blockchain;
    let tonite: SandboxContract<Tonite>;
    let owner: SandboxContract<TreasuryContract>;
    const keyReplay = randomTestKey('tonite-test');
    const ownerKeyPair = randomTestKey('tonite-owner');

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        owner = await blockchain.treasury('owner');
        let ecvrf = blockchain.openContract(
            CoordinatorUnit.createFromOwnerAndKey(owner.address, 0n, keyReplay.publicKey),
        );

        await ecvrf.sendDeploy(owner.getSender());
        tonite = blockchain.openContract(
            Tonite.createFromConfig(
                {
                    ownerKeyPair: ownerKeyPair,
                    owner: beginCell().storeAddress(owner.address).asSlice(),
                    ecvrf: beginCell().storeAddress(ecvrf.address).asSlice(),
                },
                code,
                0,
            ),
        );

        const topUpBalance = await tonite.sendDeposit(owner.getSender(), {
            value: toNano('2'),
        });

        expect(topUpBalance.transactions).toHaveTransaction({
            from: owner.address,
            to: tonite.address,
            success: true,
            exitCode: 0,
        });

        expect(topUpBalance.transactions.length).toBe(2);
    });

    it('should return an "invalid op code" message back to the user', async () => {
        // opcode 101 is invalid one
        const result = await tonite.sendOpCode(owner.getSender(), { value: toNano('0.01'), opCode: 101 });

        const message = parseOutMessage(result.transactions[0], tonite.address);
        expect(message).toBeDefined();
        const body = message?.body.beginParse();
        console.log(body?.remainingBits);
        expect(body?.loadStringTail()).toBe('Unknown op!');
    });
});

function parseOutMessage(transaction: BlockchainTransaction, src: Address): Message | undefined {
    console.log(transaction.children[0].inMessage?.body.beginParse().remainingBits);
    for (const message of transaction.outMessages) {
        console.log(message[0]);
        const msg = message[1];
        console.log(msg.body.beginParse().remainingBits);
        return msg;
    }
}

function parseInMessage(transaction: BlockchainTransaction): Maybe<Message> {
    const message = transaction.inMessage;

    return message;
}
