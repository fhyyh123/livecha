package com.chatlive.support.common.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;

import java.sql.SQLException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalArgument(IllegalArgumentException ex) {
        var code = ex.getMessage();
        var status = HttpStatus.BAD_REQUEST;
        if ("missing_token".equals(code) || "unauthorized".equals(code)) {
            status = HttpStatus.UNAUTHORIZED;
        }
        if ("forbidden".equals(code)) {
            status = HttpStatus.FORBIDDEN;
        }
        return ResponseEntity.status(status).body(ApiResponse.error(code));
    }

    @ExceptionHandler(ExpiredJwtException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    public ApiResponse<Void> handleExpiredJwt(ExpiredJwtException ex) {
        return ApiResponse.error("token_expired");
    }

    @ExceptionHandler(JwtException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    public ApiResponse<Void> handleJwt(JwtException ex) {
        return ApiResponse.error("invalid_token");
    }

    @ExceptionHandler({DuplicateKeyException.class, DataIntegrityViolationException.class})
    @ResponseStatus(HttpStatus.CONFLICT)
    public ApiResponse<Void> handleConflict(Exception ex) {
        log.warn("data_conflict", ex);
        return ApiResponse.error("conflict");
    }

    @ExceptionHandler(BadSqlGrammarException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiResponse<Void> handleBadSql(BadSqlGrammarException ex) {
        // Most common root cause in production: DB schema/migration mismatch.
        var sql = ex.getSql();
        var root = NestedExceptionUtils.getMostSpecificCause(ex);
        if (root instanceof SQLException sqlEx) {
            log.warn(
                    "db_schema_mismatch sqlState={} errorCode={} sql={}",
                    sqlEx.getSQLState(),
                    sqlEx.getErrorCode(),
                    shortenSql(sql),
                    ex
            );
        } else {
            log.warn("db_schema_mismatch sql={}", shortenSql(sql), ex);
        }
        return ApiResponse.error("db_schema_mismatch");
    }

    private static String shortenSql(String sql) {
        if (sql == null) {
            return null;
        }
        var trimmed = sql.trim().replaceAll("\\s+", " ");
        var maxLen = 500;
        if (trimmed.length() <= maxLen) {
            return trimmed;
        }
        return trimmed.substring(0, maxLen) + "...";
    }

    @ExceptionHandler(DataAccessException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiResponse<Void> handleDataAccess(DataAccessException ex) {
        log.warn("db_error", ex);
        return ApiResponse.error("db_error");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<Void> handleValidation(MethodArgumentNotValidException ex) {
        var msg = ex.getBindingResult().getAllErrors().isEmpty()
                ? "validation error"
                : ex.getBindingResult().getAllErrors().getFirst().getDefaultMessage();
        return ApiResponse.error(msg);
    }

    @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ApiResponse<Void> handleNotFound(Exception ex) {
        return ApiResponse.error("not_found");
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiResponse<Void> handleGeneric(Exception ex) {
        log.warn("unhandled_exception", ex);
        return ApiResponse.error("internal_error");
    }
}
