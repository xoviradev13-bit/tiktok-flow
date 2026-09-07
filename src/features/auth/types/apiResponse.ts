/**
 * Enterprise-grade API response types and utilities for consistent error handling.
 * Following RFC 7807 Problem Details for HTTP APIs pattern.
 */

// Standard API Response Codes
export const AUTH_ERROR_CODES = {
    // Client Errors (4xx)
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    USER_EXISTS: 'USER_EXISTS',
    USER_NOT_FOUND: 'USER_NOT_FOUND',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    TOKEN_INVALID: 'TOKEN_INVALID',
    MISSING_REQUIRED_FIELDS: 'MISSING_REQUIRED_FIELDS',
    WEAK_PASSWORD: 'WEAK_PASSWORD',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    RATE_LIMITED: 'RATE_LIMITED',

    // Server Errors (5xx)
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    DATABASE_ERROR: 'DATABASE_ERROR',
    EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
} as const;

export type AuthErrorCode = typeof AUTH_ERROR_CODES[keyof typeof AUTH_ERROR_CODES];

// Standardized API Response Types
export interface ApiSuccessResponse<T = unknown> {
    success: true;
    data?: T;
    message?: string;
    meta?: {
        timestamp: string;
        requestId?: string;
    };
}

export interface ApiErrorResponse {
    success: false;
    error: {
        code: AuthErrorCode;
        message: string;
        details?: Record<string, unknown>;
    };
    meta?: {
        timestamp: string;
        requestId?: string;
    };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// Helper functions for creating consistent responses
export function createSuccessResponse<T>(
    data?: T,
    message?: string
): ApiSuccessResponse<T> {
    return {
        success: true,
        ...(data !== undefined && { data }),
        ...(message && { message }),
        meta: {
            timestamp: new Date().toISOString(),
        },
    };
}

export function createErrorResponse(
    code: AuthErrorCode,
    message: string,
    details?: Record<string, unknown>
): ApiErrorResponse {
    return {
        success: false,
        error: {
            code,
            message,
            ...(details && { details }),
        },
        meta: {
            timestamp: new Date().toISOString(),
        },
    };
}

// Error code to HTTP status mapping
export const ERROR_CODE_TO_STATUS: Record<AuthErrorCode, number> = {
    [AUTH_ERROR_CODES.VALIDATION_ERROR]: 400,
    [AUTH_ERROR_CODES.INVALID_CREDENTIALS]: 401,
    [AUTH_ERROR_CODES.USER_EXISTS]: 409,
    [AUTH_ERROR_CODES.USER_NOT_FOUND]: 404,
    [AUTH_ERROR_CODES.TOKEN_EXPIRED]: 401,
    [AUTH_ERROR_CODES.TOKEN_INVALID]: 400,
    [AUTH_ERROR_CODES.MISSING_REQUIRED_FIELDS]: 400,
    [AUTH_ERROR_CODES.WEAK_PASSWORD]: 400,
    [AUTH_ERROR_CODES.UNAUTHORIZED]: 401,
    [AUTH_ERROR_CODES.FORBIDDEN]: 403,
    [AUTH_ERROR_CODES.RATE_LIMITED]: 429,
    [AUTH_ERROR_CODES.INTERNAL_ERROR]: 500,
    [AUTH_ERROR_CODES.SERVICE_UNAVAILABLE]: 503,
    [AUTH_ERROR_CODES.DATABASE_ERROR]: 500,
    [AUTH_ERROR_CODES.EMAIL_SEND_FAILED]: 500,
};

// Auth Result type for server actions
export interface AuthActionResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: {
        code: AuthErrorCode;
        message: string;
    };
}

export function createAuthSuccess<T>(data?: T): AuthActionResult<T> {
    return {
        success: true,
        ...(data !== undefined && { data }),
    };
}

export function createAuthError(
    code: AuthErrorCode,
    message: string
): AuthActionResult<never> {
    return {
        success: false,
        error: {
            code,
            message,
        },
    };
}
