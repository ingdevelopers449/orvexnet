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
            try {
                await this.bot.telegram.sendPhoto(user.id_telegram, photoUrl, {
                  caption: messageText,
                  parse_mode: 'HTML',
                  reply_markup: replyMarkup
                });
            } catch (photoErr: any) {
                try {
                    await this.bot.telegram.sendAnimation(user.id_telegram, photoUrl, {
                      caption: messageText,
                      parse_mode: 'HTML',
                      reply_markup: replyMarkup
                    });
                } catch (animErr: any) {
                    await this.bot.telegram.sendMessage(user.id_telegram, messageText, {
                      parse_mode: 'HTML',
                      reply_markup: replyMarkup
                    });
                }
            }
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
          console.error(`Error enviando notificación a ${user.id_telegram}:`, err);
          failCount++;
        }
      });

      await Promise.all(promises);
      
      // Esperar 1 segundo antes del siguiente lote para no saturar la API
      if (i + BATCH_SIZE < users.length) {
        await sleep(1000);
      }
    }

    // 3. Enviar también al Canal Oficial (si está configurado)
    try {
      const { data: configRow } = await supabase.from('configuracion_bot').select('valor').eq('clave', 'canal_telegram').single();
      const canal = configRow?.valor;
      if (canal) {
        const channelId = canal.startsWith('-') || canal.startsWith('@') ? canal : `@${canal}`;
        // Enviar al canal tratando foto, animacion y luego texto plano
        if (photoUrl) {
           try {
               await this.bot.telegram.sendPhoto(channelId, photoUrl, { caption: messageText, parse_mode: 'HTML' });
           } catch (photoErr) {
               try {
                   await this.bot.telegram.sendAnimation(channelId, photoUrl, { caption: messageText, parse_mode: 'HTML' });
               } catch (animErr) {
                   await this.bot.telegram.sendMessage(channelId, messageText, { parse_mode: 'HTML' });
               }
           }
        } else {
           await this.bot.telegram.sendMessage(channelId, messageText, { parse_mode: 'HTML' });
        }
      }
    } catch (e) {
      console.error('Error enviando notificación al canal:', e);
    }

    return { successCount, failCount };
  }

  // Genera el diseño premium idéntico al solicitado
  private formatPremiumMessage(product: any) {
      return `🛍️ <b>NUEVO INGRESO — STOCK LIMITADO</b> 👑

🌐 <b>${product.nombre}</b>

🚪 <b>Precio de venta:</b> <code>$${product.precio} USD</code>
📦 <b>Disponibles:</b> <code>${product.stock}</code>

🔔 <i>¡Apresúrate antes de que se agote!</i>`;
  }

  async sendNewProductNotification(productId: string) {
    const { data: product } = await supabase.from('productos').select('*').eq('id', productId).single();
    if (!product) return;

    const message = this.formatPremiumMessage(product);

    const markup = Markup.inlineKeyboard([
      Markup.button.callback(`🌐 Comprar ${product.nombre}`, `view_product_${product.id}`)
    ]).reply_markup;

    return this.broadcastToAll(message, markup, product.imagen_url);
  }

  async sendNewStockNotification(productId: string) {
    const { data: product } = await supabase.from('productos').select('*').eq('id', productId).single();
    if (!product) return;

    const message = this.formatPremiumMessage(product);

    const markup = Markup.inlineKeyboard([
      Markup.button.callback(`🌐 Comprar ${product.nombre}`, `view_product_${product.id}`)
    ]).reply_markup;

    return this.broadcastToAll(message, markup, product.imagen_url);
  }
}
