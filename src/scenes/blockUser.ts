import { Scenes, Markup } from 'telegraf';
import { supabase } from '../config/supabase';

const cancelKeyboard = Markup.keyboard(['❌ Cancelar']).resize();
const removeKeyboard = Markup.removeKeyboard();

export const blockUserScene = new Scenes.WizardScene(
  'BLOCK_USER_SCENE',
  
  // Paso 1: Pedir ID de Telegram
  async (ctx) => {
    await ctx.reply(`🚫 <b>Bloquear Usuario</b>\n\nEscribe el <b>ID de Telegram</b> del usuario que deseas bloquear (ej. 123456789). \n\nSi el usuario ya está bloqueado, esta acción lo <b>Desbloqueará</b>.\n\nPara cancelar, escribe "❌ Cancelar".`, {
      parse_mode: 'HTML',
      ...cancelKeyboard
    });
    return ctx.wizard.next();
  },

  // Paso 2: Procesar bloqueo/desbloqueo
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text.trim();
      
      if (text === '❌ Cancelar' || text.toLowerCase() === 'cancelar') {
        await ctx.reply('Operación cancelada.', removeKeyboard);
        return ctx.scene.leave();
      }

      const telegramId = parseInt(text, 10);
      if (isNaN(telegramId)) {
        await ctx.reply('⚠️ Por favor ingresa un ID numérico válido. (Ej: 123456789)');
        return;
      }

      // Buscar al usuario
      const { data: user } = await supabase.from('usuarios').select('id, bloqueado, nombre').eq('id_telegram', telegramId).single();

      if (!user) {
        await ctx.reply(`❌ No se encontró ningún usuario registrado con el ID ${telegramId}.`, removeKeyboard);
        return ctx.scene.leave();
      }

      // Cambiar estado
      const nuevoEstado = !user.bloqueado;
      const { error } = await supabase.from('usuarios').update({ bloqueado: nuevoEstado }).eq('id', user.id);

      if (error) {
        await ctx.reply('❌ Hubo un error de base de datos al actualizar el estado.', removeKeyboard);
      } else {
        if (nuevoEstado) {
          await ctx.reply(`✅ El usuario <b>${user.nombre}</b> (ID: ${telegramId}) ha sido <b>BLOQUEADO</b> exitosamente.\n\nYa no podrá usar el bot.`, { parse_mode: 'HTML', ...removeKeyboard });
        } else {
          await ctx.reply(`✅ El usuario <b>${user.nombre}</b> (ID: ${telegramId}) ha sido <b>DESBLOQUEADO</b> exitosamente.\n\nYa puede usar el bot nuevamente.`, { parse_mode: 'HTML', ...removeKeyboard });
        }
      }

      return ctx.scene.leave();
    }
  }
);
