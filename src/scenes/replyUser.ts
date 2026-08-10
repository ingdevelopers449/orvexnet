import { Scenes, Markup } from 'telegraf';
import { supabase } from '../config/supabase';

export const replyUserScene = new Scenes.BaseScene<any>('REPLY_USER_SCENE');

replyUserScene.enter(async (ctx) => {
    const orderId = ctx.session.replyOrderId;
    if (!orderId) {
        await ctx.reply('❌ No se encontró la orden a la que deseas responder.');
        return ctx.scene.leave();
    }

    // Buscar información de la orden
    const { data: compra } = await supabase.from('compras').select('*, usuarios(id_telegram, nombre_usuario), productos(nombre)').eq('id', orderId).single();
    
    if (!compra) {
        await ctx.reply('❌ La orden especificada no existe.');
        return ctx.scene.leave();
    }

    // @ts-ignore
    ctx.session.replyUserId = compra.usuarios.id_telegram;
    // @ts-ignore
    ctx.session.replyProductName = compra.productos.nombre;

    await ctx.reply(
        `💬 <b>ENVIAR RESPUESTA AL CLIENTE</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n` +
        // @ts-ignore
        `🛍️ <b>Producto:</b> ${compra.productos.nombre}\n` +
        `🧾 <b>Orden:</b> <code>#${orderId.substring(0,8).toUpperCase()}</code>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `✏️ <i>Escribe el mensaje o los datos de la cuenta que deseas enviar al cliente.</i>\n\n` +
        `Si envías una foto, documento o mensaje largo, se le reenviará tal cual.\n\n` +
        `(Escribe /cancelar para salir sin enviar nada)`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ Cancelar', 'cancel_reply')]
            ])
        }
    );
});

replyUserScene.action('cancel_reply', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('❌ Envío de respuesta cancelado.');
    return ctx.scene.leave();
});

replyUserScene.on('message', async (ctx) => {
    // @ts-ignore
    if (ctx.message.text && ctx.message.text.trim() === '/cancelar') {
        await ctx.reply('❌ Envío de respuesta cancelado.');
        return ctx.scene.leave();
    }

    const userId = ctx.session.replyUserId;
    const orderId = ctx.session.replyOrderId;
    const productName = ctx.session.replyProductName;

    if (!userId) {
        await ctx.reply('❌ Error: ID del cliente no encontrado.');
        return ctx.scene.leave();
    }

    try {
        // Notificar al cliente
        const userMsg = `✅ <b>¡TU PEDIDO HA SIDO ENTREGADO!</b> ✅\n━━━━━━━━━━━━━━━━━━━━━━━\n🛍️ <b>Producto:</b> ${productName}\n🧾 <b>Orden:</b> #${orderId.substring(0,8).toUpperCase()}\n━━━━━━━━━━━━━━━━━━━━━━━\n\n📥 <b>Mensaje del Administrador:</b>\n`;
        
        await ctx.telegram.sendMessage(userId, userMsg, { parse_mode: 'HTML' });
        
        // Copiar el mensaje que mandó el admin al cliente
        await ctx.telegram.copyMessage(userId, ctx.chat.id, ctx.message.message_id);

        // Marcar la orden como entregada en la base de datos automáticamente
        await supabase.from('compras').update({ estado: 'entregada' }).eq('id', orderId);

        await ctx.reply('✅ <b>¡Respuesta enviada exitosamente al cliente!</b>\nLa orden ha sido marcada automáticamente como entregada.', { parse_mode: 'HTML' });
        
    } catch (err) {
        console.error('Error enviando respuesta:', err);
        await ctx.reply('❌ Hubo un error al enviar el mensaje al cliente. Asegúrate de que el usuario no haya bloqueado al bot.');
    }

    return ctx.scene.leave();
});
