import { Scenes, Markup } from 'telegraf';
import { supabase } from '../config/supabase';
import { t } from '../locales/i18n';
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

    let instrucciones = t(ctx, 'recharge_binance_title');
    instrucciones = instrucciones.replace('{payId}', payId).replace('{binanceName}', binanceName);

    await ctx.reply(instrucciones, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(t(ctx, 'recharge_help_btn'), 'help_order_id')],
        [Markup.button.callback(t(ctx, 'recharge_cancel'), 'cancel_recharge')]
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
        await ctx.answerCbQuery(t(ctx, 'btn_cancel').replace('❌ ', ''));
        await ctx.editMessageReplyMarkup(undefined);
        await ctx.reply(t(ctx, 'recharge_cancelled'), removeKeyboard);
        return ctx.scene.leave();
      }
      // @ts-ignore
      if (ctx.callbackQuery.data === 'help_order_id') {
        await ctx.answerCbQuery();
        await ctx.reply(t(ctx, 'recharge_help_msg'), { parse_mode: 'Markdown' });
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

        let successMsg = t(ctx, 'recharge_success').replace('{txId}', txId).replace('${amountPaid}', amountPaid.toFixed(2));
        
        if (bonusPercent > 0) {
            successMsg += t(ctx, 'recharge_bonus').replace('{bonusPercent}', (bonusPercent*100).toString()).replace('${bonusAmount}', bonusAmount.toFixed(2));
        }
        
        let successTotal = t(ctx, 'recharge_success_total');
        successTotal = successTotal.replace('${totalUsdt}', totalUsdt.toFixed(2)).replace('${newBalance}', newBalance.toFixed(2));
        successMsg += successTotal;

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
            await ctx.telegram.editMessageText(ctx.chat?.id, loadingMsg.message_id, undefined, t(ctx, 'recharge_used_id'));
            return ctx.scene.leave();
        }

        await ctx.telegram.editMessageText(ctx.chat?.id, loadingMsg.message_id, undefined, t(ctx, 'recharge_pending'), { parse_mode: 'Markdown' });
      }

      return ctx.scene.leave();
    }
  }
);
