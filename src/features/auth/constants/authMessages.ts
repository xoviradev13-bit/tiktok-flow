/**
 * Centralized authentication messages for user-friendly error handling.
 * These messages should be used instead of raw API error messages
 * to provide a consistent and professional user experience.
 */

export const AUTH_MESSAGES = {
    SUCCESS: {
        LOGIN: "Chào mừng bạn quay trở lại! Bạn đã đăng nhập thành công.",
        REGISTER: "Đăng ký tài khoản thành công! Đang chuyển hướng...",
        MAGIC_LINK_SENT: "Đã gửi liên kết Magic link! Vui lòng kiểm tra hộp thư email của bạn.",
        PASSWORD_RESET_REQUESTED: "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi liên kết đặt lại mật khẩu đến bạn.",
        PASSWORD_RESET_SUCCESS: "Cập nhật mật khẩu thành công! Đang chuyển hướng đến trang đăng nhập...",
    },
    ERROR: {
        // Login errors
        INVALID_CREDENTIALS: "Email hoặc mật khẩu bạn nhập không chính xác.",
        TOKEN_EXPIRED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
        ACCOUNT_LOCKED: "Tài khoản của bạn đã bị quản trị viên chặn quyền truy cập. Vui lòng liên hệ Quản trị viên để được hỗ trợ.",
        INVITATION_REQUIRED: "Hệ thống chỉ dành cho Quản trị viên và thành viên đã được mời. Vui lòng liên hệ Admin để nhận thư mời tham gia.",
        WRONG_ACCOUNT: "Tài khoản hiện tại không khớp với email nhận thư mời. Vui lòng chuyển sang đúng tài khoản được mời.",

        // Registration errors
        USER_EXISTS: "Tài khoản với email này đã tồn tại trên hệ thống.",
        REGISTRATION_FAILED: "Không thể tạo tài khoản. Vui lòng thử lại.",

        // Password errors
        WEAK_PASSWORD: "Mật khẩu phải có ít nhất 8 ký tự bao gồm chữ hoa, chữ thường và chữ số.",
        PASSWORDS_NOT_MATCH: "Mật khẩu xác nhận không khớp.",
        PASSWORD_RESET_FAILED: "Không thể đặt lại mật khẩu. Vui lòng thử lại.",

        // Token/Link errors
        INVALID_TOKEN: "Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.",
        MAGIC_LINK_FAILED: "Không thể gửi liên kết Magic link. Vui lòng thử lại.",

        // OAuth errors
        GOOGLE_CONNECT_FAILED: "Không thể kết nối với Google. Vui lòng thử lại.",
        OAUTH_FAILED: "Không thể đăng nhập bằng phương thức này. Vui lòng thử lại.",
        OAUTH_ACCOUNT_NOT_LINKED: "Email này đã được đăng ký bằng mật khẩu hoặc phương thức khác. Vui lòng đăng nhập bằng mật khẩu để hoàn tất liên kết tài khoản.",

        // Network/Server errors
        NETWORK_ERROR: "Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng của bạn.",
        SERVER_ERROR: "Đã xảy ra sự cố từ phía máy chủ. Vui lòng thử lại sau.",
        GENERIC: "Đã xảy ra lỗi. Vui lòng thử lại.",
    },
    WARNING: {
        WEAK_PASSWORD: "Mật khẩu phải có ít nhất 8 ký tự bao gồm chữ hoa, chữ thường và chữ số.",
    },
    INFO: {
        REDIRECTING: "Đang chuyển hướng...",
        CHECK_EMAIL: "Vui lòng kiểm tra hộp thư email để nhận hướng dẫn tiếp theo.",
    },
} as const;

// Type for accessing messages
export type AuthMessageKey = keyof typeof AUTH_MESSAGES;
export type SuccessMessageKey = keyof typeof AUTH_MESSAGES.SUCCESS;
export type ErrorMessageKey = keyof typeof AUTH_MESSAGES.ERROR;
export type WarningMessageKey = keyof typeof AUTH_MESSAGES.WARNING;
export type InfoMessageKey = keyof typeof AUTH_MESSAGES.INFO;

/**
 * Maps API error codes to user-friendly messages.
 * Use this to convert backend error codes to display messages.
 */
