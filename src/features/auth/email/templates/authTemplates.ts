import { baseEmailLayout } from './baseLayout';

export const magicLinkTemplate = (url: string) => {
    const content = `
    <h1 class="h1">Đăng nhập vào TIKTOKFLOW</h1>
    <p class="p">Xin chào,</p>
    <p class="p">Chúng tôi đã nhận được yêu cầu đăng nhập nhanh vào tài khoản TIKTOKFLOW của bạn. Nhấn vào nút bên dưới để tiến hành xác thực. Liên kết này sẽ hết hạn sau 10 phút.</p>
  `;
    return baseEmailLayout(content, { url, text: 'Đăng Nhập Ngay' });
};

export const verifyEmailTemplate = (url: string) => {
    const content = `
    <h1 class="h1">Xác thực địa chỉ email</h1>
    <p class="p">Chào mừng bạn đến với TIKTOKFLOW! Vui lòng xác thực địa chỉ email của bạn để bắt đầu sử dụng tài khoản.</p>
  `;
    return baseEmailLayout(content, { url, text: 'Xác Thực Email' });
};

export const resetPasswordTemplate = (url: string) => {
    const content = `
    <h1 class="h1">Khôi phục mật khẩu</h1>
    <p class="p">Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Nếu bạn không thực hiện yêu cầu này, bạn có thể an tâm bỏ qua email.</p>
    <p class="p">Ngược lại, vui lòng nhấn vào nút bên dưới để tiến hành đặt mật khẩu mới.</p>
  `;
    return baseEmailLayout(content, { url, text: 'Đặt Lại Mật Khẩu' });
};
