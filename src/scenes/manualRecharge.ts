import { Scenes, Markup } from 'telegraf';
import { supabase } from '../config/supabase';

const cancelKeyboard = Markup.keyboard(['❌ Cancelar']).resize();
const removeKeyboard = Markup.removeKeyboard();

export const manualRechargeScene = new Scenes.WizardScene(
  'MANUAL_RECHARGE_SCENE',
  
  // Paso 1: Pedir el ID de Telegram
  async (ctx) => {
    // @ts-ignore
    ctx.scene.session.rechargeData = {};
    await ctx.reply('💰 *Gestión de Saldos*\n\nPor favor, ingresa el *ID de Telegram* del cliente al que deseas modificarle el saldo:', {
        parse_mode: 'Markdown',
        ...cancelKeyboard
    });
    return ctx.wizard.next();
  },
  
  // Paso 2: Verificar ID y pedir el monto
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text.trim();
      if (text === '❌ Cancelar') {
        await ctx.reply('Proceso cancelado.', removeKeyboard);
        return ctx.scene.leave();
      }

      const telegramId = parseInt(text, 10);
      if (isNaN(telegramId)) {
        await ctx.reply('⚠️ Por favor ingresa un ID numérico válido.');
        return;
      }

      const { data: targetUser, error } = await supabase.from('usuarios').select('*').eq('id_telegram', telegramId).single();
      
      if (error || !targetUser) {
        await ctx.reply('❌ No se encontró ningún usuario registrado con ese ID de Telegram en la base de datos. Verifica el ID e intenta de nuevo.');
        return ctx.scene.leave();
      }

      // @ts-ignore
      ctx.scene.session.rechargeData.targetUser = targetUser;

      await ctx.reply(`👤 *Usuario encontrado:*\nID: \`${targetUser.id_telegram}\`\nSaldo actual: *$${targetUser.saldo} USD*\n\nIngresa el **monto** que deseas sumar a su saldo en USD (ejemplo: \`10.50\`):\n_Nota: Si deseas restarle saldo, usa un número negativo (ejemplo: \`-5\`)._`, {
        parse_mode: 'Markdown'
      });
      
      return ctx.wizard.next();
    }
  },
  
  // Paso 3: Aplicar el monto
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text.replace(',', '.').trim();
      if (text === '❌ Cancelar') {
        await ctx.reply('Proceso cancelado.', removeKeyboard);
        return ctx.scene.leave();
      }

      const monto = parseFloat(text);
      if (isNaN(monto) || monto === 0) {
        await ctx.reply('⚠️ Por favor ingresa un monto válido (diferente de 0).');
        return;
      }

      // @ts-ignore
      const targetUser = ctx.scene.session.rechargeData.targetUser;
      const currentSaldo = parseFloat(targetUser.saldo);
      const newSaldo = currentSaldo + monto;

      // Actualizar en la base de datos
      const { error: updateError } = await supabase.from('usuarios').update({ saldo: newSaldo }).eq('id', targetUser.id);

      if (updateError) {
        console.error(updateError);
        await ctx.reply('❌ Ocurrió un error al actualizar el saldo del usuario.', removeKeyboard);
        return ctx.scene.leave();
      }

      // Registrar el movimiento de saldo
      await supabase.from('movimientos_saldo').insert([{
        id_usuario: targetUser.id,
        tipo_movimiento: monto > 0 ? 'recarga' : 'ajuste',
        monto: Math.abs(monto), // El monto del movimiento siempre en positivo
        saldo_anterior: currentSaldo,
        saldo_nuevo: newSaldo,
        descripcion: `Ajuste manual de administrador`
      }]);

      await ctx.reply(`✅ *Saldo actualizado exitosamente.*\n\nEl usuario \`${targetUser.id_telegram}\` ahora tiene *$${newSaldo.toFixed(2)} USD* en su cuenta.`, { 
          parse_mode: 'Markdown',
          ...removeKeyboard
      });

      // Notificar al cliente
      try {
        let notifMsg = `🔔 *NOTIFICACIÓN DE SALDO*\n\n`;
        if (monto > 0) {
            notifMsg += `Un administrador acaba de agregar *$${monto.toFixed(2)} USD* a tu cuenta.\n`;
        } else {
            notifMsg += `Se ha realizado un ajuste de *-$${Math.abs(monto).toFixed(2)} USD* a tu cuenta.\n`;
        }
        notifMsg += `💰 **Tu nuevo saldo es: $${newSaldo.toFixed(2)} USD**`;

        await ctx.telegram.sendMessage(targetUser.id_telegram, notifMsg, { parse_mode: 'Markdown' });
      } catch (e) {
        console.error('Error notificando al usuario del ajuste de saldo', e);
        await ctx.reply('⚠️ Se actualizó el saldo, pero el usuario no pudo ser notificado (probablemente bloqueó al bot).');
      }

      return ctx.scene.leave();
    }
  }
);
