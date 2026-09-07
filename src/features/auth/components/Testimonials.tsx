import { useTranslation } from "react-i18next";
import React from 'react';

const testimonials = [
  { id: 1, name: "Thanh Hằng", handle: "@hangdigital", rating: 5, quote: "Nền tảng tuyệt vời! Trải nghiệm mượt mà và các tính năng checklist, quét GPM cực kỳ sát với nhu cầu vận hành dàn acc." },
  { id: 2, name: "Minh Tuấn", handle: "@tuantiktok", rating: 5, quote: "Hệ thống giúp tối ưu hóa toàn bộ quy trình chấm công nhân sự và kiểm soát doanh thu từng tài khoản chính xác theo thời gian thực." },
  { id: 3, name: "Quốc Bảo", handle: "@baomedia", rating: 5, quote: "Đã thử qua nhiều giải pháp nhưng TIKTOKFLOW vượt trội hơn hẳn. Trực quan, ổn định và tăng hiệu suất team rõ rệt." },
];

const StarRating = ({ rating }: { rating: number }) => (
    <div className="flex text-amber-400">
        {[...Array(5)].map((_, i) => (
            <svg key={i} className={`w-4 h-4 fill-current ${i < rating ? 'text-amber-400' : 'text-slate-300 dark:text-slate-700'}`} viewBox="0 0 24 24">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>
        ))}
    </div>
);

const UserCard = ({ name, handle, quote, rating }: { name: string, handle: string, quote: string, rating: number }) => {
    const imagePlaceholder = `https://placehold.co/80x80/ec4899/FFFFFF?text=${name.split(' ')[0][0]}${name.split(' ')[1] ? name.split(' ')[1][0] : ''}`;
    
    return (
        <div className="p-4 flex flex-col bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl shadow-md transition duration-300 hover:shadow-lg h-full">
            <div className="flex items-center mb-3">
                <img 
                    src={imagePlaceholder}
                    alt={name}
                    className="w-11 h-11 rounded-full object-cover mr-3 border-2 border-pink-400"
                />
                <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{name}</h3>
                    <p className="text-xs text-pink-600 dark:text-pink-400 font-medium">{handle}</p>
                </div>
            </div>
            <StarRating rating={rating} />
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 flex-grow leading-relaxed">{quote}</p>
        </div>
    );
};

export const Testimonials = () => {
    const { t } = useTranslation();
    return (
        <div className="mt-12 pt-6 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 text-center">Được tin dùng bởi các Creator & Team Vận Hành</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {testimonials.map((item) => (
                    <UserCard key={item.id} {...item} />
                ))}
            </div>
        </div>
    );
};
