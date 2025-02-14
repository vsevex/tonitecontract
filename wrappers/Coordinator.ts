import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Slice,
    toNano,
    TupleBuilder,
} from '@ton/core';
import { sign } from '@ton/crypto';

// Source: https://github.com/ProgramCrafter/ecvrf-coordinator-contract/blob/master/src/coordinator.fc
let coordinatorCode = Cell.fromBase64(
    'te6ccgECGwEABDUAART/APSkE/S88sgLAQIBIAIDAgFIBAUC9vLtRND0BNM/0wfTD1UwbwQB+kDT/9P/0x8wM/gjUAO88uCCA9QB0O1E+QBAE/kQ8uCD+ADtRNAg10mpOALtRPkAWdcDyMsHy/8ibyTtRNCAINcj+CMFyPQAFMs/EssHyw8BgQML1yLPFssfye1UQwDbPIIQBpzsqMjLHxgZAdTQINdJwSDjCAHQ0wMBcbAB+kAwAeMIAdMfIYIQq0xIWbqORTBsEoIQywO/r7qONu1E0PQB0z941yHTD/pAMFEzxwXy4KumMoIID0JAqAGocPsCcIAYyMsFWM8WIfoCy2rJgwb7AJEw4uMNBgIBIAcIAM5sIe1E0PQE0z/TB9MPBoIImJaAoSGmPIIID0JAqKkEIMEB4wgF+kAwUwSBAQv0Cm+hs5owAqQghAe88tCql9cLPxagRRXiUTWgBcjLP0AEgQEL9EFQJATI9AATyz/LB8sPAc8Wye1UAgFICQoCASAMDQAjtVidqJoegJpn+mD6YeIEi+CQAfu1zaQ/JLkLGeLQXgWcckwfoNWVjN1V+Vhlni7KOpsJiJuTOqvMAhBad+lUcF4doqxR2RqlrfQg1bDC0DtgTpXsg8IeCBjcteyiimVqfzkZf+sZ4vl/7j8ggC3kXyQKYF8kimYgORl/7j8ggBVv+Rlv+X/uPyCAHyTVIQQfJLALAGhTMfkkIxBGEDVZBMjL/xPL/8v/AcjL/xLL/3L5BACpOH9SBKig+SapCAHIy/8Sy3/L/8nQAgEgDg8CASAUFQIBWBARAgEgEhMAIa5P9qJoegJpn+mD6YeKL4JAAQWt6sAYAAewsp/gAEGxw7tRND0BNM/0wfTDxRfBKY8gggPQkCoAaiCCJiWgKCACASAWFwAzt/s9qJoEGuk1JwBdqJ8gCzrgeRlg+X/5OhAACbD/PklgACOyjPtRND0BNM/0wfTDxA0XwSAB7tP/Ifkh03/T/zADgvAs45Jg/QasrGbqr8rDLPF2UdTYTETcmdVeYBCC079Ko4Lw7RVijsjVLW+hBq2GFoHbAnSvZB4Q8EDG5a9lFFMrU/nIy/9YzxfL/3H5BAFvIvkgUwP5JF35JPkjBPklU1L5JPkjEDVURRMFGgDoy//JAW8kbVEyoSKOQASBAQv0kvLglgHXCz8gwgGcpcjLP1QgBoEBC/RBlTADpQME4nGAGMjLBVAGzxaCCcnDgPoCFctqUmDMyXL7AATkNDRQA+1E0IAg1yP4IwXI9AAUyz8SywfLDwGBAwvXIs8Wyx/J7VQA1gTIy/8Ty//L/wHIy/8Sy/9y+QQAqTh/uvLgZILwSFSSpO6TpQQ1KStyiS8XYXs6AHh/xFiZxPIU5Lqmp62C8O0VYo7I1S1voQathhaB2wJ0r2QeEPBAxuWvZRRTK1P5yMv/Esv/y/9x+QQA',
);

export class CoordinatorUnit implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromOwnerAndKey(owner: Address, publicKeyEcvrf: bigint, publicKeyReplay: Buffer) {
        const cell = beginCell()
            .storeUint(0, 1 + 64 + 8 + 16)
            .storeAddress(owner)
            .storeUint(publicKeyEcvrf, 256)
            .storeBuffer(publicKeyReplay)
            .storeUint(0, 32)
            .endCell();

        const init = { code: coordinatorCode, data: cell };
        return new CoordinatorUnit(contractAddress(0, init), init);
    }

    async sendSubscribeRandom(provider: ContractProvider, via: Sender, value: bigint, consumer?: Address) {
        consumer = consumer ?? via.address!!;

        await provider.internal(via, {
            value,
            body: beginCell().storeUint(0xab4c4859, 32).storeAddress(consumer).endCell(),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }

    async getAlpha(provider: ContractProvider): Promise<Slice> {
        const result = await provider.get('get_alpha', []);
        const alpha = result.stack.pop();
        if (alpha.type != 'slice') throw new Error('get returned invalid value');
        return alpha.cell.beginParse();
    }

    async getBalance(provider: ContractProvider): Promise<Number> {
        return Number((await provider.getState()).balance) / 1e9;
    }

    async sendDeploy(provider: ContractProvider, via: Sender): Promise<void> {
        return provider.internal(via, { value: toNano('1.0'), body: beginCell().endCell(), bounce: false });
    }

    async sendProvideRandomness(provider: ContractProvider, pi: Slice, secretReplay: Buffer) {
        const contractState = (await provider.getState()).state;
        if (contractState.type != 'active') throw new Error('invalid state');
        const hashToSign = Cell.fromBoc(contractState.data!!)[0].hash();
        const signature = beginCell().storeBuffer(sign(hashToSign, secretReplay)).endCell();
        await provider.external(beginCell().storeSlice(pi).storeRef(signature).endCell());
    }

    async getCalcPiFromAlpha(provider: ContractProvider, secret: bigint, alpha: Slice): Promise<Slice> {
        var args = new TupleBuilder();
        args.writeNumber(secret);
        args.writeSlice(alpha);
        const result = await provider.get('ecvrf::rist255::with_secret::prove', args.build());
        const pi = result.stack.pop();
        if (pi.type != 'slice') throw new Error('get returned invalid value');
        return pi.cell.beginParse();
    }

    async getPublicKey(provider: ContractProvider, secret: bigint): Promise<bigint> {
        var args = new TupleBuilder();
        args.writeNumber(secret);
        return (await provider.get('rist255::get_public_key', args.build())).stack.readBigNumber();
    }

    async getUnfulfilled(provider: ContractProvider): Promise<number> {
        return (await provider.get('get_unfulfilled', [])).stack.readNumber();
    }
}
