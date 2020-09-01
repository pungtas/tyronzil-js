/*
    TyronZIL-js: Decentralized identity client for the Zilliqa blockchain platform
    Copyright (C) 2020 Julio Cesar Cabrapan Duarte

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
*/

import LogColors from './log-colors';
import * as Crypto from '@zilliqa-js/crypto';
import DidCreate from '../lib/sidetree/did-operations/did-create';
//import DidRecover, { RecoverOperationInput } from '../lib/sidetree/did-operations/did-recover';
import { CliInputModel, PublicKeyInput } from '../lib/sidetree/models/cli-input-model';
import TyronZILScheme from '../lib/sidetree/tyronZIL-schemes/did-scheme';
import { NetworkNamespace, SchemeInputData } from '../lib/sidetree/tyronZIL-schemes/did-scheme';
import * as readline from 'readline-sync';
import { PublicKeyPurpose } from '../lib/sidetree/models/verification-method-models';
import { LongFormDidInput, TyronZILUrlScheme } from '../lib/sidetree/tyronZIL-schemes/did-url-scheme';
import * as fs from 'fs';
import DidDoc, {ResolutionInput, Accept, ResolutionResult} from '../lib/sidetree/did-document';
//import JsonAsync from '@decentralized-identity/sidetree/dist/lib/core/versions/latest/util/JsonAsync';
import ServiceEndpointModel from '@decentralized-identity/sidetree/dist/lib/core/versions/latest/models/ServiceEndpointModel';
import { PrivateKeys, /*Cryptography*/} from '../lib/sidetree/did-keys';
//import Multihash from '@decentralized-identity/sidetree/dist/lib/core/versions/latest/Multihash';
import Encoder from '@decentralized-identity/sidetree/dist/lib/core/versions/latest/Encoder';
import SidetreeError from '@decentralized-identity/sidetree/dist/lib/common/SidetreeError';
import ErrorCode from '../lib/ErrorCode';
//import DidDeactivate, { DeactivateOperationInput } from '../lib/sidetree/did-operations/did-deactivate';
//import { PatchAction, PatchModel } from '../lib/sidetree/models/patch-model';
//import DidUpdate, { UpdateOperationInput } from '../lib/sidetree/did-operations/did-update';
import TyronTransaction, { TransitionTag, DeployedContract } from '../lib/blockchain/tyron-transaction';
import { ContractInit } from '../lib/blockchain/tyron-contract';

/** Handles the command-line interface DID operations */
export default class TyronCLI {
    /** Gets network choice from the user */
    private static network(): NetworkNamespace {
        const network = readline.question(LogColors.green(`On which Zilliqa network would you like to operate, mainnet(m) or testnet(t)?`) + ` - [m/t] - Defaults to testnet - ` + LogColors.lightBlue(`Your answer: `));
        // Defaults to testnet
        let NETWORK;
        switch(network.toLowerCase()) {
            case 'm':
                NETWORK = NetworkNamespace.Mainnet;
                break;
            default:
                // Defaults to testnet
                NETWORK = NetworkNamespace.Testnet;
                break;
        }
        return NETWORK;
    }

    /** Initializes the client account */
    private static clientInit(): Account {
        const client_privateKey = readline.question(LogColors.green(`What is the client's private key? - `) + LogColors.lightBlue(`Your answer: `));
        const CLIENT_ADDR = Crypto.getAddressFromPrivateKey(client_privateKey);
        const CLIENT: Account = {
            addr: CLIENT_ADDR,
            privateKey: client_privateKey,
        };
        return CLIENT;
    }

    /***            ****            ***/

