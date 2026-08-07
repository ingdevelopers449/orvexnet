import { Telegraf, Markup, Context } from 'telegraf';
import { supabase } from '../config/supabase';

// Helper: Soporte URL
export async function getSupportUrl() {
    const { data } = await supabase.from('configuracion_bot').select('valor').eq('clave', 'soporte').single();
    let soporte = data?.valor || 'soporte';
    if (soporte.startsWith('@')) soporte = soporte.substring(1);
    return `https://t.me/${soporte}`;
}

// Helper: Obtener Saldo
export async function getUserBalance(ctx: any) {
    if (!ctx.from) return 0;
    const { data } = await supabase.from('usuarios').select('saldo').eq('id_telegram', ctx.from.id).single();
    return data ? Number(data.saldo).toFixed(2) : '0.00';
}

// Render catálogo
export async function renderCatalogList(ctx: any, page: number = 0) {
    await ctx.sendChatAction('typing');
    const { data: products, error } = await supabase.from('productos').select('*').eq('activo', true).order('fecha_creacion', { ascending: false });

    if (error) console.error('Error fetching products:', error);

    if (!products || products.length === 0) {
        return ctx.editMessageText('😔 Lo sentimos, no hay productos disponibles en este momento.', Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Volver al menú', 'user_back')]
        ]));
    }

    const itemsPerPage = 8;
    const totalPages = Math.ceil(products.length / itemsPerPage);
    
    if (page < 0) page = totalPages - 1;
    if (page >= totalPages) page = 0;

    const startIdx = page * itemsPerPage;
    const currentProducts = products.slice(startIdx, startIdx + itemsPerPage);
    
    const balance = await getUserBalance(ctx);

    let message = `🛍️ <b>CATÁLOGO DE PRODUCTOS</b>\n`;
    message += `💰 <b>Tu saldo:</b> $${balance} USD\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `<i>Selecciona un producto para ver sus detalles:</i>\n\n`;

    const buttons = [];

    for (const p of currentProducts) {
        buttons.push([Markup.button.callback(`💎 ${p.nombre} - $${p.precio} USD | 📦 Stock: ${p.stock}`, `view_product_${p.id}`)]);
    }

    if (totalPages > 1) {
        buttons.push([
            Markup.button.callback('◀️', `cat_list_${page - 1}`),
            Markup.button.callback(`Pág ${page + 1}/${totalPages}`, 'ignore'),
            Markup.button.callback('▶️', `cat_list_${page + 1}`)
        ]);
    }

    buttons.push([Markup.button.callback('🔙 Menú Principal', 'user_back')]);

    try {
        await ctx.editMessageText(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    } catch (e) {
        await ctx.reply(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    }
}

export function setupUserRoutes(bot: Telegraf<any>) {

  bot.command('recargar', async (ctx) => {
    await ctx.scene.enter('RECHARGE_SCENE');
  });

  bot.start(async (ctx) => {
    const balance = await getUserBalance(ctx);
    const welcomeMessage = `✨ <b>¡BIENVENIDO A ORVEX NET!</b> ✨
━━━━━━━━━━━━━━━━━━━━━━━
🚀 <i>La mejor plataforma de productos digitales.</i>

🔹 <b>Entregas Automáticas</b> ⚡️
🔹 <b>Soporte Premium</b> 🛡️
🔹 <b>Precios Insuperables</b> 💎

💰 <b>Tu saldo actual:</b> $${balance} USD

👇 <b>Selecciona una opción para comenzar:</b>
━━━━━━━━━━━━━━━━━━━━━━━`;

    const supportUrl = await getSupportUrl();

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🛒 VER CATÁLOGO DE PRODUCTOS', 'user_catalog')],
      [Markup.button.callback('💳 Recargar Saldo', 'user_recharge'), Markup.button.callback('👤 Mi Perfil', 'user_profile')],
      [Markup.button.url('📞 Contactar a Soporte', supportUrl)]
    ]);

    await ctx.reply('🔥');
    await ctx.reply(welcomeMessage, { parse_mode: 'HTML', ...keyboard });
  });

  bot.action('user_back', async (ctx) => {
    await ctx.answerCbQuery();
    const balance = await getUserBalance(ctx);
    const welcomeMessage = `✨ <b>¡BIENVENIDO A ORVEX NET!</b> ✨
━━━━━━━━━━━━━━━━━━━━━━━
🚀 <i>La mejor plataforma de productos digitales.</i>

