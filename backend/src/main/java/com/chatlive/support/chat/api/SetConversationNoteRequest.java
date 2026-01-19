package com.chatlive.support.chat.api;

import jakarta.validation.constraints.Size;

public record SetConversationNoteRequest(
        @Size(max = 2000, message = "note_too_long") String note
) {
}