    /** Handles the `create` subcommand */
    public static async handleCreate(): Promise<void> {
        const NETWORK = this.network();
        Promise.resolve(this.clientInit())
        .then(async client => {
            const user_privateKey = readline.question(LogColors.green(`As the user, you're the owner of your tyron-smart-contract! Which private key do you choose to have that power? - `) + LogColors.lightBlue(`Your answer: `));
            const CONTRACT_OWNER = Crypto.getAddressFromPrivateKey(user_privateKey);
            const USER: Account = {
                addr: CONTRACT_OWNER,
                privateKey: user_privateKey
            };

            const ACCOUNTS = {
                client: client,
                user: USER
            };
    
            return ACCOUNTS;
        })
        .then(async accounts => {
            // Adds public keys and service endpoints:
            const PUBLIC_KEYS = await this.InputKeys();
            const SERVICE = await this.InputService();

            const CLI_INPUT: CliInputModel = {
                network: NETWORK,
                publicKeyInput: PUBLIC_KEYS,
                service: SERVICE
            }

            /** Executes the DID-create operation */
            const DID_EXECUTED = await DidCreate.executeCli(CLI_INPUT);
            
            /***            ****            ***/

            /** The globally unique part of the DID */
            const DID_SUFFIX = DID_EXECUTED.didUniqueSuffix;
            
            const SCHEME_DATA: SchemeInputData = {
                network: NETWORK,
                didUniqueSuffix: DID_SUFFIX
            };
            
            /** The tyronZIL DID-scheme */
            const DID_SCHEME = await TyronZILScheme.newDID(SCHEME_DATA);

            /** tyronZIL DID instance with the proper DID-scheme */
            const DID_tyronZIL = DID_SCHEME.did_tyronZIL;
            
            console.log(LogColors.yellow(`Your decentralized identity on Zilliqa is: `) + LogColors.brightYellow(`${DID_tyronZIL}`)); 
            
            /***            ****            ***/
            
            /** Saves the private keys */
            const PRIVATE_KEYS: PrivateKeys = {
                privateKeys: DID_EXECUTED.privateKey,
                updatePrivateKey: Encoder.encode(Buffer.from(JSON.stringify(DID_EXECUTED.updatePrivateKey))),
                recoveryPrivateKey: Encoder.encode(Buffer.from(JSON.stringify(DID_EXECUTED.recoveryPrivateKey))),
            };
            const KEY_FILE_NAME = `DID_PRIVATE_KEYS_${DID_tyronZIL}.json`;
            fs.writeFileSync(KEY_FILE_NAME, JSON.stringify(PRIVATE_KEYS, null, 2));
            console.info(LogColors.yellow(`Private keys saved as: ${LogColors.brightYellow(KEY_FILE_NAME)}`));

            /***            ****            ***/
            
            /** To generate the Sidetree Long-Form DID */
            const LONG_DID_INPUT: LongFormDidInput = {
                    schemeInput: SCHEME_DATA,
                    encodedSuffixData: DID_EXECUTED.encodedSuffixData,
                    encodedDelta: DID_EXECUTED.encodedDelta!
            }
            const LONG_FORM_DID = await TyronZILUrlScheme.longFormDid(LONG_DID_INPUT);
            const LONG_DID_tyronZIL = LONG_FORM_DID.longFormDid;

            console.log(LogColors.yellow(`In case you want to submit the transaction at a later stage, your Sidetree Long-Form DID is: `) + LogColors.brightYellow(`${LONG_DID_tyronZIL}`));
            
            const TYRON_CLI = {
                accounts: accounts,
                operation: DID_EXECUTED,
                did: DID_tyronZIL
            };

            return TYRON_CLI;
        })
        .then(async TYRON_CLI => {
            /** Asks if the user wants to write their tyronZIL DID on Zilliqa */
            const write_did = readline.question(LogColors.green(`Would you like to write your tyronZIL DID on Zilliqa?`) + ` - [y/n] - Defaults to yes ` + LogColors.lightBlue(`Your answer: `));
            switch (write_did.toLowerCase()) {
                case "n":
                    console.log(LogColors.green(`Then, that's all for now. Enjoy your decentralized identity!`));
                    return;
                default:
                    break;
            }

            const CONTRACT_INIT: ContractInit = {
                tyron_init: "0x75d8297b8bd2e35de1c17e19d2c13504de623793",
                contract_owner: TYRON_CLI.accounts.user.addr,
                client_addr: TYRON_CLI.accounts.client.addr,
                tyron_stake: 100000000000000        // e.g. 100 ZIL
            };

            const gas_limit = readline.question(LogColors.green(`What is the gas limit? - `) + LogColors.lightBlue(`Your answer: `));
            
            console.log(LogColors.brightGreen(`Initializing your tyron-smart-contract...`));
            
            const INITIALIZE = await TyronTransaction.initialize(
                NETWORK,
                CONTRACT_INIT,
                TYRON_CLI.accounts.client.privateKey,
                TYRON_CLI.accounts.user.privateKey,
                Number(gas_limit),
            );
            
            const INIT = INITIALIZE as TyronTransaction;
            
            const version = readline.question(LogColors.green(`What version of the tyron-smart-contract would you like to deploy? - `) + LogColors.lightBlue(`Your answer: `));
            console.log(LogColors.brightGreen(`Deploying...`))

            /***            ****            ***/
            // The user deploys their tyron-smart-contract and calls the ContractInit transition
            const DEPLOYED_CONTRACT = await TyronTransaction.deploy(INIT, version);
            const TYRON_ADDR = (DEPLOYED_CONTRACT as DeployedContract).contract.address;
       
            const TAG = TransitionTag.Create;
            const PARAMS = await TyronTransaction.create(
                TYRON_CLI.did,
                TYRON_CLI.operation.encodedSuffixData,
                TYRON_CLI.operation.encodedDelta,
                TYRON_CLI.operation.updateCommitment,
                TYRON_CLI.operation.recoveryCommitment
            );
            await TyronTransaction.submit(INIT, TYRON_ADDR!, TAG, PARAMS);
        })
        .catch(error => console.error(error))            
    }

    /***            ****            ****/

