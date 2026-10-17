"""Minimal JSON-RPC client for verifying JukeCoin play payments on-chain."""

import json
import urllib.request

from django.conf import settings

# keccak256("SongPlayed(address,uint256,bytes32,uint256)"), pinned by a test in contracts/test/JukeCoin.ts
SONG_PLAYED_TOPIC = '0x4a487cb38049169c54803c9106aeb5c73fc892842427171d03a069cee30b5757'

# JukeCoin.PLAY_PRICE: 0.001 JUKE in base units (18 decimals)
PLAY_PRICE = 10**15


class ChainError(Exception):
    """The node could not be reached or returned an RPC error."""


class PaymentError(Exception):
    """The transaction exists but does not prove the expected payment."""


def rpc(method, params):
    body = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}).encode()
    request = urllib.request.Request(
        settings.CHAIN_RPC_URL, data=body, headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.load(response)
    except (OSError, ValueError) as exc:
        raise ChainError(f'RPC request failed: {exc}') from exc
    if 'error' in payload:
        raise ChainError(payload['error'].get('message', 'RPC error'))
    return payload.get('result')


def verify_play_payment(tx_hash, play_id, song_id):
    """Return the paying wallet address if `tx_hash` paid for this play, else raise PaymentError."""
    receipt = rpc('eth_getTransactionReceipt', [tx_hash])
    if receipt is None:
        raise PaymentError('Transaction not found or not mined yet.')
    if int(receipt['status'], 16) != 1:
        raise PaymentError('Transaction failed on-chain.')

    contract = settings.JUKECOIN_ADDRESS.lower()
    for log in receipt['logs']:
        topics = [t.lower() for t in log['topics']]
        if (
            log['address'].lower() != contract
            or len(topics) != 4
            or topics[0] != SONG_PLAYED_TOPIC
            or topics[3] != play_id.lower()
        ):
            continue
        if int(topics[2], 16) != song_id:
            raise PaymentError('Payment was made for a different song.')
        if int(log['data'], 16) < PLAY_PRICE:
            raise PaymentError('Payment amount is too low.')
        return '0x' + topics[1][-40:]

    raise PaymentError('Transaction does not contain a payment for this play.')
