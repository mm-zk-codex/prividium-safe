// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Time-gated message registry for the RevealSoon demo.
/// @dev Dual payloads are stored immediately; read access for the private text is gated by reveal time.
contract RevealSoon {
    struct Message {
        address author;
        uint64 createdAt;
        uint64 revealAt;
        string publicText;
        string privateText;
    }

    struct MessageHeader {
        uint256 id;
        address author;
        uint64 createdAt;
        uint64 revealAt;
    }

    Message[] private messages;

    function createMessage(
        string calldata publicText,
        string calldata privateText,
        uint32 delaySeconds
    ) external returns (uint256 id) {
        id = messages.length;
        uint64 createdAt = uint64(block.timestamp);
        uint64 revealAt = createdAt + delaySeconds;
        messages.push(
            Message({
                author: msg.sender,
                createdAt: createdAt,
                revealAt: revealAt,
                publicText: publicText,
                privateText: privateText
            })
        );
    }

    function getMessagesCount() external view returns (uint256) {
        return messages.length;
    }

    function getMessageHeader(uint256 id) external view returns (MessageHeader memory) {
        require(id < messages.length, "Message not found");
        Message storage message = messages[id];
        return
            MessageHeader({
                id: id,
                author: message.author,
                createdAt: message.createdAt,
                revealAt: message.revealAt
            });
    }

    /// @notice Returns messages in ascending id order.
    /// @param start First message id to return.
    /// @param count Max number of messages to return.
    function getMessagesRange(uint256 start, uint256 count) external view returns (MessageHeader[] memory) {
        uint256 total = messages.length;
        if (start >= total || count == 0) {
            return new MessageHeader[](0);
        }

        uint256 available = total - start;
        uint256 length = count < available ? count : available;
        MessageHeader[] memory result = new MessageHeader[](length);

        for (uint256 i = 0; i < length; i++) {
            uint256 messageId = start + i;
            Message storage message = messages[messageId];
            result[i] = MessageHeader({
                id: messageId,
                author: message.author,
                createdAt: message.createdAt,
                revealAt: message.revealAt
            });
        }

        return result;
    }

    function getPublicText(uint256 id) external view returns (string memory) {
        require(id < messages.length, "Message not found");
        return messages[id].publicText;
    }

    function getPrivateText(uint256 id) external view returns (string memory) {
        require(id < messages.length, "Message not found");
        Message storage message = messages[id];
        require(block.timestamp >= message.revealAt, "Message not revealed");
        return message.privateText;
    }

    function isRevealed(uint256 id) external view returns (bool) {
        require(id < messages.length, "Message not found");
        return block.timestamp >= messages[id].revealAt;
    }
}