🔹 <b>Entregas Automáticas</b> ⚡️
🔹 <b>Soporte Premium</b> 🛡️
🔹 <b>Precios Insuperables</b> 💎

💰 <b>Tu saldo actual:</b> $${balance} USD

👇 <b>Selecciona una opción para comenzar:</b>
━━━━━━━━━━━━━━━━━━━━━━━`;
    const supportUrl = await getSupportUrl();
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🛒 VER CATÁLOGO DE PRODUCTOS', 'user_catalog')],
      [Markup.button.callback('💳 Recargar Saldo', 'user_recharge'), Markup.button.callback('👤 Mi Perfil', 'user_profile')],
      [Markup.button.url('📞 Contactar a Soporte', supportUrl)]
    ]);
    await ctx.editMessageText(welcomeMessage, { parse_mode: 'HTML', ...keyboard });
  });

  bot.action('user_catalog', async (ctx) => {
      await ctx.answerCbQuery();
      await renderCatalogList(ctx, 0);
  });

  bot.action(/cat_list_(-?\d+)/, async (ctx) => {
      const page = parseInt(ctx.match[1], 10);
      await ctx.answerCbQuery();
      await renderCatalogList(ctx, page);
  });

  bot.action(/view_product_(.+)/, async (ctx) => {
      const productId = ctx.match[1];
      await ctx.answerCbQuery();
      const { data: product } = await supabase.from('productos').select('*').eq('id', productId).single();
      if (!product) return ctx.reply('Error: Producto no encontrado');

      const message = `🛍️ <b>DETALLES DEL PRODUCTO</b>
━━━━━━━━━━━━━━━━━━━━━━━
💎 <b>${product.nombre}</b>

📜 <i>${product.descripcion || 'Sin descripción detallada.'}</i>

📦 <b>Stock Disponible:</b> ${product.stock}
💰 <b>Precio:</b> $${product.precio} USD
━━━━━━━━━━━━━━━━━━━━━━━`;

      const buttons = [
          [Markup.button.callback(`🛒 Seleccionar cantidad`, `checkout_${product.id}_1`)],
          [Markup.button.callback('🔙 Volver al catálogo', 'user_catalog')]
      ];

      try {
          await ctx.editMessageText(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
      } catch (e) {}
  });

  bot.action('user_recharge', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('RECHARGE_SCENE');
  });

  bot.action('user_profile', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.sendChatAction('typing');
    const { data: user } = await supabase.from('usuarios').select('*').eq('id_telegram', ctx.from?.id).single();
    if (!user) return ctx.reply('Error al cargar tu perfil.');

    const saldo = user.saldo;
    const { count } = await supabase.from('compras').select('*', { count: 'exact', head: true }).eq('id_usuario', user.id);

    const profileText = `👤 <b>TU PERFIL DE USUARIO</b>
━━━━━━━━━━━━━━━━━━━━━━━
🆔 <b>ID de Telegram:</b> <code>${ctx.from?.id}</code>
📅 <b>Usuario desde:</b> ${new Date(user.fecha_registro).toLocaleDateString()}
🛍️ <b>Compras realizadas:</b> ${count || 0}

