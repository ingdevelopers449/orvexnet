import { Telegraf, Markup } from 'telegraf';
import { supabase } from '../config/supabase';
import { config } from '../config/env';

// Helper function para pausar la ejecución (evitar rate limits)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class NotificationService {
  private bot: Telegraf;

  constructor(bot: Telegraf) {
    this.bot = bot;
  }

  /**
   * Envía un mensaje masivo a todos los usuarios activos, respetando límites de Telegram
   */
  async broadcastToAll(messageText: string, replyMarkup?: any, photoUrl?: string) {
    // 1. Obtener todos los usuarios activos
    const { data: users, error } = await supabase
      .from('usuarios')
      .select('id, id_telegram')
      .eq('activo', true)
      .eq('bloqueado', false);

    if (error || !users) {
      console.error('Error fetching users for broadcast', error);
      return;
    }

    let successCount = 0;
    let failCount = 0;

    // 2. Enviar en lotes (Telegram permite ~30 msgs/sec, somos conservadores usando 20)
    const BATCH_SIZE = 20;
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      
      const promises = batch.map(async (user) => {
        try {
          if (photoUrl) {
            await this.bot.telegram.sendPhoto(user.id_telegram, photoUrl, {
              caption: messageText,
              parse_mode: 'HTML',
              reply_markup: replyMarkup
            });
          } else {
            await this.bot.telegram.sendMessage(user.id_telegram, messageText, {
              parse_mode: 'HTML',
              reply_markup: replyMarkup
            });
          }
          successCount++;
        } catch (err: any) {
          // Manejar bloqueos o errores de Telegram
          if (err.code === 403) {
            // El usuario bloqueó al bot, lo marcamos en la DB
            await supabase.from('usuarios').update({ bloqueado: true }).eq('id', user.id);
          }
          failCount++;
        }
      });

      await Promise.all(promises);
      
      // Esperar 1 segundo antes del siguiente lote para no saturar la API
      if (i + BATCH_SIZE < users.length) {
        await sleep(1000);
      }
    }

    return { successCount, failCount };
  }

  async sendNewProductNotification(productId: string) {
    const { data: product } = await supabase.from('productos').select('*').eq('id', productId).single();
    if (!product) return;

    const message = `<b>ORVEX SHOP</b>
🔥 HOT!

▶️ <b>${product.nombre} NEW STOCK</b>

🔥 Available: ${product.stock}
💰 Price: From $${product.precio} USDT

💠 Buy now:
@${this.bot.botInfo?.username || 'ORVEXNET_BOT'}`;

    const markup = Markup.inlineKeyboard([
      Markup.button.callback('🛒 Buy Now', `buy_product_${product.id}`)
    ]).reply_markup;

    return this.broadcastToAll(message, markup, product.imagen_url);
  }

  async sendNewStockNotification(productId: string) {
    const { data: product } = await supabase.from('productos').select('*').eq('id', productId).single();
    if (!product) return;

    const message = `<b>ORVEX SHOP</b>
🔥 HOT!

▶️ <b>${product.nombre} NEW STOCK</b>

🔥 Available: ${product.stock}
💰 Price: From $${product.precio} USDT

💠 Buy now:
@${this.bot.botInfo?.username || 'ORVEXNET_BOT'}`;

    const markup = Markup.inlineKeyboard([
      Markup.button.callback(`🛒 Buy Now`, `buy_product_${product.id}`)
    ]).reply_markup;

    return this.broadcastToAll(message, markup, product.imagen_url);
  }
}
