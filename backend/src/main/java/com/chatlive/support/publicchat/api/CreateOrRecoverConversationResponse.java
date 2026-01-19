package com.chatlive.support.publicchat.api;

public record CreateOrRecoverConversationResponse(
        String conversation_id,
        boolean recovered
) {
}
