import { Telegraf, Markup, Context } from 'telegraf';
import { supabase } from '../config/supabase';
import { t } from '../locales/i18n';
import { config } from '../config/env';

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
        return ctx.editMessageText(t(ctx, 'empty_catalog'), Markup.inlineKeyboard([
            [Markup.button.callback(t(ctx, 'btn_back_menu'), 'user_back')]
        ]));
    }

    const itemsPerPage = 8;
    const totalPages = Math.ceil(products.length / itemsPerPage);
    
    if (page < 0) page = totalPages - 1;
    if (page >= totalPages) page = 0;

    const startIdx = page * itemsPerPage;
    const currentProducts = products.slice(startIdx, startIdx + itemsPerPage);
    
    const balance = await getUserBalance(ctx);

    let message = `👑 <b>Tienda</b>\n\n`;
    message += `<i>Elige un producto o una 📁 categoría 👇</i>\n`;
    message += `═══════════════════════\n`;

    const buttons = [];

    for (const p of currentProducts) {
        buttons.push([Markup.button.callback(`⚡ ${p.nombre} — $${p.precio} | 🟢 ${p.stock}`, `view_product_${p.id}`)]);
    }

    if (totalPages > 1) {
        buttons.push([
            Markup.button.callback('◀️', `cat_list_${page - 1}`),
            Markup.button.callback(`Pág ${page + 1}/${totalPages}`, 'ignore'),
            Markup.button.callback('▶️', `cat_list_${page + 1}`)
        ]);
    }

    buttons.push([Markup.button.callback('🔙 ' + t(ctx, 'btn_back_menu'), 'user_back')]);

    try {
        await ctx.editMessageText(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    } catch (e) {
        await ctx.deleteMessage().catch(() => {});
        await ctx.reply(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    }
}

export function setupUserRoutes(bot: Telegraf<any>) {

  bot.command('recargar', async (ctx) => {
    await ctx.scene.enter('RECHARGE_SCENE');
  });

  bot.start(async (ctx) => {
    if (!ctx.session) ctx.session = {};
    if (!ctx.session.language) {
        // Mostrar menú de idioma
        const langKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🇪🇸 Español', 'set_lang_es')],
            [Markup.button.callback('🇺🇸 English', 'set_lang_en')]
        ]);
        return ctx.reply('🌍 Please select your language / Por favor selecciona tu idioma:', langKeyboard);
    }
    await sendMainMenu(ctx);
  });

  bot.action('set_lang_es', async (ctx) => {
      if (!ctx.session) ctx.session = {};
      ctx.session.language = 'es';
      if (ctx.from) {
          await supabase.from('usuarios').update({ idioma: 'es' }).eq('id_telegram', ctx.from.id);
      }
      await ctx.deleteMessage().catch(() => {});
      await sendMainMenu(ctx);
  });

  bot.action('set_lang_en', async (ctx) => {
      if (!ctx.session) ctx.session = {};
      ctx.session.language = 'en';
      if (ctx.from) {
          await supabase.from('usuarios').update({ idioma: 'en' }).eq('id_telegram', ctx.from.id);
      }
      await ctx.deleteMessage().catch(() => {});
      await sendMainMenu(ctx);
  });

  bot.action('user_language', async (ctx) => {
      await ctx.answerCbQuery();
      const langKeyboard = Markup.inlineKeyboard([
          [Markup.button.callback('🇪🇸 Español', 'set_lang_es')],
          [Markup.button.callback('🇺🇸 English', 'set_lang_en')]
      ]);
      await ctx.editMessageText('🌍 Please select your language / Por favor selecciona tu idioma:', langKeyboard).catch(() => {});
  });

  async function sendMainMenu(ctx: any) {
    const balance = await getUserBalance(ctx);
    const welcomeMessage = `✨ <b>VIP DASHBOARD</b> ✨
═══════════════════════
👋 <i>${t(ctx, 'welcome_title')}</i>
${t(ctx, 'welcome_desc')}

💳 <b>${t(ctx, 'balance_label')}</b> <code style="color: green">$${balance} USD</code>

⬇️ <i>${t(ctx, 'select_option')}</i>
═══════════════════════`;

    const supportUrl = await getSupportUrl();

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(ctx, 'btn_catalog'), 'user_catalog')],
      [Markup.button.callback(t(ctx, 'btn_recharge'), 'user_recharge'), Markup.button.callback(t(ctx, 'btn_profile'), 'user_profile')],
      [Markup.button.url(t(ctx, 'btn_support'), supportUrl), Markup.button.callback(t(ctx, 'btn_history'), 'user_history')],
      [Markup.button.callback(t(ctx, 'btn_language'), 'user_language')]
    ]);

    const banner = config.telegram.bannerUrl;

    try {
        if (banner) {
            try {
                await ctx.replyWithPhoto(banner, { caption: welcomeMessage, parse_mode: 'HTML', ...keyboard });
            } catch (pErr) {
                try {
                    await ctx.replyWithAnimation(banner, { caption: welcomeMessage, parse_mode: 'HTML', ...keyboard });
                } catch (aErr) {
                    await ctx.reply(welcomeMessage, { parse_mode: 'HTML', ...keyboard });
                }
            }
        } else {
            await ctx.reply(welcomeMessage, { parse_mode: 'HTML', ...keyboard });
        }
    } catch (e) {
        await ctx.deleteMessage().catch(() => {});
        await ctx.reply(welcomeMessage, { parse_mode: 'HTML', ...keyboard });
    }
  }

  bot.action('user_back', async (ctx) => {
    await ctx.answerCbQuery();
    const balance = await getUserBalance(ctx);
    const welcomeMessage = `✨ <b>VIP DASHBOARD</b> ✨
═══════════════════════
👋 <i>${t(ctx, 'welcome_title')}</i>
${t(ctx, 'welcome_desc')}

💳 <b>${t(ctx, 'balance_label')}</b> <code style="color: green">$${balance} USD</code>

⬇️ <i>${t(ctx, 'select_option')}</i>
═══════════════════════`;
    const supportUrl = await getSupportUrl();
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(ctx, 'btn_catalog'), 'user_catalog')],
      [Markup.button.callback(t(ctx, 'btn_recharge'), 'user_recharge'), Markup.button.callback(t(ctx, 'btn_profile'), 'user_profile')],
      [Markup.button.url(t(ctx, 'btn_support'), supportUrl), Markup.button.callback(t(ctx, 'btn_history'), 'user_history')],
      [Markup.button.callback(t(ctx, 'btn_language'), 'user_language')]
    ]);

    const banner = config.telegram.bannerUrl;

    try {
        if (banner) {
            await ctx.deleteMessage().catch(() => {});
            try {
                await ctx.replyWithPhoto(banner, { caption: welcomeMessage, parse_mode: 'HTML', ...keyboard });
            } catch (pErr) {
                try {
                    await ctx.replyWithAnimation(banner, { caption: welcomeMessage, parse_mode: 'HTML', ...keyboard });
                } catch (aErr) {
                    await ctx.reply(welcomeMessage, { parse_mode: 'HTML', ...keyboard });
                }
            }
        } else {
            await ctx.editMessageText(welcomeMessage, { parse_mode: 'HTML', ...keyboard });
        }
    } catch (e) {
        await ctx.deleteMessage().catch(() => {});
        await ctx.reply(welcomeMessage, { parse_mode: 'HTML', ...keyboard });
    }
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
      if (!product) return ctx.reply(t(ctx, 'err_product_not_found'));

      const message = `✨ <b>INFO DEL PRODUCTO</b> ✨
═══════════════════════
💎 <b>${product.nombre}</b>

<blockquote><i>${product.descripcion || 'Sin descripción detallada.'}</i></blockquote>

📦 <b>${t(ctx, 'available_stock')}</b> <code>${product.stock}</code>
💵 <b>${t(ctx, 'unit_price')}</b> <code style="color: green">$${product.precio} USD</code>
═══════════════════════`;

      const buttons = [
          [Markup.button.callback(`🛒 Seleccionar Cantidad`, `checkout_${product.id}_1`)],
          [Markup.button.callback('🔙 ' + t(ctx, 'btn_back_catalog'), 'user_catalog')]
      ];

      try {
          if (product.imagen_url) {
              await ctx.deleteMessage().catch(() => {});
              try {
                  await ctx.replyWithPhoto(product.imagen_url, { caption: message, parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
              } catch (errPhoto) {
                  try {
                      await ctx.replyWithAnimation(product.imagen_url, { caption: message, parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
                  } catch (errAnim) {
                      await ctx.reply(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
                  }
              }
          } else {
              await ctx.editMessageText(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
          }
      } catch (e) {
          // Fallback en caso de que no pueda editar
          await ctx.deleteMessage().catch(() => {});
          await ctx.reply(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
      }
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

    const profileText = `👤 <b>PANEL VIP DEL CLIENTE</b> 👤
═══════════════════════
🆔 <b>${t(ctx, 'profile_id')}</b> <code>${ctx.from?.id}</code>
📅 <b>Membro desde:</b> <i>${new Date(user.fecha_registro).toLocaleDateString()}</i>
🏆 <b>Nivel:</b> ${count && count > 5 ? '👑 Cliente Frecuente' : '⭐ Cliente Estándar'}

💰 <b>SALDO DISPONIBLE:</b>
💳 <b><code style="color: green">$${saldo} USD</code></b>

🛍️ <b>Total de Compras:</b> ${count || 0}
═══════════════════════
💡 <i>Mantén tu saldo recargado para comprar sin esperas.</i>`;

    await ctx.editMessageText(profileText, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
          [Markup.button.callback('💎 ' + t(ctx, 'btn_recharge'), 'user_recharge'), Markup.button.callback('🧾 ' + t(ctx, 'btn_history'), 'user_history')],
          [Markup.button.callback('🔙 ' + t(ctx, 'btn_back_menu'), 'user_back')]
      ])
    });
  });

  bot.action('user_history', async (ctx) => {
      await ctx.answerCbQuery();
      const { data: user } = await supabase.from('usuarios').select('id').eq('id_telegram', ctx.from?.id).single();
      if (!user) return;
      const { data: compras } = await supabase.from('compras').select('id_producto').eq('id_usuario', user.id);
      
      if (!compras || compras.length === 0) {
          return ctx.editMessageText(t(ctx, 'history_empty'), {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([[Markup.button.callback(t(ctx, 'btn_back_history') || '🔙 Volver', 'user_profile')]])
          });
      }

      const uniqueProductIds = [...new Set(compras.map(c => c.id_producto))];
      const { data: products } = await supabase.from('productos').select('id, nombre').in('id', uniqueProductIds);

      let message = `${t(ctx, 'history_title')}\n━━━━━━━━━━━━━━━━━━━━━━━\n${t(ctx, 'history_desc')}\n\n`;
      const buttons = [];
      if (products) {
          for (const p of products) {
              buttons.push([Markup.button.callback(`📦 ${p.nombre}`, `history_prod_${p.id}`)]);
          }
      }
      buttons.push([Markup.button.callback(t(ctx, 'btn_back_menu'), 'user_profile')]);

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

      let message = `${t(ctx, 'history_item_title').replace('{productName}', product.nombre)}\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `${t(ctx, 'history_tx_count')} ${compras ? compras.length : 0}\n\n`;

      if (compras && compras.length > 0) {
          message += `${t(ctx, 'history_orders')}\n`;
          for (const c of compras) {
              const date = new Date(c.fecha_compra).toLocaleDateString();
              const orderId = c.id.substring(0, 8).toUpperCase();
              message += `🔹 <b>#${orderId}</b> - ${date} (${c.cantidad}x)\n`;
          }
          message += `\n`;
      }

      if (cuentas && cuentas.length > 0) {
          message += `${t(ctx, 'history_accounts')}\n\n`;
          for (let i = 0; i < cuentas.length; i++) {
              const fecha = new Date(cuentas[i].fecha_vendido).toLocaleDateString();
              message += `[${fecha}]\n<code>${cuentas[i].contenido}</code>\n\n`;
          }
      } else if (product.tipo_entrega === 'automatica' && product.contenido !== 'Entrega desde inventario individual') {
          message += `${t(ctx, 'history_content')}\n<code>${product.contenido}</code>\n\n`;
      } else {
          message += `${t(ctx, 'history_manual')}\n\n`;
      }

      if (message.length > 4000) {
          message = message.substring(0, 3950) + '\n\n... [El historial es muy largo para mostrarse completo]';
      }

      try {
          await ctx.editMessageText(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(t(ctx, 'btn_back_history'), 'user_history')]]) });
      } catch (e) {}
  });

  bot.action(/checkout_(.+)_(\d+)/, async (ctx) => {
      const productId = ctx.match[1];
      let qty = parseInt(ctx.match[2], 10);
      await ctx.answerCbQuery();
      
      const { data: product } = await supabase.from('productos').select('*').eq('id', productId).single();
      if (!product) return ctx.reply(t(ctx, 'err_product_not_found'));
      if (!product.activo) {
          await ctx.deleteMessage().catch(() => {});
          return ctx.reply(t(ctx, 'err_product_inactive'), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(t(ctx, 'btn_back_catalog'), 'user_catalog')]])});
      }
      if (product.stock <= 0) {
          await ctx.deleteMessage().catch(() => {});
          return ctx.reply(t(ctx, 'err_out_of_stock'), { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(t(ctx, 'btn_back_catalog'), 'user_catalog')]])});
      }

      if (qty < 1) qty = 1;
      if (qty > product.stock) qty = product.stock;

      const totalAmount = product.precio * qty;
      const checkoutMsg = `🛒 <b>CARRITO DE COMPRAS</b> 🛒
═══════════════════════
💎 <b>${product.nombre}</b>

💵 <b>${t(ctx, 'unit_price')}</b> <code style="color: green">$${product.precio} USD</code>
📦 <b>${t(ctx, 'available_stock')}</b> <code>${product.stock}</code>
═══════════════════════
📊 <b>${t(ctx, 'selected_qty')}</b> <code>${qty}</code>
💰 <b>${t(ctx, 'total_amount')}</b> <code style="color: green">$${totalAmount.toFixed(2)} USD</code>

<i>${t(ctx, 'select_qty_desc')}</i>`;

      const buttons = [
          [
              Markup.button.callback('➖', `checkout_${product.id}_${qty - 1}`),
              Markup.button.callback(`✅ ${qty}`, 'ignore'), 
              Markup.button.callback('➕', `checkout_${product.id}_${qty + 1}`)
          ],
          [Markup.button.callback(`${t(ctx, 'btn_confirm_buy')} (x${qty})`, `confirm_buy_${product.id}_${qty}`)],
          [Markup.button.callback(t(ctx, 'btn_back_catalog'), 'user_catalog')]
      ];

      try {
          if (product.imagen_url) {
              await ctx.editMessageCaption(checkoutMsg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
          } else {
              await ctx.editMessageText(checkoutMsg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
          }
      } catch (e) {
          // Si editMessageCaption falla (por ej, no era multimedia por algún error previo), intentamos fallback
          try {
              await ctx.editMessageText(checkoutMsg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
          } catch(err) {
              await ctx.deleteMessage().catch(() => {});
              await ctx.reply(checkoutMsg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
          }
      }
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
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});
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
        let errStr = t(ctx, 'err_insufficient_funds');
        errStr = errStr.replace('${total}', totalPrice.toFixed(2)).replace('${balance}', userBalance.toFixed(2));
        return ctx.telegram.editMessageText(ctx.chat?.id, processingMsg.message_id, undefined, errStr, { 
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback(t(ctx, 'btn_recharge'), 'user_recharge')],
                [Markup.button.callback(t(ctx, 'btn_back_catalog'), 'user_catalog')]
            ]).reply_markup
        });
      }

      let itemsEntregados = product.contenido || 'Contenido manual';
      let idsInventario: string[] = [];

      if (product.tipo_entrega === 'automatica' && product.contenido === 'Entrega desde inventario individual') {
          const { data: inventarioItems } = await supabase.from('inventario_cuentas').select('*').eq('id_producto', product.id).eq('vendido', false).order('fecha_agregado', { ascending: true }).limit(qty);
              
          if (!inventarioItems || inventarioItems.length < qty) {
              return ctx.telegram.editMessageText(ctx.chat?.id, processingMsg.message_id, undefined, t(ctx, 'err_inventory_mismatch'), {
                  reply_markup: Markup.inlineKeyboard([[Markup.button.callback(t(ctx, 'btn_back_catalog'), 'user_catalog')]]).reply_markup
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

      let mensajeExito = `✅ <b>${t(ctx, 'buy_success')}</b> ✅
═══════════════════════
🧾 <b>${t(ctx, 'order_id')}</b> <code>#${orderId}</code>
🛍️ <b>${t(ctx, 'product_label')}</b> ${product.nombre} (x${qty})
💰 <b>${t(ctx, 'amount_paid')}</b> <code style="color: green">$${totalPrice.toFixed(2)} USD</code>
💳 <b>${t(ctx, 'balance_remaining')}</b> <code style="color: green">$${newBalance.toFixed(2)} USD</code>
═══════════════════════\n`;
      
      if (product.tipo_entrega === 'automatica') {
          mensajeExito += `📥 <b>${t(ctx, 'auto_delivery_title')}</b>\n`;
          mensajeExito += `<blockquote>${itemsEntregados}</blockquote>\n\n`;
          mensajeExito += `<i>${t(ctx, 'thanks_for_buying')}</i>`;
      } else {
          mensajeExito += `⏳ <b>${t(ctx, 'manual_delivery_title')}</b>\n`;
          mensajeExito += `<i>${t(ctx, 'thanks_for_buying')}</i>`;

          // --- NOTIFICAR A LOS ADMINS SOBRE LA COMPRA MANUAL ---
          try {
              const { data: admins } = await supabase.from('administradores').select('id_telegram').eq('activo', true);
              if (admins && admins.length > 0) {
                  const username = ctx.from?.username ? `@${ctx.from.username}` : `Sin @ (Nombre: ${ctx.from?.first_name})`;
                  const userId = ctx.from?.id;
                  const adminMsg = `
🔔 <b>¡NUEVA VENTA MANUAL!</b> 🔔
═══════════════════════
🛒 <b>Producto:</b> <code>${product.nombre} (x${qty})</code>
💵 <b>Ingreso:</b> <code style="color: green">+$${totalPrice.toFixed(2)} USD</code>
🧾 <b>Orden:</b> <code>#${orderId}</code>
═══════════════════════
👤 <b>Comprador:</b> ${username}
🆔 <b>ID:</b> <code>${userId}</code>
🔗 <b>Chat Directo:</b> <a href="tg://user?id=${userId}">👉 Iniciar Chat 👈</a>

⚠️ <b>ACCIÓN REQUERIDA:</b> <i>Entrega el producto a la brevedad.</i>
`;

                  for (const admin of admins) {
                      await ctx.telegram.sendMessage(admin.id_telegram, adminMsg, { parse_mode: 'HTML' }).catch(() => {});
                  }
              }
          } catch (err) {
              console.error('Error enviando alerta a admins:', err);
          }
      }

      let keyboardButtons: any[] = [
          [Markup.button.callback('🛍️ ' + t(ctx, 'btn_continue_buying'), 'user_catalog')],
          [Markup.button.callback('🔙 ' + t(ctx, 'btn_back_menu'), 'user_back')]
      ];

      if (product.tipo_entrega !== 'automatica') {
          const supportUrl = await getSupportUrl();
          const prefilledText = encodeURIComponent(`${t(ctx, 'admin_notified')} ${product.nombre} (#${orderId})`);
          const fullSupportUrl = `${supportUrl}?text=${prefilledText}`;
          keyboardButtons.unshift([Markup.button.url(t(ctx, 'btn_talk_seller'), fullSupportUrl)]);
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
