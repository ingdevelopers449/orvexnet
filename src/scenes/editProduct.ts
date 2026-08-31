import { Scenes, Markup } from 'telegraf';
import { supabase } from '../config/supabase';

const cancelKeyboard = Markup.keyboard(['❌ Cancelar']).resize();
const removeKeyboard = Markup.removeKeyboard();

export const editProductScene = new Scenes.WizardScene(
  'EDIT_PRODUCT_SCENE',
  
  // Paso 1: Mostrar lista de productos
  async (ctx) => {
    // @ts-ignore
    const state = ctx.wizard.state as any;
    const action = state.editAction; // 'edit_product', 'change_price', etc.

    const { data: products } = await supabase.from('productos').select('id, nombre');

    if (!products || products.length === 0) {
      await ctx.reply('⚠️ No tienes productos registrados.');
      return ctx.scene.leave();
    }

    let actionName = 'Editar';
    if (action === 'edit_product') actionName = 'Cambiar Nombre';
    if (action === 'change_price') actionName = 'Cambiar Precio';
    if (action === 'change_desc') actionName = 'Cambiar Descripción';
    if (action === 'change_media') actionName = 'Cambiar Imagen/GIF';
    if (action === 'change_req_data') actionName = 'Solicitar Datos (On/Off)';
    if (action === 'activate_prod') actionName = 'Activar';
    if (action === 'deactivate_prod') actionName = 'Desactivar';
    if (action === 'delete_prod') actionName = 'Eliminar';

    const buttons = products.map(p => [Markup.button.callback(`📦 ${p.nombre}`, `edit_target_${p.id}`)]);
    buttons.push([Markup.button.callback('❌ Cancelar', 'cancel_edit')]);

    await ctx.reply(`<b>${actionName} Producto</b>\nSelecciona el producto que deseas modificar:`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });

    return ctx.wizard.next();
  },

  // Paso 2: Recibir selección y procesar o pedir más datos
  async (ctx) => {
    // @ts-ignore
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      // @ts-ignore
      const data = ctx.callbackQuery.data;
      if (data === 'cancel_edit') {
        await ctx.answerCbQuery('Cancelado');
        await ctx.editMessageText('Operación cancelada.');
        return ctx.scene.leave();
      }

      if (data.startsWith('edit_target_')) {
        const productId = data.replace('edit_target_', '');
        await ctx.answerCbQuery();
        
        // @ts-ignore
        const action = ctx.wizard.state.editAction;
        // @ts-ignore
        ctx.wizard.state.targetProductId = productId;

        const { data: product } = await supabase.from('productos').select('*').eq('id', productId).single();
        if (!product) {
          await ctx.reply('❌ Producto no encontrado.');
          return ctx.scene.leave();
        }

        // Acciones directas que no requieren input de texto
        if (action === 'change_req_data') {
          const newState = !product.requiere_datos;
          await supabase.from('productos').update({ requiere_datos: newState }).eq('id', productId);
          await ctx.editMessageText(`✅ El producto <b>${product.nombre}</b> ahora <b>${newState ? 'SÍ' : 'NO'}</b> requiere datos adicionales del cliente al comprar.`, { parse_mode: 'HTML' });
          return ctx.scene.leave();
        }
        
        if (action === 'activate_prod') {
          await supabase.from('productos').update({ activo: true }).eq('id', productId);
          await ctx.editMessageText(`✅ El producto <b>${product.nombre}</b> ha sido activado.`, { parse_mode: 'HTML' });
          return ctx.scene.leave();
        }
        
        if (action === 'deactivate_prod') {
          await supabase.from('productos').update({ activo: false }).eq('id', productId);
          await ctx.editMessageText(`🔴 El producto <b>${product.nombre}</b> ha sido desactivado.`, { parse_mode: 'HTML' });
          return ctx.scene.leave();
        }

        if (action === 'delete_prod') {
          // Confirmación de borrado (para simplificar, lo borramos directo, o lo desactivamos si no queremos perder historial)
          // Usualmente no se debe hacer DELETE si hay FK restrictivas en compras
          const { error } = await supabase.from('productos').delete().eq('id', productId);
          if (error) {
            await ctx.editMessageText(`❌ No se pudo eliminar el producto porque tiene ventas asociadas. Ha sido desactivado en su lugar.`);
            await supabase.from('productos').update({ activo: false }).eq('id', productId);
          } else {
            await ctx.editMessageText(`🗑️ El producto <b>${product.nombre}</b> ha sido eliminado.`, { parse_mode: 'HTML' });
          }
          return ctx.scene.leave();
        }

        // Acciones que requieren input
        if (action === 'edit_product') {
          await ctx.editMessageText(`Escribe el <b>nuevo nombre</b> para el producto:\n(Actual: ${product.nombre})`, { parse_mode: 'HTML' });
        } else if (action === 'change_price') {
          await ctx.editMessageText(`Escribe el <b>nuevo precio</b> para el producto (en USD):\n(Actual: $${product.precio})`, { parse_mode: 'HTML' });
        } else if (action === 'change_desc') {
          await ctx.editMessageText(`Escribe la <b>nueva descripción</b> para el producto:\n(Actual:\n${product.descripcion})`, { parse_mode: 'HTML' });
        } else if (action === 'change_media') {
          await ctx.editMessageText(`Envía la <b>nueva imagen, GIF o URL</b> para el producto:\n(O escribe "borrar" para quitarla)`, { parse_mode: 'HTML' });
        }

        // Mostrar teclado de cancelar para texto
        const msg = await ctx.reply('Puedes escribir "❌ Cancelar" para abortar.', cancelKeyboard);
        // @ts-ignore
        ctx.wizard.state.cancelMsgId = msg.message_id;

        return ctx.wizard.next();
      }
    }
  },

  // Paso 3: Recibir input de texto
  async (ctx) => {
    // @ts-ignore
    if (ctx.message) {
      // @ts-ignore
      const text = ctx.message.text || '';
      // @ts-ignore
      const photo = ctx.message.photo;
      // @ts-ignore
      const animation = ctx.message.animation;
      
      if (text.toLowerCase() === 'cancelar' || text === '❌ Cancelar') {
        await ctx.reply('Operación cancelada.', removeKeyboard);
        return ctx.scene.leave();
      }

      // @ts-ignore
      const action = ctx.wizard.state.editAction;
      // @ts-ignore
      const productId = ctx.wizard.state.targetProductId;
      let updateData = {};
      let successMsg = '';

      if (action === 'edit_product') {
        updateData = { nombre: text };
        successMsg = `✅ Nombre actualizado a: <b>${text}</b>`;
      } else if (action === 'change_price') {
        const newPrice = parseFloat(text);
        if (isNaN(newPrice) || newPrice < 0) {
          await ctx.reply('⚠️ Por favor, envía un número válido mayor o igual a 0.');
          return;
        }
        updateData = { precio: newPrice };
        successMsg = `✅ Precio actualizado a: <b>$${newPrice} USD</b>`;
      } else if (action === 'change_desc') {
        updateData = { descripcion: text };
        successMsg = `✅ Descripción actualizada.`;
      } else if (action === 'change_media') {
        if (text.toLowerCase() === 'borrar') {
            updateData = { imagen_url: null };
            successMsg = `✅ Imagen eliminada.`;
        } else if (photo) {
            updateData = { imagen_url: photo[photo.length - 1].file_id };
            successMsg = `✅ Imagen actualizada.`;
        } else if (animation) {
            updateData = { imagen_url: animation.file_id };
            successMsg = `✅ GIF animado actualizado.`;
        } else if (text.startsWith('http')) {
            updateData = { imagen_url: text.trim() };
            successMsg = `✅ URL de imagen actualizada.`;
        } else {
            await ctx.reply('⚠️ Formato no válido. Envía una imagen, un GIF, un enlace o escribe "borrar".');
            return;
        }
      }

      const { error } = await supabase.from('productos').update(updateData).eq('id', productId);

      if (error) {
        console.error(error);
        await ctx.reply('❌ Hubo un error al actualizar la base de datos.', removeKeyboard);
      } else {
        await ctx.reply(successMsg, { parse_mode: 'HTML', ...removeKeyboard });
      }

      return ctx.scene.leave();
    }
  }
);
