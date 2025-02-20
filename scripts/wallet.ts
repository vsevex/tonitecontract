import { getHttpEndpoint } from '@orbs-network/ton-access';
import { KeyPair, mnemonicToWalletKey } from '@ton/crypto';
import { OpenedContract, TonClient, WalletContractV4, WalletContractV5R1 } from '@ton/ton';
import { Maybe } from '@ton/ton/dist/utils/maybe';
import { WalletIdV5R1 } from '@ton/ton/dist/wallets/WalletContractV5R1';

export async function importWallet(
    mnemonic: string,
    opts?: { workchain?: number | undefined; mainnet?: boolean },
): Promise<[TonClient, KeyPair, OpenedContract<WalletContractV4>]> {
    const endpoint = await getHttpEndpoint({ network: (opts?.mainnet ?? false) ? 'mainnet' : 'testnet' });
    const client = new TonClient({ endpoint });

    const key = await mnemonicToWalletKey(mnemonic.split(' '));

    const wallet = WalletContractV4.create({
        publicKey: key.publicKey,
        workchain: opts?.workchain ?? 0,
    });
    const walletContract = client.open(wallet);

    return [client, key, walletContract];
}

export async function importV5Wallet(
    mnemonic: string,
    opts?: { workchain?: number | undefined; walletId?: Maybe<Partial<WalletIdV5R1<number>>> },
): Promise<[TonClient, KeyPair, OpenedContract<WalletContractV5R1>]> {
    const endpoint = await getHttpEndpoint({ network: 'testnet' });
    const client = new TonClient({ endpoint });

    const key = await mnemonicToWalletKey(mnemonic.split(' '));

    const wallet = WalletContractV5R1.create({
        publicKey: key.publicKey,
        workchain: opts?.workchain ?? 0,
        walletId: opts?.walletId,
    });
    const walletContract = client.open(wallet);

    return [client, key, walletContract];
}
