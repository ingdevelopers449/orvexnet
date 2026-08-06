import { Scenes, Markup } from 'telegraf';
import { supabase } from '../config/supabase';
import { BinancePayService } from '../services/binance';

const cancelKeyboard = Markup.keyboard(['❌ Cancelar']).resize();
const removeKeyboard = Markup.removeKeyboard();
const binanceService = new BinancePayService();

export const rechargeScene = new Scenes.WizardScene(
  'RECHARGE_SCENE',
  // Paso 1: Seleccionar método
  async (ctx) => {
    await ctx.reply('💳 *Recargar Saldo*\n\nSelecciona el método de pago:', {
        parse_mode: 'Markdown',
        ...Markup.keyboard([['Binance Pay'], ['❌ Cancelar']]).resize()
    });
    return ctx.wizard.next();
  },
  // Paso 2: Ingresar monto
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text;
      if (text === '❌ Cancelar') {
        await ctx.reply('Recarga cancelada.', removeKeyboard);
        return ctx.scene.leave();
      }
      if (text !== 'Binance Pay') {
        await ctx.reply('Por favor selecciona un método válido.');
        return;
      }
      
      await ctx.reply('Ingresa el *monto* en USDT que deseas recargar (ej. 5.00):', {
          parse_mode: 'Markdown',
          ...cancelKeyboard
      });
      return ctx.wizard.next();
    }
  },
  // Paso 3: Mostrar instrucciones y pedir ID
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text;
      if (text === '❌ Cancelar') {
        await ctx.reply('Recarga cancelada.', removeKeyboard);
        return ctx.scene.leave();
      }
      
      const amount = parseFloat(text.replace(',', '.'));
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('⚠️ Monto inválido. Ingresa un número válido.');
        return;
      }
      // @ts-ignore
      ctx.scene.session.rechargeAmount = amount;

      const instrucciones = `💰 *Instrucciones de Pago*

Por favor envía exactamente *${amount.toFixed(2)} USDT* a través de Binance Pay.

*Pay ID:* \`123456789\` (Reemplaza con tu Pay ID real en la configuración)

Una vez realizado el pago, envíame por aquí el **ID de Transacción** (Transaction ID / Order ID) que te generó Binance.`;

      await ctx.reply(instrucciones, { parse_mode: 'Markdown', ...cancelKeyboard });
      return ctx.wizard.next();
    }
  },
  // Paso 4: Validar pago
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text;
      if (text === '❌ Cancelar') {
        await ctx.reply('Recarga cancelada.', removeKeyboard);
        return ctx.scene.leave();
      }
      
      const txId = text.trim();
      // @ts-ignore
      const amount = ctx.scene.session.rechargeAmount;
      
      await ctx.reply('⏳ Verificando pago con Binance... Por favor espera.', removeKeyboard);

      // Obtener el ID del usuario en DB
      const { data: user } = await supabase.from('usuarios').select('id, saldo').eq('id_telegram', ctx.from?.id).single();
      
      if (!user) {
        await ctx.reply('❌ Error: Usuario no encontrado en la base de datos.');
        return ctx.scene.leave();
      }

      // Validar con la API de Binance
      const orderInfo = await binanceService.queryOrder(undefined, txId); // Suponiendo que txId es el merchantTradeNo o se busca de otra forma
      
      let isValid = false;
      
      if (orderInfo && binanceService.isPaymentSuccessful(orderInfo)) {
          // Extraer monto y moneda real de la orden para validar
          const paidAmount = parseFloat(orderInfo.data.orderAmount);
          const currency = orderInfo.data.currency;
          
          if (paidAmount >= amount && currency === 'USDT') {
              isValid = true;
          }
      }

      if (isValid) {
        // Conversión a COP simulada (ej. 1 USDT = 4000 COP) - Esto debería ser dinámico o configurable
        const conversionRate = 4000;
        const amountCop = amount * conversionRate;
        const newBalance = parseFloat(user.saldo) + amountCop;

        // Insertar recarga y actualizar saldo en una transacción (RPC idealmente, aquí lo hacemos secuencial)
        const { error: insertError } = await supabase.from('recargas').insert([{
            id_usuario: user.id,
            monto: amount,
            moneda: 'USDT',
            metodo_pago: 'binance_pay',
            id_transaccion: txId,
            estado: 'aprobada'
        }]);

        if (insertError) {
             if (insertError.code === '23505') { // UNIQUE constraint violation
                 await ctx.reply('❌ Este ID de transacción ya ha sido utilizado.');
                 return ctx.scene.leave();
             }
             await ctx.reply('❌ Error interno al registrar la recarga.');
             return ctx.scene.leave();
        }

        // Actualizar saldo
        await supabase.from('usuarios').update({ saldo: newBalance }).eq('id', user.id);
        
        // Registrar movimiento
        await supabase.from('movimientos_saldo').insert([{
            id_usuario: user.id,
            tipo_movimiento: 'recarga',
            monto: amountCop,
            saldo_anterior: user.saldo,
            saldo_nuevo: newBalance,
            descripcion: `Recarga vía Binance Pay TX: ${txId}`
        }]);

        await ctx.reply(`✅ *Recarga confirmada*\n\n💰 Monto recibido: ${amount.toFixed(2)} USDT\n💳 Método: Binance Pay\n🧾 ID de transacción: \`${txId}\`\n💰 Saldo actualizado: $${newBalance} COP\n\nGracias por tu recarga.`, { parse_mode: 'Markdown' });

      } else {
        // Falló la validación automática, pasa a pendiente para revisión manual
        const { error: insertError } = await supabase.from('recargas').insert([{
            id_usuario: user.id,
            monto: amount,
            moneda: 'USDT',
            metodo_pago: 'binance_pay',
            id_transaccion: txId,
            estado: 'pendiente'
        }]);

        if (insertError && insertError.code === '23505') {
            await ctx.reply('❌ Este ID de transacción ya ha sido registrado previamente.');
            return ctx.scene.leave();
        }

        await ctx.reply('⚠️ No pudimos verificar tu pago automáticamente en este momento o los datos no coinciden. La recarga ha quedado en estado *pendiente* y será revisada manualmente por un administrador en breve.', { parse_mode: 'Markdown' });
      }

      return ctx.scene.leave();
    }
  }
);
