# Requires 'requests' module to be installed to be installed
import sys
import json
import requests
import subprocess
import random
from time import sleep
####### PLEASE SET THESE VALUES BEFORE RUNNING TOOL ###########
TOOL_LOCATION = '/home/chris/VisualStudio/blockchain-database/tools/transaction-executor/bin/run'
SERVER = 'http://34.84.4.176:8080'
TRANSFER_AMOUNT = 5
###############################################################
TOOL_COMMAND = 'node '+ TOOL_LOCATION + ' --transactionFile={transaction_fle} --privateKey={private_key} --server=' + SERVER
BALANCE_SET_TRANSACTION = {"type": "SET_VALUE", "ref": "/account/{address}/balance", "value": None, "nonce": None}
BALANCE_TRANSFER_TRANSACTION = {"type": "SET_VALUE", "ref": "/transfer/{{address}}/{receiver}/{nonce}/value", "value": None, "nonce": None}
ALL_ACCOUNTS = SERVER + '/get?ref=/account'
SPECIFIC_ACCOUNT_BALANCE = ALL_ACCOUNTS + '/{address}/balance'
NONCE_DICT = {}
PRIVATE_PUBLIC_KEY_DICT = {}


def extract_account_from_sys_args(account_info):
    return {account.split('=')[0]: int(account.split('=')[1]) for account in account_info}


def get_nonce(private_key):
    if private_key not in NONCE_DICT:
        NONCE_DICT[private_key] = 0
    nonce = NONCE_DICT[private_key]
    NONCE_DICT[private_key] = NONCE_DICT[private_key] + 1
    return nonce


def get_balance_set_transaction(private_key, balance):
    nonce = get_nonce(private_key)
    balance_transaction = BALANCE_SET_TRANSACTION.copy()
    balance_transaction['value'] = balance
    balance_transaction['nonce'] = nonce
    return balance_transaction


def get_amount_transfer_transaction(sender, receiver):
    nonce = get_nonce(sender)
    balance_transfer = BALANCE_TRANSFER_TRANSACTION.copy()
    balance_transfer['ref'] = balance_transfer['ref'].format(nonce=nonce, receiver=PRIVATE_PUBLIC_KEY_DICT[receiver])
    balance_transfer['nonce'] = nonce
    balance_transfer['value'] = TRANSFER_AMOUNT
    return balance_transfer


def create_transaction_file(transaction, file_path='transaction.txt'):
    print('Creating transaction {transaction} in file {file_path}'.format(transaction=transaction, file_path=file_path))
    with open(file_path, 'w') as f:
        json.dump(transaction, f)
    return file_path


def execute_transaction(private_key, transaction_file):
    command = TOOL_COMMAND.format(private_key=private_key, transaction_fle=transaction_file)
    print('Executing {0}'.format(command))
    sleep(1)
    process = subprocess.Popen(command.split(), stdout=subprocess.PIPE)
    output, error = process.communicate()
    if (error):
        print('Command had error with output {0}'.format(output))
    else:
        print('Command successful')


def set_public_key(private_key):
    # TOOO: Chris implement so it can work even when previous accounts are already there
    response = requests.get(url=ALL_ACCOUNTS)
    response.raise_for_status()
    account_public_keys = response.json()['result'].keys()
    print(account_public_keys)
    for public_key in account_public_keys:
        if public_key not in list(PRIVATE_PUBLIC_KEY_DICT.values()):
            PRIVATE_PUBLIC_KEY_DICT[private_key] = public_key
            print('Public key for {private_key} is {public_key}'.format(private_key=private_key, public_key=public_key))


def select_accounts(accounts):
    account_names = list(accounts.keys())
    sender = random.choice(account_names)
    while accounts[sender] < TRANSFER_AMOUNT:
        sender = random.choice(account_names)
    account_names.remove(sender)
    return sender, random.choice(account_names)


def set_initial_balance(accounts):
    for private_key, balance in accounts.items():
        transaction_file = create_transaction_file(get_balance_set_transaction(private_key, balance))
        execute_transaction(private_key, transaction_file)
        set_public_key(private_key)


def update_balance(sender, receiver, accounts):
    accounts[sender] = accounts[sender] - TRANSFER_AMOUNT
    accounts[receiver] = accounts[receiver] + TRANSFER_AMOUNT


def get_balance(address):
    response = requests.get(url=SPECIFIC_ACCOUNT_BALANCE.format(address=address))
    response.raise_for_status()
    balance = response.json()['result']
    print('User with address {address} has balance {balance}'.format(address=address, balance=balance))
    return int(balance)


def check_balance(sender, receiver, accounts):
    sender_public_key = PRIVATE_PUBLIC_KEY_DICT[sender]
    receiver_public_key = PRIVATE_PUBLIC_KEY_DICT[receiver]
    sender_balance = get_balance(sender_public_key)
    receiver_balance = get_balance(receiver_public_key)
    assert_balance(sender_balance, sender, accounts)
    assert_balance(receiver_balance, receiver, accounts)


def assert_balance(actual_balance, private_key, accounts):
    try:
        assert actual_balance == accounts[private_key]
    except AssertionError:
        print('Failed assertion for user {user}\nExpected Balance: {expected}\nActual Balance: {actual}'
              ''.format(user=PRIVATE_PUBLIC_KEY_DICT[private_key], expected=accounts[private_key], actual=actual_balance))


if __name__ == '__main__':
    accounts = extract_account_from_sys_args(sys.argv[1:])
    set_initial_balance(accounts)
    while True:
        sender, receiver = select_accounts(accounts)
        transaction_file = create_transaction_file(get_amount_transfer_transaction(sender, receiver))
        execute_transaction(sender, transaction_file)
        update_balance(sender, receiver, accounts)
        sleep(2)
        check_balance(sender, receiver, accounts)