    /** Resolves the tyronZIL DID and saves it */
    public static async handleResolve(): Promise<void> {
        const NETWORK = this.network();
        const DID = readline.question(LogColors.green(`Which tyronZIL DID would you like to resolve? - `) + LogColors.lightBlue(`Your answer: `));
        /** Asks for the user's `tyron address` */
        const tyronAddr = readline.question(LogColors.green(`What is the address of the user's tyron-smart-contract - `) + LogColors.lightBlue(`Your answer: `));
        
        /** User choice to whether to resolve the DID as a document or resolution result */
        const RESOLUTION_CHOICE = readline.question(LogColors.green(`Would you like to resolve your DID as a document(1) or as a resolution result(2)? `) + `- [1/2] - Defaults to document - ` + LogColors.lightBlue(`Your answer: `));
        
        let ACCEPT;
        switch (RESOLUTION_CHOICE) {
            case "1":
                ACCEPT = Accept.contentType                
                break;
            case "2":
                ACCEPT = Accept.Result
                break;
            default:
                ACCEPT = Accept.contentType
                break;
        }

        const RESOLUTION_INPUT: ResolutionInput = {
            did: DID,
            metadata : {
                accept: ACCEPT
            }
        }
        console.log(LogColors.brightGreen(`Resolving your request...`));

        /** Resolves the tyronZIL DID */        
        const DID_RESOLVED = await DidDoc.resolution(NETWORK, tyronAddr, RESOLUTION_INPUT) as ResolutionResult | DidDoc;
        
        // Saves the DID-document
        try{
            await DidDoc.write(DID, DID_RESOLVED);
        } catch {
            throw new SidetreeError(ErrorCode.CouldNotSave);
        }
    }

    /***            ****            ***/

    /** Generates the keys' input */
    public static async InputKeys(): Promise<PublicKeyInput[]> {
        // Creates the first verification method used with a general purpose as the primary public key and for authentication as verification relationship:
        console.log(LogColors.green(`Let's create a primary signing key for your DID. It's a general-purpose verification method, also used for authentication as the verification relationship.`));
        
        let PRIMARY_KEY_ID = readline.question(`Choose a name for your key - Defaults to 'primarySigningKey' - ` + LogColors.lightBlue(`Your answer: `));
        if (PRIMARY_KEY_ID === "") {
            PRIMARY_KEY_ID = 'primarySigningKey';
        }

        const PRIMARY_PUBLIC_KEY: PublicKeyInput = {
            id: PRIMARY_KEY_ID,
            purpose: [PublicKeyPurpose.General, PublicKeyPurpose.Auth]
        };
    
        const PUBLIC_KEYS: PublicKeyInput[] = [PRIMARY_PUBLIC_KEY];
    
        // Asks if the user wants a secondary key-pair, and its purpose:
        const MORE_KEYS = readline.question(`Would you like to have a secondary public keys? [y] - Defaults to 'no' - ` + LogColors.lightBlue(`Your answer: `));

        if (MORE_KEYS.toLowerCase() === 'y') {
            let SECONDARY_KEY_ID = readline.question(`Choose a name for your key - Defaults to 'secondarySigningKey' - ` + LogColors.lightBlue(`Your answer: `));
            if (SECONDARY_KEY_ID === "") {
                SECONDARY_KEY_ID = 'secondarySigningKey';
            }

            let SECONDARY_PURPOSE = [PublicKeyPurpose.Auth];
            const WHICH_PURPOSE = readline.question(`What is the secondary purpose: general(1), authentication(2) or both(3)? [1/2/3] - Defaults to authentication - ` + LogColors.lightBlue(`Your answer: `));
            if (WHICH_PURPOSE === '1') {
                SECONDARY_PURPOSE = [PublicKeyPurpose.General]
            } else if (WHICH_PURPOSE === '3') {
                SECONDARY_PURPOSE = [PublicKeyPurpose.General, PublicKeyPurpose.Auth]
            }
            
            const SECONDARY_PUBLIC_KEY: PublicKeyInput = {
                id: SECONDARY_KEY_ID,
                purpose: SECONDARY_PURPOSE
            };
            PUBLIC_KEYS.push(SECONDARY_PUBLIC_KEY);
        }
        return PUBLIC_KEYS
    }

    /***            ****            ***/

    /** Generates the services' input */
    public static async InputService(): Promise<ServiceEndpointModel[]> {
        console.log(LogColors.green(`Let's create service endpoints for your DID!`));
        
        const SERVICE = [];
        
        let WEBSITE_ENDPOINT = readline.question(`Write down your website [https://yourwebsite.com] - Defaults to 'https://tyronZIL.com' - ` + LogColors.lightBlue(`Your answer: `));
        if (WEBSITE_ENDPOINT === "") {
            WEBSITE_ENDPOINT = 'https://tyronZIL.com';
        }
        const SERVICE_WEBSITE: ServiceEndpointModel = {
            id: 'main-website',
            type: 'website',
            endpoint: WEBSITE_ENDPOINT
        }
        SERVICE.push(SERVICE_WEBSITE);
        return SERVICE
    }
}

interface Account {
    addr: string;
    privateKey: string;
}
