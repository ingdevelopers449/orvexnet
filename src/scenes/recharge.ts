import { Scenes, Markup } from 'telegraf';
import { supabase } from '../config/supabase';
import { BinancePayService } from '../services/binance';

const binanceService = new BinancePayService();
const removeKeyboard = Markup.removeKeyboard();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const rechargeScene = new Scenes.WizardScene(
  'RECHARGE_SCENE',
  // Paso 1: Mostrar instrucciones directamente
  async (ctx) => {
    // Obtener configuración de la DB
    let payId = '372194191';
    let binanceName = 'ORVEX_NET';

    const { data: configRows } = await supabase.from('configuracion_bot').select('clave, valor').in('clave', ['binance_pay_id', 'binance_pay_name']);
    
    if (configRows) {
      const payIdRow = configRows.find(r => r.clave === 'binance_pay_id');
      const nameRow = configRows.find(r => r.clave === 'binance_pay_name');
      if (payIdRow && payIdRow.valor) payId = payIdRow.valor;
      if (nameRow && nameRow.valor) binanceName = nameRow.valor;
    }

    const instrucciones = `💰 *Deposito Binance Pay*

*Pay ID:* \`${payId}\`
*Nombre Binance:* \`${binanceName}\`

✅ Envia el monto exacto en USDT al Pay ID de arriba.
✅ Copia tu Binance Order ID.
✅ Pega tu Binance Order ID aqui.

⚠️ *Solo se acreditaran pagos confirmados enviados a este Binance Pay ID.*

🎁 *Bonus:*

$50+ ➔ +2%
$100+ ➔ +5%

*Envia tu Binance Order ID abajo:*`;

    await ctx.reply(instrucciones, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🆔 ¿Dónde encuentro el Order ID?', 'help_order_id')],
        [Markup.button.callback('❌ Cancelar', 'cancel_recharge')]
      ])
    });

    return ctx.wizard.next();
  },
  // Paso 2: Recibir ID y Validar con Animación
  async (ctx) => {
    // Manejar botón de cancelar o ayuda
    // @ts-ignore
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      // @ts-ignore
      if (ctx.callbackQuery.data === 'cancel_recharge') {
        await ctx.answerCbQuery('Cancelado');
        await ctx.editMessageReplyMarkup(undefined);
        await ctx.reply('Recarga cancelada.', removeKeyboard);
        return ctx.scene.leave();
      }
      // @ts-ignore
      if (ctx.callbackQuery.data === 'help_order_id') {
        await ctx.answerCbQuery();
        await ctx.reply('El Order ID es una serie de números que Binance te muestra en el recibo de tu pago exitoso (ej. 1234567890123456). Copia y pega solo los números aquí.');
        return; // No avanzamos, nos quedamos esperando el texto
      }
    }

    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const txId = ctx.message.text.trim();
      
      // Animación de barra de progreso
      const loadingMsg = await ctx.reply('⏳ Iniciando verificación...');
      
      const frames = [
        '⏳ Verificando pago... [■□□□□□□□□□] 10%',
        '⏳ Conectando con Binance... [■■■□□□□□□□] 30%',
        '⏳ Buscando transacción... [■■■■■□□□□□] 50%',
        '⏳ Analizando montos... [■■■■■■■□□□] 75%',
        '⏳ Finalizando validación... [■■■■■■■■■■] 100%'
      ];

      for (const frame of frames) {
        await ctx.telegram.editMessageText(ctx.chat?.id, loadingMsg.message_id, undefined, frame);
        await sleep(600); // 0.6 segundos por frame para que se vea bien
      }

      // Obtener usuario
      const { data: user } = await supabase.from('usuarios').select('id, saldo').eq('id_telegram', ctx.from?.id).single();
      
      if (!user) {
        await ctx.telegram.editMessageText(ctx.chat?.id, loadingMsg.message_id, undefined, '❌ Error: Usuario no encontrado en la base de datos.');
        return ctx.scene.leave();
      }

      // Validar con Binance
      const orderInfo = await binanceService.queryOrder(undefined, txId);
      
      let isValid = false;
      let amountPaid = 0;
      
      if (orderInfo && binanceService.isPaymentSuccessful(orderInfo)) {
          amountPaid = parseFloat(orderInfo.data.orderAmount);
          const currency = orderInfo.data.currency;
          
          if (amountPaid > 0 && currency === 'USDT') {
              isValid = true;
          }
      }

      if (isValid) {
        // Calcular bonus
        let bonusPercent = 0;
        if (amountPaid >= 100) bonusPercent = 0.05;
        else if (amountPaid >= 50) bonusPercent = 0.02;

        const bonusAmount = amountPaid * bonusPercent;
        const totalUsdt = amountPaid + bonusAmount;
        const newBalance = parseFloat(user.saldo) + totalUsdt;

        const { error: insertError } = await supabase.from('recargas').insert([{
            id_usuario: user.id,
            monto: amountPaid,
            moneda: 'USDT',
            metodo_pago: 'binance_pay',
            id_transaccion: txId,
            estado: 'aprobada'
        }]);

        if (insertError) {
             if (insertError.code === '23505') { 
                 await ctx.telegram.editMessageText(ctx.chat?.id, loadingMsg.message_id, undefined, '❌ Error: Este Order ID ya ha sido utilizado o acreditado previamente.');
                 return ctx.scene.leave();
             }
             await ctx.telegram.editMessageText(ctx.chat?.id, loadingMsg.message_id, undefined, '❌ Error interno al registrar la recarga en la base de datos.');
             return ctx.scene.leave();
        }

        // Actualizar saldo
        await supabase.from('usuarios').update({ saldo: newBalance }).eq('id', user.id);
        
        // Registrar movimiento
        await supabase.from('movimientos_saldo').insert([{
            id_usuario: user.id,
            tipo_movimiento: 'recarga',
            monto: totalUsdt,
            saldo_anterior: user.saldo,
            saldo_nuevo: newBalance,
            descripcion: `Recarga Binance TX: ${txId} (+Bonus: ${bonusPercent*100}%)`
        }]);

        let successMsg = `✅ *¡RECARGA CONFIRMADA EXITOSAMENTE!*\n\n`;
        successMsg += `🧾 *Order ID:* \`${txId}\`\n`;
        successMsg += `💰 *Monto depositado:* ${amountPaid.toFixed(2)} USD\n`;
        
        if (bonusPercent > 0) {
            successMsg += `🎁 *Bonus aplicado:* +${bonusPercent*100}% (+${bonusAmount.toFixed(2)} USD)\n`;
        }
        
        successMsg += `💵 *Total acreditado:* $${totalUsdt.toFixed(2)} USD\n`;
        successMsg += `💼 *Tu nuevo saldo es:* $${newBalance.toFixed(2)} USD\n\n`;
        successMsg += `🎉 ¡Gracias por confiar en nosotros!`;

        await ctx.telegram.editMessageText(ctx.chat?.id, loadingMsg.message_id, undefined, successMsg, { parse_mode: 'Markdown' });

      } else {
        // Falló validación, guardar pendiente
        const { error: insertError } = await supabase.from('recargas').insert([{
            id_usuario: user.id,
            monto: 0, // No sabemos el monto real
            moneda: 'USDT',
            metodo_pago: 'binance_pay',
            id_transaccion: txId,
            estado: 'pendiente'
        }]);

        if (insertError && insertError.code === '23505') {
            await ctx.telegram.editMessageText(ctx.chat?.id, loadingMsg.message_id, undefined, '❌ Error: Este Order ID ya ha sido registrado previamente.');
            return ctx.scene.leave();
        }

        await ctx.telegram.editMessageText(ctx.chat?.id, loadingMsg.message_id, undefined, '⚠️ *Atención*\n\nNo pudimos verificar tu pago automáticamente en este momento. La recarga ha quedado en estado *pendiente*.\n\nUn administrador revisará este Order ID manualmente a la brevedad.', { parse_mode: 'Markdown' });
      }

      return ctx.scene.leave();
    }
  }
);
