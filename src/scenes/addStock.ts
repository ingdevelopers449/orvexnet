import { Scenes, Markup } from 'telegraf';
import { supabase } from '../config/supabase';

const cancelKeyboard = Markup.keyboard(['❌ Cancelar']).resize();
const removeKeyboard = Markup.removeKeyboard();

export const addStockScene = new Scenes.WizardScene(
  'ADD_STOCK_SCENE',
  // Paso 1: Pedir cantidad de stock
  async (ctx) => {
    // @ts-ignore
    const productId = ctx.scene.session.selectedProductId;
    
    // Obtener info del producto
    const { data: product } = await supabase
      .from('productos')
      .select('*')
      .eq('id', productId)
      .single();
      
    if (!product) {
      await ctx.reply('❌ Producto no encontrado.');
      return ctx.scene.leave();
    }
    
    // @ts-ignore
    ctx.scene.session.productData = product;

    if (product.tipo_entrega === 'automatica' && product.contenido === 'Entrega desde inventario individual') {
        // @ts-ignore
        ctx.scene.session.isDynamic = true;
        await ctx.reply(
            `📦 Has seleccionado: *${product.nombre}*\nStock actual: ${product.stock}\n\nEste es un producto de cuentas individuales. Pega o escribe aquí las credenciales que deseas agregar, *una cuenta por cada línea*.`,
            { parse_mode: 'Markdown', ...cancelKeyboard }
        );
    } else {
        // @ts-ignore
        ctx.scene.session.isDynamic = false;
        await ctx.reply(
          `📦 Has seleccionado: *${product.nombre}*\nStock actual: ${product.stock}\n\nIngresa la cantidad de stock genérico que deseas *agregar* (número):`,
          { parse_mode: 'Markdown', ...cancelKeyboard }
        );
    }
    
    return ctx.wizard.next();
  },
  // Paso 2: Recibir cantidad, mostrar previa y pedir confirmación
  async (ctx) => {
    // @ts-ignore
    if (ctx.message && 'text' in ctx.message) {
      // @ts-ignore
      const text = ctx.message.text;
      if (text === '❌ Cancelar') {
        await ctx.reply('Proceso cancelado.', removeKeyboard);
        return ctx.scene.leave();
      }
      
      // @ts-ignore
      const isDynamic = ctx.scene.session.isDynamic;
      let cantidad = 0;
      let cuentas: string[] = [];

      if (isDynamic) {
          cuentas = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
          cantidad = cuentas.length;
          
          if (cantidad === 0) {
              await ctx.reply('⚠️ No se detectó ninguna cuenta. Asegúrate de pegarlas separadas por salto de línea.');
              return;
          }
          // @ts-ignore
          ctx.scene.session.cuentasToAdd = cuentas;
      } else {
          cantidad = parseInt(text, 10);
          if (isNaN(cantidad) || cantidad <= 0) {
            await ctx.reply('⚠️ Por favor ingresa una cantidad válida mayor a 0.');
            return;
          }
      }
      
      // @ts-ignore
      const product = ctx.scene.session.productData;
      const nuevoStock = product.stock + cantidad;
      
      // @ts-ignore
      ctx.scene.session.stockToAdd = cantidad;
      // @ts-ignore
      ctx.scene.session.nuevoStock = nuevoStock;

      const previewText = `📦 *Actualización de inventario*

Producto: ${product.nombre}

Stock anterior: ${product.stock}
Stock agregado: ${cantidad}
Nuevo stock: ${nuevoStock}

¿Confirmas esta actualización?`;

      // Truco para quitar el teclado de sistema y luego enviar el inline
      const tempMsg = await ctx.reply('Procesando...', removeKeyboard);
      try { await ctx.deleteMessage(tempMsg.message_id); } catch(e) {}

      await ctx.reply(previewText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Confirmar y Actualizar', 'confirm_stock')],
          [Markup.button.callback('❌ Cancelar', 'cancel_stock')]
        ])
      });
      
      return ctx.wizard.next();
    }
  },
  // Paso 3: Procesar confirmación
  async (ctx) => {
    // @ts-ignore
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      // @ts-ignore
      const action = ctx.callbackQuery.data;
      if (action === 'cancel_stock') {
        await ctx.answerCbQuery('Cancelado');
        await ctx.editMessageReplyMarkup(undefined);
        await ctx.reply('Actualización cancelada.');
        return ctx.scene.leave();
      } else if (action === 'confirm_stock') {
        await ctx.answerCbQuery('Actualizando...');
        
        // @ts-ignore
        const product = ctx.scene.session.productData;
        // @ts-ignore
        const cantidad = ctx.scene.session.stockToAdd;
        // @ts-ignore
        const nuevoStock = ctx.scene.session.nuevoStock;
        // @ts-ignore
        const isDynamic = ctx.scene.session.isDynamic;
        // @ts-ignore
        const cuentasToAdd: string[] = ctx.scene.session.cuentasToAdd || [];
        
        // Si es inventario dinámico, insertar cada cuenta
        if (isDynamic && cuentasToAdd.length > 0) {
            const inserts = cuentasToAdd.map(c => ({
                id_producto: product.id,
                contenido: c,
                vendido: false
            }));
            const { error: invErr } = await supabase.from('inventario_cuentas').insert(inserts);
            if (invErr) {
                console.error(invErr);
                await ctx.reply('❌ Ocurrió un error al guardar las cuentas dinámicas en la base de datos.');
                return ctx.scene.leave();
            }
        }

        // Actualizar el stock total en el producto
        const { error: updateError } = await supabase
          .from('productos')
          .update({ stock: nuevoStock })
          .eq('id', product.id);

        if (updateError) {
          console.error(updateError);
          await ctx.reply('❌ Ocurrió un error al actualizar el contador de stock.');
          return ctx.scene.leave();
        }

        // Registrar movimiento
        await supabase.from('movimientos_inventario').insert([{
            id_producto: product.id,
            cantidad: cantidad,
            tipo_movimiento: 'entrada',
            stock_anterior: product.stock,
            stock_nuevo: nuevoStock,
            id_administrador: ctx.from?.id
        }]);

        await ctx.editMessageReplyMarkup(undefined);
        
        await ctx.reply(`✅ Inventario actualizado.\n\n¿Deseas enviar una notificación a los clientes?`, Markup.inlineKeyboard([
            [Markup.button.callback('📢 Sí, notificar', `notify_stock_${product.id}`)],
            [Markup.button.callback('❌ No notificar', 'notify_none')]
        ]));

        return ctx.scene.leave();
      }
    }
  }
);
