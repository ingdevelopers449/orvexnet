import { Scenes, Markup } from 'telegraf';
import { supabase } from '../config/supabase';

const cancelKeyboard = Markup.keyboard(['❌ Cancelar']).resize();
const removeKeyboard = Markup.removeKeyboard();

export const announcementScene = new Scenes.WizardScene(
  'ANNOUNCEMENT_SCENE',
  
  // Paso 1: Pedir el mensaje
  async (ctx) => {
    await ctx.reply(`📢 <b>Enviar Anuncio Global</b>\n\nEscribe el mensaje que deseas enviar a todos los usuarios del bot. Puedes usar formato HTML (como <b>negrita</b> o <i>cursiva</i>).\n\nPara cancelar, escribe "❌ Cancelar".`, {
      parse_mode: 'HTML',
      ...cancelKeyboard
    });
    return ctx.wizard.next();
  },

  // Paso 2: Confirmación
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text;
      if (text === '❌ Cancelar') {
        await ctx.reply('Operación cancelada.', removeKeyboard);
        return ctx.scene.leave();
      }

      // @ts-ignore
      ctx.wizard.state.announcementText = text;

      await ctx.reply(`<b>Vista Previa del Anuncio:</b>\n\n${text}\n\n¿Estás seguro de que deseas enviar este mensaje a TODOS los usuarios registrados?`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Sí, enviar a todos', 'confirm_announcement')],
          [Markup.button.callback('❌ Cancelar', 'cancel_announcement')]
        ])
      });

      return ctx.wizard.next();
    }
  },

  // Paso 3: Enviar
  async (ctx) => {
    // @ts-ignore
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      // @ts-ignore
      const data = ctx.callbackQuery.data;

      if (data === 'cancel_announcement') {
        await ctx.answerCbQuery('Cancelado');
        await ctx.editMessageText('Anuncio cancelado.');
        await ctx.reply('Menú restaurado.', removeKeyboard);
        return ctx.scene.leave();
      }

      if (data === 'confirm_announcement') {
        await ctx.answerCbQuery('Enviando...');
        // @ts-ignore
        const text = ctx.wizard.state.announcementText;

        const { data: users } = await supabase.from('usuarios').select('id_telegram').eq('bloqueado', false);
        
        let successCount = 0;
        let failCount = 0;

        await ctx.editMessageText('⏳ Enviando anuncio en segundo plano...');

        if (users) {
          for (const u of users) {
            try {
              await ctx.telegram.sendMessage(u.id_telegram, text, { parse_mode: 'HTML' });
              successCount++;
            } catch (e) {
              failCount++;
            }
            // Pequeña pausa para evitar límites de Telegram
            await new Promise(resolve => setTimeout(resolve, 50)); 
          }
        }

        await ctx.reply(`✅ <b>Anuncio finalizado</b>\nEnviados con éxito: ${successCount}\nFallidos: ${failCount}`, {
          parse_mode: 'HTML',
          ...removeKeyboard
        });

        return ctx.scene.leave();
      }
    }
  }
);
