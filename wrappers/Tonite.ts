import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type ToniteConfig = {};

export function toniteConfigToCell(config: ToniteConfig): Cell {
    return beginCell().endCell();
}

export class Tonite implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Tonite(address);
    }

    static createFromConfig(config: ToniteConfig, code: Cell, workchain = 0) {
        const data = toniteConfigToCell(config);
        const init = { code, data };
        return new Tonite(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }
}