💰 <b>SALDO ACTUAL:</b>
💎 <b>$${saldo} USD</b>
━━━━━━━━━━━━━━━━━━━━━━━
<i>Recuerda recargar tu saldo para comprar de manera automática.</i>`;

    await ctx.editMessageText(profileText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
          [Markup.button.callback('💳 Recargar Saldo', 'user_recharge')],
          [Markup.button.callback('🧾 Mi Historial', 'user_history')],
          [Markup.button.callback('🔙 Volver al menú', 'user_back')]
      ])
    });
  });

  bot.action('user_history', async (ctx) => {
      await ctx.answerCbQuery();
      const { data: user } = await supabase.from('usuarios').select('id').eq('id_telegram', ctx.from?.id).single();
      if (!user) return;
      const { data: compras } = await supabase.from('compras').select('id_producto').eq('id_usuario', user.id);
      
      if (!compras || compras.length === 0) {
          return ctx.editMessageText('🧾 <b>Historial de Compras</b>\n\nAún no has realizado ninguna compra.', {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Volver al Perfil', 'user_profile')]])
          });
      }

      const uniqueProductIds = [...new Set(compras.map(c => c.id_producto))];
      const { data: products } = await supabase.from('productos').select('id, nombre').in('id', uniqueProductIds);

      let message = `🧾 <b>TU HISTORIAL DE COMPRAS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n<i>Selecciona el producto del cual quieres ver los detalles:</i>\n\n`;
      const buttons = [];
      if (products) {
          for (const p of products) {
              buttons.push([Markup.button.callback(`📦 ${p.nombre}`, `history_prod_${p.id}`)]);
          }
      }
      buttons.push([Markup.button.callback('🔙 Volver al Perfil', 'user_profile')]);

      try {
          await ctx.editMessageText(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
      } catch (e) {}
  });

  bot.action(/history_prod_(.+)/, async (ctx) => {
      const productId = ctx.match[1];
      await ctx.answerCbQuery('Cargando historial...');
      const { data: user } = await supabase.from('usuarios').select('id').eq('id_telegram', ctx.from?.id).single();
      const { data: product } = await supabase.from('productos').select('*').eq('id', productId).single();
      
      if (!user || !product) return;
      const { data: compras } = await supabase.from('compras').select('*').eq('id_usuario', user.id).eq('id_producto', productId).order('fecha_compra', { ascending: false });
      const { data: cuentas } = await supabase.from('inventario_cuentas').select('*').eq('id_comprador', user.id).eq('id_producto', productId).order('fecha_vendido', { ascending: false });

      let message = `🧾 <b>HISTORIAL: ${product.nombre}</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `🛍️ <b>Transacciones realizadas:</b> ${compras ? compras.length : 0}\n\n`;

      if (compras && compras.length > 0) {
          message += `📋 <b>Tus Órdenes:</b>\n`;
          for (const c of compras) {
              const date = new Date(c.fecha_compra).toLocaleDateString();
              const orderId = c.id.substring(0, 8).toUpperCase();
              message += `🔹 <b>#${orderId}</b> - ${date} (${c.cantidad}x)\n`;
          }
          message += `\n`;
      }

      if (cuentas && cuentas.length > 0) {
          message += `🎁 <b>Cuentas / Items Entregados:</b>\n\n`;
          for (let i = 0; i < cuentas.length; i++) {
              const fecha = new Date(cuentas[i].fecha_vendido).toLocaleDateString();
              message += `[${fecha}]\n<code>${cuentas[i].contenido}</code>\n\n`;
          }
      } else if (product.tipo_entrega === 'automatica' && product.contenido !== 'Entrega desde inventario individual') {
          message += `🎁 <b>Contenido Entregado:</b>\n<code>${product.contenido}</code>\n\n`;
      } else {
          message += `⏳ <b>Tipo de entrega:</b> Manual (soporte).\n\n`;
      }

      if (message.length > 4000) {
          message = message.substring(0, 3950) + '\n\n... [El historial es muy largo para mostrarse completo]';
      }

      try {
          await ctx.editMessageText(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Volver al Historial general', 'user_history')]]) });
      } catch (e) {}
  });

  bot.action(/checkout_(.+)_(\d+)/, async (ctx) => {
      const productId = ctx.match[1];
      let qty = parseInt(ctx.match[2], 10);
      await ctx.answerCbQuery();
      
      const { data: product } = await supabase.from('productos').select('*').eq('id', productId).single();
      if (!product) return ctx.reply('Error: Producto no encontrado');
      if (!product.activo) return ctx.editMessageText('❌ Este producto ya no está activo.', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Volver al catálogo', 'user_catalog')]])});
      if (product.stock <= 0) return ctx.editMessageText('❌ Agotado. No hay stock disponible.', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Volver al catálogo', 'user_catalog')]])});

      if (qty < 1) qty = 1;
      if (qty > product.stock) qty = product.stock;

      const totalAmount = product.precio * qty;
      const checkoutMsg = `🛒 <b>PANTALLA DE COMPRA</b>
━━━━━━━━━━━━━━━━━━━━━━━
💎 <b>${product.nombre}</b>

💰 <b>Precio unitario:</b> $${product.precio} USD
📦 <b>Stock disponible:</b> ${product.stock}

🛒 <b>Cantidad seleccionada:</b> ${qty}
💵 <b>Monto total a pagar:</b> $${totalAmount.toFixed(2)} USD
━━━━━━━━━━━━━━━━━━━━━━━
<i>Selecciona la cantidad usando los botones ➖ y ➕:</i>`;

      const buttons = [
          [
              Markup.button.callback('➖', `checkout_${product.id}_${qty - 1}`),
              Markup.button.callback(`✅ ${qty}`, 'ignore'), 
              Markup.button.callback('➕', `checkout_${product.id}_${qty + 1}`)
          ],
          [Markup.button.callback(`🛒 CONFIRMAR COMPRA (x${qty})`, `confirm_buy_${product.id}_${qty}`)],
          [Markup.button.callback('🔙 Volver al catálogo', 'user_catalog')]
      ];

      try {
          await ctx.editMessageText(checkoutMsg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
      } catch (e) {}
  });

  bot.action('ignore', async (ctx) => {
      await ctx.answerCbQuery();
  });

  bot.action(/confirm_buy_(.+)_(\d+)/, async (ctx) => {
    const productId = ctx.match[1];
    const qty = parseInt(ctx.match[2], 10);
    const telegramId = ctx.from?.id;

    if (!telegramId) return ctx.answerCbQuery('Error: Usuario no identificado');

    await ctx.answerCbQuery('Procesando compra, por favor espera...');
    const processingMsg = await ctx.reply('⏳ Procesando tu compra... verificando inventario y saldo.');

    try {
      const { data: user, error: userError } = await supabase.from('usuarios').select('*').eq('id_telegram', telegramId).single();
      if (userError || !user) throw new Error('Usuario no encontrado');

      const { data: product, error: productError } = await supabase.from('productos').select('*').eq('id', productId).single();
      if (productError || !product) throw new Error('Producto no encontrado');

      if (!product.activo) {
        return ctx.telegram.editMessageText(ctx.chat?.id, processingMsg.message_id, undefined, '❌ Este producto ya no está activo.', {
          reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Volver al catálogo', 'user_catalog')]]).reply_markup
        });
      }

      if (product.stock < qty) {
        return ctx.telegram.editMessageText(ctx.chat?.id, processingMsg.message_id, undefined, `❌ Stock insuficiente. Solo hay ${product.stock} unidades disponibles.`, {
          reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Volver al catálogo', 'user_catalog')]]).reply_markup
        });
      }

      const totalPrice = product.precio * qty;
      const userBalance = parseFloat(user.saldo);

      if (userBalance < totalPrice) {
        return ctx.telegram.editMessageText(ctx.chat?.id, processingMsg.message_id, undefined, `❌ *Saldo insuficiente*\n\nMonto a pagar: $${totalPrice.toFixed(2)} USD\nTu saldo: $${userBalance.toFixed(2)} USD\n\nPor favor, recarga saldo usando el botón de abajo.`, { 
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('💳 Recargar Saldo', 'user_recharge')],
                [Markup.button.callback('🔙 Volver al catálogo', 'user_catalog')]
            ]).reply_markup
        });
      }

      let itemsEntregados = product.contenido || 'Contenido manual';
      let idsInventario: string[] = [];

      if (product.tipo_entrega === 'automatica' && product.contenido === 'Entrega desde inventario individual') {
          const { data: inventarioItems } = await supabase.from('inventario_cuentas').select('*').eq('id_producto', product.id).eq('vendido', false).order('fecha_agregado', { ascending: true }).limit(qty);
              
          if (!inventarioItems || inventarioItems.length < qty) {
              return ctx.telegram.editMessageText(ctx.chat?.id, processingMsg.message_id, undefined, '❌ Error: Inconsistencia de inventario. No hay suficientes cuentas disponibles.', {
                  reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Volver al catálogo', 'user_catalog')]]).reply_markup
              });
          }
          
          itemsEntregados = inventarioItems.map(i => i.contenido).join('\n━━━━━━━━━━━\n');
          idsInventario = inventarioItems.map(i => i.id);
      }

      const newBalance = userBalance - totalPrice;
      const newStock = product.stock - qty;

      await supabase.from('usuarios').update({ saldo: newBalance }).eq('id', user.id);
      await supabase.from('productos').update({ stock: newStock }).eq('id', product.id);
      
      if (idsInventario.length > 0) {
          for (const idInv of idsInventario) {
              await supabase.from('inventario_cuentas').update({ vendido: true, id_comprador: user.id, fecha_vendido: new Date().toISOString() }).eq('id', idInv);
          }
      }

      const { data: compraRes, error: compraErr } = await supabase.from('compras').insert([{
          id_usuario: user.id,
          id_producto: product.id,
          precio_pagado: totalPrice,
          moneda: 'USD',
          cantidad: qty,
          estado: product.tipo_entrega === 'automatica' ? 'entregada' : 'pendiente'
      }]).select().single();

      if (compraErr) console.error('Error insertando compra:', compraErr);

      const orderId = compraRes ? compraRes.id.substring(0, 8).toUpperCase() : 'DESCONOCIDO';

      await supabase.from('movimientos_saldo').insert([{
          id_usuario: user.id,
          tipo_movimiento: 'compra',
          monto: totalPrice,
          saldo_anterior: userBalance,
          saldo_nuevo: newBalance,
          descripcion: `Compra x${qty}: ${product.nombre}`
      }]);

      let mensajeExito = `✅ *¡COMPRA EXITOSA!*\n\n`;
      mensajeExito += `🧾 *ID de Orden:* #${orderId}\n`;
      mensajeExito += `🛍️ *Producto:* ${product.nombre} (x${qty})\n`;
      mensajeExito += `💵 *Monto pagado:* $${totalPrice.toFixed(2)} USD\n`;
      mensajeExito += `💼 *Saldo restante:* $${newBalance.toFixed(2)} USD\n\n`;
      
      if (product.tipo_entrega === 'automatica') {
          mensajeExito += `🎁 *Aquí tienes tus productos:*\n\n`;
          mensajeExito += `\`\`\`text\n${itemsEntregados}\n\`\`\`\n\n`;
          mensajeExito += `¡Gracias por tu compra!`;
      } else {
          mensajeExito += `⏳ *Entrega Manual:* Un administrador ha sido notificado y se comunicará contigo en breve para entregarte los productos.\n\n`;
          mensajeExito += `¡Gracias por tu compra!`;

          // --- NOTIFICAR A LOS ADMINS SOBRE LA COMPRA MANUAL ---
          try {
              const { data: admins } = await supabase.from('administradores').select('id_telegram').eq('activo', true);
              if (admins && admins.length > 0) {
                  const username = ctx.from?.username ? `@${ctx.from.username}` : `Sin @ (Nombre: ${ctx.from?.first_name})`;
                  const userId = ctx.from?.id;
                  const adminMsg = `🚨 <b>NUEVA VENTA (ENTREGA MANUAL)</b> 🚨
━━━━━━━━━━━━━━━━━━━━━━━
🛍️ <b>Producto:</b> ${product.nombre} (x${qty})
💰 <b>Total pagado:</b> $${totalPrice.toFixed(2)} USD
🧾 <b>ID Orden:</b> #${orderId}

👤 <b>Cliente:</b> ${username}
🆔 <b>ID Telegram:</b> <code>${userId}</code>
🔗 <b>Enlace Directo:</b> <a href="tg://user?id=${userId}">Toca aquí para chatear con el cliente</a>

⚠️ <i>Contacta al cliente para hacerle la entrega manual.</i>`;

                  for (const admin of admins) {
                      await ctx.telegram.sendMessage(admin.id_telegram, adminMsg, { parse_mode: 'HTML' }).catch(() => {});
                  }
              }
          } catch (err) {
              console.error('Error enviando alerta a admins:', err);
          }
      }

      let keyboardButtons: any[] = [
          [Markup.button.callback('🛍️ Seguir comprando', 'user_catalog')],
          [Markup.button.callback('🔙 Menú principal', 'user_back')]
      ];

      if (product.tipo_entrega !== 'automatica') {
          const supportUrl = await getSupportUrl();
          const prefilledText = encodeURIComponent(`Hola, acabo de comprar el producto ${product.nombre} (Orden #${orderId}). Escribo para coordinar la entrega manual.`);
          const fullSupportUrl = `${supportUrl}?text=${prefilledText}`;
          keyboardButtons.unshift([Markup.button.url('📞 Hablar con el Vendedor', fullSupportUrl)]);
      }

      await ctx.telegram.editMessageText(ctx.chat?.id, processingMsg.message_id, undefined, mensajeExito, { 
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard(keyboardButtons).reply_markup
      });

    } catch (error) {
      console.error('Error procesando compra:', error);
      await ctx.telegram.editMessageText(ctx.chat?.id, processingMsg.message_id, undefined, '❌ Ocurrió un error inesperado al procesar tu compra. Por favor, contacta a soporte.', {
          reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Menú principal', 'user_back')]]).reply_markup
      });
    }
  });

}
