-- Allow storing visitor ids in message_state.user_id (read receipts / delivery markers).
-- H2 init uses a named FK constraint.

alter table message_state
    drop constraint if exists fk_state_user;
