import { Telegraf, Markup, Context } from 'telegraf';
import { supabase } from '../config/supabase';
import { NotificationService } from '../services/notifications';

// Middleware de administrador
export const adminMiddleware = async (ctx: Context, next: () => Promise<void>) => {
  if (!ctx.from) return;
  const { data: admin } = await supabase.from('administradores').select('id').eq('id_telegram', ctx.from.id).eq('activo', true).single();
  if (admin) return next();
};

export function setupAdminRoutes(bot: Telegraf<any>, notificationService: NotificationService) {

  bot.command('admin', adminMiddleware, async (ctx) => {
    await ctx.sendChatAction('typing');
    const { count: usersCount } = await supabase.from('usuarios').select('*', { count: 'exact', head: true });
    const { count: productsCount } = await supabase.from('productos').select('*', { count: 'exact', head: true }).eq('activo', true);
    const { count: salesCount } = await supabase.from('compras').select('*', { count: 'exact', head: true });
    
    const adminMessage = `⚙️ <b>PANEL DE CONTROL (ADMINISTRADOR)</b>
━━━━━━━━━━━━━━━━━━━━━━━
👥 <b>Usuarios registrados:</b> ${usersCount || 0}
📦 <b>Productos activos:</b> ${productsCount || 0}
🧾 <b>Ventas totales:</b> ${salesCount || 0}
━━━━━━━━━━━━━━━━━━━━━━━
<i>Selecciona una acción de administración:</i>`;

    await ctx.reply(adminMessage, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Agregar Producto', 'admin_add_product')],
        [Markup.button.callback('💰 Gestionar saldos', 'admin_recharge_saldo')],
        [Markup.button.callback('🔍 Buscar Orden', 'admin_search_order')],
        [Markup.button.callback('📢 Enviar Notificación Global', 'admin_notify')],
        [Markup.button.callback('📦 Agregar nuevo stock', 'admin_add_stock')],
        [Markup.button.callback('✏️ Editar producto', 'admin_edit_product'), Markup.button.callback('💰 Cambiar precio', 'admin_change_price')],
        [Markup.button.callback('📝 Cambiar descripción', 'admin_change_desc'), Markup.button.callback('🖼️ Cambiar Imagen', 'admin_change_media')],
        [Markup.button.callback('🟢 Activar producto', 'admin_activate_prod'), Markup.button.callback('🔴 Desactivar producto', 'admin_deactivate_prod')],
        [Markup.button.callback('🗑️ Eliminar producto', 'admin_delete_prod'), Markup.button.callback('📊 Ver inventario', 'admin_view_inventory')],
        [Markup.button.callback('📢 Enviar anuncio', 'admin_send_announcement'), Markup.button.callback('👥 Ver usuarios', 'admin_view_users')],
        [Markup.button.callback('💳 Revisar recargas', 'admin_review_recharges')],
        [Markup.button.callback('🧾 Ver compras', 'admin_view_purchases'), Markup.button.callback('📈 Ver estadísticas', 'admin_view_stats')],
        [Markup.button.callback('🚫 Bloquear usuario', 'admin_block_user')],
        [Markup.button.callback('🔙 Cerrar Panel', 'admin_back')]
      ])
    });
  });

  bot.action('admin_back', adminMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('Panel cerrado.');
  });

  bot.action('admin_recharge_saldo', adminMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('MANUAL_RECHARGE_SCENE');
  });

  bot.action('admin_search_order', adminMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('SEARCH_ORDER_SCENE');
  });

  bot.action('admin_add_product', adminMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('ADD_PRODUCT_SCENE');
  });

  bot.action('admin_add_stock', adminMiddleware, async (ctx) => {
    await ctx.answerCbQuery('Cargando productos...');
    const { data: products } = await supabase.from('productos').select('id, nombre').eq('activo', true);
    if (!products || products.length === 0) {
      return ctx.editMessageText('No hay productos activos para agregar stock.', Markup.inlineKeyboard([[Markup.button.callback('🔙 Volver', 'admin_back')]]));
    }
    const buttons = products.map(p => [Markup.button.callback(p.nombre, `select_stock_prod_${p.id}`)]);
    buttons.push([Markup.button.callback('🔙 Volver', 'admin_back')]);
    await ctx.editMessageText('📦 Selecciona el producto al que deseas agregar stock:', Markup.inlineKeyboard(buttons));
  });

  bot.action(/select_stock_prod_(.+)/, adminMiddleware, async (ctx) => {
    const productId = ctx.match[1];
    await ctx.answerCbQuery();
    // @ts-ignore
    ctx.scene.session.selectedProductId = productId;
    await ctx.scene.enter('ADD_STOCK_SCENE');
  });

  bot.action(/publish_never|publish_later|notify_none/, adminMiddleware, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('Entendido, no se ha enviado ninguna notificación.');
  });

  bot.action(/publish_([a-z0-9\-]+)/, adminMiddleware, async (ctx) => {
    if (ctx.match[1] === 'never' || ctx.match[1] === 'later') return;
    const productId = ctx.match[1];
    await ctx.answerCbQuery('Enviando notificaciones...');
    await ctx.editMessageText('Enviando notificaciones en segundo plano...');
    const result = await notificationService.sendNewProductNotification(productId);
    if (result) {
      await ctx.reply(`✅ Notificación enviada. Éxito: ${result.successCount}, Fallos: ${result.failCount}`);
    }
  });

  bot.action(/notify_stock_([a-z0-9\-]+)/, adminMiddleware, async (ctx) => {
    const productId = ctx.match[1];
    await ctx.answerCbQuery('Enviando notificaciones...');
    await ctx.editMessageText('Enviando notificaciones en segundo plano...');
    const result = await notificationService.sendNewStockNotification(productId);
    if (result) {
      await ctx.reply(`✅ Notificación de stock enviada. Éxito: ${result.successCount}, Fallos: ${result.failCount}`);
    }
  });

  bot.action(/admin_(edit_product|change_price|change_desc|change_media|activate_prod|deactivate_prod|delete_prod)/, adminMiddleware, async (ctx) => {
    const action = ctx.match[1];
    await ctx.answerCbQuery();
    await ctx.scene.enter('EDIT_PRODUCT_SCENE', { editAction: action });
  });

  // ===============================================
  // FASE 2: IMPLEMENTACIÓN DE BOTONES RESTANTES
  // ===============================================

  // Ver Inventario
  bot.action('admin_view_inventory', adminMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const { data: products } = await supabase.from('productos').select('*').order('activo', { ascending: false });
      
      if (!products || products.length === 0) return ctx.reply('No hay productos.');
      
      let msg = `📊 <b>REPORTE DE INVENTARIO</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
      products.forEach(p => {
          const status = p.activo ? '🟢' : '🔴';
          msg += `${status} <b>${p.nombre}</b>\n`;
          msg += `📦 Stock: ${p.stock} | 💰 Precio: $${p.precio}\n\n`;
      });

      await ctx.reply(msg, { parse_mode: 'HTML' });
  });

  // Ver Estadísticas
  bot.action('admin_view_stats', adminMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const { data: compras } = await supabase.from('compras').select('precio_pagado, cantidad, id_producto');
      
      let totalVentasUSD = 0;
      let totalUnidadesVendidas = 0;

      if (compras) {
          compras.forEach(c => {
              totalVentasUSD += Number(c.precio_pagado);
              totalUnidadesVendidas += Number(c.cantidad);
          });
      }

      let msg = `📈 <b>ESTADÍSTICAS FINANCIERAS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `💵 <b>Ingresos Totales:</b> $${totalVentasUSD.toFixed(2)} USD\n`;
      msg += `🛍️ <b>Unidades Vendidas:</b> ${totalUnidadesVendidas}\n`;
      
      await ctx.reply(msg, { parse_mode: 'HTML' });
  });

  // Revisar últimas compras
  bot.action('admin_view_purchases', adminMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const { data: compras } = await supabase.from('compras').select('*, usuarios(id_telegram), productos(nombre)').order('fecha_compra', { ascending: false }).limit(10);
      
      if (!compras || compras.length === 0) return ctx.reply('No hay compras recientes.');
      
      let msg = `🧾 <b>ÚLTIMAS 10 COMPRAS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
      compras.forEach(c => {
          const date = new Date(c.fecha_compra).toLocaleString();
          msg += `📅 ${date}\n`;
          // @ts-ignore
          msg += `👤 ID: <code>${c.usuarios?.id_telegram}</code>\n`;
          // @ts-ignore
          msg += `🛍️ Producto: ${c.productos?.nombre} (x${c.cantidad})\n`;
          msg += `💰 Pagó: $${c.precio_pagado}\n\n`;
      });

      await ctx.reply(msg, { parse_mode: 'HTML' });
  });

  // Revisar últimas recargas
  bot.action('admin_review_recharges', adminMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      const { data: recargas } = await supabase.from('movimientos_saldo').select('*, usuarios(id_telegram)').eq('tipo_movimiento', 'recarga').order('fecha_movimiento', { ascending: false }).limit(10);
      
      if (!recargas || recargas.length === 0) return ctx.reply('No hay recargas recientes.');
      
      let msg = `💳 <b>ÚLTIMAS 10 RECARGAS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
      recargas.forEach(r => {
          const date = new Date(r.fecha_movimiento).toLocaleString();
          msg += `📅 ${date}\n`;
          // @ts-ignore
          msg += `👤 ID: <code>${r.usuarios?.id_telegram}</code>\n`;
          msg += `💰 Monto: $${r.monto}\n`;
          msg += `📝 Nota: ${r.descripcion}\n\n`;
      });

      await ctx.reply(msg, { parse_mode: 'HTML' });
  });

  // Escenas pendientes
  bot.action('admin_send_announcement', adminMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.scene.enter('ANNOUNCEMENT_SCENE');
  });

  bot.action('admin_block_user', adminMiddleware, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.scene.enter('BLOCK_USER_SCENE');
  });

  bot.action('admin_view_users', adminMiddleware, async (ctx) => {
      await ctx.answerCbQuery('Puedes usar la DB para lista completa. Abriendo resumen...');
      const { count: usuariosTotales } = await supabase.from('usuarios').select('*', { count: 'exact', head: true });
      const { count: usuariosBloqueados } = await supabase.from('usuarios').select('*', { count: 'exact', head: true }).eq('bloqueado', true);
      
      let msg = `👥 <b>RESUMEN DE USUARIOS</b>\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `✅ Activos: ${Number(usuariosTotales) - Number(usuariosBloqueados)}\n`;
      msg += `🚫 Bloqueados: ${usuariosBloqueados}\n`;
      msg += `📦 Total Registrados: ${usuariosTotales}\n`;

      await ctx.reply(msg, { parse_mode: 'HTML' });
  });

  bot.action(/admin_.+/, adminMiddleware, async (ctx) => {
    await ctx.answerCbQuery('Esta función aún no está implementada.');
  });
}
