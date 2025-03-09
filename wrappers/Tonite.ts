import {
  beginCell,
  Address,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  toNano,
  TupleBuilder,
  Dictionary,
  Slice,
  TupleItemSlice,
} from "@ton/core";
import { ParticipantTuple, PoolTuple } from "./helpers";
import { KeyPair, sign } from "@ton/crypto";

export type ToniteConfig = {
  seqno?: number;
  ownerKeyPair: KeyPair;
  owner: Slice;
  ecvrf: Slice;
};

let ownerKey: KeyPair;

export function poolConfigToCell(config: ToniteConfig): Cell {
  ownerKey = config.ownerKeyPair;

  return beginCell()
    .storeUint(config.seqno || 12, 32) // seq_no
    .storeUint(0, 1)
    .storeBuffer(config.ownerKeyPair.publicKey, 32)
    .storeDict(Dictionary.empty())
    .storeRef(
      beginCell().storeSlice(config.owner).storeSlice(config.ecvrf).endCell()
    ) // owner && ecvrf
    .endCell();
}

export class Tonite implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell }
  ) {}

  static createFromConfig(config: ToniteConfig, code: Cell, workchain = 0) {
    const data = poolConfigToCell(config);
    const init = { code, data };
    return new Tonite(contractAddress(workchain, init), init);
  }

  // Send a message to create a new pool
  static createPoolMessage(
    startTime: number,
    endTime: number,
    maxParticipants: number,
    stakeAmount: bigint
  ) {
    return beginCell()
      .storeUint(startTime, 32)
      .storeUint(endTime, 32)
      .storeUint(maxParticipants, 32)
      .storeUint(0, 32)
      .storeUint(0, 1)
      .storeCoins(stakeAmount)
      .storeDict(Dictionary.empty())
      .storeDict(Dictionary.empty())
      .storeDict(Dictionary.empty())
      .endCell();
  }

  // Send a message to update the contract code
  static updatePoolMessage(newCode: Cell): Cell {
    return beginCell().storeUint(0x2a, 32).storeRef(newCode).endCell();
  }

  async sendDeploy(
    provider: ContractProvider,
    via: Sender,
    value: bigint
  ): Promise<void> {
    return provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  // Send a transaction to create a pool
  async sendCreatePool(
    provider: ContractProvider,
    opts: {
      seqno: number;
      poolId: number;
      body: Cell;
      secretKey?: Buffer<ArrayBufferLike> | undefined;
    }
  ): Promise<void> {
    return provider.external(
      beginCell()
        .storeBuffer(
          sign(
            beginCell()
              .storeUint(opts.poolId, 32)
              .storeRef(opts.body)
              .endCell()
              .hash(),
            opts.secretKey ?? ownerKey.secretKey
          ),
          64
        )
        .storeUint(opts.seqno, 32)
        .storeUint(Math.floor(Date.now() / 1000) + 3, 32)
        .storeUint(0x1f, 32)
        .storeUint(opts.poolId, 32)
        .storeRef(opts.body)
        .endCell()
    );
  }

  async sendWithdraw(
    provider: ContractProvider,
    opts: {
      seqno: number;
      secretKey?: Buffer<ArrayBufferLike> | undefined;
    }
  ): Promise<void> {
    return provider.external(
      beginCell()
        .storeBuffer(
          sign(
            beginCell().endCell().hash(),
            opts.secretKey ?? ownerKey.secretKey
          ),
          64
        )
        .storeUint(opts.seqno, 32)
        .storeUint(Math.floor(Date.now() / 1000) + 3, 32)
        .storeUint(0x7, 32)
        .endCell()
    );
  }

  // Send a transaction to join a pool
  async sendJoinPool(
    provider: ContractProvider,
    via: Sender,
    value: bigint = toNano("1"),
    opts: { poolId: number; queryId?: number | undefined }
  ): Promise<void> {
    return provider.internal(via, {
      value: value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(0xb, 32)
        .storeUint(opts.queryId || Date.now(), 64)
        .storeUint(opts.poolId, 32)
        .endCell(),
    });
  }

  async sendInternalMessage(
    provider: ContractProvider,
    via: Sender,
    value: bigint = toNano("1")
  ): Promise<void> {
    return provider.internal(via, { value, body: beginCell().endCell() });
  }

  // Send a transaction to cancel a pool
  async sendCancelPool(
    provider: ContractProvider,
    opts: {
      seqno: number;
      poolId: number;
      secretKey?: Buffer<ArrayBufferLike> | undefined;
    }
  ): Promise<void> {
    return provider.external(
      beginCell()
        .storeBuffer(
          sign(
            beginCell().storeUint(opts.poolId, 32).endCell().hash(),
            opts.secretKey ?? ownerKey.secretKey
          ),
          64
        )
        .storeUint(opts.seqno, 32)
        .storeUint(Math.floor(Date.now() / 1000) + 3, 32)
        .storeUint(0x20, 32)
        .storeUint(opts.poolId, 32)
        .endCell()
    );
  }

  // Send a transaction to update the contract code
  async sendUpdatePool(
    sender: Sender,
    provider: ContractProvider,
    newCode: Cell,
    value: bigint = toNano("0.1")
  ) {
    return provider.internal(sender, {
      value: value,
      body: Tonite.updatePoolMessage(newCode),
    });
  }

  // Gets the owner's public key
  async getOwnerPubkey(provider: ContractProvider): Promise<string> {
    const result = (await provider.get("get_owner_pubkey", [])).stack;
    return result.readBigNumber().toString(16);
  }

  async getPoolWithId(
    provider: ContractProvider,
    poolId: number
  ): Promise<PoolTuple> {
    const args = new TupleBuilder();
    args.writeNumber(poolId);
    const result = (await provider.get("get_pool", args.build())).stack;

    const startTime = result.readBigNumber();
    const endTime = result.readBigNumber();
    const maxParticipants = result.readBigNumber();
    const currentParticipantCount = result.readBigNumber();
    const stakeAmount = result.readBigNumber();
    const poolStatus = result.readBigNumber();
    const participants = result.readCellOpt();
    const results = result.readCellOpt();
    const rewards = result.readCellOpt();

    return new PoolTuple(
      BigInt(poolId),
      startTime,
      endTime,
      maxParticipants,
      currentParticipantCount,
      stakeAmount,
      poolStatus,
      participants,
      results,
      rewards
    );
  }

  async getSeqno(provider: ContractProvider): Promise<number> {
    const result = (await provider.get("seqno", [])).stack;
    return result.readNumber();
  }

  async getRewardWithKey(
    provider: ContractProvider,
    opts: { poolId: number; key: number }
  ): Promise<Slice> {
    const args = new TupleBuilder();
    args.writeNumber(opts.poolId);
    args.writeNumber(opts.key);
    const result = (await provider.get("get_reward", args.build())).stack;
    return (result.peek() as TupleItemSlice).cell.asSlice();
  }

  async getParticipantWithAddr(
    provider: ContractProvider,
    opts: { poolId: number; stakerAddr?: Address }
  ): Promise<ParticipantTuple> {
    const args = new TupleBuilder();
    args.writeNumber(opts.poolId);
    args.writeAddress(opts.stakerAddr);
    const result = (
      await provider.get("get_participant_with_addr", args.build())
    ).stack;
    const participant = (result.peek() as TupleItemSlice).cell.beginParse();

    return new ParticipantTuple(
      BigInt(participant.loadUint(8)),
      participant.loadAddress(),
      BigInt(participant.loadCoins())
    );
  }

  async sendClosePool(
    provider: ContractProvider,
    opts: {
      seqno: number;
      poolId: number;
      secretKey?: Buffer<ArrayBufferLike> | undefined;
    }
  ): Promise<void> {
    return provider.external(
      beginCell()
        .storeBuffer(
          sign(
            beginCell().storeUint(opts.poolId, 32).endCell().hash(),
            opts.secretKey ?? ownerKey.secretKey
          ),
          64
        )
        .storeUint(opts.seqno, 32)
        .storeUint(Math.floor(Date.now() / 1000) + 3, 32)
        .storeUint(0x65, 32)
        .storeUint(opts.poolId, 32)
        .endCell()
    );
  }

  async sendSimple(
    provider: ContractProvider,
    via: Sender,
    opts: { value: bigint; comment?: string }
  ): Promise<void> {
    return provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: opts.comment
        ? beginCell().storeUint(0, 32).storeStringTail(opts.comment).endCell()
        : undefined,
    });
  }

  async sendOp(
    provider: ContractProvider,
    via: Sender,
    opts: { value: bigint; op: number }
  ): Promise<void> {
    return provider.internal(via, {
      value: opts.value,
      body: beginCell().storeUint(opts.op, 32).endCell(),
    });
  }

  // Sends a random number on chain
  async sendRandomNumber(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    opts: { random: number }
  ): Promise<void> {
    return provider.internal(via, {
      value: value,
      body: beginCell()
        .storeUint(0x069ceca8, 32)
        .storeUint(opts.random, 256)
        .endCell(),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });
  }

  async getBalance(provider: ContractProvider): Promise<number> {
    const result = await provider.get("balance", []);
    return result.stack.readNumber();
  }

  async sendUpdateCode(
    provider: ContractProvider,
    opts: {
      seqno: number;
      newCode: Cell;
      secretKey?: Buffer<ArrayBufferLike> | undefined;
    }
  ): Promise<void> {
    return provider.external(
      beginCell()
        .storeBuffer(
          sign(
            beginCell().storeRef(opts.newCode).endCell().hash(),
            opts.secretKey ?? ownerKey.secretKey
          ),
          64
        )
        .storeUint(opts.seqno, 32)
        .storeUint(Math.floor(Date.now() / 1000) + 3, 32)
        .storeUint(0x2a, 32)
        .storeRef(opts.newCode)
        .endCell()
    );
  }
}
