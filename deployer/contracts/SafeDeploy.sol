// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.23;

import { SafeL2 } from '../vendor/safe-smart-account/contracts/SafeL2.sol';
import { SafeProxyFactory } from '../vendor/safe-smart-account/contracts/proxies/SafeProxyFactory.sol';
import { CompatibilityFallbackHandler } from '../vendor/safe-smart-account/contracts/handler/CompatibilityFallbackHandler.sol';
import { MultiSendCallOnly } from '../vendor/safe-smart-account/contracts/libraries/MultiSendCallOnly.sol';

contract SafeSingleton is SafeL2 {}

contract SafeFactory is SafeProxyFactory {}

contract SafeFallbackHandler is CompatibilityFallbackHandler {}

contract SafeMultiSend is MultiSendCallOnly {}
