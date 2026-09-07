export interface EmailTheme {
  brandColor: string;
  buttonText: string;
  backgroundColor: string;
  textColor: string;
  headerColor: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface EmailResponse {
  success: boolean;
  messageId: string;
  timestamp: string;
}

export interface Attachment {
   filename: string;
   content: Buffer | string;
   contentType?: string;
}


export interface BillingEmailData {
  shopName: string;
  planName?: string;
  amount?: number;
  currency?: string;
  nextBillingDate?: string;
  credits?: number;
  usageLimit?: number;
  currentUsage?: number;
  serviceType?: string;
  billingCycle?: string;
  trialEndDate?: string;
  paymentStatus?: string;
}