export const ERROR_CODE_TO_MESSAGE: Record<string, string> = {
    // Standard API error codes
    VALIDATION_ERROR: AUTH_MESSAGES.ERROR.GENERIC,
    INVALID_CREDENTIALS: AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS,
    USER_EXISTS: AUTH_MESSAGES.ERROR.USER_EXISTS,
    USER_NOT_FOUND: AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS, // Don't reveal user existence
    TOKEN_EXPIRED: AUTH_MESSAGES.ERROR.TOKEN_EXPIRED,
    TOKEN_INVALID: AUTH_MESSAGES.ERROR.INVALID_TOKEN,
    MISSING_REQUIRED_FIELDS: AUTH_MESSAGES.ERROR.GENERIC,
    WEAK_PASSWORD: AUTH_MESSAGES.ERROR.WEAK_PASSWORD,
    UNAUTHORIZED: AUTH_MESSAGES.ERROR.TOKEN_EXPIRED,
    FORBIDDEN: AUTH_MESSAGES.ERROR.GENERIC,
    ACCOUNT_LOCKED: AUTH_MESSAGES.ERROR.ACCOUNT_LOCKED,
    RATE_LIMITED: AUTH_MESSAGES.ERROR.ACCOUNT_LOCKED,
    INTERNAL_ERROR: AUTH_MESSAGES.ERROR.SERVER_ERROR,
    SERVICE_UNAVAILABLE: AUTH_MESSAGES.ERROR.SERVER_ERROR,
    DATABASE_ERROR: AUTH_MESSAGES.ERROR.SERVER_ERROR,
    EMAIL_SEND_FAILED: AUTH_MESSAGES.ERROR.SERVER_ERROR,

    // NextAuth error codes
    Configuration: AUTH_MESSAGES.ERROR.SERVER_ERROR,
    AccessDenied: AUTH_MESSAGES.ERROR.INVITATION_REQUIRED,
    InvitationRequired: AUTH_MESSAGES.ERROR.INVITATION_REQUIRED,
    WrongAccount: AUTH_MESSAGES.ERROR.WRONG_ACCOUNT,
    Verification: AUTH_MESSAGES.ERROR.INVALID_TOKEN,
    OAuthSignin: AUTH_MESSAGES.ERROR.OAUTH_FAILED,
    OAuthCallback: AUTH_MESSAGES.ERROR.OAUTH_FAILED,
    OAuthCreateAccount: AUTH_MESSAGES.ERROR.OAUTH_FAILED,
    EmailCreateAccount: AUTH_MESSAGES.ERROR.REGISTRATION_FAILED,
    Callback: AUTH_MESSAGES.ERROR.GENERIC,
    OAuthAccountNotLinked: AUTH_MESSAGES.ERROR.OAUTH_ACCOUNT_NOT_LINKED,
    EmailSignin: AUTH_MESSAGES.ERROR.MAGIC_LINK_FAILED,
    CredentialsSignin: AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS,
    SessionRequired: AUTH_MESSAGES.ERROR.TOKEN_EXPIRED,
    Default: AUTH_MESSAGES.ERROR.GENERIC,
};

/**
 * Get a user-friendly error message from an error code or raw message.
 * Falls back to generic error if code is not recognized.
 */
export function getUserFriendlyMessage(
    errorCodeOrMessage: string | undefined | null,
    fallback: string = AUTH_MESSAGES.ERROR.GENERIC
): string {
    if (!errorCodeOrMessage) return fallback;

    // Check if it's a known error code
    if (ERROR_CODE_TO_MESSAGE[errorCodeOrMessage]) {
        return ERROR_CODE_TO_MESSAGE[errorCodeOrMessage];
    }

    // Check for common error patterns in raw messages
    const lowerMessage = errorCodeOrMessage.toLowerCase();

    if (lowerMessage.includes('already exists') || lowerMessage.includes('duplicate') || lowerMessage.includes('đã tồn tại')) {
        return AUTH_MESSAGES.ERROR.USER_EXISTS;
    }
    if (lowerMessage.includes('invalid') && (lowerMessage.includes('credentials') || lowerMessage.includes('password'))) {
        return AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS;
    }
    if (lowerMessage.includes('expired') || lowerMessage.includes('hết hạn')) {
        return AUTH_MESSAGES.ERROR.TOKEN_EXPIRED;
    }
    if (lowerMessage.includes('not found') || lowerMessage.includes('không tìm thấy')) {
        return AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS;
    }
    if (lowerMessage.includes('network') || lowerMessage.includes('connection') || lowerMessage.includes('kết nối')) {
        return AUTH_MESSAGES.ERROR.NETWORK_ERROR;
    }
    if (lowerMessage.includes('server') || lowerMessage.includes('internal') || lowerMessage.includes('máy chủ')) {
        return AUTH_MESSAGES.ERROR.SERVER_ERROR;
    }

    // Return fallback for unrecognized errors
    return fallback;
}
