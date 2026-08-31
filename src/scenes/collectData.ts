import { Scenes, Markup } from 'telegraf';
import { supabase } from '../config/supabase';
import { t } from '../locales/i18n';

// Escena para recolectar datos adicionales (como correo) de un usuario
export const collectDataScene = new Scenes.WizardScene(
  'COLLECT_DATA_SCENE',
  
  // Paso 1: Pedir los datos
  async (ctx) => {
    // @ts-ignore
    const state = ctx.wizard.state as any;
    const { orderId, productName } = state;
    
    await ctx.reply(`🛒 <b>COMPLETAR ORDEN</b>\n━━━━━━━━━━━━━━━━━━\n\nEl producto <b>${productName}</b> requiere información adicional para la entrega (por ejemplo, tu correo electrónico).\n\n👇 <b>Por favor, envía a continuación el dato solicitado:</b>`, {
        parse_mode: 'HTML',
        ...Markup.keyboard(['❌ Cancelar']).resize()
    });
    return ctx.wizard.next();
  },
  
  // Paso 2: Recibir dato y confirmar
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text.trim();
      if (text === '❌ Cancelar') {
        await ctx.reply('Has cancelado la recolección de datos. Contacta a soporte para darles la información de tu orden manualmente.', Markup.removeKeyboard());
        return ctx.scene.leave();
      }

      // @ts-ignore
      ctx.wizard.state.userData = text;

      const msg = `📝 <b>CONFIRMAR DATOS</b>\n\nHas ingresado lo siguiente:\n<pre>${text}</pre>\n\n¿La información es correcta?`;
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirmar y Enviar', 'confirm_data')],
        [Markup.button.callback('✏️ Editar (Volver a escribir)', 'edit_data')]
      ]);

      await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
      return ctx.wizard.next();
    }
  },

  // Paso 3: Procesar confirmación o edición
  async (ctx) => {
    // @ts-ignore
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      // @ts-ignore
      const action = ctx.callbackQuery.data;
      
      if (action === 'edit_data') {
        await ctx.answerCbQuery('Por favor, escribe de nuevo.');
        await ctx.editMessageText('Por favor, <b>escribe nuevamente</b> el dato solicitado:', { parse_mode: 'HTML' });
        // @ts-ignore
        ctx.wizard.selectStep(1); // Volver al paso de esperar texto
        return;
      }

      if (action === 'confirm_data') {
        await ctx.answerCbQuery('Confirmado, enviando orden...');
        await ctx.editMessageReplyMarkup(undefined);
        await ctx.reply('⏳ Procesando...', Markup.removeKeyboard());

        // @ts-ignore
        const state = ctx.wizard.state as any;
        const { orderId, userData, adminAlertMsg, product, qty, totalPrice, newBalance, telegramId } = state;

        // 1. Guardar en base de datos
        await supabase.from('compras').update({ datos_usuario: userData }).eq('id', orderId);

        // 2. Modificar el mensaje de admin para incluir los datos
        const finalAdminMsg = adminAlertMsg.replace(
          '⚠️ <b>Por favor, atiende este pedido lo más pronto posible.</b>',
          `📝 <b>DATOS DEL CLIENTE:</b>\n<pre>${userData}</pre>\n\n⚠️ <b>Por favor, atiende este pedido lo más pronto posible.</b>`
        );

        // 3. Enviar mensaje de alerta al administrador (copiado del userController)
        try {
            const { data: configRow } = await supabase.from('configuracion_bot').select('valor').eq('clave', 'canal_ventas').single();
            const canalVentas = configRow?.valor;
            const { data: admins } = await supabase.from('administradores').select('id_telegram').eq('activo', true);
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.url('👤 Contactar Usuario', `tg://user?id=${telegramId}`)],
                [Markup.button.url('💬 Enviar Respuesta', `https://t.me/${ctx.botInfo?.username || 'bot'}?start=reply_${orderId}`)],
                [Markup.button.callback('✅ Marcar como Entregado', `mark_delivered_${orderId}`)]
            ]);

            if (canalVentas) {
                const targetChannel = canalVentas.startsWith('-') ? parseInt(canalVentas, 10) : (canalVentas.startsWith('@') ? canalVentas : `@${canalVentas}`);
                await ctx.telegram.sendMessage(targetChannel, finalAdminMsg, { parse_mode: 'HTML', ...keyboard }).catch(console.error);
            } else if (admins && admins.length > 0) {
                for (const admin of admins) {
                    await ctx.telegram.sendMessage(admin.id_telegram, finalAdminMsg, { parse_mode: 'HTML', ...keyboard }).catch(() => {});
                }
            }
        } catch (err) {
            console.error('Error enviando alerta con datos:', err);
        }

        // 4. Mostrar el mensaje de éxito final al usuario
        let mensajeExito = `✅ <b>${t(ctx, 'buy_success')}</b> ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━
🧾 <b>${t(ctx, 'order_id')}</b> <code>#${orderId.substring(0,8).toUpperCase()}</code>
🛍️ <b>${t(ctx, 'product_label')}</b> <code>${product.nombre} (x${qty})</code>

<blockquote>💰 <b>${t(ctx, 'amount_paid')}</b> <code>$${totalPrice.toFixed(2)} USD</code>
💳 <b>${t(ctx, 'balance_remaining')}</b> <code>$${newBalance.toFixed(2)} USD</code></blockquote>
━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        mensajeExito += `⏳ <b>${t(ctx, 'manual_delivery_title')}</b>\n`;
        mensajeExito += `<i>Tus datos han sido enviados al vendedor. ${t(ctx, 'thanks_for_buying')}</i>`;

        let userButtons = [
            [Markup.button.callback('🛍️ ' + t(ctx, 'btn_continue_buying'), 'user_catalog')],
            [Markup.button.callback('🔙 ' + t(ctx, 'btn_back_menu'), 'user_back')]
        ];

        await ctx.reply(mensajeExito, { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(userButtons)
        });

        return ctx.scene.leave();
      }
    }
  }
);
