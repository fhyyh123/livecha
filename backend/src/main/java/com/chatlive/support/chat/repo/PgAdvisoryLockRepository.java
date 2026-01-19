package com.chatlive.support.chat.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class PgAdvisoryLockRepository {

    private final JdbcTemplate jdbcTemplate;

    public PgAdvisoryLockRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public boolean tryLock(String key) {
        try {
            Boolean ok = jdbcTemplate.queryForObject(
                    "select pg_try_advisory_lock(hashtext(?)::bigint)",
                    Boolean.class,
                    key
            );
            return ok != null && ok;
        } catch (Exception ignored) {
            // Non-Postgres (e.g. H2) or function not available: run without distributed lock.
            return true;
        }
    }

    public void unlock(String key) {
        try {
            jdbcTemplate.queryForObject(
                    "select pg_advisory_unlock(hashtext(?)::bigint)",
                    Boolean.class,
                    key
            );
        } catch (Exception ignored) {
            // ignore
        }
    }
}
