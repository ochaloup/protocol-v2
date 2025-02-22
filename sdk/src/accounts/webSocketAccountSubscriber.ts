import { DataAndSlot, BufferAndSlot, AccountSubscriber } from './types';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { AccountInfo, Context, PublicKey } from '@solana/web3.js';
import { capitalize } from './utils';
import * as Buffer from 'buffer';

export class WebSocketAccountSubscriber<T> implements AccountSubscriber<T> {
	dataAndSlot?: DataAndSlot<T>;
	bufferAndSlot?: BufferAndSlot;
	accountName: string;
	program: Program;
	accountPublicKey: PublicKey;
	decodeBufferFn: (buffer: Buffer) => T;
	onChange: (data: T) => void;
	listenerId?: number;
	resubTimeoutMs?: number;
	timeoutId?: NodeJS.Timeout;

	receivingData: boolean;

	public constructor(
		accountName: string,
		program: Program,
		accountPublicKey: PublicKey,
		decodeBuffer?: (buffer: Buffer) => T,
		resubTimeoutMs?: number
	) {
		this.accountName = accountName;
		this.program = program;
		this.accountPublicKey = accountPublicKey;
		this.decodeBufferFn = decodeBuffer;
		this.resubTimeoutMs = resubTimeoutMs;
		this.receivingData = false;
	}

	async subscribe(onChange: (data: T) => void): Promise<void> {
		if (this.listenerId) {
			return;
		}

		this.onChange = onChange;
		if (!this.dataAndSlot) {
			await this.fetch();
		}

		this.listenerId = this.program.provider.connection.onAccountChange(
			this.accountPublicKey,
			(accountInfo, context) => {
				if (this.resubTimeoutMs) {
					this.receivingData = true;
					clearTimeout(this.timeoutId);
					this.handleRpcResponse(context, accountInfo);
					this.setTimeout();
				} else {
					this.handleRpcResponse(context, accountInfo);
				}
			},
			(this.program.provider as AnchorProvider).opts.commitment
		);

		if (this.resubTimeoutMs) {
			this.setTimeout();
		}
	}

	setData(data: T, slot?: number): void {
		const newSlot = slot || 0;
		if (this.dataAndSlot && this.dataAndSlot.slot > newSlot) {
			return;
		}

		this.dataAndSlot = {
			data,
			slot,
		};
	}

	private setTimeout(): void {
		if (!this.onChange) {
			throw new Error('onChange callback function must be set');
		}
		this.timeoutId = setTimeout(async () => {
			if (this.receivingData) {
				console.log(
					`No ws data from ${this.accountName} in ${this.resubTimeoutMs}ms, resubscribing`
				);
				await this.unsubscribe();
				this.receivingData = false;
				await this.subscribe(this.onChange);
			}
		}, this.resubTimeoutMs);
	}

	async fetch(): Promise<void> {
		const rpcResponse =
			await this.program.provider.connection.getAccountInfoAndContext(
				this.accountPublicKey,
				(this.program.provider as AnchorProvider).opts.commitment
			);
		this.handleRpcResponse(rpcResponse.context, rpcResponse?.value);
	}

	handleRpcResponse(context: Context, accountInfo?: AccountInfo<Buffer>): void {
		const newSlot = context.slot;
		let newBuffer: Buffer | undefined = undefined;
		if (accountInfo) {
			newBuffer = accountInfo.data;
		}

		if (!this.bufferAndSlot) {
			this.bufferAndSlot = {
				buffer: newBuffer,
				slot: newSlot,
			};
			if (newBuffer) {
				const account = this.decodeBuffer(newBuffer);
				this.dataAndSlot = {
					data: account,
					slot: newSlot,
				};
				this.onChange(account);
			}
			return;
		}

		if (newSlot <= this.bufferAndSlot.slot) {
			return;
		}

		const oldBuffer = this.bufferAndSlot.buffer;
		if (newBuffer && (!oldBuffer || !newBuffer.equals(oldBuffer))) {
			this.bufferAndSlot = {
				buffer: newBuffer,
				slot: newSlot,
			};
			const account = this.decodeBuffer(newBuffer);
			this.dataAndSlot = {
				data: account,
				slot: newSlot,
			};
			this.onChange(account);
		}
	}

	decodeBuffer(buffer: Buffer): T {
		if (this.decodeBufferFn) {
			return this.decodeBufferFn(buffer);
		} else {
			return this.program.account[this.accountName].coder.accounts.decode(
				capitalize(this.accountName),
				buffer
			);
		}
	}

	unsubscribe(): Promise<void> {
		if (this.listenerId) {
			const promise =
				this.program.provider.connection.removeAccountChangeListener(
					this.listenerId
				);
			this.listenerId = undefined;
			return promise;
		}
	}
}
