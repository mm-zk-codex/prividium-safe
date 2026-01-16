// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Time-gated message registry for the RevealSoon demo.
/// @dev Payloads are stored immediately; read access is gated by reveal time.
contract RevealSoon {
    struct Message {
        address author;
        uint64 createdAt;
        uint64 revealAt;
        string payload;
    }

    struct MessageHeader {
        uint256 id;
        address author;
        uint64 createdAt;
        uint64 revealAt;
        bool isRevealedNow;
    }

    Message[] private messages;

    function createMessage(string calldata payload, uint32 delaySeconds) external returns (uint256 id) {
        id = messages.length;
        uint64 createdAt = uint64(block.timestamp);
        uint64 revealAt = createdAt + delaySeconds;
        messages.push(
            Message({
                author: msg.sender,
                createdAt: createdAt,
                revealAt: revealAt,
                payload: payload
            })
        );
    }

    function getMessagesCount() external view returns (uint256) {
        return messages.length;
    }

    /// @notice Returns recent messages in reverse chronological order.
    /// @param limit Max number of messages to return.
    /// @param offset Number of newest messages to skip (cursor).
    function getRecentMessages(uint256 limit, uint256 offset) external view returns (MessageHeader[] memory) {
        uint256 total = messages.length;
        if (offset >= total || limit == 0) {
            return new MessageHeader[](0);
        }

        uint256 available = total - offset;
        uint256 count = limit < available ? limit : available;
        MessageHeader[] memory result = new MessageHeader[](count);

        for (uint256 i = 0; i < count; i++) {
            uint256 messageId = total - offset - 1 - i;
            Message storage message = messages[messageId];
            result[i] = MessageHeader({
                id: messageId,
                author: message.author,
                createdAt: message.createdAt,
                revealAt: message.revealAt,
                isRevealedNow: block.timestamp >= message.revealAt
            });
        }

        return result;
    }

    function getMessagePayload(uint256 id) external view returns (string memory) {
        require(id < messages.length, "Message not found");
        Message storage message = messages[id];
        require(block.timestamp >= message.revealAt, "Message not revealed");
        return message.payload;
    }
}
