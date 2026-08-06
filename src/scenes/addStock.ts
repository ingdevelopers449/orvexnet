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

    await ctx.reply(
      `📦 Has seleccionado: *${product.nombre}*\nStock actual: ${product.stock}\n\nIngresa la cantidad de stock que deseas *agregar*:`,
      { parse_mode: 'Markdown', ...cancelKeyboard }
    );
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
      
      const cantidad = parseInt(text, 10);
      if (isNaN(cantidad) || cantidad <= 0) {
        await ctx.reply('⚠️ Por favor ingresa una cantidad válida mayor a 0.');
        return;
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

      await ctx.reply(previewText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Confirmar y Actualizar', 'confirm_stock')],
          [Markup.button.callback('❌ Cancelar', 'cancel_stock')]
        ]),
        ...removeKeyboard
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
        
        // Actualizar en DB y registrar movimiento (usaremos RPC si estuviera definido, o dos inserts secuenciales)
        const { error: updateError } = await supabase
          .from('productos')
          .update({ stock: nuevoStock })
          .eq('id', product.id);

        if (updateError) {
          console.error(updateError);
          await ctx.reply('❌ Ocurrió un error al actualizar el stock.');
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
