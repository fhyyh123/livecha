-- Allow storing visitor ids in message_state.user_id (read receipts / delivery markers).
-- Previously this column had a FK to user_account(id), which rejects visitor ids.

alter table message_state
    drop constraint if exists message_state_user_id_fkey;
