import dotenv from 'dotenv';
dotenv.config();

export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  },
  supabase: {
    url: (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, ''),
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  binancePay: {
    apiKey: process.env.BINANCE_PAY_API_KEY || '',
    secretKey: process.env.BINANCE_PAY_SECRET_KEY || '',
    merchantId: process.env.BINANCE_PAY_MERCHANT_ID || '',
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
};

// Validaciones básicas
if (!config.telegram.botToken) {
  console.error("FATAL ERROR: TELEGRAM_BOT_TOKEN is missing.");
}
if (!config.supabase.url || !config.supabase.serviceKey) {
  console.error("FATAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.");
}
