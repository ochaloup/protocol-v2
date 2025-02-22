import {
	AddressLookupTableAccount,
	ConfirmOptions,
	Signer,
	Transaction,
	TransactionInstruction,
	TransactionSignature,
	VersionedTransaction,
} from '@solana/web3.js';
import { IWallet } from '../types';

export type TxSigAndSlot = {
	txSig: TransactionSignature;
	slot: number;
};

export interface TxSender {
	wallet: IWallet;

	send(
		tx: Transaction,
		additionalSigners?: Array<Signer>,
		opts?: ConfirmOptions,
		preSigned?: boolean
	): Promise<TxSigAndSlot>;

	sendVersionedTransaction(
		tx: VersionedTransaction,
		additionalSigners?: Array<Signer>,
		opts?: ConfirmOptions,
		preSigned?: boolean
	): Promise<TxSigAndSlot>;

	getVersionedTransaction(
		ixs: TransactionInstruction[],
		lookupTableAccounts: AddressLookupTableAccount[],
		additionalSigners?: Array<Signer>,
		opts?: ConfirmOptions
	): Promise<VersionedTransaction>;

	sendRawTransaction(
		rawTransaction: Buffer | Uint8Array,
		opts: ConfirmOptions
	): Promise<TxSigAndSlot>;

	getTimeoutCount(): number;
}
